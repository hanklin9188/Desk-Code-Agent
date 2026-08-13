import { describe, expect, it } from "vitest";
import { buildEvidenceRetry, extractPatchTargets, keywordCoverage, normalizeEvidencePath, routeCapability } from "../services/g4-diagnostic-runtime/src/index";

describe("G4 diagnostic runtime", () => {
  it("allows a bounded retry only for concrete unseen evidence", () => {
    const first = buildEvidenceRetry({ originalTask: "fix", currentRelevantSource: "source", concreteFailure: "hidden test failed", previousPatchSummary: "p1", newlyAcquiredEvidence: "assert expected 2", attempt: 1, maximumAttempts: 3, seenEvidenceHashes: new Set() });
    expect(first.retry).toBe(true);
    expect(first.prompt).toContain("ORIGINAL TASK");
    expect(first.prompt).toContain("CONCRETE TEST OR TOOL FAILURE");
    expect(buildEvidenceRetry({ originalTask: "fix", currentRelevantSource: "source", concreteFailure: "same", previousPatchSummary: "p2", newlyAcquiredEvidence: "assert expected 2", attempt: 2, maximumAttempts: 3, seenEvidenceHashes: new Set([first.evidenceHash!]) }).reason).toBe("NO_NEW_EVIDENCE");
  });

  it("stops at the pre-registered attempt budget", () => {
    expect(buildEvidenceRetry({ originalTask: "fix", currentRelevantSource: "source", concreteFailure: "failed", previousPatchSummary: "p", newlyAcquiredEvidence: "new", attempt: 2, maximumAttempts: 2, seenEvidenceHashes: new Set() }).reason).toBe("ATTEMPT_BUDGET_EXHAUSTED");
  });

  it("normalizes location-qualified evidence and parses patch targets", () => {
    expect(normalizeEvidencePath("[README.md:1-80]")).toBe("README.md");
    expect(extractPatchTargets("--- a/src/a.mjs\n+++ b/src/a.mjs\n@@ -1 +1 @@\n-a\n+b\n")).toEqual(["src/a.mjs"]);
    expect(keywordCoverage("upper bound omitted", "The upper limit bound was omitted")).toBeGreaterThanOrEqual(2 / 3);
  });

  it("routes from deterministic capability evidence rather than model confidence", () => {
    expect(routeCapability({ mutation: false, repositorySupported: true, evidenceComplete: true, behavioralOracleAvailable: false, hiddenOracleAvailable: false, fileScope: 0, difficulty: "L3", taskClassBehavioralSuccess: 1 })).toBe("SUPPORTED");
    expect(routeCapability({ mutation: true, repositorySupported: true, evidenceComplete: true, behavioralOracleAvailable: true, hiddenOracleAvailable: true, fileScope: 1, difficulty: "L2", taskClassBehavioralSuccess: 0 })).toBe("REPORT_ONLY");
    expect(routeCapability({ mutation: true, repositorySupported: true, evidenceComplete: true, behavioralOracleAvailable: true, hiddenOracleAvailable: true, fileScope: 1, difficulty: "L2", taskClassBehavioralSuccess: 0.6 })).toBe("EXPERIMENTAL");
    expect(routeCapability({ mutation: false, repositorySupported: true, evidenceComplete: false, behavioralOracleAvailable: false, hiddenOracleAvailable: false, fileScope: 0, difficulty: "L2", taskClassBehavioralSuccess: 1 })).toBe("REPORT_ONLY");
  });
});
