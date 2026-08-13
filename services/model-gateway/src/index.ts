import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ModelRole = "orchestrator" | "analyst" | "coder" | "reviewer" | "reporter";
export interface ModelHealth { status: "ready" | "offline" | "loading"; endpoint: string; localOnly: boolean; model: string; revision: string }
export interface StructuredModelRequest { requestId: string; role: ModelRole; prompt: string; schemaName: string; maxTokens: number; responseSchema?: object }
export interface StructuredModelResponse<T = unknown> { requestId: string; output: T; finishReason: string; promptTokens: number; completionTokens: number; latencyMs: number }
export interface ModelChunk { requestId: string; delta: string; done: boolean }
export interface ModelMetrics { completedRequests: number; failedRequests: number; cancelledRequests: number; promptTokens: number; completionTokens: number; totalLatencyMs: number; queueDepth: number }

export interface ModelProfile {
  id: "quality" | "balanced" | "compact";
  model: string;
  revision: string;
  tokenizerRevision: string;
  dtype: string;
  maxModelLength: number;
  gpuMemoryUtilization: number;
  concurrency: number;
  prefixCaching: boolean;
  status: "baseline" | "experimental" | "validated";
}

export const QUALITY_PROFILE: ModelProfile = Object.freeze({
  id: "quality", model: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a",
  tokenizerRevision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", dtype: "bfloat16",
  maxModelLength: 8192, gpuMemoryUtilization: 0.82, concurrency: 1, prefixCaching: true, status: "baseline"
});
export const BALANCED_PROFILE: ModelProfile = Object.freeze({ ...QUALITY_PROFILE, id: "balanced", dtype: "fp8", gpuMemoryUtilization: 0.78, status: "experimental" });
export const COMPACT_PROFILE: ModelProfile = Object.freeze({ ...QUALITY_PROFILE, id: "compact", model: "Qwen/Qwen3.5-4B-AWQ-or-GPTQ", dtype: "int4", gpuMemoryUtilization: 0.72, status: "experimental" });

export interface GpuProbe { available: boolean; name?: string; totalMemoryMiB?: number; error?: string }
export interface VllmPreflight {
  wsl: boolean;
  gpu: GpuProbe;
  vllmAvailable: boolean;
  ready: boolean;
  blockers: string[];
  checkedAt: string;
}
export interface PreflightAdapters {
  commandExists: (name: string) => Promise<boolean>;
  gpuProbe: () => Promise<GpuProbe>;
}

export function candidateExecutablePaths(name: string, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = name === "vllm" ? env.DCA_VLLM_EXECUTABLE : undefined;
  return [...new Set([
    ...(configured ? [path.resolve(configured)] : []),
    path.resolve(cwd, "runtime/model/.venv/bin", name)
  ])];
}

