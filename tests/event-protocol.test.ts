import { describe, expect, it, vi } from "vitest";
import { EventStore, initialProjection, reduceEvent, replayEvents } from "../packages/event-protocol/src/index";
import type { AgentEvent } from "../packages/contracts/src/index";
import { runtimeTraces } from "./fixtures/runtime-traces";

const event = (sequence: number, type: string, id = `evt_${sequence}`): AgentEvent => ({
  eventId: id, runId: "run_1", taskId: "task_1", sequence, timestamp: new Date(sequence * 1000).toISOString(),
  source: "runtime", type, severity: "info", payload: {}, privacy: "local_only"
});

describe("event protocol", () => {
  it("replays a typed trace to the same final state", () => {
    const events = [event(0, "run.created"), event(1, "run.started"), event(2, "repo.index.started"), event(3, "run.completed")];
    const incremental = events.reduce(reduceEvent, initialProjection("run_1", "task_1"));
    expect(replayEvents([...events].reverse())).toEqual(incremental);
    expect(incremental.state).toBe("DONE");
  });

  it("ignores duplicate at-least-once delivery", () => {
    const first = reduceEvent(initialProjection("run_1", "task_1"), event(0, "run.created"));
    expect(reduceEvent(first, event(0, "run.created")).events).toHaveLength(1);
    expect(reduceEvent(first, event(1, "run.started", "evt_0")).events).toHaveLength(1);
  });

  it("rejects an out-of-order append and publishes valid events", () => {
    const store = new EventStore();
    const listener = vi.fn();
    store.subscribe("run_1", listener);
    store.append(event(0, "run.created"));
    expect(() => store.append(event(2, "run.started"))).toThrow(/expected sequence 1/);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("replays all product truth fixtures without upgrading failed or NOT_RUN verification", () => {
    const projections = Object.fromEntries(Object.entries(runtimeTraces).map(([name, events]) => [name, replayEvents([...events])]));
    expect(projections.successful_analysis.state).toBe("DONE"); expect(projections.successful_patch.verification[0].status).toBe("PASS");
    expect(projections.failed_patch.state).toBe("FAILED"); expect(projections.retry.state).toBe("PLANNING"); expect(projections.cancellation.state).toBe("CANCELLED"); expect(projections.timeout.verification[0].status).toBe("TIMED_OUT");
    expect(projections.approval_request.state).toBe("AWAITING_APPROVAL"); expect(projections.skill_rejection.state).toBe("BLOCKED"); expect(projections.model_offline.state).toBe("BLOCKED"); expect(projections.sandbox_downgrade.verification[0].status).toBe("NOT_RUN"); expect(projections.report_only.state).toBe("DONE");
    expect(projections.prompt_injection.events.some((item) => item.type === "security.injection_detected")).toBe(true); expect(projections.rollback.events.some((item) => item.type === "patch.rolled_back")).toBe(true);
  });
  it("bounds the UI event window while preserving truth for a 100k-event replay", () => {
    const started = performance.now(); const events = Array.from({ length: 100_000 }, (_, sequence) => event(sequence, sequence === 99_999 ? "run.completed" : "tool.output")); const projection = replayEvents(events); const durationMs = performance.now() - started;
    expect(projection.totalEvents).toBe(100_000); expect(projection.events).toHaveLength(2_000); expect(projection.state).toBe("DONE"); expect(durationMs).toBeLessThan(5_000);
  });
  it("bounds retained EventStore history while preserving monotonic sequence and total truth", () => {
    const store = new EventStore({ maxRuns: 2, maxEventsPerRun: 2_000 });
    for (let sequence = 0; sequence < 2_500; sequence += 1) store.append(event(sequence, sequence === 2_499 ? "run.completed" : "tool.output"));
    expect(store.list("run_1")).toHaveLength(2_000);
    expect(store.total("run_1")).toBe(2_500);
    expect(store.nextSequence("run_1")).toBe(2_500);
    expect(store.replay("run_1")).toMatchObject({ state: "DONE", totalEvents: 2_500, lastSequence: 2_499 });
  });
});
