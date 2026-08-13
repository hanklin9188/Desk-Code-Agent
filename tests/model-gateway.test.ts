import { describe, expect, it } from "vitest";
import {
  isLoopbackEndpoint, LocalModelGateway, ModelGatewayClient, parseStructuredOutput,
  preflightVllm, buildVllmLaunchSpec, candidateExecutablePaths, QUALITY_PROFILE
} from "../services/model-gateway/src/index";

describe("local model gateway", () => {
  it("allows loopback and rejects remote endpoints under local policy", () => {
    expect(isLoopbackEndpoint("http://127.0.0.1:8000/v1")).toBe(true);
    expect(isLoopbackEndpoint("http://localhost:8000/v1")).toBe(true);
    expect(isLoopbackEndpoint("https://example.com/v1")).toBe(false);
    expect(() => new LocalModelGateway("https://example.com/v1")).toThrow(/loopback/);
  });

  it("streams bounded offline chunks", async () => {
    const gateway = new LocalModelGateway();
    const chunks = [];
    for await (const chunk of gateway.stream({ requestId: "req_1", role: "analyst", prompt: "analyze", schemaName: "finding", maxTokens: 100 })) chunks.push(chunk);
    expect(chunks.at(-1)?.done).toBe(true);
    expect(chunks.map((chunk) => chunk.delta).join("")).toContain("Evidence retrieved");
  });

  it("reports machine preflight without claiming a missing vLLM runtime is ready", async () => {
    const result = await preflightVllm({ commandExists: async (name) => name !== "vllm", gpuProbe: async () => ({ available: true, name: "RTX 4080 SUPER", totalMemoryMiB: 16376 }) });
    expect(result.wsl).toBe(true);
    expect(result.gpu.available).toBe(true);
    expect(result.vllmAvailable).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("vLLM executable is not available");
  });

  it("includes the project-local model runtime in executable discovery", () => {
    const candidates = candidateExecutablePaths("vllm", "/workspace/desk-code-agent", {});
    expect(candidates).toContain("/workspace/desk-code-agent/runtime/model/.venv/bin/vllm");
  });

  it("builds a loopback-only pinned launch specification", () => {
    expect(QUALITY_PROFILE.revision).toBe("851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a");
    expect(QUALITY_PROFILE.tokenizerRevision).toBe(QUALITY_PROFILE.revision);
    const launch = buildVllmLaunchSpec(QUALITY_PROFILE, "ephemeral-secret");
    expect(launch.command).toBe("vllm");
    expect(launch.args).toContain("127.0.0.1");
    expect(launch.args).not.toContain("0.0.0.0");
    expect(launch.args.slice(launch.args.indexOf("--revision"), launch.args.indexOf("--revision") + 2)).toEqual(["--revision", QUALITY_PROFILE.revision]);
    expect(launch.args.slice(launch.args.indexOf("--tokenizer-revision"), launch.args.indexOf("--tokenizer-revision") + 2)).toEqual(["--tokenizer-revision", QUALITY_PROFILE.tokenizerRevision]);
    expect(launch.args.slice(launch.args.indexOf("--served-model-name"), launch.args.indexOf("--served-model-name") + 2)).toEqual(["--served-model-name", QUALITY_PROFILE.model]);
    expect(launch.env.VLLM_API_KEY).toBe("ephemeral-secret");
    expect(launch.redactedArgs.join(" ")).not.toContain("ephemeral-secret");
  });

  it("repairs only fenced JSON and rejects prose without structured output", () => {
    expect(parseStructuredOutput<{ ok: boolean }>('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(() => parseStructuredOutput("I think this passed")).toThrow(/structured JSON/);
  });

  it("calls the OpenAI-compatible loopback endpoint and records metrics", async () => {
    const fetchMock = async () => new Response(JSON.stringify({ id: "cmpl_1", choices: [{ message: { content: '{"status":"PASS"}' } }], usage: { prompt_tokens: 10, completion_tokens: 4 } }), { status: 200, headers: { "content-type": "application/json" } });
    const client = new ModelGatewayClient({ endpoint: "http://127.0.0.1:8000/v1", apiKey: "secret", fetch: fetchMock });
    const result = await client.complete({ requestId: "req_live", role: "reviewer", prompt: "review", schemaName: "review_result", maxTokens: 100 });
    expect(result.output).toEqual({ status: "PASS" });
    expect(client.metrics().completedRequests).toBe(1);
    expect(client.metrics().promptTokens).toBe(10);
  });

  it("passes an explicit JSON Schema to constrained decoding", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchMock = async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"value":"ok"}' } }], usage: {} }), { status: 200 });
    };
    const client = new ModelGatewayClient({ apiKey: "secret", fetch: fetchMock });
    const schema = { type: "object", additionalProperties: false, required: ["value"], properties: { value: { type: "string", enum: ["ok"] } } };
    await client.complete({ requestId: "schema", role: "analyst", prompt: "return data", schemaName: "bounded", maxTokens: 20, responseSchema: schema });
    expect(requestBody?.response_format).toEqual({ type: "json_schema", json_schema: { name: "bounded", schema, strict: true } });
  });
});
