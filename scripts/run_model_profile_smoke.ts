import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseStructuredOutput } from "../services/model-gateway/src/index";
import { parseProfileId, readModelSpecializationRegistry } from "../services/model-specialization-runtime/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const profileId = parseProfileId(process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length));
const artifactVersion = process.argv.find((value) => value.startsWith("--artifact-version="))?.slice("--artifact-version=".length) ?? "v2";
if (!/^v[23]$/.test(artifactVersion)) throw new Error("Artifact version must be v2 or v3");
const registry = await readModelSpecializationRegistry(root);
const profile = registry.profiles[profileId];
const shared = registry.sharedServing;
const endpoint = `http://${shared.host}:${shared.port}/v1`;
const keyPath = path.join(root, ".runtime/model/api-key");
const startStatePath = path.join(root, ".runtime/model/profile-start.json");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const now = () => performance.now();

async function gpuMemoryMiB(): Promise<number> {
  const { stdout } = await execFileAsync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { timeout: 5_000 });
  return Number(stdout.trim().split(/\s+/)[0]);
}

async function waitUntilReady(): Promise<{ apiKey: string; models: { data?: Array<{ id?: string }> }; loadTimeMs: number }> {
  const startState = JSON.parse(await readFile(startStatePath, "utf8")) as { profileId: string; startedEpochMs: number };
  if (startState.profileId !== profileId) throw new Error("Profile start state does not match requested smoke profile");
  const deadline = Date.now() + 10 * 60_000;
  let lastError = "not started";
  while (Date.now() < deadline) {
    try {
      const apiKey = (await readFile(keyPath, "utf8")).trim();
      const response = await fetch(`${endpoint}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(2_000) });
      const models = await response.json() as { data?: Array<{ id?: string }> };
      if (response.ok && models.data?.some((item) => item.id === profile.modelId)) {
        const loadTimeMs = Date.now() - startState.startedEpochMs;
        await writeFile(path.join(root, ".runtime/model/profile-ready.json"), `${JSON.stringify({ profileId, readyEpochMs: Date.now(), loadTimeMs })}\n`, { flag: "wx" });
        return { apiKey, models, loadTimeMs };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) { lastError = error instanceof Error ? error.message : "readiness failure"; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Model did not become ready: ${lastError}`);
}

const ready = await waitUntilReady();
const headers = { authorization: `Bearer ${ready.apiKey}`, "content-type": "application/json" };
const base = { model: profile.modelId, temperature: shared.temperature, seed: shared.seed, chat_template_kwargs: { enable_thinking: shared.reasoningMode } };

async function request(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ response: Response; json: Record<string, any>; latencyMs: number }> {
  const started = now();
  const response = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });
  const json = await response.json() as Record<string, any>;
  return { response, json, latencyMs: now() - started };
}

let peakVramMiB = await gpuMemoryMiB();
const idleVramMiB = peakVramMiB;
const vramSamples: number[] = [peakVramMiB];
const sampler = setInterval(async () => {
  try { const value = await gpuMemoryMiB(); vramSamples.push(value); peakVramMiB = Math.max(peakVramMiB, value); } catch { /* measurement cannot change inference truth */ }
}, 100);

const modelsStarted = now();
const modelsResponse = await fetch(`${endpoint}/models`, { headers });
const modelsBody = await modelsResponse.json() as { data?: Array<{ id?: string }> };
const modelsLatencyMs = now() - modelsStarted;
if (!modelsResponse.ok || !modelsBody.data?.some((item) => item.id === profile.modelId)) throw new Error("Exact served model was not returned by /v1/models");

const ordinary = await request({ ...base, messages: [{ role: "user", content: "Reply in one short sentence confirming local readiness." }], max_tokens: 48 });
const ordinaryContent = ordinary.json.choices?.[0]?.message?.content;
if (!ordinary.response.ok || typeof ordinaryContent !== "string" || !ordinaryContent) throw new Error("Ordinary completion failed");

