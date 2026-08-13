import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ModelGatewayClient, QUALITY_PROFILE, parseStructuredOutput } from "../services/model-gateway/src/index";

const exec = promisify(execFile);
const root = process.cwd();
const endpoint = "http://127.0.0.1:8000/v1";
const apiKey = (await readFile(path.join(root, ".runtime/model/api-key"), "utf8")).trim();
const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const now = () => performance.now();

async function gpuMemoryMiB(): Promise<number> {
  const { stdout } = await exec("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]);
  return Number(stdout.trim().split(/\s+/)[0]);
}

async function requestJson(body: Record<string, unknown>, signal?: AbortSignal) {
  const started = now();
  const response = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });
  const json = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return { json, latencyMs: now() - started };
}

const base = {
  model: QUALITY_PROFILE.model,
  temperature: 0,
  chat_template_kwargs: { enable_thinking: false }
};

let peakVramMiB = await gpuMemoryMiB();
const idleVramMiB = peakVramMiB;
const sampler = setInterval(async () => {
  try { peakVramMiB = Math.max(peakVramMiB, await gpuMemoryMiB()); } catch { /* telemetry cannot change request truth */ }
}, 100);

const modelsStarted = now();
const modelsResponse = await fetch(`${endpoint}/models`, { headers });
const models = await modelsResponse.json() as { data?: Array<{ id?: string }> };
const modelsLatencyMs = now() - modelsStarted;
if (!modelsResponse.ok || models.data?.[0]?.id !== QUALITY_PROFILE.model) throw new Error("Pinned served model was not returned by /v1/models");

const normal = await requestJson({
  ...base,
  messages: [{ role: "user", content: "Reply in one short sentence confirming that this local gateway is ready." }],
  max_tokens: 48
});
const normalChoice = (normal.json.choices as Array<{ message?: { content?: string } }> | undefined)?.[0];
const normalContent = normalChoice?.message?.content ?? "";
if (!normalContent) throw new Error("Normal completion returned no content");

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { status: { type: "string", enum: ["PASS"] }, local_only: { type: "boolean", const: true } },
  required: ["status", "local_only"]
};
const structured = await requestJson({
  ...base,
  messages: [{ role: "user", content: "Return the required gateway status object." }],
  max_tokens: 48,
  response_format: { type: "json_schema", json_schema: { name: "gateway_probe", schema, strict: true } }
});
const structuredContent = ((structured.json.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content ?? "");
const structuredValue = parseStructuredOutput<{ status: string; local_only: boolean }>(structuredContent);
if (structuredValue.status !== "PASS" || structuredValue.local_only !== true) throw new Error("Structured response violated the required schema");

const streamStarted = now();
const streamResponse = await fetch(`${endpoint}/chat/completions`, {
  method: "POST", headers,
  body: JSON.stringify({ ...base, messages: [{ role: "user", content: "List three concise properties of a safe local model gateway." }], max_tokens: 64, stream: true, stream_options: { include_usage: true } })
});
if (!streamResponse.ok || !streamResponse.body) throw new Error(`Streaming request failed with HTTP ${streamResponse.status}`);
const reader = streamResponse.body.pipeThrough(new TextDecoderStream()).getReader();
let streamBuffer = "";
let streamText = "";
let ttftMs: number | null = null;
let streamUsage: { prompt_tokens?: number; completion_tokens?: number } = {};
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  streamBuffer += value;
  const lines = streamBuffer.split("\n");
  streamBuffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: typeof streamUsage };
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta && ttftMs === null) ttftMs = now() - streamStarted;
    streamText += delta;
    if (chunk.usage) streamUsage = chunk.usage;
  }
}
const streamLatencyMs = now() - streamStarted;
if (!streamText || ttftMs === null) throw new Error("Streaming completion produced no content");

let timeoutObserved = false;
try {
  await requestJson({ ...base, messages: [{ role: "user", content: "Write a long analysis." }], max_tokens: 512 }, AbortSignal.timeout(1));
} catch (error) {
  timeoutObserved = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
}
if (!timeoutObserved) throw new Error("Timeout was not observed");

