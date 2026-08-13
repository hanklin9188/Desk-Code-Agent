import type { AgentEvent, ApprovalRequest, EvidenceRef, RunState, VerificationStage } from "../../contracts/src/index";

export interface RunProjection {
  runId: string;
  taskId: string;
  state: RunState;
  lastSequence: number;
  activeAgent?: string;
  currentSkill?: string;
  currentMessage: string;
  progress: number;
  events: AgentEvent[];
  evidence: EvidenceRef[];
  verification: VerificationStage[];
  approval?: ApprovalRequest;
  privacy: "local_only" | "network_used";
  totalEvents: number;
}

export const initialProjection = (runId = "idle", taskId = "idle"): RunProjection => ({
  runId,
  taskId,
  state: "CREATED",
  lastSequence: -1,
  currentMessage: "Ready to build a run contract",
  progress: 0,
  events: [],
  evidence: [],
  verification: [],
  privacy: "local_only"
  , totalEvents: 0
});

const stateByEvent: Record<string, RunState> = {
  "run.created": "CREATED", "run.started": "INGESTING", "contract.created": "CONTRACTING",
  "scope.completed": "SCOPING", "repo.index.started": "INDEXING", "evidence.retrieved": "RETRIEVING",
  "agent.started": "ANALYZING", "patch.planned": "PLANNING", "patch.applied": "EDITING",
  "verification.started": "VERIFYING", "diagnosis.started": "DIAGNOSING", "review.requested": "REVIEWING",
  "approval.requested": "AWAITING_APPROVAL", "report.started": "REPORTING", "run.completed": "DONE",
  "run.blocked": "BLOCKED", "run.failed": "FAILED", "run.cancelled": "CANCELLED"
};

const progressByState: Record<RunState, number> = {
  CREATED: 0, INGESTING: 5, CONTRACTING: 10, SCOPING: 16, INDEXING: 25, RETRIEVING: 36,
  ANALYZING: 48, PLANNING: 58, EDITING: 66, VERIFYING: 76, DIAGNOSING: 60, REVIEWING: 88,
  AWAITING_APPROVAL: 92, REPORTING: 96, DONE: 100, BLOCKED: 100, FAILED: 100, CANCELLED: 100
};

export function reduceEvent(projection: RunProjection, event: AgentEvent): RunProjection {
  if (event.runId !== projection.runId && projection.runId !== "idle") return projection;
  if (event.sequence <= projection.lastSequence || projection.events.at(-1)?.eventId === event.eventId) return projection;

  const state = stateByEvent[event.type] ?? projection.state;
  const next: RunProjection = {
    ...projection,
    runId: event.runId,
    taskId: event.taskId,
    state,
    lastSequence: event.sequence,
    progress: Math.max(projection.progress, progressByState[state]),
    currentMessage: typeof event.payload.message === "string" ? event.payload.message : humanize(event.type),
    events: [...projection.events, event].slice(-2_000),
    totalEvents: projection.totalEvents + 1
  };

  if (event.type === "agent.started") {
    next.activeAgent = String(event.payload.role ?? event.source);
    next.currentSkill = typeof event.payload.skill === "string" ? event.payload.skill : undefined;
  }
  if (event.type === "evidence.retrieved" && Array.isArray(event.payload.items)) next.evidence = event.payload.items as unknown as EvidenceRef[];
  if (event.type === "verification.stage") {
    const stage = event.payload as unknown as VerificationStage;
    next.verification = [...projection.verification.filter((item) => item.id !== stage.id), stage];
  }
  if (event.type === "approval.requested") next.approval = event.payload as unknown as ApprovalRequest;
  if (event.type === "approval.denied" || event.type === "approval.granted") next.approval = undefined;
  if (event.payload.networkUsed === true) next.privacy = "network_used";
  return next;
}

export function replayEvents(events: AgentEvent[]): RunProjection {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const seed = sorted[0] ? initialProjection(sorted[0].runId, sorted[0].taskId) : initialProjection();
  return sorted.reduce(reduceEvent, seed);
}

export class EventStore {
  readonly #events = new Map<string, AgentEvent[]>();
  readonly #eventIds = new Map<string, Set<string>>();
  readonly #listeners = new Map<string, Set<(event: AgentEvent) => void>>();
  readonly #totals = new Map<string, number>();
  readonly #lastSequences = new Map<string, number>();
  readonly #maxRuns: number;
  readonly #maxEventsPerRun: number;

  constructor(options: { maxRuns?: number; maxEventsPerRun?: number } = {}) {
    this.#maxRuns = options.maxRuns ?? 100;
    // Frozen AgentRuntime derives sequence numbers from retained event count.
    // Keep its default store lossless; bounded UI/soak stores opt in explicitly.
    this.#maxEventsPerRun = options.maxEventsPerRun ?? Number.MAX_SAFE_INTEGER;
    if (this.#maxRuns < 1 || this.#maxEventsPerRun < 1) throw new Error("EventStore bounds must be positive");
  }

  append(event: AgentEvent): number {
    if (!this.#events.has(event.runId) && this.#events.size >= this.#maxRuns) this.#evictOldestRun();
    const events = this.#events.get(event.runId) ?? [];
    const ids = this.#eventIds.get(event.runId) ?? new Set<string>();
    const lastSequence = this.#lastSequences.get(event.runId);
    if (ids.has(event.eventId) || (lastSequence !== undefined && event.sequence <= lastSequence)) return events.length;
    const expected = lastSequence === undefined ? event.sequence : lastSequence + 1;
    if (event.sequence !== expected) throw new Error(`Out-of-order event: expected sequence ${expected}, received ${event.sequence}`);
    events.push(Object.freeze({ ...event }));
    if (events.length > this.#maxEventsPerRun) {
      const removed = events.shift();
      if (removed) ids.delete(removed.eventId);
    }
    this.#events.set(event.runId, events);
    ids.add(event.eventId); this.#eventIds.set(event.runId, ids);
    this.#lastSequences.set(event.runId, event.sequence);
    this.#totals.set(event.runId, (this.#totals.get(event.runId) ?? 0) + 1);
    this.#listeners.get(event.runId)?.forEach((listener) => listener(event));
    return event.sequence;
  }

  list(runId: string, afterSequence = -1): AgentEvent[] {
    return (this.#events.get(runId) ?? []).filter((event) => event.sequence > afterSequence);
  }

  subscribe(runId: string, listener: (event: AgentEvent) => void): () => void {
    const listeners = this.#listeners.get(runId) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(runId, listeners);
    return () => listeners.delete(listener);
  }

  nextSequence(runId: string): number { return (this.#lastSequences.get(runId) ?? -1) + 1; }
  total(runId: string): number { return this.#totals.get(runId) ?? 0; }
  replay(runId: string): RunProjection { const projection = replayEvents(this.list(runId)); return { ...projection, totalEvents: this.total(runId) }; }
  #evictOldestRun(): void {
    const runId = this.#events.keys().next().value as string | undefined;
    if (!runId) return;
    this.#events.delete(runId); this.#eventIds.delete(runId); this.#lastSequences.delete(runId); this.#totals.delete(runId); this.#listeners.delete(runId);
  }
}

export const humanize = (value: string) => value.split(".").map((part) => part.replaceAll("_", " ")).join(" · ");
