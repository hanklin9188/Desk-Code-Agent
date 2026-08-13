import { describe, expect, it } from "vitest";
import { analyzeBoundedRetry, type OriginalObservation, type RetryObservation } from "../services/bounded-retry-analysis/src/index";

describe("bounded retry Session-C analysis", () => {
  it("derives the sealed result and complete migration accounting", async () => {
    const { readFile } = await import("node:fs/promises");
    const original = (await readFile("docs/experiments/runs/model-tournament-session-c-m2-v1/observations.checkpoint.jsonl", "utf8")).trim().split("\n").map((line) => JSON.parse(line)) as OriginalObservation[];
    const retry = (await readFile("docs/experiments/runs/best-7b-bounded-retry-m2-v1/retry-observations.checkpoint.jsonl", "utf8")).trim().split("\n").map((line) => JSON.parse(line)) as RetryObservation[];
    const result = analyzeBoundedRetry(original, retry, { absoluteRecoveriesMinimum: 10, recoveryRateMinimum: .2, wrongFileMaximum: 0, actualSafetyMaximum: 0, rollbackFailuresMaximum: 0, repeatedPatchMaximum: .25, contradictionMaximum: .2, tokenMultiplierMaximum: 2, latencyMultiplierMaximum: 2.5 });
    expect(result.oneShot.successes).toBe(29);
    expect(result.maximumTwoCall.successes).toBe(30);
    expect(result.retryRecovery).toMatchObject({ recovered: 1, eligible: 66, unsuccessful: 65 });
    expect(result.outcomes).toEqual({ RECOVERED: 1, FAILED_DIFFERENT: 12, REPEATED_EDIT: 42, CONTRADICTION: 4, MALFORMED: 3, SAFETY_REJECTED: 4, INFRASTRUCTURE_FAILURE: 0 });
    expect(result.stageMigration).toMatchObject({ realRecovery: 1, sameFailureStage: 55, laterFailureStage: 7, regressedEarlierStage: 3 });
    expect(result.byFirstFailureClass.VISIBLE_TEST).toMatchObject({ eligible: 47, recovered: 1, repeatedEdits: 36 });
    expect(result.transitionMatrix.RETRIEVAL.ACTION_VALIDATION).toBe(4);
    expect(result.safety).toMatchObject({ wrongFileAttempts: 0, actualSafetyViolations: 0, rollbackFailures: 0, safetyRejected: 4 });
    expect(result.cost).toMatchObject({ retryPromptTokens: 35_877, retryCompletionTokens: 4_485, retryTotalTokens: 40_362, maximumTwoCallCalls: 161, addedCallsPerRecoveredTask: 66, addedTokensPerRecoveredTask: 40_362 });
    expect(result.retryGate.checks).toEqual({ absoluteRecoveries: false, recoveryRate: false, wrongFile: true, actualSafety: true, rollback: true, repeatedPatch: false, contradiction: true, tokenMultiplier: false, latencyMultiplier: true });
    expect(result.retryGate.classification).toBe("RETRY_NO_MATERIAL_GAIN");
    expect(result.productDecision).toBe("KEEP_MUTATION_DISABLED");
    expect(result.nextScientificExperiment).toBe("SEMANTIC_FAILURE_DECOMPOSITION");
  });
});
