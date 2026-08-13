import { assertTaskContract, RUN_STATES, type AgentEvent, type FeasibilityDecision, type RunState, type ScopeEstimate, type TaskContract, type TaskMode } from "../../../packages/contracts/src/index";
import { EventStore } from "../../../packages/event-protocol/src/index";

export interface RouteDecision { mode: TaskMode; risk: "L1" | "L2" | "L3"; mutationAllowed: boolean }

export function routeTask(goal: string): RouteDecision {
  const value = goal.toLowerCase();
  const asksMutation = /fix|implement|add|change|refactor|修改|修|實作|新增/.test(value);
  const asksAnalysis = /analy|review|explain|overview|分析|檢查|解釋/.test(value);
  const mode: TaskMode = asksMutation && asksAnalysis ? "MIXED" : asksMutation ? "CODE" : asksAnalysis ? "ANALYZE" : "EXPLORE";
  const broad = /complete|entire|all|migration|完整|全部|整個/.test(value);
  return { mode, risk: broad ? "L3" : asksMutation ? "L2" : "L1", mutationAllowed: asksMutation };
}

export function evaluateFeasibility(scope: ScopeEstimate): FeasibilityDecision {
  if (scope.securityRisk) return "BLOCKED_BY_SECURITY_POLICY";
  if (!scope.hasOracle && scope.modifiedFiles > 0) return "BLOCKED_BY_MISSING_ORACLE";
  if (scope.relevantFiles > 12 || scope.modifiedFiles > 8 || scope.patchLines > 800) return "TASK_TOO_LARGE";
  if (scope.modifiedFiles > 5 || scope.patchLines > 400) return "EXECUTE_IN_WORKTREE_AND_REQUEST_APPROVAL";
  if (scope.modifiedFiles === 0) return "REPORT_ONLY";
  return "AUTO_EXECUTE";
}

type Subscriber = (event: AgentEvent) => void;

export class AgentRuntime {
  readonly #store: EventStore;
  readonly #controllers = new Map<string, AbortController>();
  readonly #contracts = new Map<string, TaskContract>();
  readonly #states = new Map<string, RunState>();

  constructor(store = new EventStore()) { this.#store = store; }

  startRun(rawContract: TaskContract): { runId: string; cancel: () => void } {
    const contract = assertTaskContract(rawContract);
    const runId = `run_${contract.taskId}_${Date.now().toString(36)}`;
    const controller = new AbortController();
    this.#contracts.set(runId, contract);
    this.#states.set(runId, "CREATED");
    this.#controllers.set(runId, controller);
    this.emit(runId, "runtime", "run.created", { message: "Run contract created" });
    return { runId, cancel: () => this.cancelRun(runId) };
  }

  emit(runId: string, source: string, type: string, payload: Record<string, unknown> = {}, severity: AgentEvent["severity"] = "info"): AgentEvent {
    const contract = this.#contracts.get(runId);
    if (!contract) throw new Error(`Unknown run: ${runId}`);
    const sequence = this.#store.list(runId).length;
    const event: AgentEvent = {
      eventId: `${runId}_evt_${sequence}`, runId, taskId: contract.taskId, sequence,
      timestamp: new Date().toISOString(), source, type, severity, payload, privacy: "local_only"
    };
    this.#store.append(event);
    return event;
  }

  subscribeEvents(runId: string, subscriber: Subscriber): () => void { return this.#store.subscribe(runId, subscriber); }
  events(runId: string): AgentEvent[] { return this.#store.list(runId); }
  projection(runId: string) { return this.#store.replay(runId); }
  state(runId: string): RunState {
    const state = this.#states.get(runId); if (!state) throw new Error(`Unknown run: ${runId}`); return state;
  }

  transition(runId: string, next: RunState): RunState {
    if (!RUN_STATES.includes(next)) throw new Error(`Unknown run state: ${String(next)}`);
    const current = this.state(runId);
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) throw new Error(`Forbidden run transition: ${current} → ${next}`);
    this.#states.set(runId, next);
    this.emit(runId, "runtime", "run.state_changed", { from: current, to: next, message: `${current} → ${next}` });
    return next;
  }

  cancelRun(runId: string): { acknowledged: boolean; state: "CANCELLED" } {
    const controller = this.#controllers.get(runId);
    if (!controller) return { acknowledged: false, state: "CANCELLED" };
    this.emit(runId, "runtime", "run.cancel_requested", { message: "Cancellation requested" }, "warning");
    controller.abort();
    this.emit(runId, "runtime", "run.cancelled", { message: "Run cancelled; partial evidence retained" }, "warning");
    this.#states.set(runId, "CANCELLED");
    this.#controllers.delete(runId);
    return { acknowledged: true, state: "CANCELLED" };
  }

  submitApproval(runId: string, artifactHash: string, expectedHash: string, expiresAt: string): boolean {
    const valid = artifactHash === expectedHash && Date.parse(expiresAt) > Date.now();
    this.emit(runId, "approval", valid ? "approval.granted" : "approval.denied", { artifactHash, message: valid ? "Exact scoped approval granted" : "Approval rejected: stale or mismatched artifact" }, valid ? "info" : "warning");
    return valid;
  }
}

const ALLOWED_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  CREATED: ["INGESTING", "CANCELLED"], INGESTING: ["CONTRACTING", "CANCELLED", "FAILED"],
  CONTRACTING: ["SCOPING", "BLOCKED", "CANCELLED"], SCOPING: ["INDEXING", "BLOCKED", "CANCELLED"],
  INDEXING: ["RETRIEVING", "FAILED", "CANCELLED"], RETRIEVING: ["ANALYZING", "FAILED", "CANCELLED"],
  ANALYZING: ["PLANNING", "REPORTING", "FAILED", "CANCELLED"], PLANNING: ["EDITING", "REPORTING", "BLOCKED", "CANCELLED"],
  EDITING: ["VERIFYING", "FAILED", "CANCELLED"], VERIFYING: ["REVIEWING", "DIAGNOSING", "FAILED", "CANCELLED"],
  DIAGNOSING: ["RETRIEVING", "FAILED", "CANCELLED"], REVIEWING: ["EDITING", "AWAITING_APPROVAL", "REPORTING", "FAILED", "CANCELLED"],
  AWAITING_APPROVAL: ["REPORTING", "BLOCKED", "CANCELLED"], REPORTING: ["DONE", "FAILED", "CANCELLED"],
  DONE: [], BLOCKED: ["REPORTING", "CANCELLED"], FAILED: ["REPORTING"], CANCELLED: []
};