const defaultAdapters: PreflightAdapters = {
  commandExists: async (name) => {
    try { await execFileAsync("which", [name], { timeout: 3_000 }); return true; } catch {
      for (const candidate of candidateExecutablePaths(name)) {
        try { await access(candidate, fsConstants.X_OK); return true; } catch { /* continue bounded candidates */ }
      }
      return false;
    }
  },
  gpuProbe: async () => {
    try {
      const { stdout } = await execFileAsync("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], { timeout: 5_000, maxBuffer: 16_384 });
      const [name, memory] = stdout.trim().split(",").map((value) => value.trim());
      return { available: true, name, totalMemoryMiB: Number(memory) };
    } catch (error) { return { available: false, error: error instanceof Error ? error.message : "GPU probe failed" }; }
  }
};

export async function preflightVllm(adapters: PreflightAdapters = defaultAdapters): Promise<VllmPreflight> {
  const wsl = os.release().toLowerCase().includes("microsoft") || Boolean(process.env.WSL_DISTRO_NAME);
  const [gpu, vllmAvailable] = await Promise.all([adapters.gpuProbe(), adapters.commandExists("vllm")]);
  const blockers: string[] = [];
  if (!wsl && process.platform === "win32") blockers.push("vLLM requires the configured WSL2 backend on Windows");
  if (!gpu.available) blockers.push("NVIDIA GPU is not available to the runtime");
  if (!vllmAvailable) blockers.push("vLLM executable is not available");
  return { wsl, gpu, vllmAvailable, ready: blockers.length === 0, blockers, checkedAt: new Date().toISOString() };
}

export interface LaunchSpec { command: "vllm"; args: string[]; redactedArgs: string[]; env: Record<string, string> }
export function buildVllmLaunchSpec(profile: ModelProfile, apiKey: string): LaunchSpec {
  if (!apiKey || apiKey.length < 8) throw new Error("An ephemeral API key with at least 8 characters is required");
  const args = [
    "serve", profile.model, "--host", "127.0.0.1", "--port", "8000", "--dtype", profile.dtype,
    "--revision", profile.revision, "--tokenizer-revision", profile.tokenizerRevision,
    "--served-model-name", profile.model,
    "--max-model-len", String(profile.maxModelLength), "--gpu-memory-utilization", String(profile.gpuMemoryUtilization),
    "--max-num-seqs", String(profile.concurrency), "--api-key", apiKey
  ];
  if (profile.prefixCaching) args.push("--enable-prefix-caching");
  return { command: "vllm", args, redactedArgs: args.map((value, index) => args[index - 1] === "--api-key" ? "[REDACTED]" : value), env: { VLLM_API_KEY: apiKey } };
}

export const createEphemeralApiKey = () => randomBytes(32).toString("base64url");

export function isLoopbackEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
  } catch { return false; }
}

export function parseStructuredOutput<T>(content: string): T {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) throw new Error("Model response did not contain structured JSON output");
  try { return JSON.parse(candidate) as T; }
  catch (error) { throw new Error(`Model returned invalid structured JSON: ${error instanceof Error ? error.message : "parse error"}`); }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
interface ClientOptions { endpoint?: string; apiKey: string; fetch?: FetchLike; timeoutMs?: number; model?: string }

export class ModelGatewayClient {
  readonly #endpoint: string;
  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #model: string;
  readonly #controllers = new Map<string, AbortController>();
  readonly #metrics: ModelMetrics = { completedRequests: 0, failedRequests: 0, cancelledRequests: 0, promptTokens: 0, completionTokens: 0, totalLatencyMs: 0, queueDepth: 0 };

