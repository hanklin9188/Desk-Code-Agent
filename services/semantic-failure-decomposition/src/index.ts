export const PRIMARY_TAXONOMY = [
  "T1_TASK_REQUIREMENT_MISUNDERSTANDING",
  "T2_LOCAL_LOGIC_ERROR",
  "T3_BOUNDARY_EDGE_CASE_ERROR",
  "T4_API_CONTRACT_MISUNDERSTANDING",
  "T5_DATAFLOW_STATE_REASONING_ERROR",
  "T6_EXCEPTION_ERROR_SEMANTICS",
  "T7_INCOMPLETE_PATCH_SCOPE",
  "T8_CROSS_FILE_DEPENDENCY_MISSED",
  "T9_TEST_CONTRACT_MISUNDERSTANDING",
  "T10_EVIDENCE_MISSING_OR_INSUFFICIENT",
  "T11_RETRIEVAL_FAILURE",
  "T12_ACTION_OR_PATCH_REPRESENTATION",
  "T13_SYNTAX_CODE_FORMATION",
  "T14_AMBIGUOUS_OR_INCONCLUSIVE",
] as const;

export const PATCH_SCOPES = ["SINGLE_RANGE", "SINGLE_SYMBOL", "MULTI_SYMBOL_SAME_FILE", "MULTI_FILE"] as const;
export const REASONING_HORIZONS = ["LOCAL", "INTRA_FILE", "CROSS_FILE", "STATEFUL_OR_API_LEVEL"] as const;
export const EVIDENCE_SUFFICIENCY = ["SUFFICIENT", "PARTIALLY_SUFFICIENT", "MISSING_REQUIRED_EVIDENCE", "INCONCLUSIVE"] as const;
export const FAILURE_OBSERVABILITY = ["EXPLICIT_MACHINE_FEEDBACK", "PARTIAL_MACHINE_FEEDBACK", "GENERIC_FAILURE_ONLY"] as const;
export const RETRY_BEHAVIORS = ["NOT_APPLICABLE_SUCCESS", "RECOVERED", "REPEATED_EDIT", "FAILED_DIFFERENT", "CONTRADICTION", "MALFORMED", "SAFETY_REJECTED"] as const;
export const CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;

export const PRIMARY_PRECEDENCE = [
  { rank: 1, category: "T11_RETRIEVAL_FAILURE", rule: "Required evidence exists in the repository and frozen retrieval metadata proves it was not selected or included." },
  { rank: 2, category: "T12_ACTION_OR_PATCH_REPRESENTATION", rule: "The first authoritative failure is P2 action validation or patch construction, before semantic execution can be evaluated." },
  { rank: 3, category: "T13_SYNTAX_CODE_FORMATION", rule: "Syntax/type formation is the first failure and no stronger semantic cause is supported by persisted edit evidence." },
  { rank: 4, category: "T10_EVIDENCE_MISSING_OR_INSUFFICIENT", rule: "Required information is proven absent from model-visible context and was not a retrievable-but-missed repository item covered by T11." },
  { rank: 5, category: "T8_CROSS_FILE_DEPENDENCY_MISSED", rule: "A necessary cross-file dependency is central, evidence was sufficient, and observable edit evidence proves it was missed." },
  { rank: 6, category: "T7_INCOMPLETE_PATCH_SCOPE", rule: "Required companion work is within one file or otherwise not centrally cross-file, evidence was sufficient, and observable edit evidence proves incomplete scope." },
  { rank: 7, category: "T1_TASK_REQUIREMENT_MISUNDERSTANDING", rule: "Observable edit behavior addresses a different requested behavior; task text alone is not enough." },
  { rank: 8, category: "T9_TEST_CONTRACT_MISUNDERSTANDING", rule: "Visible model-available verification evidence was sufficient and observable edit behavior contradicts that contract." },
  { rank: 9, category: "T6_EXCEPTION_ERROR_SEMANTICS", rule: "Observable edit behavior specifically mishandles exception type, propagation, fallback, retry, message, or error state." },
  { rank: 10, category: "T4_API_CONTRACT_MISUNDERSTANDING", rule: "Observable edit behavior contradicts an available API, caller, return-type, or public-interface contract." },
  { rank: 11, category: "T5_DATAFLOW_STATE_REASONING_ERROR", rule: "Observable edit behavior mishandles mutation, copy, lifecycle, dependency ordering, stale state, or propagated values." },
  { rank: 12, category: "T3_BOUNDARY_EDGE_CASE_ERROR", rule: "Core observable edit is otherwise supported but fails a specific boundary, sentinel, empty, null, first/last, or off-by-one case." },
  { rank: 13, category: "T2_LOCAL_LOGIC_ERROR", rule: "Evidence and scope are local and sufficient and observable edit behavior implements incorrect branch, operator, ordering, calculation, or return semantics." },
  { rank: 14, category: "T14_AMBIGUOUS_OR_INCONCLUSIVE", rule: "Use whenever persisted evidence cannot distinguish a stronger cause; never infer a semantic cause from failure stage or oracle alone." },
] as const;

