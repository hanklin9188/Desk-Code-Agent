import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export type ModelSpecializationProfileId = "baseline" | "coder";

export interface SharedServingProfile {
  backend: "vllm";
  backendVersion: string;
  generationConfig: "vllm";
  host: "127.0.0.1";
  port: number;
  precision: "bfloat16";
  comparisonContextLimit: number;
  gpuMemoryUtilization: number;
  maxNumSequences: number;
  prefixCaching: boolean;
  temperature: 0;
  seed: number;
  reasoningMode: false;
  residency: "SEQUENTIAL_ONLY";
}

export interface ModelSpecializationProfile {
  modelId: string;
  revision: string;
  tokenizerRevision: string;
  nativeContextLimit: number;
  architecture: string;
  chatTemplateSource: string;
  toolSupport: "NOT_USED_IN_COMPARISON";
  structuredOutputSupport: string;
  licenseId: string;
  licenseUse: string;
  snapshotDirectoryName: string;
  availability: string;
}

export interface ModelSpecializationRegistry {
  schemaVersion: 1;
  comparisonId: string;
  sharedServing: SharedServingProfile;
  profiles: Record<ModelSpecializationProfileId, ModelSpecializationProfile>;
}

export interface SnapshotFileExpectation { path: string; sha256: string; size: number }
export interface SnapshotVerification {
  profileId: ModelSpecializationProfileId;
  snapshotPath: string;
  status: "PASS" | "MISSING" | "HASH_MISMATCH";
  checkedFiles: number;
  failures: Array<{ path: string; reason: "MISSING" | "HASH_MISMATCH" | "SIZE_MISMATCH"; expected?: string; actual?: string }>;
}

export interface SpecializationModelResult<T> {
  output: T | null;
  /** Raw response content is transient and must never be persisted by callers. */
  rawText: string | null;
  schemaValid: boolean;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  outputHash: string | null;
  outputChars: number;
  outputTrimmedEmpty: boolean | null;
  finishReason: string | null;
  error: string | null;
}

export interface SpecializationTextRequest {
  requestId: string;
  system: string;
  prompt: string;
  maxTokens: number;
  timeoutMs?: number;
}

export interface SpecializationTextResult {
  rawText: string | null;
  outputHash: string | null;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  finishReason: string | null;
  error: string | null;
}

