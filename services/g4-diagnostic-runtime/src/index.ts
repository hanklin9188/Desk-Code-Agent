import { createHash } from "node:crypto";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export interface EvidenceRetryInput {
  originalTask: string;
  currentRelevantSource: string;
  concreteFailure: string;
  previousPatchSummary: string;
  newlyAcquiredEvidence: string;
  attempt: number;
  maximumAttempts: number;
  seenEvidenceHashes: ReadonlySet<string>;
}

export interface EvidenceRetryDecision {
  retry: boolean;
  reason: "NEW_EVIDENCE_WITHIN_BUDGET" | "ATTEMPT_BUDGET_EXHAUSTED" | "NO_CONCRETE_FAILURE" | "NO_NEW_EVIDENCE";
  evidenceHash: string | null;
  prompt: string | null;
}

export function buildEvidenceRetry(input: EvidenceRetryInput): EvidenceRetryDecision {
  if (input.attempt >= input.maximumAttempts) return { retry: false, reason: "ATTEMPT_BUDGET_EXHAUSTED", evidenceHash: null, prompt: null };
  if (!input.concreteFailure.trim()) return { retry: false, reason: "NO_CONCRETE_FAILURE", evidenceHash: null, prompt: null };
  const evidenceHash = sha256(input.newlyAcquiredEvidence.trim());
  if (!input.newlyAcquiredEvidence.trim() || input.seenEvidenceHashes.has(evidenceHash)) return { retry: false, reason: "NO_NEW_EVIDENCE", evidenceHash, prompt: null };
  const prompt = [
    "ORIGINAL TASK", input.originalTask,
    "CURRENT RELEVANT SOURCE", input.currentRelevantSource,
    "CONCRETE TEST OR TOOL FAILURE", input.concreteFailure,
    "PREVIOUS PATCH SUMMARY", input.previousPatchSummary,
    "NEWLY ACQUIRED EVIDENCE", input.newlyAcquiredEvidence,
    "Return a corrected minimal patch. Do not repeat the prior patch. No conversation history is available."
  ].join("\n\n");
  return { retry: true, reason: "NEW_EVIDENCE_WITHIN_BUDGET", evidenceHash, prompt };
}

export function normalizeEvidencePath(value: string): string {
  return value.trim().replace(/^\[/, "").replace(/\]$/, "").replace(/#L\d+(?:-L?\d+)?$/, "").replace(/:\d+(?:-\d+)?$/, "");
}

export function extractPatchTargets(diff: string): string[] {
  return [...new Set(diff.split(/\r?\n/).filter((line) => line.startsWith("+++ ") && !line.endsWith("/dev/null")).map((line) => line.slice(4).split("\t")[0].replace(/^b\//, "")))];
}

export function patchSummary(diff: string): string {
  const targets = extractPatchTargets(diff);
  const changedLines = diff.split(/\r?\n/).filter((line) => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line)).length;
  return `sha256=${sha256(diff)}; targets=${targets.join(",") || "none"}; changedLines=${changedLines}`;
}

const stopWords = new Set(["the", "and", "for", "from", "with", "that", "this", "only", "into", "instead", "while", "when", "each", "input", "value", "values", "implementation", "return", "returns"]);
export function keywordCoverage(expected: string, actual: string): number {
  const tokens = [...new Set(expected.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !stopWords.has(token)))];
  if (!tokens.length) return 1;
  const haystack = actual.toLowerCase();
  return tokens.filter((token) => haystack.includes(token)).length / tokens.length;
}

export type CapabilityRoute = "SUPPORTED" | "ASSISTED" | "EXPERIMENTAL" | "REPORT_ONLY";
export interface CapabilityRouteInput {
  mutation: boolean;
  repositorySupported: boolean;
  evidenceComplete: boolean;
  behavioralOracleAvailable: boolean;
  hiddenOracleAvailable: boolean;
  fileScope: number;
  difficulty: "L1" | "L2" | "L3" | "L4";
  taskClassBehavioralSuccess: number;
}

export function routeCapability(input: CapabilityRouteInput): CapabilityRoute {
  if (!input.repositorySupported || !input.evidenceComplete) return "REPORT_ONLY";
  if (!input.mutation) {
    if (input.taskClassBehavioralSuccess >= 0.8) return "SUPPORTED";
    if (input.taskClassBehavioralSuccess >= 0.5) return "ASSISTED";
    return "REPORT_ONLY";
  }
  if (!input.behavioralOracleAvailable || !input.hiddenOracleAvailable || input.fileScope !== 1 || input.difficulty === "L4") return "REPORT_ONLY";
  if (input.taskClassBehavioralSuccess >= 0.5) return "EXPERIMENTAL";
  if (input.taskClassBehavioralSuccess >= 0.25) return "ASSISTED";
  return "REPORT_ONLY";
}
