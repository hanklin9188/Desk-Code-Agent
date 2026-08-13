import { describe, expect, it } from "vitest";
import {
  buildRetryPrompt,
  classifyContradiction,
  deriveRetryFailureEvidence,
  materializeRetryIntent,
  previousEditSummary,
  stableJson,
  type TournamentObservation,
} from "../services/bounded-retry-runtime/src/index";

function row(stage = "HIDDEN_TEST", success = false): TournamentObservation & { modelCall: { outputSha256: string } } {
  return {
    observationId: "m2-task-1",
    taskId: "task-1",
    repositoryId: "repo-1",
    retrieval: { exactSourceSelected: true, exactSourceIncluded: true, contextSha256: "a".repeat(64) },
    modelCall: { outputSha256: "b".repeat(64) },
    normalization: {
      classification: "VALID_EDIT",
      changedFiles: 1,
      changedLines: 2,
      canonicalDiffSha256: "c".repeat(64),
      stages: { parse: { status: "PASS", code: "JSON_PARSED" } },
    },
    execution: {
      patchApplied: true,
      syntax: "PASS",
      visible: stage === "VISIBLE_TEST" ? "FAIL" : "PASS",
      hidden: stage === "HIDDEN_TEST" ? "FAIL" : "NOT_RUN",
      rollback: "PASS",
      cleanup: "PASS",
      actualSafetyViolation: false,
      errorCode: null,
      errorSha256: null,
    },
    outcome: {
      behavioralSuccess: success,
      wrongFileAttempt: false,
      actualSafetyViolation: false,
      firstFailureStage: success ? "SUCCESS" : stage,
      transportFailure: false,
      timeout: false,
      cancelled: false,
    },
  };
}

describe("bounded retry contract", () => {
  it("rejects successful, unknown, transport, and unsafe rows", () => {
    expect(() => deriveRetryFailureEvidence(row("SUCCESS", true))).toThrow(/not retry eligible/);
    expect(() => deriveRetryFailureEvidence(row("UNKNOWN"))).toThrow(/Unregistered/);
    const transport = row("VISIBLE_TEST"); transport.outcome.transportFailure = true;
    expect(() => deriveRetryFailureEvidence(transport)).toThrow(/Infrastructure/);
    const unsafe = row("VISIBLE_TEST"); unsafe.outcome.wrongFileAttempt = true;
    expect(() => deriveRetryFailureEvidence(unsafe)).toThrow(/Unsafe/);
  });

  it("withholds hidden details and preserves bounded prior metadata", () => {
    const input = row();
    const evidence = deriveRetryFailureEvidence(input);
    expect(evidence.signal).toContain("hidden source, assertions, expected output, and expected patch withheld");
    expect(evidence.priorKnownPassStages).toEqual(["SYNTAX_TYPE", "VISIBLE_TEST"]);
    expect(previousEditSummary(input)).toContain("raw_edit_unavailable=true");
    expect(stableJson(evidence)).not.toContain("reference_fixed_source");
  });

  it("renders injected braces and replacement metacharacters byte-exactly without recursion", () => {
    const evidence = deriveRetryFailureEvidence(row("VISIBLE_TEST"));
    const source = "const x = `${base}`; const y = '$& $` $\\\' {failure_evidence}';";
    const rendered = buildRetryPrompt({ originalBoundedContext: source, previousEditSummary: "hash={source}", failureEvidence: evidence });
    expect(rendered).toContain(source);
    expect(rendered).toContain("hash={source}");
    expect(rendered).toContain("VISIBLE_TEST_FAILED");
  });

  it("materializes deterministic hash-only intent and detects regression contradiction", () => {
    const input = row();
    const evidence = deriveRetryFailureEvidence(input);
    const summary = previousEditSummary(input);
    const prompt = buildRetryPrompt({ originalBoundedContext: "TASK\nSOURCE", previousEditSummary: summary, failureEvidence: evidence });
    const args = { row: input, repositoryRevision: "rev", modelId: "TIGER-Lab/FIM-7B", modelRevision: "5a1", sourceContext: "TASK\nSOURCE", retryPrompt: prompt, system: "SYSTEM", schema: { type: "object" }, generation: { temperature: 0 } };
    expect(materializeRetryIntent(args)).toEqual(materializeRetryIntent(args));
    expect(materializeRetryIntent(args).retryAttemptIndex).toBe(1);
    expect(classifyContradiction(evidence, { syntax: "PASS", visible: "FAIL", hidden: "NOT_RUN" })).toBe(true);
    expect(classifyContradiction(evidence, { syntax: "PASS", visible: "PASS", hidden: "PASS" })).toBe(false);
  });
});
