import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { QUALITY_PROFILE } from "../../model-gateway/src/index";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export interface LiveModelResult<T> {
  output: T | null;
  schemaValid: boolean;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  outputHash: string | null;
  error: string | null;
}

export async function readLocalModelAccess(root = process.cwd()): Promise<{ endpoint: string; apiKey: string; model: string }> {
  const apiKey = (await readFile(path.join(root, ".runtime/model/api-key"), "utf8")).trim();
  if (!apiKey) throw new Error("Local vLLM API key is missing");
  const endpoint = "http://127.0.0.1:8000/v1";
  const response = await fetch(`${endpoint}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Pinned local model endpoint returned HTTP ${response.status}`);
  const body = await response.json() as { data?: Array<{ id?: string }> };
  if (body.data?.[0]?.id !== QUALITY_PROFILE.model) throw new Error("Served model differs from the G3 freeze");
  return { endpoint, apiKey, model: QUALITY_PROFILE.model };
}

export class G3LiveModel {
  readonly #endpoint: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #seed: number;
  constructor(options: { endpoint: string; apiKey: string; model: string; seed?: number }) {
    this.#endpoint = options.endpoint;
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#seed = options.seed ?? 20260809;
  }

  async structured<T>(input: { requestId: string; system: string; prompt: string; schema: object; maxTokens: number; timeoutMs?: number }): Promise<LiveModelResult<T>> {
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
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.requestId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64),
              schema: input.schema,
              strict: true
            }
          }
        })
      });
      const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      const raw = body.choices?.[0]?.message?.content ?? "";
      let output: T;
      try { output = JSON.parse(raw) as T; }
      catch { return { output: null, schemaValid: false, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0, latencyMs: performance.now() - started, outputHash: sha256(raw), error: "INVALID_JSON" }; }
      return { output, schemaValid: true, promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0, latencyMs: performance.now() - started, outputHash: sha256(raw), error: null };
    } catch (error) {
      return { output: null, schemaValid: false, promptTokens: 0, completionTokens: 0, latencyMs: performance.now() - started, outputHash: null, error: error instanceof Error ? error.message : "MODEL_FAILURE" };
    }
  }
}

export const genericG3ResponseSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["ANSWER", "PATCH_PROPOSAL", "REPORT_ONLY", "BLOCKED_MISSING_ORACLE", "NEED_APPROVAL", "BLOCKED_SECURITY_POLICY"] },
    answer: { type: "string" },
    evidence_paths: { type: "array", items: { type: "string" }, maxItems: 8 },
    target_paths: { type: "array", items: { type: "string" }, maxItems: 4 },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["status", "answer", "evidence_paths", "target_paths", "confidence"]
});

