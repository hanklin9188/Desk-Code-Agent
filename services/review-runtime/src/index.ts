import type { VerificationStatus } from "../../../packages/contracts/src/index";

export type ReviewLevel = "BLOCKER" | "MAJOR" | "MINOR" | "SUGGESTION";
export interface ReviewIssue { level: ReviewLevel; message: string; path: string | null; line: number | null; evidenceIds: string[] }
export interface ReviewAxis { axis: "SPEC" | "STANDARDS"; issues: ReviewIssue[]; contextHash: string }
export interface AggregatedReview { decision: "APPROVE" | "CHANGES_REQUESTED" | "NEED_CONTEXT" | "BLOCKED"; spec: ReviewAxis; standards: ReviewAxis; mandatoryVerificationPassed: boolean }

export function aggregateDualAxisReview(input: { verification: VerificationStatus; spec: ReviewAxis; standards: ReviewAxis }): AggregatedReview {
  if (input.spec.axis !== "SPEC" || input.standards.axis !== "STANDARDS") throw new Error("Review axes are mislabeled");
  if (input.spec.contextHash === input.standards.contextHash) throw new Error("Spec and Standards review contexts must remain isolated");
  const mandatoryVerificationPassed = input.verification === "PASS";
  const issues = [...input.spec.issues, ...input.standards.issues];
  const hasBlocker = issues.some((issue) => issue.level === "BLOCKER");
  const hasMajor = issues.some((issue) => issue.level === "MAJOR");
  const missingEvidence = issues.some((issue) => issue.evidenceIds.length === 0);
  const decision = !mandatoryVerificationPassed ? "BLOCKED" : missingEvidence ? "NEED_CONTEXT" : hasBlocker ? "BLOCKED" : hasMajor ? "CHANGES_REQUESTED" : "APPROVE";
  return { decision, spec: input.spec, standards: input.standards, mandatoryVerificationPassed };
}
