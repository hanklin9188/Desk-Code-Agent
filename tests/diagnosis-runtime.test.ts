// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DiagnosisRuntime } from "../services/diagnosis-runtime/src/index";
import { TrustedVerificationExecutor } from "../services/tool-runtime/src/index";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function runtime() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dca-diagnosis-")); roots.push(root);
  return new DiagnosisRuntime(new TrustedVerificationExecutor(root, {
    red: { executable: process.execPath, args: ["-e", "process.stderr.write('expected total 5 but received -1');process.exit(1)"], timeoutMs: 2_000, requiresHardNetworkIsolation: false },
    misleading: { executable: process.execPath, args: ["-e", "process.stderr.write('database timeout: expected total 5 but received -1');process.exit(1)"], timeoutMs: 2_000, requiresHardNetworkIsolation: false },
    green: { executable: process.execPath, args: ["-e", "process.exit(0)"], timeoutMs: 2_000, requiresHardNetworkIsolation: false }
  }, { level: "PROCESS_CONSTRAINED", strategy: "none", reason: "fixture" }));
}

describe("diagnosis-gated coding", () => {
  it("pins all twenty hidden-oracle task contracts without exposing hidden commands as visible oracles", async () => {
    const manifest = JSON.parse(await readFile(path.resolve(process.cwd(), "benchmarks/hidden_oracle_manifest.json"), "utf8")) as { tasks: Array<{ id: string; category: string; visible_oracle: string | null; hidden_oracle: string; expected_mode: string; max_changed_lines: number }> };
    expect(manifest.tasks).toHaveLength(20);
    expect(new Set(manifest.tasks.map((task) => task.id)).size).toBe(20);
    expect(new Set(manifest.tasks.map((task) => task.category)).size).toBe(20);
    expect(manifest.tasks.every((task) => task.hidden_oracle && task.hidden_oracle !== task.visible_oracle)).toBe(true);
    expect(manifest.tasks.filter((task) => task.visible_oracle === null).every((task) => task.expected_mode === "REPORT_ONLY" && task.max_changed_lines === 0)).toBe(true);
  });
  it("requires exact real RED evidence before hypotheses", async () => {
    const diagnosis = await runtime();
    expect((await diagnosis.reproduce("red", "expected total 5 but received -1")).status).toBe("RED");
    const noRed = await diagnosis.reproduce("green", "expected total 5 but received -1");
    expect(noRed.status).toBe("BLOCKED_MISSING_REPRO");
    expect(() => diagnosis.hypothesize(noRed, [])).toThrow(/RED/);
  });

  it("resists a misleading first hypothesis and blocks patching until a supported cause wins", async () => {
    const diagnosis = await runtime(); const red = await diagnosis.reproduce("misleading", "expected total 5 but received -1");
    let artifact = diagnosis.hypothesize(red, [
      { id: "database", suspectedCause: "database timeout", evidenceIds: red.evidenceIds, prediction: "isolating database changes the result", discriminatingProbe: "replace database response only", confidence: 0.6 },
      { id: "operator", suspectedCause: "addition uses subtraction", evidenceIds: red.evidenceIds, prediction: "direct add(2,3) returns -1", discriminatingProbe: "invoke add with constants", confidence: 0.55 },
      { id: "serialization", suspectedCause: "numeric serialization", evidenceIds: red.evidenceIds, prediction: "round-trip changes operands", discriminatingProbe: "round-trip operands only", confidence: 0.2 }
    ]);
    expect(() => diagnosis.assertPatchAllowed(artifact)).toThrow(/blocked/);
    artifact = diagnosis.recordProbe(artifact, { hypothesisId: "database", variable: "database response", outcome: "FALSIFIES", evidenceId: "probe-db" });
    artifact = diagnosis.recordProbe(artifact, { hypothesisId: "operator", variable: "operator implementation", outcome: "SUPPORTS", evidenceId: "probe-operator" });
    expect(artifact.hypotheses[0]).toMatchObject({ id: "operator", rank: 1, confidence: 0.8 });
    expect(artifact.patchAllowed).toBe(true); expect(() => diagnosis.assertPatchAllowed(artifact)).not.toThrow();
  });

  it("rejects duplicate/stale probe evidence", async () => {
    const diagnosis = await runtime(); const red = await diagnosis.reproduce("red", "expected total 5 but received -1");
    let artifact = diagnosis.hypothesize(red, ["a", "b", "c"].map((id, index) => ({ id, suspectedCause: id, evidenceIds: red.evidenceIds, prediction: `prediction ${id}`, discriminatingProbe: `probe ${id}`, confidence: 0.4 - index * 0.1 })));
    artifact = diagnosis.recordProbe(artifact, { hypothesisId: "a", variable: "one variable", outcome: "INCONCLUSIVE", evidenceId: "fresh" });
    expect(() => diagnosis.recordProbe(artifact, { hypothesisId: "a", variable: "one variable", outcome: "SUPPORTS", evidenceId: "fresh" })).toThrow(/fresh/);
  });
});