const cancellationClient = new ModelGatewayClient({ endpoint, apiKey, timeoutMs: 30_000 });
const cancellationRequestId = "live-cancel-probe";
let cancellationObserved = false;
try {
  for await (const chunk of cancellationClient.stream({ requestId: cancellationRequestId, role: "analyst", prompt: "Generate a detailed architecture discussion.", schemaName: "probe", maxTokens: 512 })) {
    if (chunk.delta) {
      cancellationObserved = cancellationClient.cancel(cancellationRequestId);
      break;
    }
  }
} catch (error) {
  cancellationObserved ||= error instanceof Error && error.name === "AbortError";
}
if (!cancellationObserved) throw new Error("Cancellation was not acknowledged");

const queueClient = new ModelGatewayClient({ endpoint, apiKey, timeoutMs: 60_000 });
const queuedStarted = now();
const queued = Promise.all([
  queueClient.complete<{ request: number }>({ requestId: "queue-1", role: "orchestrator", prompt: "Return only JSON: {\"request\":1}", schemaName: "queue_probe", maxTokens: 32 }),
  queueClient.complete<{ request: number }>({ requestId: "queue-2", role: "orchestrator", prompt: "Return only JSON: {\"request\":2}", schemaName: "queue_probe", maxTokens: 32 })
]);
await new Promise((resolve) => setTimeout(resolve, 5));
const observedClientQueueDepth = queueClient.metrics().queueDepth;
const queuedResults = await queued;
const queuedLatencyMs = now() - queuedStarted;
if (queuedResults[0].output.request !== 1 || queuedResults[1].output.request !== 2) throw new Error("Concurrent structured requests returned invalid outputs");

clearInterval(sampler);
peakVramMiB = Math.max(peakVramMiB, await gpuMemoryMiB());
const usage = normal.json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
const completionTokens = streamUsage.completion_tokens ?? 0;
const generationSeconds = Math.max((streamLatencyMs - (ttftMs ?? 0)) / 1_000, 0.001);
const timestamp = new Date().toISOString();
const runId = `live-vllm-${timestamp.replaceAll(":", "-").replace(".", "-")}`;
const result = {
  schema_version: 1,
  run_id: runId,
  status: "PASS",
  timestamp,
  environment: {
    model: QUALITY_PROFILE.model,
    model_revision: QUALITY_PROFILE.revision,
    tokenizer_revision: QUALITY_PROFILE.tokenizerRevision,
    precision: QUALITY_PROFILE.dtype,
    max_model_length: QUALITY_PROFILE.maxModelLength,
    serving_backend: "vllm",
    serving_backend_version: "0.26.0",
    sampling_backend: "vllm_native",
    endpoint: "http://127.0.0.1:8000/v1",
    local_only: true
  },
  checks: {
    models: { status: "PASS", latency_ms: modelsLatencyMs, model_id: models.data?.[0]?.id },
    normal_completion: { status: "PASS", latency_ms: normal.latencyMs, prompt_tokens: usage?.prompt_tokens ?? 0, completion_tokens: usage?.completion_tokens ?? 0, output_sha256: sha256(normalContent) },
    structured_output: { status: "PASS", latency_ms: structured.latencyMs, schema_valid: true, output_sha256: sha256(structuredContent) },
    streaming: { status: "PASS", latency_ms: streamLatencyMs, ttft_ms: ttftMs, prompt_tokens: streamUsage.prompt_tokens ?? 0, completion_tokens: completionTokens, throughput_tokens_per_second: completionTokens / generationSeconds, output_sha256: sha256(streamText) },
    timeout: { status: timeoutObserved ? "PASS" : "FAIL" },
    cancellation: { status: cancellationObserved ? "PASS" : "FAIL" },
    concurrency_queue: { status: "PASS", requests: 2, observed_client_queue_depth: observedClientQueueDepth, total_latency_ms: queuedLatencyMs },
    malformed_output_handling: { status: (() => { try { parseStructuredOutput("plain prose"); return "FAIL"; } catch { return "PASS"; } })() }
  },
  telemetry: { idle_vram_mib: idleVramMiB, peak_vram_mib: peakVramMiB },
  privacy: { raw_model_output_stored: false, api_key_stored: false }
};

const outputDir = path.join(root, "docs/experiments/runs", runId);
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o644 });
console.log(JSON.stringify({ output: path.relative(root, path.join(outputDir, "result.json")), ...result }, null, 2));
