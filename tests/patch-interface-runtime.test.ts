// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  PATCH_INTERFACE_P0_SCHEMA,
  PATCH_INTERFACE_P4_SCHEMA,
  buildCanonicalUnifiedDiff,
  normalizePatchInterfaceOutput,
  sha256Source,
  validateCanonicalDiffPolicy,
  type PatchInterfaceId,
  type PatchInterfaceNormalizationResult,
  type PatchInterfacePolicy
} from "../services/patch-interface-runtime/src/index";
import { ConstrainedPatchRuntime } from "../services/tool-runtime/src/index";

const exec = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

const fixtureFile = "src/example.mjs";
const fixtureSource = [
  "export function compute(value) {",
  "  const adjusted = value - 1;",
  "  return adjusted;",
  "}",
  "export const marker = 'old';",
  ""
].join("\n");

function policyFor(
  sources: Readonly<Record<string, string>>,
  ranges: Readonly<Record<string, readonly { startLine: number; endLine: number }[]>>,
  overrides: Partial<PatchInterfacePolicy> = {}
): PatchInterfacePolicy {
  const files = Object.keys(sources);
  return {
    allowedFiles: files,
    allowedRanges: ranges,
    expectedSourceSha256: Object.fromEntries(files.map((file) => [file, sha256Source(sources[file])])),
    maxChangedFiles: files.length,
    maxChangedLines: 20,
    maxToolActions: 4,
    ...overrides
  };
}

function normalize(
  interfaceId: PatchInterfaceId,
  rawOutput: string,
  sources: Readonly<Record<string, string>> = { [fixtureFile]: fixtureSource },
  policy: PatchInterfacePolicy = policyFor(sources, { [fixtureFile]: [{ startLine: 1, endLine: 5 }] })
): PatchInterfaceNormalizationResult {
  return normalizePatchInterfaceOutput({ interfaceId, rawOutput, sources, policy });
}

async function applyWithProductionRuntime(result: PatchInterfaceNormalizationResult, file: string, source: string): Promise<string> {
  expect(result.classification).toBe("VALID_EDIT");
  expect(result.canonicalDiff).not.toBeNull();
  const root = await mkdtemp(path.join(os.tmpdir(), "dca-interface-"));
  temporaryRoots.push(root);
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), source);
  await exec("git", ["init", "-b", "main"], { cwd: root });
  const patcher = new ConstrainedPatchRuntime(root, { allowedFiles: [file], maxChangedLines: 20 });
  const applied = await patcher.apply(result.canonicalDiff!);
  const after = await readFile(path.join(root, file), "utf8");
  expect(await patcher.rollback(applied.files)).toBe(true);
  expect(await readFile(path.join(root, file), "utf8")).toBe(source);
  return after;
}

function p0Output(diff: string, targetPaths = [fixtureFile]): string {
  return JSON.stringify({
    status: "PATCH_PROPOSAL",
    unified_diff: diff,
    summary: "bounded correction",
    evidence_paths: [],
    target_paths: targetPaths,
    confidence: 0.8
  });
}

