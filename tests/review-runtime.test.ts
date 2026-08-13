import { describe, expect, it } from "vitest";
import { aggregateDualAxisReview } from "../services/review-runtime/src/index";

const clean = { issues: [], contextHash: "spec-context", axis: "SPEC" as const };
const standards = { issues: [], contextHash: "standards-context", axis: "STANDARDS" as const };

describe("dual-axis review gate", () => {
  it("cannot approve when deterministic verification is not PASS", () => {
    expect(aggregateDualAxisReview({ verification: "NOT_RUN", spec: clean, standards }).decision).toBe("BLOCKED");
  });
  it("preserves independent blockers and approves only clean isolated axes", () => {
    expect(aggregateDualAxisReview({ verification: "PASS", spec: clean, standards }).decision).toBe("APPROVE");
    expect(aggregateDualAxisReview({ verification: "PASS", spec: { ...clean, issues: [{ level: "MAJOR", message: "criterion missing", path: null, line: null, evidenceIds: ["E1"] }] }, standards }).decision).toBe("CHANGES_REQUESTED");
    expect(() => aggregateDualAxisReview({ verification: "PASS", spec: clean, standards: { ...standards, contextHash: "spec-context" } })).toThrow(/contexts must remain isolated/);
  });
});
