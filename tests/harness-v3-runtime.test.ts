import { describe, expect, it } from "vitest";
import { buildEminV3Plan } from "../services/harness-v3-runtime/src/index";

describe("E-MIN-V3 production seam", () => {
  it("keeps one model call and deterministic protections while using task-aware evidence", () => {
    const plan = buildEminV3Plan({
      task: "How do I run this repository?",
      candidates: [
        { id: "readme", path: "README.md", content: "Use npm run dev", evidenceClass: "DOCUMENTATION" },
        { id: "build", path: "package.json", content: "{\"scripts\":{\"dev\":\"vite\"}}", evidenceClass: "BUILD" }
      ],
      signals: { mode: "ANALYZE", modifiedFiles: 0, patchLines: 0, hasReliableOracle: true, hiddenTestsAvailable: false, failedPatchAttempts: 0, confidence: 0.9 }
    });
    expect(plan.profile).toBe("E-MIN-V3");
    expect(plan.modelCalls).toBe(1);
    expect(plan.agentMode).toBe("SINGLE");
    expect(plan.semanticReviewer).toBe("OFF");
    expect(plan.multiAgent).toBe("OFF");
    expect(plan.retrieval.coverage.complete).toBe(true);
    expect(plan.context.variant).toBe("C1_PLUS");
    expect(plan.codeEnforcedPolicies).toContain("WORKTREE_ISOLATION");
    expect(plan.codeEnforcedPolicies).toContain("ROLLBACK");
  });
});
