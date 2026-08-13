import type { AgentEvent } from "../../packages/contracts/src/index";

const trace = (id: string, events: Array<[string, Record<string, unknown>?]>): AgentEvent[] => events.map(([type, payload = {}], sequence) => ({ eventId: `${id}-${sequence}`, runId: `run-${id}`, taskId: `task-${id}`, sequence, timestamp: new Date(sequence * 1000).toISOString(), source: "fixture", type, severity: type.includes("failed") ? "error" : "info", payload: { message: type, ...payload }, privacy: "local_only" }));
const passStage = { id: "targeted", label: "Targeted tests", trustedCommandId: "test", status: "PASS", durationMs: 12 };
const notRunStage = { id: "sandbox", label: "Sandboxed verification", trustedCommandId: "verify", status: "NOT_RUN", summary: "Hard isolation unavailable" };

export const runtimeTraces = {
  successful_analysis: trace("analysis", [["run.created"], ["run.started"], ["contract.created"], ["scope.completed"], ["repo.index.started"], ["evidence.retrieved", { items: [] }], ["agent.started", { role: "Analyst", skill: "R11" }], ["report.started"], ["run.completed"]]),
  successful_patch: trace("patch", [["run.created"], ["patch.planned"], ["patch.applied"], ["verification.started"], ["verification.stage", passStage], ["review.requested"], ["report.started"], ["run.completed"]]),
  failed_patch: trace("failed", [["run.created"], ["patch.applied"], ["verification.started"], ["verification.stage", { ...passStage, status: "FAIL" }], ["run.failed"]]),
  retry: trace("retry", [["run.created"], ["verification.started"], ["verification.stage", { ...passStage, status: "FAIL" }], ["diagnosis.started"], ["evidence.retrieved", { items: [] }], ["patch.planned"]]),
  cancellation: trace("cancel", [["run.created"], ["run.started"], ["run.cancelled"]]),
  timeout: trace("timeout", [["run.created"], ["verification.started"], ["verification.stage", { ...passStage, status: "TIMED_OUT" }], ["run.failed"]]),
  prompt_injection: trace("injection", [["run.created"], ["security.injection_detected", { flags: ["policy_override_attempt"], permissionsGranted: [] }], ["report.started"], ["run.completed"]]),
  approval_request: trace("approval", [["run.created"], ["approval.requested", { id: "approval-1", action: "Push", target: "canonical", artifactHash: "sha256:fixture", scope: "one branch", rollback: "delete branch", expiresAt: "2099-01-01T00:00:00.000Z" }]]),
  rollback: trace("rollback", [["run.created"], ["patch.applied"], ["verification.started"], ["verification.stage", { ...passStage, status: "FAIL" }], ["patch.rolled_back", { exact: true }], ["report.started"], ["run.completed"]]),
  skill_rejection: trace("skill-rejected", [["run.created"], ["skill.rejected", { skillId: "R26", reason: "admission evidence absent" }], ["run.blocked"]]),
  model_offline: trace("offline", [["run.created"], ["model.offline", { status: "NOT_RUN" }], ["run.blocked"]]),
  sandbox_downgrade: trace("sandbox", [["run.created"], ["verification.started"], ["verification.stage", notRunStage], ["run.blocked"]]),
  report_only: trace("report-only", [["run.created"], ["scope.completed", { decision: "REPORT_ONLY" }], ["report.started"], ["run.completed"]])
} as const;
