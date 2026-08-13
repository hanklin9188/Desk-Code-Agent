// @vitest-environment node
import { describe, expect, it } from "vitest";
import path from "node:path";
import { AnalysisRuntime } from "../services/analysis-runtime/src/index";

describe("cited deterministic analysis", () => {
  it("produces an overview and report without inventing semantic claims", async () => {
    const runtime = new AnalysisRuntime(); const bundle = await runtime.analyze(path.resolve(process.cwd()));
    expect(bundle.overview.languages.length).toBeGreaterThan(0);
    expect(bundle.overview.manifests).toContain("package.json");
    expect(bundle.provenance).toBe("deterministic");
    expect(bundle.overview.purpose).toMatch(/requires cited README/);
    expect(runtime.renderMarkdown(bundle)).toContain("repository report");
  });

  it("keeps model inference separate and rejects citations outside the evidence ledger", async () => {
    const runtime = new AnalysisRuntime();
    const gateway = {
      complete: async (request: { requestId: string; prompt: string }) => {
        const evidenceId = request.prompt.match(/evidence_[a-f0-9]+/)?.[0];
        if (!evidenceId) throw new Error("fixture expected evidence");
        return {
          requestId: request.requestId,
          output: {
            purpose: "A bounded local engineering workspace.",
            architectureSummary: "The repository separates desktop, runtime, and contracts.",
            readingOrder: ["README.md", "packages/contracts/src/index.ts"],
            claims: [
              { text: "The product is local-first.", evidenceIds: [evidenceId], confidence: 0.88 }
            ]
          },
          finishReason: "stop", promptTokens: 100, completionTokens: 40, latencyMs: 12
        };
      }
    };
    const bundle = await runtime.analyzeWithModel(path.resolve(process.cwd()), gateway);
    expect(bundle.provenance).toBe("model_assisted");
    expect(bundle.modelInference.claims[0].source).toBe("MODEL_INFERENCE");
    expect(bundle.deterministic.fingerprint.fileCount).toBeGreaterThan(0);
    expect(bundle.modelInference.claims[0].evidenceIds[0]).toMatch(/^evidence_/);

    const poisoned = {
      complete: async () => ({
        requestId: "poisoned", output: { purpose: "unsupported", architectureSummary: "unsupported", readingOrder: [], claims: [{ text: "invented", evidenceIds: ["evidence_not_in_ledger"], confidence: 1 }] },
        finishReason: "stop", promptTokens: 1, completionTokens: 1, latencyMs: 1
      })
    };
    await expect(runtime.analyzeWithModel(path.resolve(process.cwd()), poisoned)).rejects.toThrow(/outside the evidence ledger/);
  });

  it("builds and validates all eleven evidence-labelled report sections", async () => {
    const runtime = new AnalysisRuntime();
    const report = await runtime.analyzeComplete(path.resolve(process.cwd()));
    expect(report.status).toBe("PASS");
    expect(report.sections).toHaveLength(11);
    expect(report.sections.map((section) => section.name)).toEqual([
      "Executive Summary", "Repository Overview", "Architecture", "Code Quality", "Testing", "Security/Risk",
      "Performance Hypotheses", "Technical Debt", "Priority Recommendations", "Onboarding Guide", "Evidence Appendix"
    ]);
    expect(report.sections.flatMap((section) => section.claims).every((claim) => claim.label === "UNKNOWN" || claim.evidenceIds.length > 0)).toBe(true);
    expect(report.metrics.unsupportedClaims).toBe(0);
    expect(runtime.renderCompleteMarkdown(report)).toContain("[HYPOTHESIS]");

    const poisoned = structuredClone(report);
    poisoned.sections[0].claims[0].evidenceIds = ["evidence_unknown"];
    expect(() => runtime.validateCompleteReport(poisoned)).toThrow(/outside the evidence ledger/);
  }, 15_000);
});
