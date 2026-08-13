// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readModelSpecializationRegistry } from "../services/model-specialization-runtime/src/index";
import { assertExactInstalledModelRuntime, probeInstalledModelRuntime, sanitizedLaunchArgs, type InstalledModelRuntime } from "../scripts/model_serving_attestation";

describe("model serving attestation", () => {
  it("binds the exact installed local model runtime without starting a model", async () => {
    const installed = await probeInstalledModelRuntime(path.resolve(process.cwd()));
    expect(installed.packages).toEqual({ vllm: "0.26.0", transformers: "5.14.1", torch: "2.11.0+cu130" });
    expect(installed.pythonExecutableSha256).toMatch(/^[0-9a-f]{64}$/);
  }, 30_000);

  it("constructs the exact redacted sequential launch argument surface", async () => {
    const registry = await readModelSpecializationRegistry();
    const args = sanitizedLaunchArgs(registry, "coder");
    expect(args).toContain("Qwen/Qwen2.5-Coder-3B-Instruct");
    expect(args).toContain("488639f1ff808d1d3d0ba301aef8c11461451ec5");
    expect(args.slice(args.indexOf("--api-key"), args.indexOf("--api-key") + 2)).toEqual(["--api-key", "[EPHEMERAL_REDACTED]"]);
    expect(args).toContain("--enable-prefix-caching");
  });

  it("compares installed runtime values independent of JSON insertion order", () => {
    const expected: InstalledModelRuntime = {
      pythonExecutable: "/runtime/python",
      pythonVersion: "3.12.13",
      packages: { vllm: "0.26.0", transformers: "5.14.1", torch: "2.11.0+cu130" },
      pythonExecutableSha256: "a".repeat(64)
    };
    const launchOrdered = {
      pythonExecutable: expected.pythonExecutable,
      pythonExecutableSha256: expected.pythonExecutableSha256,
      pythonVersion: expected.pythonVersion,
      packages: expected.packages
    };
    expect(JSON.stringify(launchOrdered)).not.toBe(JSON.stringify(expected));
    expect(() => assertExactInstalledModelRuntime(launchOrdered, expected)).not.toThrow();
  });

  it("rejects missing or extra runtime and package fields", () => {
    const expected: InstalledModelRuntime = {
      pythonExecutable: "/runtime/python",
      pythonExecutableSha256: "a".repeat(64),
      pythonVersion: "3.12.13",
      packages: { vllm: "0.26.0", transformers: "5.14.1", torch: "2.11.0+cu130" }
    };
    expect(() => assertExactInstalledModelRuntime({ ...expected, extra: true }, expected)).toThrow(/missing or unexpected fields/);
    expect(() => assertExactInstalledModelRuntime({ ...expected, packages: { ...expected.packages, extra: true } }, expected)).toThrow(/missing or unexpected fields/);
  });
});
