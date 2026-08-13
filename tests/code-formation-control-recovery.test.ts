import { describe, expect, it } from "vitest";
import { deriveParserStageTelemetry, materializeRecoveryIntent, normalizedConfigSha256, RECOVERY_GENERATION_SEED, RECOVERY_SCHEDULE_SEED } from "../services/code-formation-control-recovery/src/index";
import { normalizePatchInterfaceOutput, sha256Source, type PatchInterfacePolicy } from "../services/patch-interface-runtime/src/index";

const source = "export function recover(v) {\n  return v;\n}\nexport const marker = 9;\n";
const task = { task_id: "recovery-test", repository_id: "recovery-repo", repository_revision: "sha256:test", prompt: "Fix recover to add one.", difficulty: "medium", allowed_file: "src/subject.mjs", allowed_range: { start_line: 1, end_line: 3 }, changed_line_budget: 12, visible_test_path: "test/visible.test.mjs" };
const repository = { repository_id: task.repository_id, immutable_revision: task.repository_revision, files: [{ path: task.allowed_file, content: source, role: "source" as const }, { path: task.visible_test_path, content: "visible-only", role: "test" as const }] };
const oracle = { task_id: task.task_id, original_source_sha256: sha256Source(source), reference_fixed_source: "never included reference fix", exact_relevant_symbol: "recover", hidden_files: [{ path: "test/hidden.test.mjs", content: "hidden-only", role: "test" as const }], hidden_test_path: "test/hidden.test.mjs" };
const schema = { type: "object", required: ["file", "start_line", "end_line", "replacement"] };
const policy: PatchInterfacePolicy = { allowedFiles: [task.allowed_file], allowedRanges: { [task.allowed_file]: [{ startLine: 1, endLine: 3 }] }, expectedSourceSha256: { [task.allowed_file]: sha256Source(source) }, maxChangedFiles: 1, maxChangedLines: 12 };

describe("code formation control recovery", () => {
  it("materializes retrieveG3 E-MIN-V2/C1 intents and changes only the treatment system", () => {
    const control = materializeRecoveryIntent({ pairIndex: 1, condition: "CONTROL", task, repository, oracle, controlSystem: "system", schema });
    const treatment = materializeRecoveryIntent({ pairIndex: 1, condition: "TREATMENT", task, repository, oracle, controlSystem: "system", schema });
    expect(control.retrieval.configuration).toBe("E-MIN-V2"); expect(control.retrieval.contextVariant).toBe("C1_TASK_PLUS_SOURCE");
    expect(control.prompt).toBe(treatment.prompt); expect(control.schemaSha256).toBe(treatment.schemaSha256); expect(control.system).not.toBe(treatment.system);
    expect(control.prompt).not.toContain(oracle.reference_fixed_source); expect(control.prompt).not.toContain(oracle.hidden_files[0].content);
    expect(RECOVERY_GENERATION_SEED).not.toBe(RECOVERY_SCHEDULE_SEED);
  });

  it("derives bounded parser telemetry without retaining response or replacement", () => {
    const raw = JSON.stringify({ file: task.allowed_file, start_line: 1, end_line: 3, replacement: "export function recover(v) { return v + 1; }" });
    const normalized = normalizePatchInterfaceOutput({ interfaceId: "P2", rawOutput: raw, sources: { [task.allowed_file]: source }, policy });
    const telemetry = deriveParserStageTelemetry({ rawText: raw, schemaValid: true, error: null, finishReason: "stop", outputChars: raw.length, parsedOutput: JSON.parse(raw), normalization: normalized });
    expect(telemetry.validP2Action).toBe(true); expect(telemetry.actionValidationCode).toBe("RANGE_EDIT_ACCEPTED");
    expect(JSON.stringify(telemetry)).not.toContain(raw); expect(JSON.stringify(telemetry)).not.toContain("return v + 1");
  });

  it("distinguishes invalid JSON and missing replacement deterministically", () => {
    const invalid = normalizePatchInterfaceOutput({ interfaceId: "P2", rawOutput: "{bad", sources: { [task.allowed_file]: source }, policy });
    const first = deriveParserStageTelemetry({ rawText: "{bad", schemaValid: false, error: "INVALID_JSON", finishReason: "stop", outputChars: 4, parsedOutput: null, normalization: invalid });
    expect(first.modelError).toBe("INVALID_JSON"); expect(first.parseCode).toBe("INVALID_JSON");
    const value = { file: task.allowed_file, start_line: 1, end_line: 3 };
    const raw = JSON.stringify(value), missing = normalizePatchInterfaceOutput({ interfaceId: "P2", rawOutput: raw, sources: { [task.allowed_file]: source }, policy });
    const second = deriveParserStageTelemetry({ rawText: raw, schemaValid: false, error: null, finishReason: "length", outputChars: raw.length, parsedOutput: value, normalization: missing });
    expect(second.parserSchemaReason).toBe("MISSING_REPLACEMENT"); expect(second.finishReason).toBe("LENGTH");
  });

  it("canonicalizes normalized configuration independent of key order", () => {
    expect(normalizedConfigSha256({ b: { d: 2, c: 1 }, a: 0 })).toBe(normalizedConfigSha256({ a: 0, b: { c: 1, d: 2 } }));
  });
});
