import { describe, expect, it } from "vitest";
import { classifyEvidenceNeed, packageMinimalContext, retrieveTaskAware, scoreEvidenceCoverage, type SelectedEvidence, type TaskAwareCandidate } from "../services/task-aware-retrieval/src/index";

const candidates: TaskAwareCandidate[] = [
  { id: "src", path: "src/load_config.ts", content: "export function load_config() { return 'safe'; }", evidenceClass: "SYMBOL", symbols: ["load_config"] },
  { id: "test", path: "tests/load_config.test.ts", content: "test('load_config rejects blank input', () => {})", evidenceClass: "TEST", symbols: ["load_config"] },
  { id: "readme", path: "README.md", content: "Run locally with npm run dev.", evidenceClass: "DOCUMENTATION" },
  { id: "package", path: "package.json", content: "{\"scripts\":{\"dev\":\"vite\"}}", evidenceClass: "BUILD" },
  { id: "license", path: "LICENSE", content: "MIT License", evidenceClass: "METADATA" }
];

describe("task-aware retrieval generation 3", () => {
  it("classifies bounded mixed evidence needs without candidate leakage", () => {
    const request = classifyEvidenceNeed({ task: "Fix load_config and use its associated test", declaredSymbols: ["load_config"] });
    expect(request.classes).toContain("SYMBOL");
    expect(request.classes).toContain("TEST");
    expect(request.classes.length).toBeLessThanOrEqual(3);
    expect(request.maxFallbackRounds).toBe(1);
    expect(request.primary).toBe("SYMBOL");
  });

  it("classifies onboarding as documentation plus build", () => {
    expect(classifyEvidenceNeed({ task: "How do I install and run this repo?" }).classes).toEqual(expect.arrayContaining(["DOCUMENTATION", "BUILD"]));
  });

  it("adds at most one missing evidence class through the bounded fallback", () => {
    const r1 = retrieveTaskAware({ policy: "R1_TASK_AWARE_FIXED", task: "Explain the architecture, test runner, and license", candidates });
    const r2 = retrieveTaskAware({ policy: "R2_TASK_AWARE_ONE_FALLBACK", task: "Explain the architecture, test runner, and license", candidates });
    expect(r1.selected).toHaveLength(2);
    expect(r1.coverage.complete).toBe(false);
    expect(r2.fallbackRounds).toBeLessThanOrEqual(1);
    expect(r2.selected.length).toBeLessThanOrEqual(3);
    expect(r2.coverage.ratio).toBeGreaterThanOrEqual(r1.coverage.ratio);
  });

  it("prefers an indexed definition over an exact symbol mentioned only in a stale comment", () => {
    const result = retrieveTaskAware({
      policy: "R2_TASK_AWARE_ONE_FALLBACK",
      task: "Locate the current implementation of function load_config.",
      declaredSymbols: ["load_config"],
      candidates: [
        { id: "stale", path: "src/legacy.ts", content: "// load_config is implemented here", evidenceClass: "SYMBOL", symbols: ["legacy_load_config"] },
        candidates[0]
      ]
    });
    expect(result.selected[0].path).toBe("src/load_config.ts");
  });

  it("reports class coverage without conflating it with oracle relevance", () => {
    const coverage = scoreEvidenceCoverage(["METADATA", "DOCUMENTATION"], [candidates[4]]);
    expect(coverage.complete).toBe(false);
    expect(coverage.missing).toEqual(["DOCUMENTATION"]);
  });

  it("packages primary and supporting evidence without internal diagnostics", () => {
    const result = retrieveTaskAware({ policy: "R2_TASK_AWARE_ONE_FALLBACK", task: "How do I install and run this repo?", candidates });
    const context = packageMinimalContext({ task: "How do I install and run this repo?", evidence: result.selected, hardTokenCap: 500 });
    expect(context.variant).toBe("C1_PLUS");
    expect(context.content).toContain("PRIMARY EVIDENCE");
    expect(context.content).toContain("SUPPORTING EVIDENCE");
    expect(context.content).not.toContain("coverageBeforeFallback");
    expect(context.estimatedTokens).toBeLessThanOrEqual(500);
  });

  it("re-slices oversized evidence instead of silently omitting the critical item", () => {
    const oversized: SelectedEvidence = { ...candidates[2], content: "important decision\n".repeat(600), rank: 1, score: 20, stage: "PRIMARY", family: "DOCUMENTATION", reasons: ["fixture"], estimatedTokens: 2_000 };
    const context = packageMinimalContext({ task: "Read the current documentation", evidence: [oversized], hardTokenCap: 200 });
    expect(context.includedPaths).toEqual(["README.md"]);
    expect(context.content).toContain("TRUNCATED BY BUDGET");
    expect(context.estimatedTokens).toBeLessThanOrEqual(200);
  });
});
