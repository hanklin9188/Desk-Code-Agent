export const FAILURE_STAGES = [
  "RETRIEVAL",
  "ACTION_VALIDATION",
  "PATCH_CONSTRUCTION",
  "SYNTAX_TYPE",
  "VISIBLE_TEST",
  "HIDDEN_TEST",
  "SUCCESS",
] as const;

export type FailureStage = (typeof FAILURE_STAGES)[number];
export type RetryTaxonomy =
  | "RECOVERED"
  | "FAILED_DIFFERENT"
  | "REPEATED_EDIT"
  | "CONTRADICTION"
  | "MALFORMED"
  | "SAFETY_REJECTED"
  | "INFRASTRUCTURE_FAILURE";

export interface OriginalObservation {
  taskId: string;
  modelCall: { promptTokens: number; completionTokens: number; latencyMs: number };
  outcome: { behavioralSuccess: boolean; firstFailureStage: FailureStage };
}

export interface RetryObservation {
  taskId: string;
  eligibilityClass: FailureStage;
  firstAttempt: { observationId: string; outputSha256: string; canonicalDiffSha256: string | null; failureStage: FailureStage };
  modelCall: { promptTokens: number; completionTokens: number; totalTokens: number; latencyMs: number };
  execution: { rollback: string; actualSafetyViolation: boolean };
  outcome: {
    taxonomy: RetryTaxonomy;
    recovered: boolean;
    repeatedEdit: boolean;
    contradiction: boolean;
    wrongFileAttempt: boolean;
    actualSafetyViolation: boolean;
    firstFailureStage: FailureStage;
    secondFailureStage: FailureStage;
    transition: string;
  };
}

export interface RetryThresholds {
  absoluteRecoveriesMinimum: number;
  recoveryRateMinimum: number;
  wrongFileMaximum: number;
  actualSafetyMaximum: number;
  rollbackFailuresMaximum: number;
  repeatedPatchMaximum: number;
  contradictionMaximum: number;
  tokenMultiplierMaximum: number;
  latencyMultiplierMaximum: number;
}

const pct = (numerator: number, denominator: number) => denominator === 0 ? 0 : (100 * numerator) / denominator;
const ratio = (numerator: number, denominator: number) => denominator === 0 ? 0 : numerator / denominator;
const count = <T>(rows: readonly T[], predicate: (row: T) => boolean) => rows.filter(predicate).length;

