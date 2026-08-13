import type { TaskMode } from "../../../packages/contracts/src/index";

export type HarnessComponent =
  | "TASK_CONTRACT"
  | "MINIMAL_RETRIEVAL"
  | "MINIMAL_CONTEXT"
  | "SINGLE_AGENT"
  | "DETERMINISTIC_VERIFICATION"
  | "SPECIALIST_AGENT"
  | "SEMANTIC_REVIEW";

export interface HarnessTaskSignals {
  mode: TaskMode;
  modifiedFiles: number;
  patchLines: number;
  hasReliableOracle: boolean;
  hiddenTestsAvailable: boolean;
  failedPatchAttempts: number;
  confidence: number;
  crossFileScope?: number;
  securitySensitive?: boolean;
  conflictingEvidence?: boolean;
  explicitArchitectureAnalysis?: boolean;
  explicitIndependentReview?: boolean;
  releaseCandidate?: boolean;
  specialistExperimentEnabled?: boolean;
  semanticReviewExperimentEnabled?: boolean;
}

export interface EscalationDecision {
  escalate: boolean;
  specialist: "ARCHITECTURE_ANALYSTS" | "SPEC_STANDARDS_REVIEW" | "DIAGNOSIS_CRITIC" | "NONE";
  reasons: string[];
}

export interface ReviewTriggerInput {
  modifiedFiles: number;
  patchLines: number;
  securitySensitive: boolean;
  confidence: number;
  hiddenTestsAvailable: boolean;
  releaseCandidate: boolean;
  explicitIndependentReview?: boolean;
}

export interface ReviewDecision {
  required: boolean;
  reasons: string[];
}

export interface MinimumHarnessPlan {
  profile: "E-MIN";
  agentMode: "SINGLE" | "SPECIALIST";
  components: HarnessComponent[];
  modelFacingSkills: string[];
  deterministicSkills: string[];
  codeEnforcedPolicies: string[];
  retrievalPolicy: { primary: "SYMBOL_TOP_2"; fallback: "HYBRID_TOP_2"; includeTests: "ONLY_WHEN_SOURCE_IS_INSUFFICIENT" };
  contextPolicy: "C1_TASK_PLUS_SOURCE";
  escalation: EscalationDecision;
  review: ReviewDecision;
  candidateEscalation: EscalationDecision;
  candidateReview: ReviewDecision;
  specialistPolicy: "EXPERIMENTAL_DISABLED_BY_DEFAULT";
  semanticReviewPolicy: "EXPERIMENTAL_DISABLED_BY_DEFAULT";
  signals: HarnessTaskSignals;
}

const CODE_ENFORCED_POLICIES = [
  "WORKTREE_ISOLATION",
  "PATH_ALLOWLIST",
  "PATCH_BUDGET",
  "TRUSTED_COMMAND_REGISTRY",
  "SHELL_FALSE",
  "TIMEOUT_CANCELLATION_OUTPUT_CAP",
  "SECRET_REDACTION",
  "UNTRUSTED_CONTENT_BOUNDARY",
  "ROLLBACK",
  "EXACT_APPROVAL_BINDING",
  "CANONICAL_GITHUB_TARGET"
] as const;

export function shouldEscalateToSpecialist(signals: HarnessTaskSignals): EscalationDecision {
  if (signals.explicitArchitectureAnalysis) {
    return { escalate: true, specialist: "ARCHITECTURE_ANALYSTS", reasons: ["explicit architecture-analysis request"] };
  }
  if (signals.explicitIndependentReview) {
    return { escalate: true, specialist: "SPEC_STANDARDS_REVIEW", reasons: ["independent review explicitly required"] };
  }
  const diagnosisReasons: string[] = [];
  if (signals.failedPatchAttempts > 0) diagnosisReasons.push("a bounded patch attempt failed");
  if (signals.conflictingEvidence) diagnosisReasons.push("evidence conflicts");
  if (signals.confidence < 0.5) diagnosisReasons.push("diagnosis confidence is below 0.5");
  if (signals.mode === "DEBUG" && diagnosisReasons.length >= 2) {
    return { escalate: true, specialist: "DIAGNOSIS_CRITIC", reasons: diagnosisReasons };
  }
  return { escalate: false, specialist: "NONE", reasons: [] };
}

export function shouldRequestSemanticReview(input: ReviewTriggerInput): ReviewDecision {
  const reasons: string[] = [];
  const hasPatchOrFixedPoint = input.modifiedFiles > 0 || input.patchLines > 0 || Boolean(input.explicitIndependentReview) || input.releaseCandidate;
  if (hasPatchOrFixedPoint && input.modifiedFiles >= 3) reasons.push("patch changes at least three files");
  if (hasPatchOrFixedPoint && input.patchLines >= 100) reasons.push("patch changes at least 100 lines");
  if (hasPatchOrFixedPoint && input.securitySensitive) reasons.push("security-sensitive change");
  if (hasPatchOrFixedPoint && input.confidence < 0.6) reasons.push("patch confidence is below 0.6");
  if (hasPatchOrFixedPoint && !input.hiddenTestsAvailable) reasons.push("hidden-test oracle is unavailable");
  if (input.releaseCandidate) reasons.push("release candidate");
  if (input.explicitIndependentReview) reasons.push("independent review explicitly required");
  return { required: reasons.length > 0, reasons };
}