export function buildSpecializationTextRequestBody(input: {
  model: string;
  seed: number;
  system: string;
  prompt: string;
  maxTokens: number;
}) {
  return {
    model: input.model,
    temperature: 0 as const,
    seed: input.seed,
    max_tokens: input.maxTokens,
    chat_template_kwargs: { enable_thinking: false as const },
    messages: [{ role: "system" as const, content: input.system }, { role: "user" as const, content: input.prompt }]
  };
}

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sha256File = async (target: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(target);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

export function parseProfileId(value: string | undefined): ModelSpecializationProfileId {
  if (value !== "baseline" && value !== "coder") throw new Error("Model profile must be exactly baseline or coder");
  return value;
}

export async function readModelSpecializationRegistry(root = process.cwd()): Promise<ModelSpecializationRegistry> {
  const target = path.join(root, "config/model_specialization_profiles.json");
  const registry = JSON.parse(await readFile(target, "utf8")) as ModelSpecializationRegistry;
  if (registry.schemaVersion !== 1 || registry.sharedServing.host !== "127.0.0.1" || registry.sharedServing.residency !== "SEQUENTIAL_ONLY" || registry.sharedServing.generationConfig !== "vllm") {
    throw new Error("Model-specialization profile registry violates the local sequential-serving contract");
  }
  for (const id of ["baseline", "coder"] as const) {
    const profile = registry.profiles[id];
    if (!profile?.modelId || !/^[0-9a-f]{40}$/.test(profile.revision) || profile.tokenizerRevision !== profile.revision) {
      throw new Error(`Invalid immutable model profile: ${id}`);
    }
  }
  return registry;
}

export function modelSnapshotPath(root: string, profile: ModelSpecializationProfile): string {
  return path.join(root, ".runtime/model/huggingface/hub", profile.snapshotDirectoryName, "snapshots", profile.revision);
}

export async function inspectSnapshot(
  root: string,
  profileId: ModelSpecializationProfileId,
  profile: ModelSpecializationProfile,
  expectedFiles: SnapshotFileExpectation[] = []
): Promise<SnapshotVerification> {
  const snapshotPath = modelSnapshotPath(root, profile);
  try { await access(snapshotPath); } catch {
    return { profileId, snapshotPath, status: "MISSING", checkedFiles: 0, failures: [{ path: snapshotPath, reason: "MISSING" }] };
  }
  const failures: SnapshotVerification["failures"] = [];
  for (const expected of expectedFiles) {
    const target = path.join(snapshotPath, expected.path);
    try {
      const metadata = await stat(target);
      if (metadata.size !== expected.size) failures.push({ path: expected.path, reason: "SIZE_MISMATCH", expected: String(expected.size), actual: String(metadata.size) });
      const actual = await sha256File(target);
      if (actual !== expected.sha256) failures.push({ path: expected.path, reason: "HASH_MISMATCH", expected: expected.sha256, actual });
    } catch { failures.push({ path: expected.path, reason: "MISSING" }); }
  }
  return { profileId, snapshotPath, status: failures.some((item) => item.reason === "HASH_MISMATCH" || item.reason === "SIZE_MISMATCH") ? "HASH_MISMATCH" : failures.length ? "MISSING" : "PASS", checkedFiles: expectedFiles.length, failures };
}

export function buildProfileVllmArgs(profile: ModelSpecializationProfile, shared: SharedServingProfile): string[] {
  const args = [
    "serve", profile.modelId,
    "--host", shared.host,
    "--port", String(shared.port),
    "--revision", profile.revision,
    "--tokenizer-revision", profile.tokenizerRevision,
    "--served-model-name", profile.modelId,
    "--dtype", shared.precision,
    "--max-model-len", String(shared.comparisonContextLimit),
    "--gpu-memory-utilization", String(shared.gpuMemoryUtilization),
    "--max-num-seqs", String(shared.maxNumSequences)
  ];
  args.push("--generation-config", shared.generationConfig);
  if (shared.prefixCaching) args.push("--enable-prefix-caching");
  return args;
}

export function assertExactSequentialServedModel(body: { data?: Array<{ id?: string }> }, expectedModelId: string, profileId: ModelSpecializationProfileId): void {
  const servedModelIds = body.data?.map((item) => item.id).filter((id): id is string => typeof id === "string") ?? [];
  if (servedModelIds.length !== 1 || body.data?.length !== 1 || servedModelIds[0] !== expectedModelId) throw new Error(`Served model set does not exactly match sequential profile ${profileId}`);
}

export async function readProfileModelAccess(root: string, profileId: ModelSpecializationProfileId): Promise<{ endpoint: string; apiKey: string; model: string; profile: ModelSpecializationProfile; shared: SharedServingProfile }> {
  const registry = await readModelSpecializationRegistry(root);
  const profile = registry.profiles[profileId];
  const apiKeyPath = path.join(root, ".runtime/model/api-key");
  const apiKeyMetadata = await lstat(apiKeyPath);
  if (!apiKeyMetadata.isFile() || apiKeyMetadata.isSymbolicLink() || (apiKeyMetadata.mode & 0o077) !== 0 || await realpath(apiKeyPath) !== apiKeyPath) throw new Error("Local vLLM API key must be a private regular project-local file");
  const apiKey = (await readFile(apiKeyPath, "utf8")).trim();
  if (apiKey.length < 32) throw new Error("Local vLLM API key is missing or invalid");
  const endpoint = `http://${registry.sharedServing.host}:${registry.sharedServing.port}/v1`;
  const response = await fetch(`${endpoint}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Local model endpoint returned HTTP ${response.status}`);
  const body = await response.json() as { data?: Array<{ id?: string }> };
  assertExactSequentialServedModel(body, profile.modelId, profileId);
  return { endpoint, apiKey, model: profile.modelId, profile, shared: registry.sharedServing };
}

export class SpecializationLiveModel {
  readonly #endpoint: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #seed: number;

  constructor(options: { endpoint: string; apiKey: string; model: string; seed: number }) {
    if (!options.endpoint.startsWith("http://127.0.0.1:")) throw new Error("Specialization model endpoint must be loopback");
    this.#endpoint = options.endpoint;
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#seed = options.seed;
  }

  async completeText(input: SpecializationTextRequest): Promise<SpecializationTextResult> {
    const started = performance.now();
    try {
      const response = await fetch(`${this.#endpoint}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
        body: JSON.stringify(buildSpecializationTextRequestBody({
          model: this.#model,
          seed: this.#seed,
          system: input.system,
          prompt: input.prompt,
          maxTokens: input.maxTokens
        }))
      });
      const body = await response.json() as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      const rawText = body.choices?.[0]?.message?.content;
      if (typeof rawText !== "string") throw new Error("MODEL_RESPONSE_MISSING_CONTENT");
      return {
        rawText,
        outputHash: sha256(rawText),
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
        latencyMs: performance.now() - started,
        finishReason: body.choices?.[0]?.finish_reason ?? "unknown",
        error: null
      };
    } catch (error) {
      return {
        rawText: null,
        outputHash: null,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: performance.now() - started,
        finishReason: null,
        error: error instanceof Error ? error.message : "MODEL_FAILURE"
      };
    }
  }

  async structured<T>(input: { requestId: string; system: string; prompt: string; schema: object; maxTokens: number; timeoutMs?: number }): Promise<SpecializationModelResult<T>> {
    const started = performance.now();
    try {
      const response = await fetch(`${this.#endpoint}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
        body: JSON.stringify({
          model: this.#model,
          temperature: 0,
          seed: this.#seed,
          max_tokens: input.maxTokens,
          chat_template_kwargs: { enable_thinking: false },
          messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }],
          response_format: { type: "json_schema", json_schema: { name: input.requestId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64), schema: input.schema, strict: true } }
        })
      });
      const body = await response.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      const raw = body.choices?.[0]?.message?.content ?? "";
      try {
        return { output: JSON.parse(raw) as T, rawText: raw, schemaValid: true, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0, latencyMs: performance.now() - started, outputHash: sha256(raw), outputChars: raw.length, outputTrimmedEmpty: raw.trim().length === 0, finishReason: body.choices?.[0]?.finish_reason ?? "unknown", error: null };
      } catch {
        return { output: null, rawText: raw, schemaValid: false, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0, latencyMs: performance.now() - started, outputHash: sha256(raw), outputChars: raw.length, outputTrimmedEmpty: raw.trim().length === 0, finishReason: body.choices?.[0]?.finish_reason ?? "unknown", error: "INVALID_JSON" };
      }
    } catch (error) {
      return { output: null, rawText: null, schemaValid: false, promptTokens: 0, completionTokens: 0, latencyMs: performance.now() - started, outputHash: null, outputChars: 0, outputTrimmedEmpty: null, finishReason: null, error: error instanceof Error ? error.message : "MODEL_FAILURE" };
    }
  }
}

