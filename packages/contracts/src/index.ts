export const RUN_STATES = [
  "CREATED", "INGESTING", "CONTRACTING", "SCOPING", "INDEXING", "RETRIEVING",
  "ANALYZING", "PLANNING", "EDITING", "VERIFYING", "DIAGNOSING", "REVIEWING",
  "AWAITING_APPROVAL", "REPORTING", "DONE", "BLOCKED", "FAILED", "CANCELLED"
] as const;

export type RunState = (typeof RUN_STATES)[number];
export type TaskMode = "EXPLORE" | "ANALYZE" | "DEBUG" | "CODE" | "TEST" | "REVIEW" | "REFACTOR" | "DOCUMENT" | "ONBOARD" | "MIXED";
export type RiskLevel = "L1" | "L2" | "L3";
export type FeasibilityDecision = "AUTO_EXECUTE" | "EXECUTE_IN_WORKTREE_AND_REQUEST_APPROVAL" | "REPORT_ONLY" | "TASK_TOO_LARGE" | "BLOCKED_BY_MISSING_ORACLE" | "BLOCKED_BY_SECURITY_POLICY";
export type VerificationStatus = "QUEUED" | "RUNNING" | "PASS" | "FAIL" | "NOT_RUN" | "CANCELLED" | "TIMED_OUT";

export interface TaskContract {
  taskId: string;
  repoRef: string;
  goal: string;
  modes: TaskMode[];
  successCriteria: string[];
  constraints: string[];
  nonGoals: string[];
  approvalRequired: string[];
  scopeUncertainties: string[];
  contractHash: string;
}

export interface ScopeEstimate {
  relevantFiles: number;
  modifiedFiles: number;
  patchLines: number;
  hasOracle: boolean;
  securityRisk?: boolean;
}

export interface AgentEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  runId: string;
  taskId: string;
  sequence: number;
  timestamp: string;
  source: string;
  type: string;
  severity: "debug" | "info" | "warning" | "error" | "critical";
  payload: T;
  privacy: "local_only" | "redacted_exportable" | "public_safe";
}

export interface VerificationStage {
  id: string;
  label: string;
  trustedCommandId: string;
  status: VerificationStatus;
  durationMs?: number;
  summary?: string;
}

export interface EvidenceRef {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  hash: string;
  confidence: number;
  excerpt?: string;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  target: string;
  artifactHash: string;
  scope: string;
  rollback: string;
  expiresAt: string;
}

export const isTerminalState = (state: RunState) => ["DONE", "BLOCKED", "FAILED", "CANCELLED"].includes(state);

export function assertTaskContract(contract: TaskContract): TaskContract {
  if (!contract.taskId || !contract.repoRef || !contract.goal || contract.modes.length === 0 || contract.successCriteria.length === 0 || !contract.contractHash) {
    throw new Error("Invalid Task Contract: required fields are missing");
  }
  return Object.freeze({ ...contract, modes: [...contract.modes], successCriteria: [...contract.successCriteria] });
}
