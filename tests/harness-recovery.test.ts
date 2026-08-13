// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildMinimumHarnessPlan,
  classifyInstructionLoad,
  shouldEscalateToSpecialist,
  shouldRequestSemanticReview
} from "../services/harness-runtime/src/index";
import {
  packageContextVariant,
  rankEvidenceCandidates,
  type RetrievalCandidate
} from "../services/repo-intelligence/src/index";

const candidates: RetrievalCandidate[] = [
  { path: "docs/export-guide.md", content: "export export export serializer overview", role: "metadata" },
  { path: "src/parser.ts", content: "export function parsePort(value: string) { return Number(value); }", role: "source" },
  { path: "tests/parser.test.ts", content: "import { parsePort } from '../src/parser'; test('rejects invalid ports', () => parsePort('bad'))", role: "test" },
  { path: "src/server.ts", content: "import { parsePort } from './parser'; export function start(value: string) { return parsePort(value); }", role: "caller" }
];

describe("minimum effective harness", () => {
  it("ranks task-specific source and tests above misleading lexical noise", () => {
    const ranked = rankEvidenceCandidates({
      query: "parsePort invalid port validation",
      symbols: ["parsePort"],
      candidates,
      strategy: "hybrid",
      topK: 3,
      includeTests: true
    });
    expect(ranked.map((item) => item.path)).toEqual([
      "src/parser.ts",
      "tests/parser.test.ts",
      "src/server.ts"
    ]);
    expect(ranked[0].reasons).toContain("exact-symbol");
    expect(ranked.every((item) => item.path !== "docs/export-guide.md")).toBe(true);
  });

  it("keeps context variants explicit and measures signal allocation", () => {
    const evidence = candidates.map((item, index) => ({
      id: `E${index}`,
      repoSha: "sha",
      path: item.path,
      startLine: 1,
      endLine: 2,
      hash: `h${index}`,
      confidence: 0.9,
      excerpt: item.content,
      reason: item.role,
      role: item.role,
      relevant: item.role !== "metadata"
    }));
    const c2 = packageContextVariant({
      variant: "C2",
      task: "Reject invalid ports in parsePort",
      evidence,
      hardTokenCap: 512
    });
    const c4 = packageContextVariant({
      variant: "C4",
      task: "Reject invalid ports in parsePort",
      evidence,
      hardTokenCap: 512
    });
    expect(c2.content).toContain("src/parser.ts");
    expect(c2.content).toContain("tests/parser.test.ts");
    expect(c2.content).not.toContain("docs/export-guide.md");
    expect(c4.allocation.signalRatio).toBeGreaterThan(0.7);
    expect(c4.allocation.relevantEvidenceTokens).toBeGreaterThan(0);
    expect(c4.allocation.irrelevantEvidenceTokens).toBe(0);
  });

  it("defaults to one agent and escalates only on measurable triggers", () => {
    const simple = buildMinimumHarnessPlan({
      mode: "CODE",
      modifiedFiles: 1,
      patchLines: 12,
      hasReliableOracle: true,
      hiddenTestsAvailable: true,
      failedPatchAttempts: 0,
      confidence: 0.9
    });
    expect(simple.agentMode).toBe("SINGLE");
    expect(simple.components).toEqual([
      "TASK_CONTRACT",
      "MINIMAL_RETRIEVAL",
      "MINIMAL_CONTEXT",
      "SINGLE_AGENT",
      "DETERMINISTIC_VERIFICATION"
    ]);
    expect(simple.modelFacingSkills).toEqual([]);
    expect(simple.codeEnforcedPolicies).toContain("UNTRUSTED_CONTENT_BOUNDARY");
    expect(simple.retrievalPolicy).toEqual({ primary: "SYMBOL_TOP_2", fallback: "HYBRID_TOP_2", includeTests: "ONLY_WHEN_SOURCE_IS_INSUFFICIENT" });
    expect(simple.contextPolicy).toBe("C1_TASK_PLUS_SOURCE");

    const hardDiagnosis = { ...simple.signals, mode: "DEBUG" as const, failedPatchAttempts: 1, confidence: 0.35, conflictingEvidence: true, specialistExperimentEnabled: true };
    expect(shouldEscalateToSpecialist(hardDiagnosis).escalate).toBe(true);
    expect(buildMinimumHarnessPlan(hardDiagnosis).agentMode).toBe("SPECIALIST");
    expect(buildMinimumHarnessPlan({ ...hardDiagnosis, specialistExperimentEnabled: false }).agentMode).toBe("SINGLE");
  });

  it("requests semantic review conditionally instead of after every patch", () => {
    expect(shouldRequestSemanticReview({ modifiedFiles: 1, patchLines: 12, securitySensitive: false, confidence: 0.9, hiddenTestsAvailable: true, releaseCandidate: false }).required).toBe(false);
    expect(shouldRequestSemanticReview({ modifiedFiles: 3, patchLines: 120, securitySensitive: false, confidence: 0.9, hiddenTestsAvailable: true, releaseCandidate: false }).required).toBe(true);
    expect(shouldRequestSemanticReview({ modifiedFiles: 1, patchLines: 8, securitySensitive: true, confidence: 0.9, hiddenTestsAvailable: true, releaseCandidate: false }).required).toBe(true);
  });

  it("separates instruction, task, evidence, and history tokens", () => {
    const load = classifyInstructionLoad({
      instruction: "Choose one bounded action.",
      task: "Fix parsePort.",
      evidence: "parsePort returns Number(value).",
      relevantEvidence: "parsePort returns Number(value).",
      history: ""
    });
    expect(load.totalInputTokens).toBe(load.instructionTokens + load.taskTokens + load.evidenceTokens + load.historyTokens);
    expect(load.signalRatio).toBeGreaterThan(0.5);
  });
});