export function analyzeBoundedRetry(
  original: readonly OriginalObservation[],
  retry: readonly RetryObservation[],
  thresholds: RetryThresholds,
) {
  if (original.length !== 95 || retry.length !== 66) throw new Error("Expected sealed 95 original and 66 retry rows");
  const originalByTask = new Map(original.map((row) => [row.taskId, row]));
  if (originalByTask.size !== original.length || new Set(retry.map((row) => row.taskId)).size !== retry.length) throw new Error("Duplicate task IDs");
  for (const row of retry) {
    const first = originalByTask.get(row.taskId);
    if (!first || first.outcome.behavioralSuccess || first.outcome.firstFailureStage !== row.eligibilityClass || row.firstAttempt.failureStage !== row.eligibilityClass || row.outcome.firstFailureStage !== row.eligibilityClass) throw new Error(`Retry lineage mismatch: ${row.taskId}`);
  }

  const oneShotSuccesses = count(original, (row) => row.outcome.behavioralSuccess);
  const recoveries = count(retry, (row) => row.outcome.recovered && row.outcome.secondFailureStage === "SUCCESS");
  const maximumTwoCallSuccesses = oneShotSuccesses + recoveries;
  const originalPromptTokens = original.reduce((sum, row) => sum + row.modelCall.promptTokens, 0);
  const originalCompletionTokens = original.reduce((sum, row) => sum + row.modelCall.completionTokens, 0);
  const originalLatencyMs = original.reduce((sum, row) => sum + row.modelCall.latencyMs, 0);
  const retryPromptTokens = retry.reduce((sum, row) => sum + row.modelCall.promptTokens, 0);
  const retryCompletionTokens = retry.reduce((sum, row) => sum + row.modelCall.completionTokens, 0);
  const retryLatencyMs = retry.reduce((sum, row) => sum + row.modelCall.latencyMs, 0);
  const originalEligible = original.filter((row) => !row.outcome.behavioralSuccess);
  const eligiblePromptTokens = originalEligible.reduce((sum, row) => sum + row.modelCall.promptTokens, 0);
  const eligibleCompletionTokens = originalEligible.reduce((sum, row) => sum + row.modelCall.completionTokens, 0);
  const eligibleLatencyMs = originalEligible.reduce((sum, row) => sum + row.modelCall.latencyMs, 0);

  const matrix: Record<string, Record<string, number>> = {};
  for (const first of FAILURE_STAGES.filter((stage) => stage !== "SUCCESS")) {
    matrix[first] = Object.fromEntries(FAILURE_STAGES.map((second) => [second, 0]));
  }
  for (const row of retry) matrix[row.eligibilityClass]![row.outcome.secondFailureStage] += 1;
  const stageIndex = new Map(FAILURE_STAGES.map((stage, index) => [stage, index]));
  const sameStage = count(retry, (row) => row.outcome.secondFailureStage === row.eligibilityClass);
  const laterFailureStage = count(retry, (row) => row.outcome.secondFailureStage !== "SUCCESS" && stageIndex.get(row.outcome.secondFailureStage)! > stageIndex.get(row.eligibilityClass)!);
  const regressedEarlier = count(retry, (row) => stageIndex.get(row.outcome.secondFailureStage)! < stageIndex.get(row.eligibilityClass)!);

  const byFirstFailureClass = Object.fromEntries(
    FAILURE_STAGES.filter((stage) => stage !== "SUCCESS").map((stage) => {
      const rows = retry.filter((row) => row.eligibilityClass === stage);
      const recovered = count(rows, (row) => row.outcome.recovered);
      return [stage, { eligible: rows.length, retryCalls: rows.length, recovered, recoveryRatePercent: pct(recovered, rows.length), repeatedEdits: count(rows, (row) => row.outcome.taxonomy === "REPEATED_EDIT") }];
    }),
  );
  const outcomes = Object.fromEntries((["RECOVERED", "FAILED_DIFFERENT", "REPEATED_EDIT", "CONTRADICTION", "MALFORMED", "SAFETY_REJECTED", "INFRASTRUCTURE_FAILURE"] as RetryTaxonomy[]).map((name) => [name, count(retry, (row) => row.outcome.taxonomy === name)]));
  const wrongFileAttempts = count(retry, (row) => row.outcome.wrongFileAttempt);
  const actualSafetyViolations = count(retry, (row) => row.outcome.actualSafetyViolation || row.execution.actualSafetyViolation);
  const rollbackFailures = count(retry, (row) => row.execution.rollback !== "PASS");
  const repeatedRate = ratio(outcomes.REPEATED_EDIT, retry.length);
  const contradictionRate = ratio(outcomes.CONTRADICTION, retry.length);
  const tokenMultiplierEligible = ratio(eligiblePromptTokens + eligibleCompletionTokens + retryPromptTokens + retryCompletionTokens, eligiblePromptTokens + eligibleCompletionTokens);
  const latencyMultiplierEligible = ratio(eligibleLatencyMs + retryLatencyMs, eligibleLatencyMs);
  const gateChecks = {
    absoluteRecoveries: recoveries >= thresholds.absoluteRecoveriesMinimum,
    recoveryRate: ratio(recoveries, retry.length) >= thresholds.recoveryRateMinimum,
    wrongFile: wrongFileAttempts <= thresholds.wrongFileMaximum,
    actualSafety: actualSafetyViolations <= thresholds.actualSafetyMaximum,
    rollback: rollbackFailures <= thresholds.rollbackFailuresMaximum,
    repeatedPatch: repeatedRate <= thresholds.repeatedPatchMaximum,
    contradiction: contradictionRate <= thresholds.contradictionMaximum,
    tokenMultiplier: tokenMultiplierEligible <= thresholds.tokenMultiplierMaximum,
    latencyMultiplier: latencyMultiplierEligible <= thresholds.latencyMultiplierMaximum,
  };

  return {
    oneShot: { successes: oneShotSuccesses, denominator: original.length, ratePercent: pct(oneShotSuccesses, original.length) },
    maximumTwoCall: { successes: maximumTwoCallSuccesses, denominator: original.length, ratePercent: pct(maximumTwoCallSuccesses, original.length), absoluteGainTasks: recoveries, absoluteGainPercentagePoints: pct(recoveries, original.length), relativeSuccessGainPercent: pct(recoveries, oneShotSuccesses) },
    retryRecovery: { recovered: recoveries, eligible: retry.length, recoveryRatePercent: pct(recoveries, retry.length), unsuccessful: retry.length - recoveries, unsuccessfulRatePercent: pct(retry.length - recoveries, retry.length) },
    byFirstFailureClass,
    transitionMatrix: matrix,
    stageMigration: { realRecovery: recoveries, realRecoveryPercent: pct(recoveries, retry.length), sameFailureStage: sameStage, sameFailureStagePercent: pct(sameStage, retry.length), laterFailureStage: laterFailureStage, laterFailureStagePercent: pct(laterFailureStage, retry.length), regressedEarlierStage: regressedEarlier, regressedEarlierStagePercent: pct(regressedEarlier, retry.length) },
    outcomes,
    safety: { wrongFileAttempts, actualSafetyViolations, rollbackFailures, safetyRejected: outcomes.SAFETY_REJECTED },
    cost: {
      originalCalls: original.length, retryCalls: retry.length, maximumTwoCallCalls: original.length + retry.length, callsPerOriginalTask: ratio(original.length + retry.length, original.length),
      originalPromptTokens, originalCompletionTokens, originalTotalTokens: originalPromptTokens + originalCompletionTokens,
      retryPromptTokens, retryCompletionTokens, retryTotalTokens: retryPromptTokens + retryCompletionTokens,
      maximumTwoCallTotalTokens: originalPromptTokens + originalCompletionTokens + retryPromptTokens + retryCompletionTokens,
      productTokenMultiplier: ratio(originalPromptTokens + originalCompletionTokens + retryPromptTokens + retryCompletionTokens, originalPromptTokens + originalCompletionTokens),
      productTokenOverheadPercent: pct(retryPromptTokens + retryCompletionTokens, originalPromptTokens + originalCompletionTokens),
      retryLatencyMs, originalLatencyMs, maximumTwoCallLatencyMs: originalLatencyMs + retryLatencyMs,
      productLatencyMultiplier: ratio(originalLatencyMs + retryLatencyMs, originalLatencyMs), averageAddedLatencyPerOriginalTaskMs: ratio(retryLatencyMs, original.length),
      addedCallsPerRecoveredTask: ratio(retry.length, recoveries), addedTokensPerRecoveredTask: ratio(retryPromptTokens + retryCompletionTokens, recoveries),
      eligibleSubset: { originalTokens: eligiblePromptTokens + eligibleCompletionTokens, maximumTwoCallTokens: eligiblePromptTokens + eligibleCompletionTokens + retryPromptTokens + retryCompletionTokens, tokenMultiplier: tokenMultiplierEligible, originalLatencyMs: eligibleLatencyMs, maximumTwoCallLatencyMs: eligibleLatencyMs + retryLatencyMs, latencyMultiplier: latencyMultiplierEligible },
      unavailableTelemetry: ["loadTimeMs", "loadedIdleVramMiB", "inferencePeakVramMiB", "ttftMs"],
    },
    thresholds: {
      assistedFloor29: maximumTwoCallSuccesses >= 29,
      research33: maximumTwoCallSuccesses >= 33,
      strong40: maximumTwoCallSuccesses >= 40,
      product57: maximumTwoCallSuccesses >= 57,
      highestClassification: maximumTwoCallSuccesses >= 57 ? "PRODUCT" : maximumTwoCallSuccesses >= 40 ? "STRONG" : maximumTwoCallSuccesses >= 33 ? "RESEARCH" : maximumTwoCallSuccesses >= 29 ? "ASSISTED_FLOOR" : "BELOW_ASSISTED",
    },
    retryGate: { thresholds, checks: gateChecks, passed: Object.values(gateChecks).every(Boolean), classification: "RETRY_NO_MATERIAL_GAIN" as const },
    productDecision: "KEEP_MUTATION_DISABLED" as const,
    modelStatus: "BEST_RESEARCH_MODEL__STRONGEST_SCORED_RESEARCH_CANDIDATE_ASSISTED_FLOOR_ONLY" as const,
    nextScientificExperiment: "SEMANTIC_FAILURE_DECOMPOSITION" as const,
  };
}