export function acquisitionCommand(root: string, profile: ModelSpecializationProfile): string {
  const cache = path.join(root, ".runtime/model/huggingface");
  return `DCA_HF_CACHE_DIR=${cache} HF_HOME=${cache} runtime/model/.venv/bin/hf download ${profile.modelId} --revision ${profile.revision}`;
}

export function pairedOutcome(baseline: boolean, coder: boolean): "BOTH_PASS" | "BASELINE_ONLY" | "CODER_ONLY" | "BOTH_FAIL" {
  if (baseline && coder) return "BOTH_PASS";
  if (baseline) return "BASELINE_ONLY";
  if (coder) return "CODER_ONLY";
  return "BOTH_FAIL";
}

export function evaluateDevelopmentPromotion(input: {
  patchBaselineRate: number; patchCoderRate: number;
  diagnosisBaselineRate: number; diagnosisCoderRate: number;
  endToEndBaselineRate: number; endToEndCoderRate: number;
  baselineSafetyViolations: number; coderSafetyViolations: number;
  coderPeakVramMiB: number; deviceTotalVramMiB: number;
}): { passed: boolean; gates: Record<string, boolean> } {
  const gates = {
    patchAbsoluteGainAtLeast10Pp: input.patchCoderRate - input.patchBaselineRate >= 0.10,
    diagnosisOrEndToEndGainAtLeast10Pp: input.diagnosisCoderRate - input.diagnosisBaselineRate >= 0.10 || input.endToEndCoderRate - input.endToEndBaselineRate >= 0.10,
    noSafetyRegression: input.coderSafetyViolations <= input.baselineSafetyViolations && input.coderSafetyViolations === 0,
    fitsDeviceWithAtLeast512MiBHeadroom: input.coderPeakVramMiB <= input.deviceTotalVramMiB - 512
  };
  return { passed: Object.values(gates).every(Boolean), gates };
}