export function buildMinimumHarnessPlan(signals: HarnessTaskSignals): MinimumHarnessPlan {
  const candidateEscalation = shouldEscalateToSpecialist(signals);
  const candidateReview = shouldRequestSemanticReview({
    modifiedFiles: signals.modifiedFiles,
    patchLines: signals.patchLines,
    securitySensitive: signals.securitySensitive ?? false,
    confidence: signals.confidence,
    hiddenTestsAvailable: signals.hiddenTestsAvailable,
    releaseCandidate: signals.releaseCandidate ?? false,
    explicitIndependentReview: signals.explicitIndependentReview
  });
  const escalation = signals.specialistExperimentEnabled
    ? candidateEscalation
    : { escalate: false, specialist: "NONE" as const, reasons: candidateEscalation.reasons.length ? ["candidate trigger suppressed: specialist routing is experimental", ...candidateEscalation.reasons] : [] };
  const review = signals.semanticReviewExperimentEnabled
    ? candidateReview
    : { required: false, reasons: candidateReview.reasons.length ? ["candidate trigger suppressed: semantic review is experimental", ...candidateReview.reasons] : [] };
  const components: HarnessComponent[] = [
    "TASK_CONTRACT",
    "MINIMAL_RETRIEVAL",
    "MINIMAL_CONTEXT",
    "SINGLE_AGENT",
    "DETERMINISTIC_VERIFICATION"
  ];
  if (escalation.escalate) components.push("SPECIALIST_AGENT");
  if (review.required) components.push("SEMANTIC_REVIEW");
  const modelFacingSkills: string[] = [];
  if (signals.mode === "DEBUG" && signals.failedPatchAttempts > 0) modelFacingSkills.push("R18");
  if (escalation.specialist === "ARCHITECTURE_ANALYSTS") modelFacingSkills.push("R11", "R13", "R14");
  if (review.required) modelFacingSkills.push("R22");
  return {
    profile: "E-MIN",
    agentMode: escalation.escalate ? "SPECIALIST" : "SINGLE",
    components,
    modelFacingSkills,
    deterministicSkills: ["R02", "R05", "R06", "R07", "R09", "R21", "R25", "R26", "R28"],
    codeEnforcedPolicies: [...CODE_ENFORCED_POLICIES],
    retrievalPolicy: { primary: "SYMBOL_TOP_2", fallback: "HYBRID_TOP_2", includeTests: "ONLY_WHEN_SOURCE_IS_INSUFFICIENT" },
    contextPolicy: "C1_TASK_PLUS_SOURCE",
    escalation,
    review,
    candidateEscalation,
    candidateReview,
    specialistPolicy: "EXPERIMENTAL_DISABLED_BY_DEFAULT",
    semanticReviewPolicy: "EXPERIMENTAL_DISABLED_BY_DEFAULT",
    signals: { ...signals }
  };
}

function estimateTokens(value: string): number {
  return value.length === 0 ? 0 : Math.max(1, Math.ceil(value.length / 4));
}

export interface InstructionLoadInput {
  instruction: string;
  task: string;
  evidence: string;
  relevantEvidence: string;
  history: string;
}

export interface InstructionLoad {
  instructionTokens: number;
  taskTokens: number;
  evidenceTokens: number;
  relevantEvidenceTokens: number;
  irrelevantEvidenceTokens: number;
  historyTokens: number;
  totalInputTokens: number;
  signalRatio: number;
}

export function classifyInstructionLoad(input: InstructionLoadInput): InstructionLoad {
  const instructionTokens = estimateTokens(input.instruction);
  const taskTokens = estimateTokens(input.task);
  const evidenceTokens = estimateTokens(input.evidence);
  const relevantEvidenceTokens = Math.min(evidenceTokens, estimateTokens(input.relevantEvidence));
  const irrelevantEvidenceTokens = Math.max(0, evidenceTokens - relevantEvidenceTokens);
  const historyTokens = estimateTokens(input.history);
  const totalInputTokens = instructionTokens + taskTokens + evidenceTokens + historyTokens;
  return {
    instructionTokens,
    taskTokens,
    evidenceTokens,
    relevantEvidenceTokens,
    irrelevantEvidenceTokens,
    historyTokens,
    totalInputTokens,
    signalRatio: totalInputTokens === 0 ? 0 : (taskTokens + relevantEvidenceTokens) / totalInputTokens
  };
}