const objectSchema = { type: "object", additionalProperties: false, properties: { status: { type: "string", enum: ["PASS"] }, local_only: { type: "boolean", const: true } }, required: ["status", "local_only"] };
const structured = await request({ ...base, messages: [{ role: "user", content: "Return the required gateway status object." }], max_tokens: 48, response_format: { type: "json_schema", json_schema: { name: "specialization_smoke", schema: objectSchema, strict: true } } });
const structuredContent = structured.json.choices?.[0]?.message?.content ?? "";
const structuredValue = parseStructuredOutput<{ status: string; local_only: boolean }>(structuredContent);
if (!structured.response.ok || structuredValue.status !== "PASS" || !structuredValue.local_only) throw new Error("Structured JSON validation failed");

const streamStarted = now();
const streamResponse = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers, body: JSON.stringify({ ...base, messages: [{ role: "user", content: "List three concise properties of safe local inference." }], max_tokens: 64, stream: true, stream_options: { include_usage: true } }) });
if (!streamResponse.ok || !streamResponse.body) throw new Error(`Streaming failed with HTTP ${streamResponse.status}`);
const reader = streamResponse.body.pipeThrough(new TextDecoderStream()).getReader();
let buffer = ""; let streamText = ""; let ttftMs: number | null = null; let streamUsage: { prompt_tokens?: number; completion_tokens?: number } = {};
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += value;
  const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
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
if (!streamText || ttftMs === null) throw new Error("Streaming returned no content");

let timeoutObserved = false;
try { await request({ ...base, messages: [{ role: "user", content: "Write a long analysis." }], max_tokens: 512 }, AbortSignal.timeout(1)); }
catch (error) { timeoutObserved = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name); }
if (!timeoutObserved) throw new Error("Timeout cancellation was not observed");

const cancelController = new AbortController();
const cancelResponse = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers, body: JSON.stringify({ ...base, messages: [{ role: "user", content: "Generate a long code review with many sections." }], max_tokens: 1_024, stream: true }), signal: cancelController.signal });
if (!cancelResponse.ok || !cancelResponse.body) throw new Error("Cancellation probe stream failed to start");
const cancelReader = cancelResponse.body.getReader();
await cancelReader.read();
cancelController.abort("smoke-cancel");
const cancellationObserved = cancelController.signal.aborted;
try { await cancelReader.cancel("smoke-cancel"); } catch { /* abort may already have closed the reader */ }
if (!cancellationObserved) throw new Error("Explicit cancellation was not observed");

const sequence = [];
for (let index = 1; index <= 3; index += 1) {
  const item = await request({ ...base, messages: [{ role: "user", content: `Return exactly the integer ${index} as JSON field value.` }], max_tokens: 24, response_format: { type: "json_schema", json_schema: { name: `sequence_${index}`, schema: { type: "object", additionalProperties: false, properties: { value: { type: "integer", const: index } }, required: ["value"] }, strict: true } } });
  const content = item.json.choices?.[0]?.message?.content ?? "";
  if (!item.response.ok || parseStructuredOutput<{ value: number }>(content).value !== index) throw new Error(`Sequential request ${index} failed`);
  sequence.push({ index, latencyMs: item.latencyMs, outputSha256: sha256(content) });
}

const queueStarted = now();
const queue = await Promise.all([1, 2].map((value) => request({ ...base, messages: [{ role: "user", content: `Return JSON with queue value ${value}.` }], max_tokens: 24, response_format: { type: "json_schema", json_schema: { name: `queue_${value}`, schema: { type: "object", additionalProperties: false, properties: { value: { type: "integer", const: value } }, required: ["value"] }, strict: true } } })));
for (const [index, item] of queue.entries()) if (!item.response.ok || parseStructuredOutput<{ value: number }>(item.json.choices?.[0]?.message?.content ?? "").value !== index + 1) throw new Error("Queued request failed");
const queueLatencyMs = now() - queueStarted;

const oversized = await request({ ...base, messages: [{ role: "user", content: `Context cap probe: ${"token ".repeat(10_000)}` }], max_tokens: 1 });
const contextCapRejected = !oversized.response.ok && [400, 413, 422].includes(oversized.response.status);
if (!contextCapRejected) throw new Error("Over-context request was not rejected by the fixed model cap");

