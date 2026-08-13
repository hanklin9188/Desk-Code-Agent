import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";

export interface SkillMetadata {
  skill_id: string; name: string; display_name: string; version: string; category: "development" | "runtime";
  kind: "development-skill" | "runtime-skill"; invocation: "user" | "model" | "runtime"; owner: string;
  risk: "low" | "medium" | "high" | "critical"; status: "design" | "experimental" | "candidate" | "production" | "disabled" | "deprecated";
  max_llm_calls: number; max_context_tokens: number; schema_version: number;
}
export interface SkillDefinition { metadata: SkillMetadata; body: string; file: string; allowedTools: string[]; statePath: string[]; completionCriteria: string[] }
export interface ValidationRecord { skillId: string; valid: boolean; errors: string[]; checks: Record<string, boolean> }
export interface InvocationContext { role: string; allowedSkillIds: string[]; previousSkillId?: string; llmCallsUsed: number; contextTokens: number }
export interface InvocationDecision { allowed: boolean; reason: string }
export interface SkillAdmissionRecord { skill_id: string; decision: "EXPERIMENTAL" | "CANDIDATE" | "PRODUCTION" | "DISABLED" | "DEPRECATED"; l1_fixtures: number; l2_runs: number; l3_independent_runs: number; reason: string }
export type L1FixtureCategory = "normal" | "boundary" | "failure" | "adversarial" | "cancellation_timeout" | "stale_artifact";
export interface L1Fixture<T = unknown> { id: string; category: L1FixtureCategory; input: T; timeoutMs?: number }
export interface L1FixtureOutcome { passed: boolean; schemaValid: boolean; safetyViolations: number; repeatable: boolean; reason?: string }
export interface L1FixtureResult extends L1FixtureOutcome { id: string; category: L1FixtureCategory; timedOut: boolean; durationMs: number }
export interface L1EvaluationReport {
  skillId: string; status: "PASS" | "HOLD"; total: number; passed: number; schemaValidity: number;
  safetyViolations: number; repeatability: number; categoryCounts: Record<L1FixtureCategory, number>;
  results: L1FixtureResult[]; reasons: string[];
}
export interface WorkflowInvocation { skillId: string; role: string; allowedSkillIds: string[]; llmCallsUsed: number; contextTokens: number }
export interface L2WorkflowReport { status: "PASS" | "HOLD"; steps: Array<{ skillId: string; allowed: boolean; reason: string }>; reasons: string[] }

interface WorkflowConfig { hard_edges?: Record<string, string[]>; forbidden_edges?: Array<[string, string]> }

export class SkillRegistry {
  readonly #skills: Map<string, SkillDefinition>;
  readonly #validation: ValidationRecord[];
  readonly #hardEdges: Record<string, string[]>;
  readonly #forbiddenEdges: Set<string>;
  readonly #admissions: Map<string, SkillAdmissionRecord>;
  private constructor(skills: SkillDefinition[], validation: ValidationRecord[], workflow: WorkflowConfig, admissions: SkillAdmissionRecord[]) {
    this.#skills = new Map(skills.map((skill) => [skill.metadata.skill_id, Object.freeze(skill)]));
    this.#validation = validation;
    this.#hardEdges = workflow.hard_edges ?? {};
    this.#forbiddenEdges = new Set((workflow.forbidden_edges ?? []).map(([from, to]) => `${from}->${to}`));
    this.#admissions = new Map(admissions.map((record) => [record.skill_id, Object.freeze({ ...record })]));
  }

