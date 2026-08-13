import { describe, expect, it, vi } from "vitest";

describe("VRAM telemetry contract", () => {
  it("uses device-level sources instead of the incompatible compute-app sampler", async () => {
    vi.resetModules();
    const source = await import("../services/telemetry-runtime/src/vram");
    expect(source.sampleNvidiaSmiDevice).toBeTypeOf("function");
    expect(source.sampleNvmlDevice).toBeTypeOf("function");
  });
});
