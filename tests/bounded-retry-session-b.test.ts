import { describe, expect, it } from "vitest";
import { classifyRetryOutcome, isContradiction, secondFailureStage } from "../services/bounded-retry-session-b-runtime/src/index";

const base = { transport: "PASS" as const, normalizationClassification: "VALID_EDIT", success: false, repeated: false, contradiction: false, wrongFileAttempt: false, actualSafetyViolation: false, rollback: "PASS", cleanup: "PASS" };

describe("bounded retry Session B taxonomy", () => {
  it("uses fail-closed precedence", () => {
    expect(classifyRetryOutcome({ ...base, transport: "TIMEOUT" })).toBe("INFRASTRUCTURE_FAILURE");
    expect(classifyRetryOutcome({ ...base, wrongFileAttempt: true, success: true })).toBe("SAFETY_REJECTED");
    expect(classifyRetryOutcome({ ...base, normalizationClassification: "MALFORMED_SCHEMA" })).toBe("MALFORMED");
    expect(classifyRetryOutcome({ ...base, repeated: true })).toBe("REPEATED_EDIT");
    expect(classifyRetryOutcome({ ...base, contradiction: true })).toBe("CONTRADICTION");
    expect(classifyRetryOutcome({ ...base, success: true })).toBe("RECOVERED");
    expect(classifyRetryOutcome(base)).toBe("FAILED_DIFFERENT");
  });

  it("derives deterministic second failure stages", () => {
    const run = { exactSourceIncluded: true, transport: "PASS", normalizationClassification: "VALID_EDIT", patchApplied: true, syntax: "PASS", visible: "PASS", hidden: "PASS" };
    expect(secondFailureStage(run)).toBe("SUCCESS");
    expect(secondFailureStage({ ...run, syntax: "FAIL" })).toBe("SYNTAX_TYPE");
    expect(secondFailureStage({ ...run, visible: "FAIL" })).toBe("VISIBLE_TEST");
    expect(secondFailureStage({ ...run, hidden: "FAIL" })).toBe("HIDDEN_TEST");
  });

  it("detects regression of a previously passing machine stage", () => {
    const evidence = { priorKnownPassStages: ["SYNTAX_TYPE", "VISIBLE_TEST"] } as any;
    expect(isContradiction(evidence, { syntax: "PASS", visible: "FAIL", hidden: "NOT_RUN" })).toBe(true);
    expect(isContradiction(evidence, { syntax: "PASS", visible: "PASS", hidden: "FAIL" })).toBe(false);
  });
});