  static async load(skillsRoot: string, schemaPath: string): Promise<SkillRegistry> {
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
    const validateMetadata = ajv.compile(schema);
    const skillFiles = await discoverSkillFiles(skillsRoot);
    const skills: SkillDefinition[] = []; const validation: ValidationRecord[] = [];
    for (const file of skillFiles) {
      const raw = await readFile(file, "utf8");
      const parsed = parseSkill(raw, file); skills.push(parsed);
      const schemaValid = validateMetadata(parsed.metadata);
      const checks = {
        metadata_schema: Boolean(schemaValid), boundedness: /## 2\. Boundedness contract/.test(parsed.body),
        trigger: /## 3\. Trigger/.test(parsed.body) && /### Do not activate when/.test(parsed.body),
        input_output: /## 4\. Input contract/.test(parsed.body) && /## 5\. Output contract/.test(parsed.body),
        tool_allowlist: /## 6\. Allowed tools/.test(parsed.body), state_constraints: /## 7\. State transitions/.test(parsed.body),
        completion: parsed.completionCriteria.length > 0, failure: /## 12\. Failure and recovery/.test(parsed.body),
        observability: /## 13\. Observability events/.test(parsed.body), security: /## 11\. Guardrails/.test(parsed.body),
        validation_suite: /## 14\. Validation suite/.test(parsed.body)
      };
      const errors = [
        ...(schemaValid ? [] : (validateMetadata.errors ?? []).map((error) => `${error.instancePath} ${error.message}`)),
        ...Object.entries(checks).filter(([, passed]) => !passed).map(([check]) => `missing or invalid ${check}`)
      ];
      validation.push({ skillId: parsed.metadata.skill_id, valid: errors.length === 0, errors, checks });
    }
    const workflowPath = path.resolve(skillsRoot, "../config/workflow_registry.example.yaml");
    const workflow = parseYaml(await readFile(workflowPath, "utf8")) as WorkflowConfig;
    const admissionPath = path.resolve(skillsRoot, "validation/admission_registry.json");
    const admissionDocument = await readFile(admissionPath, "utf8").then((value) => JSON.parse(value) as { records?: SkillAdmissionRecord[] }).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return { records: [] }; throw error; });
    const admissions = admissionDocument.records ?? [];
    if (new Set(admissions.map((record) => record.skill_id)).size !== admissions.length) throw new Error("Skill admission records must have unique Skill IDs");
    if (admissions.some((record) => !skills.some((skill) => skill.metadata.skill_id === record.skill_id))) throw new Error("Skill admission registry references an unknown Skill");
    return new SkillRegistry(skills, validation, workflow, admissions);
  }

  list(): SkillDefinition[] { return [...this.#skills.values()]; }
  get(skillId: string): SkillDefinition | undefined { return this.#skills.get(skillId); }
  validation(): ValidationRecord[] { return this.#validation.map((record) => ({ ...record, errors: [...record.errors], checks: { ...record.checks } })); }
  admission(skillId: string): SkillAdmissionRecord | undefined { const record = this.#admissions.get(skillId); return record ? { ...record } : undefined; }
  admissions(): SkillAdmissionRecord[] { return [...this.#admissions.values()].map((record) => ({ ...record })); }
  productionEnabled(featureFlags: ReadonlySet<string> = new Set()): SkillDefinition[] {
    return this.list().filter((skill) => this.#admissions.get(skill.metadata.skill_id)?.decision === "PRODUCTION" && (skill.metadata.status === "production" || (skill.metadata.status === "candidate" && featureFlags.has(skill.metadata.skill_id))));
  }
  canInvoke(skillId: string, context: InvocationContext): InvocationDecision {
    const skill = this.#skills.get(skillId);
    if (!skill) return { allowed: false, reason: "Skill is not registered" };
    const validation = this.#validation.find((record) => record.skillId === skillId);
    if (!validation?.valid) return { allowed: false, reason: "Skill failed L0 validation" };
    if (skill.metadata.status === "disabled" || skill.metadata.status === "deprecated") return { allowed: false, reason: `Skill status is ${skill.metadata.status}` };
    if (!context.allowedSkillIds.includes(skillId)) return { allowed: false, reason: `Role ${context.role} does not allow Skill ${skillId}` };
    if (context.llmCallsUsed >= skill.metadata.max_llm_calls && skill.metadata.max_llm_calls > 0) return { allowed: false, reason: "LLM call budget exhausted" };
    if (context.contextTokens > skill.metadata.max_context_tokens && skill.metadata.max_context_tokens > 0) return { allowed: false, reason: "Context token budget exceeded" };
    if (context.previousSkillId) {
      const edge = `${context.previousSkillId}->${skillId}`;
      if (this.#forbiddenEdges.has(edge)) return { allowed: false, reason: `Forbidden workflow edge ${edge}` };
      const declaredNext = this.#hardEdges[context.previousSkillId];
      if (declaredNext && !declaredNext.includes(skillId)) return { allowed: false, reason: `Unregistered workflow edge ${edge}` };
    }
    return { allowed: true, reason: "Skill contract, role, edge and budgets accepted" };
  }
}

const REQUIRED_L1_COUNTS: Record<L1FixtureCategory, number> = {
  normal: 5, boundary: 3, failure: 3, adversarial: 3, cancellation_timeout: 1, stale_artifact: 1
};

export class SkillEvaluationRunner {
  readonly #registry: SkillRegistry;
  constructor(registry: SkillRegistry) { this.#registry = registry; }

  async runL1<T>(skillId: string, fixtures: L1Fixture<T>[], execute: (fixture: L1Fixture<T>, signal: AbortSignal) => Promise<L1FixtureOutcome>): Promise<L1EvaluationReport> {
    if (!this.#registry.get(skillId)) throw new Error(`Skill is not registered: ${skillId}`);
    if (new Set(fixtures.map((fixture) => fixture.id)).size !== fixtures.length) throw new Error("L1 fixture IDs must be unique");
    const categoryCounts = Object.fromEntries(Object.keys(REQUIRED_L1_COUNTS).map((category) => [category, 0])) as Record<L1FixtureCategory, number>;
    for (const fixture of fixtures) categoryCounts[fixture.category] += 1;
    const reasons = Object.entries(REQUIRED_L1_COUNTS)
      .filter(([category, minimum]) => categoryCounts[category as L1FixtureCategory] < minimum)
      .map(([category, minimum]) => `${category} requires at least ${minimum} fixtures`);
    if (reasons.length) return { skillId, status: "HOLD", total: fixtures.length, passed: 0, schemaValidity: 0, safetyViolations: 0, repeatability: 0, categoryCounts, results: [], reasons };

    const results: L1FixtureResult[] = [];
    for (const fixture of fixtures) {
      const started = performance.now();
      const controller = new AbortController();
      const timeoutMs = fixture.timeoutMs ?? 5_000;
      let timer: NodeJS.Timeout | undefined;
      let timedOut = false;
      try {
        const timeout = new Promise<L1FixtureOutcome>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true; controller.abort();
            resolve({ passed: false, schemaValid: false, safetyViolations: 0, repeatable: false, reason: `Fixture timed out after ${timeoutMs}ms` });
          }, timeoutMs);
        });
        const outcome = await Promise.race([execute(fixture, controller.signal), timeout]);
        results.push({ id: fixture.id, category: fixture.category, ...outcome, timedOut, durationMs: performance.now() - started });
      } catch (error) {
        results.push({ id: fixture.id, category: fixture.category, passed: false, schemaValid: false, safetyViolations: 0, repeatable: false, timedOut, durationMs: performance.now() - started, reason: error instanceof Error ? error.message : "Fixture execution failed" });
      } finally { if (timer) clearTimeout(timer); }
    }
    const passed = results.filter((result) => result.passed).length;
    const schemaValidity = results.filter((result) => result.schemaValid).length / results.length;
    const safetyViolations = results.reduce((sum, result) => sum + result.safetyViolations, 0);
    const repeatability = results.filter((result) => result.repeatable).length / results.length;
    if (passed !== results.length) reasons.push(`${results.length - passed} fixture(s) failed`);
    if (schemaValidity < 0.99) reasons.push("Schema validity is below 99%");
    if (safetyViolations > 0) reasons.push("Safety violations must equal zero");
    if (repeatability < 1) reasons.push("Deterministic fixture repeatability must equal 100%");
    return { skillId, status: reasons.length ? "HOLD" : "PASS", total: results.length, passed, schemaValidity, safetyViolations, repeatability, categoryCounts, results, reasons };
  }

  runL2(sequence: WorkflowInvocation[]): L2WorkflowReport {
    if (sequence.length === 0) return { status: "HOLD", steps: [], reasons: ["Workflow sequence is empty"] };
    const steps = sequence.map((step, index) => {
      const decision = this.#registry.canInvoke(step.skillId, { ...step, previousSkillId: index === 0 ? undefined : sequence[index - 1].skillId });
      return { skillId: step.skillId, ...decision };
    });
    const reasons = steps.filter((step) => !step.allowed).map((step) => `${step.skillId}: ${step.reason}`);
    return { status: reasons.length ? "HOLD" : "PASS", steps, reasons };
  }
}

async function discoverSkillFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !["development", "runtime"].includes(entry.name)) continue;
    for (const child of await readdir(path.join(root, entry.name), { withFileTypes: true })) {
      if (child.isDirectory()) files.push(path.join(root, entry.name, child.name, "SKILL.md"));
    }
  }
  return files.sort();
}

function parseSkill(raw: string, file: string): SkillDefinition {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Skill frontmatter is missing: ${file}`);
  const metadata = parseYaml(match[1]) as SkillMetadata; const body = match[2];
  const toolsSection = body.match(/## 6\. Allowed tools\s*([\s\S]*?)(?=\n## 7\.)/)?.[1] ?? "";
  const stateLine = body.match(/## 7\. State transitions[\s\S]*?\n`([^`]+)`/)?.[1] ?? "";
  const completionSection = body.match(/## 9\. Completion criteria\s*([\s\S]*?)(?=\n## 10\.)/)?.[1] ?? "";
  return {
    metadata, body, file,
    allowedTools: [...toolsSection.matchAll(/^- `([^`]+)`/gm)].map((item) => item[1]),
    statePath: stateLine.split(/\s*→\s*/).filter(Boolean),
    completionCriteria: [...completionSection.matchAll(/^- \[[ x]\] (.+)$/gm)].map((item) => item[1])
  };
}