describe("patch interface schemas and stage telemetry", () => {
  it("keeps P0 byte-for-structure compatible with the prior production runner contract", () => {
    expect(PATCH_INTERFACE_P0_SCHEMA.required).toEqual(["status", "unified_diff", "summary", "evidence_paths", "target_paths", "confidence"]);
    expect(PATCH_INTERFACE_P0_SCHEMA.additionalProperties).toBe(false);
    expect(PATCH_INTERFACE_P0_SCHEMA.properties.status.enum).toEqual(["PATCH_PROPOSAL", "BLOCKED_MISSING_ORACLE", "REPORT_ONLY"]);
  });

  it("keeps P4 identical to the preregistered uniform four-action schema", () => {
    const actions = PATCH_INTERFACE_P4_SCHEMA.properties.actions;
    expect(actions.maxItems).toBe(4);
    expect(actions.items.required).toEqual(["tool", "file", "start_line", "end_line", "text"]);
    expect(actions.items.properties.tool.enum).toEqual(["replace_range", "insert_before", "insert_after", "delete_range"]);
  });

  it("reports JSON parse and local Ajv validation as separate stages", () => {
    const parsedButInvalid = normalize("P2", JSON.stringify({ file: fixtureFile, start_line: "2", end_line: 2, replacement: "x" }));
    expect(parsedButInvalid.jsonParsed).toBe(true);
    expect(parsedButInvalid.schemaValidated).toBe(false);
    expect(parsedButInvalid.stages.parse.status).toBe("PASS");
    expect(parsedButInvalid.stages.schemaValidation.status).toBe("FAIL");
    expect(parsedButInvalid.classification).toBe("MALFORMED_SCHEMA");

    const invalidJson = normalize("P2", "{not json");
    expect(invalidJson.jsonParsed).toBe(false);
    expect(invalidJson.schemaValidated).toBe(false);
    expect(invalidJson.stages.parse.status).toBe("FAIL");
  });

  it("gives local schema failure precedence over status-looking fields", () => {
    const invalidReport = normalize("P0", JSON.stringify({ status: "REPORT_ONLY" }));
    expect(invalidReport.jsonParsed).toBe(true);
    expect(invalidReport.schemaValidated).toBe(false);
    expect(invalidReport.classification).toBe("MALFORMED_SCHEMA");
  });
});

describe("P0 structured patch and P1 free-form diff", () => {
  it("normalizes both P0 and fenced P1 to an applicable minimal canonical diff", async () => {
    const after = fixtureSource.replace("value - 1", "value + 1");
    const diff = buildCanonicalUnifiedDiff(fixtureFile, fixtureSource, after)!;
    expect(diff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"))).toHaveLength(1);
    expect(diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))).toHaveLength(1);

    const p0 = normalize("P0", p0Output(diff));
    expect(p0.jsonParsed).toBe(true);
    expect(p0.schemaValidated).toBe(true);
    expect(p0.changedLines).toBe(2);
    expect(await applyWithProductionRuntime(p0, fixtureFile, fixtureSource)).toBe(after);

    const p1 = normalize("P1", `\`\`\`diff\n${diff.trimEnd()}\n\`\`\``);
    expect(p1.jsonParsed).toBe(false);
    expect(p1.schemaValidated).toBe(false);
    expect(p1.stages.schemaValidation.status).toBe("NOT_APPLICABLE");
    expect(await applyWithProductionRuntime(p1, fixtureFile, fixtureSource)).toBe(after);
  });

  it("preserves a blank context line at the end of a hunk", async () => {
    const source = "bad\none\ntwo\n\noutside-the-hunk\n";
    const after = source.replace("bad", "good");
    const diff = buildCanonicalUnifiedDiff(fixtureFile, source, after)!;
    expect(diff.endsWith(" \n")).toBe(true);
    const sources = { [fixtureFile]: source };
    const result = normalize("P1", diff, sources, policyFor(sources, { [fixtureFile]: [{ startLine: 1, endLine: 1 }] }));
    expect(await applyWithProductionRuntime(result, fixtureFile, source)).toBe(after);
  });

  it("classifies explicit non-mutation and prose without pretending they are patches", () => {
    const report = normalize("P0", JSON.stringify({ status: "REPORT_ONLY", unified_diff: "", summary: "no safe edit", evidence_paths: [], target_paths: [], confidence: 1 }));
    expect(report.classification).toBe("REPORT_ONLY");
    expect(report.schemaValidated).toBe(true);
    expect(report.stages.patchConstruction.status).toBe("NOT_APPLICABLE");
    expect(normalize("P1", "The function probably needs a bounds check.").classification).toBe("TEXTUAL_EXPLANATION_WITHOUT_ACTION");
    expect(normalize("P1", "GENERATION_FAILURE timeout").classification).toBe("GENERATION_FAILURE");
    expect(normalize("P1", "blocked_missing_oracle: no behavioral oracle").classification).toBe("BLOCKED_MISSING_ORACLE");
  });
});