export type FailureRow = {
  taskId: string;
  repositoryId: string;
  difficulty: string;
  retrieval: { selectedPathHashes: string[]; includedPathHashes: string[] };
  modelCall: { rawOutputStored: boolean };
  normalization: { rawActionStored: boolean; canonicalDiffSha256: string | null };
  execution: Record<string, unknown>;
  outcome: { behavioralSuccess: boolean; firstFailureStage: string };
};

export function verifySessionAPopulation(rows: readonly FailureRow[], mutationTaskIds: readonly string[], oracleTaskIds: readonly string[], retryTaskIds: readonly string[]) {
  if (rows.length !== 95 || new Set(rows.map((row) => row.taskId)).size !== 95) throw new Error("Expected 95 unique one-shot observations");
  if (mutationTaskIds.length !== 95 || new Set(mutationTaskIds).size !== 95) throw new Error("Expected 95 unique mutation tasks");
  if (oracleTaskIds.length !== 95 || new Set(oracleTaskIds).size !== 95) throw new Error("Expected 95 unique mutation oracles");
  const rowIds = new Set(rows.map((row) => row.taskId));
  if (mutationTaskIds.some((id) => !rowIds.has(id)) || oracleTaskIds.some((id) => !rowIds.has(id))) throw new Error("Task population mismatch");
  const failures = rows.filter((row) => !row.outcome.behavioralSuccess), successes = rows.filter((row) => row.outcome.behavioralSuccess);
  if (failures.length !== 66 || successes.length !== 29 || retryTaskIds.length !== 66 || new Set(retryTaskIds).size !== 66 || retryTaskIds.some((id) => !failures.some((row) => row.taskId === id))) throw new Error("Success/failure/retry population mismatch");
  if (rows.some((row) => !Array.isArray(row.retrieval.selectedPathHashes) || !Array.isArray(row.retrieval.includedPathHashes) || !row.execution || !row.outcome.firstFailureStage)) throw new Error("Required structural evidence missing");
  return {
    total: rows.length, successes: successes.length, failures: failures.length, retryLinkedFailures: retryTaskIds.length,
    rawOutputsPersisted: rows.filter((row) => row.modelCall.rawOutputStored).length,
    rawActionsPersisted: rows.filter((row) => row.normalization.rawActionStored).length,
    canonicalDiffHashesPersisted: rows.filter((row) => row.normalization.canonicalDiffSha256).length,
    retrievalMetadataRows: rows.filter((row) => row.retrieval.selectedPathHashes && row.retrieval.includedPathHashes).length,
    verificationRows: rows.filter((row) => row.execution && row.outcome.firstFailureStage).length,
    firstFailureStages: Object.fromEntries([...new Set(failures.map((row) => row.outcome.firstFailureStage))].sort().map((stage) => [stage, failures.filter((row) => row.outcome.firstFailureStage === stage).length])),
    difficulties: Object.fromEntries([...new Set(rows.map((row) => row.difficulty))].sort().map((difficulty) => [difficulty, rows.filter((row) => row.difficulty === difficulty).length])),
  };
}

