import { createHash } from "node:crypto";
import type { TrustedVerificationExecutor, VerificationExecution } from "../../tool-runtime/src/index";

export interface ReproductionArtifact {
  id: string; commandId: string; symptom: string; status: "RED" | "BLOCKED_MISSING_REPRO";
  execution: VerificationExecution; deterministic: boolean; durationMs: number; evidenceIds: string[];
}
export interface DiagnosisHypothesis { id: string; suspectedCause: string; evidenceIds: string[]; prediction: string; discriminatingProbe: string; confidence: number; rank: number }
export interface ProbeResult { hypothesisId: string; variable: string; outcome: "SUPPORTS" | "FALSIFIES" | "INCONCLUSIVE"; evidenceId: string; recordedAt: string }
export interface DiagnosisArtifact { reproductionId: string; hypotheses: DiagnosisHypothesis[]; probes: ProbeResult[]; state: "HYPOTHESES" | "PROBING" | "DIAGNOSED"; patchAllowed: boolean; reason: string }

export class DiagnosisRuntime {
  readonly #executor: TrustedVerificationExecutor;
  constructor(executor: TrustedVerificationExecutor) { this.#executor = executor; }

  async reproduce(commandId: string, exactSymptom: string): Promise<ReproductionArtifact> {
    if (!exactSymptom.trim()) throw new Error("Reproduction requires an exact symptom assertion");
    const execution = await this.#executor.run(commandId);
    const combined = `${execution.stdout}\n${execution.stderr}`;
    const red = execution.status === "FAIL" && combined.includes(exactSymptom);
    const evidenceId = `repro_${createHash("sha256").update(`${commandId}:${execution.exitCode}:${exactSymptom}:${combined}`).digest("hex").slice(0, 16)}`;
    return { id: evidenceId, commandId, symptom: exactSymptom, status: red ? "RED" : "BLOCKED_MISSING_REPRO", execution, deterministic: red, durationMs: execution.durationMs, evidenceIds: red ? [evidenceId] : [] };
  }

  hypothesize(reproduction: ReproductionArtifact, candidates: Omit<DiagnosisHypothesis, "rank">[]): DiagnosisArtifact {
    if (reproduction.status !== "RED" || !reproduction.deterministic) throw new Error("Diagnosis requires deterministic RED reproduction evidence");
    if (candidates.length < 3 || candidates.length > 5) throw new Error("Diagnosis requires 3-5 hypotheses");
    if (new Set(candidates.map((item) => item.id)).size !== candidates.length) throw new Error("Hypothesis IDs must be unique");
    for (const item of candidates) {
      if (!item.suspectedCause.trim() || !item.prediction.trim() || !item.discriminatingProbe.trim() || item.evidenceIds.length === 0) throw new Error("Every hypothesis requires cause, evidence, prediction and a discriminating probe");
      if (item.confidence < 0 || item.confidence > 1) throw new Error("Hypothesis confidence must be between zero and one");
    }
    const hypotheses = this.#rank(candidates.map((item) => ({ ...item, rank: 0 })));
    return { reproductionId: reproduction.id, hypotheses, probes: [], state: "HYPOTHESES", patchAllowed: false, reason: "A discriminating probe must support a hypothesis before patch planning" };
  }

  recordProbe(diagnosis: DiagnosisArtifact, input: Omit<ProbeResult, "recordedAt">): DiagnosisArtifact {
    if (!input.variable.trim() || !input.evidenceId.trim()) throw new Error("Probe requires one named variable and evidence");
    if (diagnosis.probes.some((probe) => probe.evidenceId === input.evidenceId)) throw new Error("Probe evidence must be fresh");
    const target = diagnosis.hypotheses.find((item) => item.id === input.hypothesisId);
    if (!target) throw new Error("Probe targets an unknown hypothesis");
    const hypotheses = diagnosis.hypotheses.map((item) => item.id !== target.id ? { ...item } : { ...item, confidence: Number(Math.max(0, Math.min(1, item.confidence + (input.outcome === "SUPPORTS" ? 0.25 : input.outcome === "FALSIFIES" ? -0.5 : -0.05))).toFixed(3)) });
    const probes = [...diagnosis.probes, { ...input, recordedAt: new Date().toISOString() }];
    const ranked = this.#rank(hypotheses); const leader = ranked[0];
    const patchAllowed = leader.confidence >= 0.75 && probes.some((probe) => probe.hypothesisId === leader.id && probe.outcome === "SUPPORTS");
    return { ...diagnosis, hypotheses: ranked, probes, state: patchAllowed ? "DIAGNOSED" : "PROBING", patchAllowed, reason: patchAllowed ? `Hypothesis ${leader.id} passed the diagnosis confidence gate` : "No supported hypothesis has reached the 0.75 confidence gate" };
  }

  assertPatchAllowed(diagnosis: DiagnosisArtifact): void {
    if (!diagnosis.patchAllowed || diagnosis.state !== "DIAGNOSED") throw new Error("Patch planning is blocked until the diagnosis gate passes");
  }
  #rank(items: DiagnosisHypothesis[]): DiagnosisHypothesis[] { return [...items].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)).map((item, index) => ({ ...item, rank: index + 1 })); }
}