describe("P2 inclusive ranges, P3 symbols, and P4 bounded tools", () => {
  it("applies a P2 1-based inclusive replacement without touching sibling lines", async () => {
    const action = JSON.stringify({ file: fixtureFile, start_line: 2, end_line: 2, replacement: "  const adjusted = value + 1;" });
    const result = normalize("P2", action, { [fixtureFile]: fixtureSource }, policyFor({ [fixtureFile]: fixtureSource }, { [fixtureFile]: [{ startLine: 2, endLine: 2 }] }));
    expect(result.stages.actionValidation.code).toBe("RANGE_EDIT_ACCEPTED");
    const after = await applyWithProductionRuntime(result, fixtureFile, fixtureSource);
    expect(after).toBe(fixtureSource.replace("value - 1", "value + 1"));
    expect(after).toContain("export const marker = 'old';");
  });

  it("resolves exactly one .mjs symbol body and rejects ambiguous symbols", async () => {
    const source = "export function compute(value) {\n  return value - 1;\n}\nexport function sibling() { return 7; }\n";
    const sources = { [fixtureFile]: source };
    const policy = policyFor(sources, { [fixtureFile]: [{ startLine: 1, endLine: 3 }] }, { allowedSymbols: { [fixtureFile]: ["compute"] } });
    const result = normalize("P3", JSON.stringify({ file: fixtureFile, symbol: "compute", replacement_body: "\n  return value + 1;\n" }), sources, policy);
    expect(result.stages.actionValidation.code).toBe("UNIQUE_SYMBOL_BODY_RESOLVED");
    expect(await applyWithProductionRuntime(result, fixtureFile, source)).toBe(source.replace("value - 1", "value + 1"));

    const duplicate = "function compute() { return 1; }\nfunction compute() { return 2; }\n";
    const duplicateSources = { [fixtureFile]: duplicate };
    const ambiguous = normalize("P3", JSON.stringify({ file: fixtureFile, symbol: "compute", replacement_body: "return 3;" }), duplicateSources, policyFor(duplicateSources, { [fixtureFile]: [{ startLine: 1, endLine: 2 }] }, { allowedSymbols: { [fixtureFile]: ["compute"] } }));
    expect(ambiguous.classification).toBe("UNSAFE_EDIT");
    expect(ambiguous.stages.actionValidation.code).toBe("AMBIGUOUS_SYMBOL");

    const escaping = normalize("P3", JSON.stringify({ file: fixtureFile, symbol: "compute", replacement_body: "}\nsideEffect();\n{" }), sources, policy);
    expect(escaping.classification).toBe("UNSAFE_EDIT");
    expect(escaping.stages.actionValidation.code).toBe("INVALID_REPLACEMENT_BODY");
  });

  it("uses consistent string offsets for P3 sources and replacement bodies containing Unicode", async () => {
    const source = "export function truncate(value) {\n  return value.length > 4 ? `${value.slice(0, 4)}…` : value;\n}\nexport const marker = '保留';\n";
    const sources = { [fixtureFile]: source };
    const unicodePolicy = policyFor(sources, { [fixtureFile]: [{ startLine: 1, endLine: 3 }] }, { allowedSymbols: { [fixtureFile]: ["truncate"] } });
    const action = JSON.stringify({ file: fixtureFile, symbol: "truncate", replacement_body: "\n  return value.length > 3 ? `${value.slice(0, 3)}…` : value;\n" });
    const result = normalize("P3", action, sources, unicodePolicy);
    expect(result.stages.actionValidation.code).toBe("UNIQUE_SYMBOL_BODY_RESOLVED");
    expect(await applyWithProductionRuntime(result, fixtureFile, source)).toBe(source.replace("value.length > 4", "value.length > 3").replace("slice(0, 4)", "slice(0, 3)"));
  });

  it("applies non-overlapping P4 actions against original coordinates in descending order", async () => {
    const action = JSON.stringify({ actions: [
      { tool: "replace_range", file: fixtureFile, start_line: 2, end_line: 2, text: "  const adjusted = value + 1;" },
      { tool: "insert_after", file: fixtureFile, start_line: 4, end_line: 4, text: "// bounded edit" }
    ] });
    const result = normalize("P4", action, { [fixtureFile]: fixtureSource }, policyFor({ [fixtureFile]: fixtureSource }, { [fixtureFile]: [{ startLine: 2, endLine: 4 }] }));
    const after = await applyWithProductionRuntime(result, fixtureFile, fixtureSource);
    expect(after).toContain("value + 1");
    expect(after).toContain("}\n// bounded edit\nexport const marker");
  });

  it("rejects overlapping actions, ambiguous insert anchors, and non-empty delete text", () => {
    const policy = policyFor({ [fixtureFile]: fixtureSource }, { [fixtureFile]: [{ startLine: 1, endLine: 5 }] });
    const overlap = normalize("P4", JSON.stringify({ actions: [
      { tool: "replace_range", file: fixtureFile, start_line: 2, end_line: 3, text: "replacement" },
      { tool: "insert_after", file: fixtureFile, start_line: 2, end_line: 2, text: "inserted" }
    ] }), { [fixtureFile]: fixtureSource }, policy);
    expect(overlap.stages.actionValidation.code).toBe("OVERLAPPING_OR_AMBIGUOUS_ACTIONS");

    const ambiguous = normalize("P4", JSON.stringify({ actions: [{ tool: "insert_before", file: fixtureFile, start_line: 2, end_line: 3, text: "inserted" }] }), { [fixtureFile]: fixtureSource }, policy);
    expect(ambiguous.stages.actionValidation.code).toBe("INSERTION_REQUIRES_SINGLE_LINE_ANCHOR");

    const nonemptyDelete = normalize("P4", JSON.stringify({ actions: [{ tool: "delete_range", file: fixtureFile, start_line: 2, end_line: 2, text: "ignored?" }] }), { [fixtureFile]: fixtureSource }, policy);
    expect(nonemptyDelete.stages.actionValidation.code).toBe("DELETE_RANGE_TEXT_MUST_BE_EMPTY");

    const actionBudget = normalize("P4", JSON.stringify({ actions: [
      { tool: "replace_range", file: fixtureFile, start_line: 1, end_line: 1, text: "export function compute(value) {" },
      { tool: "replace_range", file: fixtureFile, start_line: 5, end_line: 5, text: "export const marker = 'new';" }
    ] }), { [fixtureFile]: fixtureSource }, { ...policy, maxToolActions: 1 });
    expect(actionBudget.stages.actionValidation.code).toBe("TOOL_ACTION_BUDGET_EXCEEDED");
  });
});