export type ClassificationInput = {
  task: { task_id: string; repository_id: string; repository_revision: string; category: string; difficulty: string; file_scope: string; allowed_files: string[]; visible_test_path: string };
  oracle: { exact_relevant_file: string; exact_relevant_symbol: string; exact_relevant_range_1_based: { start_line: number; end_line: number } };
  observation: FailureRow & { normalization: FailureRow["normalization"] & { classification: string; stages: Record<string, { status: string; code: string }> | null }; execution: Record<string, any> };
  retryTaxonomy?: string;
  selectedPaths: string[];
  includedPaths: string[];
};

const STATEFUL_CATEGORIES = new Set(["api_misuse", "runtime_configuration", "exception_handling", "natural_failure_recovery"]);

export function structuralDimensions(input: ClassificationInput) {
  const { task, oracle, observation } = input;
  const singleRange = task.allowed_files.length === 1 && oracle.exact_relevant_range_1_based.start_line === oracle.exact_relevant_range_1_based.end_line;
  const patchScope = task.allowed_files.length > 1 ? "MULTI_FILE" : singleRange ? "SINGLE_RANGE" : oracle.exact_relevant_symbol ? "SINGLE_SYMBOL" : "MULTI_SYMBOL_SAME_FILE";
  const reasoningHorizon = task.file_scope === "MULTI_FILE_EVIDENCE_SINGLE_TARGET" ? "CROSS_FILE" : STATEFUL_CATEGORIES.has(task.category) ? "STATEFUL_OR_API_LEVEL" : "LOCAL";
  const exactSourceIncluded = input.includedPaths.includes(oracle.exact_relevant_file);
  const visibleTestIncluded = input.includedPaths.includes(task.visible_test_path);
  const evidenceSufficiency = !exactSourceIncluded ? "MISSING_REQUIRED_EVIDENCE" : visibleTestIncluded ? "SUFFICIENT" : "PARTIALLY_SUFFICIENT";
  const stage = observation.outcome.firstFailureStage;
  const failureObservability = stage === "HIDDEN_TEST" ? "GENERIC_FAILURE_ONLY" : stage === "VISIBLE_TEST" || stage === "SYNTAX_TYPE" ? "PARTIAL_MACHINE_FEEDBACK" : "EXPLICIT_MACHINE_FEEDBACK";
  return { patchScope, reasoningHorizon, evidenceSufficiency, failureObservability, exactSourceIncluded, visibleTestIncluded } as const;
}

export function classifyFailure(input: ClassificationInput) {
  const dimensions = structuralDimensions(input), stage = input.observation.outcome.firstFailureStage;
  let primaryCategory: (typeof PRIMARY_TAXONOMY)[number], confidence: (typeof CONFIDENCE)[number], justification: string, limitationReasons: string[] = [];
  if (stage === "RETRIEVAL" && !dimensions.exactSourceIncluded) {
    primaryCategory = "T11_RETRIEVAL_FAILURE"; confidence = "HIGH";
    justification = "Required source exists in the sealed repository but exact-source retrieval selected/included metadata proves it was not model-visible.";
  } else if (stage === "ACTION_VALIDATION") {
    primaryCategory = "T12_ACTION_OR_PATCH_REPRESENTATION"; confidence = "HIGH";
    justification = "Deterministic P2 normalization records action-validation failure before patch execution; no semantic edit-content inference is used.";
  } else if (stage === "SYNTAX_TYPE" && input.observation.execution.syntax === "FAIL") {
    primaryCategory = "T13_SYNTAX_CODE_FORMATION"; confidence = "HIGH";
    justification = "The accepted P2 edit applied, then deterministic syntax/type verification failed; unavailable edit content prevents a more specific semantic cause.";
  } else {
    primaryCategory = "T14_AMBIGUOUS_OR_INCONCLUSIVE"; confidence = "LOW";
    limitationReasons = ["RAW_EDIT_CONTENT_NOT_PERSISTED", "FAILURE_STAGE_NON_IDENTIFYING"];
    if (!input.observation.normalization.stages) limitationReasons.push("REQUIRED_STRUCTURED_MUTATION_METADATA_ABSENT");
    justification = "The persisted stage and diff hash do not reveal edit semantics; no immutable observable edit body supports a stronger frozen category.";
  }
  return { primaryCategory, secondaryCategories: [] as string[], confidence, justification, limitationReasons, ...dimensions };
}

