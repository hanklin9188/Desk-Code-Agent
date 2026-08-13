import { describe, expect, it } from "vitest";
import { AgentRuntime, evaluateFeasibility, routeTask } from "../services/agent-runtime/src/index";
import type { TaskContract } from "../packages/contracts/src/index";

const contract: TaskContract = {
  taskId: "task_1", repoRef: "/workspace", goal: "fix parser", modes: ["CODE"], successCriteria: ["tests pass"],
  constraints: ["local only"], nonGoals: [], approvalRequired: [], scopeUncertainties: [], contractHash: "sha256:test"
};

describe("agent runtime", () => {
  it("routes mutation and mixed tasks deterministically", () => {
    expect(routeTask("fix the parser")).toMatchObject({ mode: "CODE", mutationAllowed: true });
    expect(routeTask("analyze and safely fix this repo")).toMatchObject({ mode: "MIXED", mutationAllowed: true });
    expect(routeTask("explain the router")).toMatchObject({ mode: "ANALYZE", mutationAllowed: false });
  });

  it("raises safety, oracle and budget gates before mutation", () => {
    expect(evaluateFeasibility({ relevantFiles: 2, modifiedFiles: 1, patchLines: 20, hasOracle: true, securityRisk: true })).toBe("BLOCKED_BY_SECURITY_POLICY");
    expect(evaluateFeasibility({ relevantFiles: 2, modifiedFiles: 1, patchLines: 20, hasOracle: false })).toBe("BLOCKED_BY_MISSING_ORACLE");
    expect(evaluateFeasibility({ relevantFiles: 13, modifiedFiles: 2, patchLines: 20, hasOracle: true })).toBe("TASK_TOO_LARGE");
    expect(evaluateFeasibility({ relevantFiles: 2, modifiedFiles: 0, patchLines: 0, hasOracle: true })).toBe("REPORT_ONLY");
  });

  it("acknowledges cancellation and retains a consistent final trace", () => {
    const runtime = new AgentRuntime();
    const { runId } = runtime.startRun(contract);
    expect(runtime.cancelRun(runId)).toEqual({ acknowledged: true, state: "CANCELLED" });
    expect(runtime.projection(runId).state).toBe("CANCELLED");
    expect(runtime.events(runId).map((event) => event.type)).toEqual(["run.created", "run.cancel_requested", "run.cancelled"]);
  });

  it("invalidates stale or mismatched approvals", () => {
    const runtime = new AgentRuntime();
    const { runId } = runtime.startRun(contract);
    expect(runtime.submitApproval(runId, "hash-new", "hash-old", new Date(Date.now() + 5000).toISOString())).toBe(false);
    expect(runtime.submitApproval(runId, "hash", "hash", new Date(Date.now() - 5000).toISOString())).toBe(false);
    expect(runtime.submitApproval(runId, "hash", "hash", new Date(Date.now() + 5000).toISOString())).toBe(true);
  });

  it("enforces registered state edges and rejects model-invented transitions", () => {
    const runtime = new AgentRuntime();
    const { runId } = runtime.startRun(contract);
    expect(runtime.state(runId)).toBe("CREATED");
    expect(runtime.transition(runId, "INGESTING")).toBe("INGESTING");
    expect(() => runtime.transition(runId, "DONE")).toThrow(/Forbidden run transition/);
    expect(() => runtime.transition(runId, "PUSH_GITHUB" as never)).toThrow(/Unknown run state/);
  });
});