describe("always-on path, source, range, and secret policy", () => {
  const numberedSource = "one\ntwo\nthree\nfour\nfive\n";
  const numberedSources = { [fixtureFile]: numberedSource };
  const narrowPolicy = policyFor(numberedSources, { [fixtureFile]: [{ startLine: 2, endLine: 2 }] });

  it("detects a changed old line outside range even when the hunk starts in range", () => {
    const deceptive = `diff --git a/${fixtureFile} b/${fixtureFile}\n--- a/${fixtureFile}\n+++ b/${fixtureFile}\n@@ -2,2 +2,2 @@\n two\n-three\n+changed\n`;
    const result = normalize("P1", deceptive, numberedSources, narrowPolicy);
    expect(result.classification).toBe("UNSAFE_EDIT");
    expect(result.stages.patchConstruction.code).toBe("RANGE_OUTSIDE_ALLOWED_SCOPE");
  });

  it("rejects a pure insertion outside the authorized boundary semantics", () => {
    const outside = `diff --git a/${fixtureFile} b/${fixtureFile}\n--- a/${fixtureFile}\n+++ b/${fixtureFile}\n@@ -4,0 +5,1 @@\n+outside\n`;
    const validation = validateCanonicalDiffPolicy(outside, numberedSources, narrowPolicy);
    expect(validation.valid).toBe(false);
    expect(validation.errorCode).toBe("RANGE_OUTSIDE_ALLOWED_SCOPE");
  });

  it("validates every later header and rejects traversal in either header surface", () => {
    const first = buildCanonicalUnifiedDiff(fixtureFile, numberedSource, numberedSource.replace("two", "TWO"))!.trimEnd();
    const maliciousSecondHeader = `${first}\n--- a/../../escape.mjs\n+++ b/../../escape.mjs\n@@ -1 +1 @@\n-old\n+new\n`;
    expect(normalize("P1", maliciousSecondHeader, numberedSources, narrowPolicy).stages.patchConstruction.code).toBe("UNSAFE_PATH");

    const directTraversal = "--- a/../escape.mjs\n+++ b/../escape.mjs\n@@ -1 +1 @@\n-old\n+new\n";
    expect(normalize("P1", directTraversal, numberedSources, narrowPolicy).stages.patchConstruction.code).toBe("UNSAFE_PATH");
  });

  it("rejects /dev/null operations and mismatches between diff and file headers", () => {
    const creation = `diff --git a/${fixtureFile} b/${fixtureFile}\n--- /dev/null\n+++ b/${fixtureFile}\n@@ -0,0 +1,1 @@\n+new\n`;
    expect(normalize("P1", creation, numberedSources, narrowPolicy).stages.patchConstruction.code).toBe("UNSAFE_PATH");

    const mismatch = `diff --git a/${fixtureFile} b/${fixtureFile}\n--- a/other.mjs\n+++ b/other.mjs\n@@ -1 +1 @@\n-old\n+new\n`;
    expect(normalize("P1", mismatch, numberedSources, narrowPolicy).stages.patchConstruction.code).toBe("MISMATCHED_DIFF_PATHS");
  });

  it("enforces changed-line budgets before canonical construction", () => {
    const diff = buildCanonicalUnifiedDiff(fixtureFile, numberedSource, numberedSource.replace("two", "TWO"))!;
    const result = normalize("P1", diff, numberedSources, { ...narrowPolicy, maxChangedLines: 1 });
    expect(result.classification).toBe("UNSAFE_EDIT");
    expect(result.stages.patchConstruction.code).toBe("CHANGED_LINE_BUDGET_EXCEEDED");
  });

  it("rejects stale source hashes before constructing or accepting a patch", () => {
    const diff = buildCanonicalUnifiedDiff(fixtureFile, numberedSource, numberedSource.replace("two", "TWO"))!;
    const stale = { ...narrowPolicy, expectedSourceSha256: { [fixtureFile]: "0".repeat(64) } };
    const result = normalize("P0", p0Output(diff), numberedSources, stale);
    expect(result.classification).toBe("UNSAFE_EDIT");
    expect(result.stages.patchConstruction.code).toBe("STALE_SOURCE");
  });

  it("rejects literal credentials while allowing ordinary token identifiers", () => {
    const credential = buildCanonicalUnifiedDiff(fixtureFile, numberedSource, numberedSource.replace("two", "apiKey = 'abcdefghijklmnop'"))!;
    const rejected = normalize("P1", credential, numberedSources, narrowPolicy);
    expect(rejected.classification).toBe("UNSAFE_EDIT");
    expect(rejected.stages.patchConstruction.code).toBe("SECRET_SHAPED_EDIT");

    const ordinary = buildCanonicalUnifiedDiff(fixtureFile, numberedSource, numberedSource.replace("two", "const redactToken = token => token;"))!;
    const accepted = normalize("P1", ordinary, numberedSources, narrowPolicy);
    expect(accepted.classification).toBe("VALID_EDIT");
  });

  it("rejects source-content mismatches even when the source hash itself is current", () => {
    const mismatch = `--- a/${fixtureFile}\n+++ b/${fixtureFile}\n@@ -2 +2 @@\n-not-two\n+changed\n`;
    const result = normalize("P1", mismatch, numberedSources, narrowPolicy);
    expect(result.classification).toBe("SYNTACTICALLY_INVALID_EDIT");
    expect(result.stages.patchConstruction.code).toBe("SOURCE_CONTENT_MISMATCH");
  });
});
