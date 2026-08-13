import { sha256, stableJson, type RetryFailureEvidence } from "../../bounded-retry-runtime/src/index";

export type RetryTaxonomy = "RECOVERED" | "FAILED_DIFFERENT" | "REPEATED_EDIT" | "CONTRADICTION" | "MALFORMED" | "SAFETY_REJECTED" | "INFRASTRUCTURE_FAILURE";

export function classifyRetryOutcome(input: {
  transport: "PASS" | "TIMEOUT" | "TRANSPORT_FAILURE";
  normalizationClassification: string;
  success: boolean;
  repeated: boolean;
  contradiction: boolean;
  wrongFileAttempt: boolean;
  actualSafetyViolation: boolean;
  rollback: string;
  cleanup: string;
}): RetryTaxonomy {
  if (input.transport !== "PASS") return "INFRASTRUCTURE_FAILURE";
  if (input.wrongFileAttempt || input.actualSafetyViolation || input.rollback !== "PASS" || input.cleanup !== "PASS" || input.normalizationClassification === "UNSAFE_EDIT") return "SAFETY_REJECTED";
  if (["MALFORMED_SCHEMA", "EMPTY_RESPONSE", "OTHER", "TEXTUAL_EXPLANATION_WITHOUT_ACTION"].includes(input.normalizationClassification)) return "MALFORMED";
  if (input.repeated) return "REPEATED_EDIT";
  if (input.contradiction) return "CONTRADICTION";
  return input.success ? "RECOVERED" : "FAILED_DIFFERENT";
}

export function secondFailureStage(input: {
  exactSourceIncluded: boolean;
  transport: string;
  normalizationClassification: string;
  patchApplied: boolean;
  syntax: string;
  visible: string;
  hidden: string;
}): string {
  if (input.transport !== "PASS") return "TOOL_INFRASTRUCTURE";
  if (input.normalizationClassification !== "VALID_EDIT") return "ACTION_VALIDATION";
  if (!input.patchApplied) return "PATCH_CONSTRUCTION";
  if (input.syntax !== "PASS") return "SYNTAX_TYPE";
  if (input.visible !== "PASS") return "VISIBLE_TEST";
  if (input.hidden !== "PASS") return "HIDDEN_TEST";
  return "SUCCESS";
}

export function retryIntentDigest(value: unknown): string { return sha256(stableJson(value)); }

export function isContradiction(first: RetryFailureEvidence, retry: { syntax: string; visible: string; hidden: string }): boolean {
  const map = { SYNTAX_TYPE: retry.syntax, VISIBLE_TEST: retry.visible, HIDDEN_TEST: retry.hidden } as const;
  return first.priorKnownPassStages.some((stage) => map[stage] !== "PASS");
}
