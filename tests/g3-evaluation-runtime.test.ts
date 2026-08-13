import { describe, expect, it } from "vitest";
import { scoreG3Response, shouldRouteV3, type G3RetrievalView } from "../services/g3-evaluation-runtime/src/index";
import type { G3RuntimeTask } from "../services/g3-benchmark-runtime/src/index";

const task: G3RuntimeTask = {
  task_id: "g3-test", repository_id: "repo", repository_commit: "a".repeat(40), split: "holdout", prompt: "How is this built?", declared_symbols: [], provenance: "fixture",
  category: "understanding", difficulty: "L3", expected_outcome: "ANSWER", required_evidence_paths: ["README.md", "package.json"], target_paths: [], required_answer_terms: [], security_sensitive: false,
  hidden_oracle_kind: "PINNED_ARTIFACT", candidates: [
    { id: "readme", path: "README.md", content: "purpose", evidenceClass: "DOCUMENTATION", role: "metadata" },
    { id: "package", path: "package.json", content: "scripts", evidenceClass: "BUILD", role: "metadata" }
  ]
};

describe("G3 open-ended scorer", () => {
  it("requires the status and complete grounded evidence without unsupported paths", () => {
    expect(scoreG3Response(task, { status: "ANSWER", answer: "Grounded", evidence_paths: ["README.md", "package.json"], target_paths: [], confidence: 0.8 }, true).success).toBe(true);
    const failed = scoreG3Response(task, { status: "ANSWER", answer: "Grounded", evidence_paths: ["README.md", "missing.md"], target_paths: [], confidence: 0.8 }, true);
    expect(failed.success).toBe(false);
    expect(failed.unsupportedClaim).toBe(true);
  });

  it("routes evidence-heavy incomplete V2 coverage without an LLM call", () => {
    const view: G3RetrievalView = { configuration: "E-MIN-V2", context: "", selectedPaths: [], includedPaths: [], omittedPaths: [], selectedClasses: ["SYMBOL"], requestedClasses: ["DOCUMENTATION", "BUILD"], coverageRatio: 0, fallbackRounds: 1, retrievalLatencyMs: 1, contextVariant: "C1", estimatedContextTokens: 1 };
    expect(shouldRouteV3(task, view)).toBe(true);
  });
});