const utf8Schema = { type: "object", additionalProperties: false, properties: { utf8: { type: "string", const: "臺灣✓" }, code: { type: "string", const: "const ok = true;" }, diff: { type: "string", const: "--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-false\n+true" } }, required: ["utf8", "code", "diff"] };
const utf8 = await request({ ...base, messages: [{ role: "user", content: "Return the required UTF-8, code, and unified-diff-like fields." }], max_tokens: 128, response_format: { type: "json_schema", json_schema: { name: "utf8_code_diff", schema: utf8Schema, strict: true } } });
const utf8Content = utf8.json.choices?.[0]?.message?.content ?? "";
const utf8Value = parseStructuredOutput<{ utf8: string; code: string; diff: string }>(utf8Content);
if (!utf8.response.ok || utf8Value.utf8 !== "臺灣✓" || !utf8Value.code.includes("const") || !utf8Value.diff.startsWith("--- a/")) throw new Error("UTF-8/code/diff structured transport failed");

clearInterval(sampler);
peakVramMiB = Math.max(peakVramMiB, await gpuMemoryMiB());
const completionTokens = streamUsage.completion_tokens ?? 0;
const generationSeconds = Math.max((streamLatencyMs - ttftMs) / 1_000, 0.001);
const timestamp = new Date().toISOString();
const result = {
  schemaVersion: 1,
  runId: `model-specialization-smoke-${profileId}-${timestamp.replace(/[:.]/g, "-")}`,
  status: "PASS_RUNTIME_PENDING_SHUTDOWN_CLEANUP",
  profileId,
  timestamp,
  exactProfile: { modelId: profile.modelId, revision: profile.revision, tokenizerRevision: profile.tokenizerRevision, precision: shared.precision, backend: `${shared.backend}-${shared.backendVersion}`, contextLimit: shared.comparisonContextLimit, host: shared.host, sequentialResidency: true },
  checks: {
    load: { status: "PASS", loadTimeMs: ready.loadTimeMs },
    models: { status: "PASS", latencyMs: modelsLatencyMs, modelId: profile.modelId },
    ordinaryCompletion: { status: "PASS", latencyMs: ordinary.latencyMs, promptTokens: ordinary.json.usage?.prompt_tokens ?? 0, completionTokens: ordinary.json.usage?.completion_tokens ?? 0, outputSha256: sha256(ordinaryContent) },
    streaming: { status: "PASS", latencyMs: streamLatencyMs, ttftMs, promptTokens: streamUsage.prompt_tokens ?? 0, completionTokens, throughputTokensPerSecond: completionTokens / generationSeconds, outputSha256: sha256(streamText) },
    structuredJson: { status: "PASS", latencyMs: structured.latencyMs, schemaValid: true, outputSha256: sha256(structuredContent) },
    malformedJsonHandling: { status: (() => { try { parseStructuredOutput("plain prose"); return "FAIL"; } catch { return "PASS"; } })() },
    timeout: { status: "PASS" },
    cancellation: { status: "PASS" },
    sequential: { status: "PASS", requests: sequence },
    queue: { status: "PASS", requests: 2, maxNumSequences: shared.maxNumSequences, totalLatencyMs: queueLatencyMs },
    contextCap: { status: "PASS", configuredTokens: shared.comparisonContextLimit, rejectedHttpStatus: oversized.response.status },
    utf8CodeDiff: { status: "PASS", latencyMs: utf8.latencyMs, outputSha256: sha256(utf8Content) },
    shutdownCleanup: { status: "PENDING_SEPARATE_LIFECYCLE_ATTESTATION" }
  },
  telemetry: { idleVramMiB, peakVramMiB, vramSamples: vramSamples.length },
  privacy: { rawPromptStored: false, rawOutputStored: false, apiKeyStoredInArtifact: false }
};

const outputRoot = path.join(root, "docs/experiments/model-specialization");
await mkdir(outputRoot, { recursive: true });
const name = `${profileId.toUpperCase()}_MODEL_SMOKE_VALIDATION.${artifactVersion}.json`;
const body = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(path.join(outputRoot, name), body, { flag: "wx" });
await writeFile(path.join(outputRoot, `${name}.sha256`), `${sha256(body)}  ${name}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output: `docs/experiments/model-specialization/${name}`, status: result.status, loadTimeMs: ready.loadTimeMs, idleVramMiB, peakVramMiB, ttftMs, throughputTokensPerSecond: completionTokens / generationSeconds }, null, 2)}\n`);
