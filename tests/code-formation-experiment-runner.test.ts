// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CODE_FORMATION_SYSTEM_SUFFIX } from "../services/code-formation-constraint/src/index";
import {
  materializeCodeFormationRequestIntent,
  resolveCodeFormationSystemPrompt,
  type CodeFormationPreregistration
} from "../services/code-formation-experiment/src/index";

const root = path.resolve(process.cwd());
const json = async <T>(relative: string): Promise<T> => JSON.parse(await readFile(path.join(root, relative), "utf8")) as T;
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

type Task = { task_id: string; repository_id: string; repository_revision: string; prompt: string; allowed_file: string; allowed_range: { start_line: number; end_line: number } };
type Repo = { repository_id: string; immutable_revision: string; files: Array<{ path: string; content: string }> };

async function frozenMaterial() {
  const prereg = await json<CodeFormationPreregistration & { schemaVersion: number; design: { taskCount: number; physicalCalls: number; conditions: string[] } }>("benchmarks/model-specialization/CODE_FORMATION_CONSTRAINT_PREREGISTRATION.v1.json");
  const manifest = await json<{ tasks: Task[]; taskIdsSha256: string }>("benchmarks/model-specialization/CODE_FORMATION_CONSTRAINT_TASK_MANIFEST.v1.json");
  const repositories = await json<{ repositories: Repo[] }>("benchmarks/model-specialization/CODE_FORMATION_CONSTRAINT_REPOSITORIES.v1.json");
  const repoBy = new Map(repositories.repositories.map((repo) => [repo.repository_id, repo]));
  const taskBy = new Map(manifest.tasks.map((task) => [task.task_id, task]));
  return { prereg, manifest, repositories, repoBy, taskBy };
}

describe("corrected code-formation Session-B request materialization", () => {
  it("resolves CONTROL and TREATMENT from the frozen nested configuration", async () => {
    const { prereg } = await frozenMaterial();
    expect(resolveCodeFormationSystemPrompt(prereg, "CONTROL")).toBe(prereg.control.systemPrompt);
    expect(resolveCodeFormationSystemPrompt(prereg, "TREATMENT")).toBe(`${prereg.control.systemPrompt}\n\n${prereg.treatment.suffix}`);
    expect(prereg.treatment.suffix).toBe(CODE_FORMATION_SYSTEM_SUFFIX);
    expect(prereg.treatment.systemPromptConstruction).toBe("CONTROL_SYSTEM_PROMPT + TWO_NEWLINES + CODE_FORMATION_SYSTEM_SUFFIX");
  });

  it("materializes all 80 frozen intents without inference or identity drift", async () => {
    const { prereg, manifest, repositories, repoBy, taskBy } = await frozenMaterial();
    expect(prereg.seed).toBe(20260812);
    expect(prereg.schedule).toHaveLength(40);
    expect(manifest.tasks).toHaveLength(40);
    expect(repositories.repositories).toHaveLength(40);
    expect(new Set(repositories.repositories.map((repo) => repo.immutable_revision)).size).toBe(40);
    const intents = prereg.schedule.flatMap((pair) => pair.order.map((condition) => {
      const task = taskBy.get(pair.task_id); expect(task).toBeDefined();
      const repo = repoBy.get(task!.repository_id); expect(repo?.immutable_revision).toBe(task!.repository_revision);
      const source = repo!.files.find((file) => file.path === task!.allowed_file); expect(source).toBeDefined();
      return materializeCodeFormationRequestIntent({ pairIndex: pair.pair_index, condition, prereg, task: task!, source: source!.content });
    }));
    expect(intents).toHaveLength(80);
    expect(intents.filter((intent) => intent.condition === "CONTROL")).toHaveLength(40);
    expect(intents.filter((intent) => intent.condition === "TREATMENT")).toHaveLength(40);
    expect(new Set(intents.map((intent) => intent.requestIntentSha256)).size).toBe(80);
    expect(new Set(intents.map((intent) => `${intent.pairIndex}:${intent.taskId}`)).size).toBe(40);
    expect(prereg.schedule.every((pair, index) => pair.order.join(",") === (index % 2 === 0 ? "CONTROL,TREATMENT" : "TREATMENT,CONTROL"))).toBe(true);
    expect(sha256(prereg.schedule.map((pair) => `${pair.pair_index}:${pair.task_id}:${pair.order.join(",")}`).join("\n"))).toMatch(/^[0-9a-f]{64}$/);
  });
});