export function auditFailureIndependently(input: ClassificationInput) {
  const stage = input.observation.outcome.firstFailureStage, dimensions = structuralDimensions(input);
  if (!dimensions.exactSourceIncluded && stage === "RETRIEVAL") return { primaryCategory: "T11_RETRIEVAL_FAILURE", confidence: "HIGH" };
  if (input.observation.normalization.classification !== "VALID_EDIT" && stage === "ACTION_VALIDATION") return { primaryCategory: "T12_ACTION_OR_PATCH_REPRESENTATION", confidence: "HIGH" };
  if (input.observation.execution.patchApplied && input.observation.execution.syntax === "FAIL" && stage === "SYNTAX_TYPE") return { primaryCategory: "T13_SYNTAX_CODE_FORMATION", confidence: "HIGH" };
  return { primaryCategory: "T14_AMBIGUOUS_OR_INCONCLUSIVE", confidence: "LOW" };
}

export type FrozenGateInput = {
  denominator: 66;
  primaryCounts: Record<(typeof PRIMARY_TAXONOMY)[number], number>;
  sufficientEvidenceFailures: number;
};

export function applyFrozenDecisionGates(input: FrozenGateInput) {
  const count = (...categories: (typeof PRIMARY_TAXONOMY)[number][]) =>
    categories.reduce((sum, category) => sum + input.primaryCounts[category], 0);
  const evaluate = (numerator: number, threshold: number, requirementsMet: boolean) => ({
    numerator,
    denominator: input.denominator,
    proportion: numerator / input.denominator,
    threshold,
    requirementsMet,
    result: numerator / input.denominator >= threshold && requirementsMet ? "PASS" : "FAIL",
  } as const);

  const G1 = evaluate(count("T10_EVIDENCE_MISSING_OR_INSUFFICIENT", "T11_RETRIEVAL_FAILURE"), 0.3, true);
  const G2 = evaluate(count("T7_INCOMPLETE_PATCH_SCOPE", "T8_CROSS_FILE_DEPENDENCY_MISSED"), 0.3, input.sufficientEvidenceFailures > 0);
  const G3 = evaluate(count("T2_LOCAL_LOGIC_ERROR", "T3_BOUNDARY_EDGE_CASE_ERROR", "T4_API_CONTRACT_MISUNDERSTANDING", "T5_DATAFLOW_STATE_REASONING_ERROR", "T6_EXCEPTION_ERROR_SEMANTICS", "T9_TEST_CONTRACT_MISUNDERSTANDING"), 0.4, input.sufficientEvidenceFailures > 0);
  const t13 = input.primaryCounts.T13_SYNTAX_CODE_FORMATION;
  const competingGateFamilies = [G1.numerator, G2.numerator, G3.numerator];
  const otherPrimaryFamilies = PRIMARY_TAXONOMY
    .filter((category) => category !== "T13_SYNTAX_CODE_FORMATION")
    .map((category) => input.primaryCounts[category]);
  const G4 = {
    numerator: t13,
    denominator: input.denominator,
    proportion: t13 / input.denominator,
    rule: "T13 must be the unique largest primary family and exceed every other gate-family count, while semantic interpretation is unavailable.",
    result: t13 > Math.max(...otherPrimaryFamilies, ...competingGateFamilies) ? "PASS" : "FAIL",
  } as const;
  const noSpecificGatePassed = [G1.result, G2.result, G3.result, G4.result].every((result) => result === "FAIL");
  return {
    G1, G2, G3, G4,
    G5: {
      result: noSpecificGatePassed ? "APPLIED" : "NOT_APPLIED",
      decision: noSpecificGatePassed ? "MIXED_SEMANTIC_CEILING__NO_SINGLE_INTERVENTION" : null,
      preciseInterpretation: noSpecificGatePassed
        ? "No single intervention among G1-G4 is supported by the available historical evidence, and semantic observability is insufficient for a more specific causal intervention."
        : null,
    },
  } as const;
}
