// @vitest-environment node
import { describe, expect, it } from "vitest";
import path from "node:path";
import { SkillEvaluationRunner, SkillRegistry, type L1Fixture } from "../services/skill-runtime/src/index";

const minimumL1Fixtures = (): L1Fixture[] => [
  ...Array.from({ length: 5 }, (_, index) => ({ id: `normal-${index}`, category: "normal" as const, input: null })),
  ...Array.from({ length: 3 }, (_, index) => ({ id: `boundary-${index}`, category: "boundary" as const, input: null })),
  ...Array.from({ length: 3 }, (_, index) => ({ id: `failure-${index}`, category: "failure" as const, input: null })),
  ...Array.from({ length: 3 }, (_, index) => ({ id: `adversarial-${index}`, category: "adversarial" as const, input: null })),
  { id: "control-0", category: "cancellation_timeout", input: null },
  { id: "stale-0", category: "stale_artifact", input: null }
];

describe("bounded Skill registry", () => {
  it("loads and L0-validates all 39 canonical Skills", async () => {
    const registry = await SkillRegistry.load(path.resolve(process.cwd(), "skills"), path.resolve(process.cwd(), "schemas/skill_definition.schema.json"));
    expect(registry.list()).toHaveLength(39);
    expect(registry.validation().every((record) => record.valid)).toBe(true);
    expect(registry.list().filter((skill) => skill.metadata.status === "production").map((skill) => skill.metadata.skill_id)).toEqual(["R09"]);
    expect(registry.admissions()).toHaveLength(9);
    expect(registry.admissions().filter((record) => record.decision === "PRODUCTION").map((record) => record.skill_id)).toEqual(["R09"]);
    expect(registry.productionEnabled().map((skill) => skill.metadata.skill_id)).toEqual(["R09"]);
  });

  it("enforces role allowlists, state edges and invocation budgets", async () => {
    const registry = await SkillRegistry.load(path.resolve(process.cwd(), "skills"), path.resolve(process.cwd(), "schemas/skill_definition.schema.json"));
    expect(registry.canInvoke("R20", { role: "coder", allowedSkillIds: ["R20"], previousSkillId: "R19", llmCallsUsed: 0, contextTokens: 2_000 }).allowed).toBe(true);
    expect(registry.canInvoke("R20", { role: "reviewer", allowedSkillIds: ["R22"], previousSkillId: "R19", llmCallsUsed: 0, contextTokens: 2_000 }).allowed).toBe(false);
    expect(registry.canInvoke("R20", { role: "coder", allowedSkillIds: ["R20"], previousSkillId: "R10", llmCallsUsed: 0, contextTokens: 2_000 }).reason).toMatch(/workflow edge/);
    expect(registry.canInvoke("R20", { role: "coder", allowedSkillIds: ["R20"], previousSkillId: "R19", llmCallsUsed: 3, contextTokens: 2_000 }).reason).toMatch(/LLM call budget/);
  });

  it("runs the complete L1 fixture matrix without promoting the Skill", async () => {
    const registry = await SkillRegistry.load(path.resolve(process.cwd(), "skills"), path.resolve(process.cwd(), "schemas/skill_definition.schema.json"));
    const report = await new SkillEvaluationRunner(registry).runL1("R21", minimumL1Fixtures(), async () => ({ passed: true, schemaValid: true, safetyViolations: 0, repeatable: true }));
    expect(report).toMatchObject({ status: "PASS", total: 16, passed: 16, schemaValidity: 1, safetyViolations: 0, repeatability: 1 });
    expect(registry.get("R21")?.metadata.status).toBe("design");
    expect(registry.productionEnabled(new Set(["R21"])).map((skill) => skill.metadata.skill_id)).toEqual(["R09"]);
  });

  it("holds incomplete, unsafe, timed-out, and invalid-schema L1 evidence", async () => {
    const registry = await SkillRegistry.load(path.resolve(process.cwd(), "skills"), path.resolve(process.cwd(), "schemas/skill_definition.schema.json"));
    const runner = new SkillEvaluationRunner(registry);
    expect((await runner.runL1("R21", minimumL1Fixtures().slice(0, 5), async () => ({ passed: true, schemaValid: true, safetyViolations: 0, repeatable: true }))).status).toBe("HOLD");
    const fixtures = minimumL1Fixtures().map((fixture) => fixture.id === "adversarial-0" ? { ...fixture, timeoutMs: 5 } : fixture);
    const report = await runner.runL1("R21", fixtures, async (fixture) => fixture.id === "adversarial-0"
      ? new Promise(() => undefined)
      : ({ passed: true, schemaValid: fixture.id !== "stale-0", safetyViolations: fixture.id === "adversarial-1" ? 1 : 0, repeatable: true }));
    expect(report.status).toBe("HOLD");
    expect(report.results.find((result) => result.id === "adversarial-0")?.timedOut).toBe(true);
    expect(report.reasons.join(" ")).toMatch(/Schema validity|Safety violations|fixture/);
  });

  it("validates L2 workflow edges and budgets deterministically", async () => {
    const registry = await SkillRegistry.load(path.resolve(process.cwd(), "skills"), path.resolve(process.cwd(), "schemas/skill_definition.schema.json"));
    const runner = new SkillEvaluationRunner(registry);
    const context = { role: "coder", allowedSkillIds: ["R19", "R20", "R21", "R22"], llmCallsUsed: 0, contextTokens: 100 };
    expect(runner.runL2([{ skillId: "R19", ...context }, { skillId: "R20", ...context }, { skillId: "R21", ...context }, { skillId: "R22", ...context }]).status).toBe("PASS");
    const held = runner.runL2([{ skillId: "R19", ...context }, { skillId: "R24", ...context }]);
    expect(held.status).toBe("HOLD");
    expect(held.reasons[0]).toMatch(/R24/);
  });
});
