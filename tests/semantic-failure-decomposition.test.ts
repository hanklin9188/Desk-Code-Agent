import { describe, expect, it } from "vitest";
import { CONFIDENCE, EVIDENCE_SUFFICIENCY, FAILURE_OBSERVABILITY, PATCH_SCOPES, PRIMARY_PRECEDENCE, PRIMARY_TAXONOMY, REASONING_HORIZONS, RETRY_BEHAVIORS, applyFrozenDecisionGates, auditFailureIndependently, classifyFailure, verifySessionAPopulation, type ClassificationInput, type FailureRow } from "../services/semantic-failure-decomposition/src/index";

describe("semantic failure decomposition Session-A freeze", () => {
  it("freezes complete, unique vocabularies and fail-closed precedence", () => {
    expect(PRIMARY_TAXONOMY).toHaveLength(14); expect(new Set(PRIMARY_TAXONOMY).size).toBe(14);
    expect(PRIMARY_PRECEDENCE.map((row) => row.rank)).toEqual([...Array(14)].map((_, index) => index + 1));
    expect(PRIMARY_PRECEDENCE.map((row) => row.category)).toEqual([PRIMARY_TAXONOMY[10], PRIMARY_TAXONOMY[11], PRIMARY_TAXONOMY[12], PRIMARY_TAXONOMY[9], PRIMARY_TAXONOMY[7], PRIMARY_TAXONOMY[6], PRIMARY_TAXONOMY[0], PRIMARY_TAXONOMY[8], PRIMARY_TAXONOMY[5], PRIMARY_TAXONOMY[3], PRIMARY_TAXONOMY[4], PRIMARY_TAXONOMY[2], PRIMARY_TAXONOMY[1], PRIMARY_TAXONOMY[13]]);
    expect(PRIMARY_PRECEDENCE.at(-1)?.rule).toContain("never infer");
    expect(PATCH_SCOPES).toHaveLength(4); expect(REASONING_HORIZONS).toHaveLength(4); expect(EVIDENCE_SUFFICIENCY).toHaveLength(4); expect(FAILURE_OBSERVABILITY).toHaveLength(3); expect(RETRY_BEHAVIORS).toHaveLength(7); expect(CONFIDENCE).toHaveLength(3);
  });
  it("mechanically verifies the sealed 95/29/66 population", async () => {
    const fs = await import("node:fs/promises");
    const lines = async (path: string) => (await fs.readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const manifest = JSON.parse(await fs.readFile("benchmarks/patch-interface/E_EDIT_HOLDOUT_MANIFEST.v5.json", "utf8"));
    const oracle = JSON.parse(await fs.readFile("benchmarks/patch-interface/E_EDIT_HOLDOUT_ORACLE.v5.sealed.json", "utf8"));
    const rows = await lines("docs/experiments/runs/model-tournament-session-c-m2-v1/observations.checkpoint.jsonl") as FailureRow[];
    const retry = await lines("docs/experiments/runs/best-7b-bounded-retry-m2-v1/retry-observations.checkpoint.jsonl");
    const result = verifySessionAPopulation(rows, manifest.tasks.filter((task: any) => task.mutation_required).map((task: any) => task.task_id), oracle.rows.filter((row: any) => rows.some((task) => task.taskId === row.task_id)).map((row: any) => row.task_id), retry.map((row: any) => row.taskId));
    expect(result).toMatchObject({ total: 95, successes: 29, failures: 66, retryLinkedFailures: 66, rawOutputsPersisted: 0, rawActionsPersisted: 0, canonicalDiffHashesPersisted: 89, retrievalMetadataRows: 95, verificationRows: 95, firstFailureStages: { ACTION_VALIDATION: 2, HIDDEN_TEST: 6, RETRIEVAL: 5, SYNTAX_TYPE: 6, VISIBLE_TEST: 47 }, difficulties: { L2: 24, L3: 48, L4: 23 } });
  });
  it("fails closed and independently reproduces observable stage categories", () => {
    const base = { task: { task_id: "t", repository_id: "r", repository_revision: "sha256:x", category: "localized_logic", difficulty: "L2", file_scope: "SINGLE_FILE", allowed_files: ["src/a.mjs"], visible_test_path: "test/a.mjs" }, oracle: { exact_relevant_file: "src/a.mjs", exact_relevant_symbol: "f", exact_relevant_range_1_based: { start_line: 2, end_line: 2 } }, selectedPaths: ["src/a.mjs"], includedPaths: ["src/a.mjs"], observation: { taskId: "t", repositoryId: "r", difficulty: "L2", retrieval: { selectedPathHashes: [], includedPathHashes: [] }, modelCall: { rawOutputStored: false }, normalization: { rawActionStored: false, canonicalDiffSha256: "a", classification: "VALID_EDIT", stages: { parse: { status: "PASS", code: "JSON_PARSED" } } }, execution: { patchApplied: true, syntax: "PASS" }, outcome: { behavioralSuccess: false, firstFailureStage: "VISIBLE_TEST" } } } as unknown as ClassificationInput;
    expect(classifyFailure(base)).toMatchObject({ primaryCategory: "T14_AMBIGUOUS_OR_INCONCLUSIVE", confidence: "LOW", patchScope: "SINGLE_RANGE", evidenceSufficiency: "PARTIALLY_SUFFICIENT" });
    expect(auditFailureIndependently(base)).toEqual({ primaryCategory: "T14_AMBIGUOUS_OR_INCONCLUSIVE", confidence: "LOW" });
    const syntax = structuredClone(base); syntax.observation.outcome.firstFailureStage = "SYNTAX_TYPE"; syntax.observation.execution.syntax = "FAIL";
    expect(classifyFailure(syntax).primaryCategory).toBe("T13_SYNTAX_CODE_FORMATION"); expect(auditFailureIndependently(syntax).primaryCategory).toBe("T13_SYNTAX_CODE_FORMATION");
    const retrieval = structuredClone(base); retrieval.includedPaths = []; retrieval.observation.outcome.firstFailureStage = "RETRIEVAL";
    expect(classifyFailure(retrieval).primaryCategory).toBe("T11_RETRIEVAL_FAILURE");
    const action = structuredClone(base); action.observation.outcome.firstFailureStage = "ACTION_VALIDATION"; action.observation.normalization.classification = "MALFORMED_SCHEMA";
    expect(classifyFailure(action).primaryCategory).toBe("T12_ACTION_OR_PATCH_REPRESENTATION");
  });
  it("applies the frozen Session-C gates without reallocating T14", () => {
    const primaryCounts = Object.fromEntries(PRIMARY_TAXONOMY.map((category) => [category, 0])) as Record<(typeof PRIMARY_TAXONOMY)[number], number>;
    Object.assign(primaryCounts, {
      T11_RETRIEVAL_FAILURE: 5,
      T12_ACTION_OR_PATCH_REPRESENTATION: 2,
      T13_SYNTAX_CODE_FORMATION: 6,
      T14_AMBIGUOUS_OR_INCONCLUSIVE: 53,
    });
    const gates = applyFrozenDecisionGates({ denominator: 66, primaryCounts, sufficientEvidenceFailures: 0 });
    expect(gates.G1).toMatchObject({ numerator: 5, denominator: 66, threshold: 0.3, result: "FAIL" });
    expect(gates.G2).toMatchObject({ numerator: 0, requirementsMet: false, result: "FAIL" });
    expect(gates.G3).toMatchObject({ numerator: 0, requirementsMet: false, result: "FAIL" });
    expect(gates.G4).toMatchObject({ numerator: 6, result: "FAIL" });
    expect(gates.G5).toMatchObject({ result: "APPLIED", decision: "MIXED_SEMANTIC_CEILING__NO_SINGLE_INTERVENTION" });
  });
});
