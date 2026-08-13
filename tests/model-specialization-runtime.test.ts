import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  acquisitionCommand,
  assertExactSequentialServedModel,
  buildSpecializationTextRequestBody,
  buildProfileVllmArgs,
  evaluateDevelopmentPromotion,
  pairedOutcome,
  parseProfileId,
  readModelSpecializationRegistry,
  SpecializationLiveModel
} from "../services/model-specialization-runtime/src/index";

describe("model specialization runtime", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pins the shared vLLM V1 model runner required by the approved CUDA path", async () => {
    const launcher = await readFile(path.resolve("scripts/start_model_profile.sh"), "utf8");
    expect(launcher).toContain("export VLLM_USE_V2_MODEL_RUNNER=0");
  });

  it("loads two exact immutable profiles with one shared serving contract", async () => {
    const registry = await readModelSpecializationRegistry();
    expect(registry.sharedServing.precision).toBe("bfloat16");
    expect(registry.sharedServing.residency).toBe("SEQUENTIAL_ONLY");
    expect(registry.sharedServing.generationConfig).toBe("vllm");
    expect(registry.profiles.baseline.revision).toBe("851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a");
    expect(registry.profiles.coder.revision).toBe("488639f1ff808d1d3d0ba301aef8c11461451ec5");
  });

  it("rejects arbitrary profile input and builds a loopback-equivalent launch", async () => {
    expect(parseProfileId("baseline")).toBe("baseline");
    expect(() => parseProfileId("../../remote")).toThrow(/baseline or coder/);
    const registry = await readModelSpecializationRegistry();
    const args = buildProfileVllmArgs(registry.profiles.coder, registry.sharedServing);
    expect(args.slice(args.indexOf("--host"), args.indexOf("--host") + 2)).toEqual(["--host", "127.0.0.1"]);
    expect(args.slice(args.indexOf("--dtype"), args.indexOf("--dtype") + 2)).toEqual(["--dtype", "bfloat16"]);
    expect(args.slice(args.indexOf("--revision"), args.indexOf("--revision") + 2)).toEqual(["--revision", registry.profiles.coder.revision]);
    expect(args.slice(args.indexOf("--generation-config"), args.indexOf("--generation-config") + 2)).toEqual(["--generation-config", "vllm"]);
  });

  it("requires the local endpoint to expose exactly the selected sequential model", () => {
    expect(() => assertExactSequentialServedModel({ data: [{ id: "Qwen/Qwen3.5-4B" }] }, "Qwen/Qwen3.5-4B", "baseline")).not.toThrow();
    expect(() => assertExactSequentialServedModel({ data: [{ id: "Qwen/Qwen3.5-4B" }, { id: "unexpected" }] }, "Qwen/Qwen3.5-4B", "baseline")).toThrow(/exactly match/);
    expect(() => assertExactSequentialServedModel({ data: [{ id: "unexpected" }] }, "Qwen/Qwen3.5-4B", "baseline")).toThrow(/exactly match/);
  });

  it("renders an exact approval-gated acquisition command", async () => {
    const registry = await readModelSpecializationRegistry();
    const command = acquisitionCommand("/workspace/desk-code-agent-v2", registry.profiles.coder);
    expect(command).toContain("Qwen/Qwen2.5-Coder-3B-Instruct");
    expect(command).toContain("--revision 488639f1ff808d1d3d0ba301aef8c11461451ec5");
    expect(command).not.toContain("latest");
  });

  it("builds unconstrained text requests without weakening fixed model settings", () => {
    const body = buildSpecializationTextRequestBody({ model: "local-model", seed: 20260809, system: "Return a diff.", prompt: "Fix the target.", maxTokens: 640 });
    expect(body).toEqual({
      model: "local-model",
      temperature: 0,
      seed: 20260809,
      max_tokens: 640,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: "system", content: "Return a diff." }, { role: "user", content: "Fix the target." }]
    });
    expect(body).not.toHaveProperty("response_format");
    expect(body).not.toHaveProperty("tools");
  });

  it("returns raw text and telemetry in memory without a response schema", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "--- a/src/value.ts\n+++ b/src/value.ts\n" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 23, completion_tokens: 11 }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const model = new SpecializationLiveModel({ endpoint: "http://127.0.0.1:8000/v1", apiKey: "ephemeral-test-key", model: "local-model", seed: 20260809 });

    const result = await model.completeText({ requestId: "p1-task", system: "Return only a unified diff.", prompt: "Fix the supplied function.", maxTokens: 640, timeoutMs: 2_000 });

    expect(result).toMatchObject({ rawText: "--- a/src/value.ts\n+++ b/src/value.ts\n", promptTokens: 23, completionTokens: 11, finishReason: "stop", error: null });
    expect(result.outputHash).toMatch(/^[0-9a-f]{64}$/);
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe("http://127.0.0.1:8000/v1/chat/completions");
    expect(init?.headers).toMatchObject({ authorization: "Bearer ephemeral-test-key", "content-type": "application/json" });
    const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(requestBody).not.toHaveProperty("response_format");
    expect(requestBody).toMatchObject({ model: "local-model", temperature: 0, seed: 20260809, max_tokens: 640, chat_template_kwargs: { enable_thinking: false } });
  });

  it("returns a bounded error result when unconstrained completion fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "local endpoint unavailable" } }), { status: 503, headers: { "content-type": "application/json" } }));
    const model = new SpecializationLiveModel({ endpoint: "http://127.0.0.1:8000/v1", apiKey: "ephemeral-test-key", model: "local-model", seed: 20260809 });

    const result = await model.completeText({ requestId: "p1-failure", system: "Return only a unified diff.", prompt: "Fix the supplied function.", maxTokens: 640 });

    expect(result).toMatchObject({ rawText: null, outputHash: null, promptTokens: 0, completionTokens: 0, finishReason: null, error: "local endpoint unavailable" });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("preserves structured finish reasons so truncation is not mislabeled as schema failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"value\":1}" }, finish_reason: "length" }],
      usage: { prompt_tokens: 7, completion_tokens: 3 }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const model = new SpecializationLiveModel({ endpoint: "http://127.0.0.1:8000/v1", apiKey: "ephemeral-test-key", model: "local-model", seed: 20260809 });
    const result = await model.structured<{ value: number }>({ requestId: "structured-finish", system: "Return JSON.", prompt: "Return value.", schema: { type: "object" }, maxTokens: 16 });
    expect(result).toMatchObject({ output: { value: 1 }, schemaValid: true, finishReason: "length", error: null });
  });

  it("requires coding gain, a second capability gain, safety, and VRAM headroom", () => {
    expect(evaluateDevelopmentPromotion({ patchBaselineRate: 0, patchCoderRate: 0.2, diagnosisBaselineRate: 0.1, diagnosisCoderRate: 0.25, endToEndBaselineRate: 0, endToEndCoderRate: 0, baselineSafetyViolations: 0, coderSafetyViolations: 0, coderPeakVramMiB: 8_000, deviceTotalVramMiB: 16_376 }).passed).toBe(true);
    expect(evaluateDevelopmentPromotion({ patchBaselineRate: 0, patchCoderRate: 0.05, diagnosisBaselineRate: 0, diagnosisCoderRate: 0.5, endToEndBaselineRate: 0, endToEndCoderRate: 0.5, baselineSafetyViolations: 0, coderSafetyViolations: 0, coderPeakVramMiB: 8_000, deviceTotalVramMiB: 16_376 }).passed).toBe(false);
    expect(pairedOutcome(false, true)).toBe("CODER_ONLY");
  });
});