  constructor(options: ClientOptions) {
    this.#endpoint = options.endpoint ?? "http://127.0.0.1:8000/v1";
    if (!isLoopbackEndpoint(this.#endpoint)) throw new Error("Model endpoint must be loopback while local-only policy is active");
    if (!options.apiKey) throw new Error("Model API key is required");
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 180_000;
    this.#model = options.model ?? QUALITY_PROFILE.model;
  }

  async health(): Promise<ModelHealth> {
    try {
      const response = await this.#fetch(`${this.#endpoint}/models`, { headers: this.#headers(), signal: AbortSignal.timeout(Math.min(this.#timeoutMs, 5_000)) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { status: "ready", endpoint: this.#endpoint, localOnly: true, model: this.#model, revision: QUALITY_PROFILE.revision };
    } catch { return { status: "offline", endpoint: this.#endpoint, localOnly: true, model: this.#model, revision: QUALITY_PROFILE.revision }; }
  }

  async complete<T = unknown>(request: StructuredModelRequest): Promise<StructuredModelResponse<T>> {
    this.#validateRequest(request);
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), this.#timeoutMs);
    this.#controllers.set(request.requestId, controller);
    this.#metrics.queueDepth += 1;
    try {
      const response = await this.#fetch(`${this.#endpoint}/chat/completions`, {
        method: "POST", headers: this.#headers(), signal: controller.signal,
        body: JSON.stringify({ model: this.#model, messages: [{ role: "user", content: request.prompt }], max_tokens: request.maxTokens, stream: false, response_format: request.responseSchema ? { type: "json_schema", json_schema: { name: request.schemaName, schema: request.responseSchema, strict: true } } : { type: "json_object" } })
      });
      if (!response.ok) throw new Error(`Model request failed with HTTP ${response.status}`);
      const body = await response.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Model response is missing message content");
      const latencyMs = performance.now() - started;
      const promptTokens = body.usage?.prompt_tokens ?? 0;
      const completionTokens = body.usage?.completion_tokens ?? 0;
      this.#metrics.completedRequests += 1; this.#metrics.promptTokens += promptTokens; this.#metrics.completionTokens += completionTokens; this.#metrics.totalLatencyMs += latencyMs;
      return { requestId: request.requestId, output: parseStructuredOutput<T>(content), finishReason: body.choices?.[0]?.finish_reason ?? "unknown", promptTokens, completionTokens, latencyMs };
    } catch (error) {
      if (controller.signal.aborted) this.#metrics.cancelledRequests += 1; else this.#metrics.failedRequests += 1;
      throw error;
    } finally { clearTimeout(timeout); this.#controllers.delete(request.requestId); this.#metrics.queueDepth -= 1; }
  }

  async *stream(request: StructuredModelRequest): AsyncGenerator<ModelChunk> {
    this.#validateRequest(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), this.#timeoutMs);
    this.#controllers.set(request.requestId, controller); this.#metrics.queueDepth += 1;
    try {
      const response = await this.#fetch(`${this.#endpoint}/chat/completions`, {
        method: "POST", headers: this.#headers(), signal: controller.signal,
        body: JSON.stringify({ model: this.#model, messages: [{ role: "user", content: request.prompt }], max_tokens: request.maxTokens, stream: true })
      });
      if (!response.ok || !response.body) throw new Error(`Model stream failed with HTTP ${response.status}`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") { yield { requestId: request.requestId, delta: "", done: true }; return; }
          const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) yield { requestId: request.requestId, delta, done: false };
        }
      }
      yield { requestId: request.requestId, delta: "", done: true };
    } finally { clearTimeout(timeout); this.#controllers.delete(request.requestId); this.#metrics.queueDepth -= 1; }
  }

  cancel(requestId: string): boolean {
    const controller = this.#controllers.get(requestId); controller?.abort("cancelled");
    return Boolean(controller);
  }
  metrics(): Readonly<ModelMetrics> { return Object.freeze({ ...this.#metrics }); }
  #headers() { return { "authorization": `Bearer ${this.#apiKey}`, "content-type": "application/json" }; }
  #validateRequest(request: StructuredModelRequest) {
    if (!request.requestId || !request.prompt || !request.schemaName) throw new Error("Structured model request is incomplete");
    if (request.maxTokens < 1 || request.maxTokens > 16_384) throw new Error("Token budget is outside the accepted range");
  }
}

export class LocalModelGateway {
  readonly #endpoint: string;
  readonly #controllers = new Map<string, AbortController>();
  constructor(endpoint = "http://127.0.0.1:8000/v1") {
    if (!isLoopbackEndpoint(endpoint)) throw new Error("Model endpoint must be loopback while local-only policy is active");
    this.#endpoint = endpoint;
  }
  health(): ModelHealth { return { status: "ready", endpoint: this.#endpoint, localOnly: true, model: QUALITY_PROFILE.model, revision: "offline-simulator" }; }
  async *stream(request: StructuredModelRequest): AsyncGenerator<ModelChunk> {
    if (request.maxTokens < 1 || request.maxTokens > 16_384) throw new Error("Token budget is outside the accepted range");
    const controller = new AbortController(); this.#controllers.set(request.requestId, controller);
    for (const delta of ["Evidence", " retrieved.", " Preparing", " structured", " result."]) {
      if (controller.signal.aborted) break;
      await Promise.resolve(); yield { requestId: request.requestId, delta, done: false };
    }
    this.#controllers.delete(request.requestId); yield { requestId: request.requestId, delta: "", done: true };
  }
  cancel(requestId: string): boolean { const controller = this.#controllers.get(requestId); controller?.abort(); this.#controllers.delete(requestId); return Boolean(controller); }
}
