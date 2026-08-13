import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { CodebaseIndex } from "../services/repo-intelligence/src/index";
import { SkillRegistry } from "../services/skill-runtime/src/index";
import { replayEvents } from "../packages/event-protocol/src/index";
import type { AgentEvent } from "../packages/contracts/src/index";

const root = path.resolve(process.cwd());
const indexStarted = performance.now();
const index = new CodebaseIndex(root, ":memory:");
const map = await index.build("working-tree");
const definitionHit = index.findDefinition("evaluateFeasibility").some((item) => item.path === "services/agent-runtime/src/index.ts");
const testHit = index.findTests("services/agent-runtime/src/index.ts").some((item) => item.path === "tests/runtime.test.ts");
const indexMs = performance.now() - indexStarted;
index.close();

const events: AgentEvent[] = Array.from({ length: 1_000 }, (_, sequence) => ({
  eventId: `bench_${sequence}`, runId: "bench_run", taskId: "bench_task", sequence,
  timestamp: new Date(sequence * 1000).toISOString(), source: "benchmark",
  type: sequence === 0 ? "run.created" : sequence === 999 ? "run.completed" : "tool.output",
  severity: "info", payload: { ordinal: sequence }, privacy: "local_only"
}));
const replayStarted = performance.now(); const projection = replayEvents(events); const replayMs = performance.now() - replayStarted;

const skillStarted = performance.now();
const registry = await SkillRegistry.load(path.join(root, "skills"), path.join(root, "schemas/skill_definition.schema.json"));
const validation = registry.validation(); const skillMs = performance.now() - skillStarted;

const result = {
  experiment_id: `deterministic-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  status: definitionHit && testHit && projection.events.length === 1_000 && validation.every((item) => item.valid) ? "PASS" : "FAIL",
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  retrieval: { queries: 2, hits: Number(definitionHit) + Number(testHit), recall_at_k: (Number(definitionHit) + Number(testHit)) / 2, index_files: map.files, symbols: map.symbols, references: map.references, duration_ms: Number(indexMs.toFixed(3)) },
  event_replay: { events: projection.events.length, final_state: projection.state, duration_ms: Number(replayMs.toFixed(3)), events_per_second: Math.round(1_000 / (replayMs / 1_000)) },
  skill_l0: { total: validation.length, valid: validation.filter((item) => item.valid).length, duration_ms: Number(skillMs.toFixed(3)), production_enabled: registry.productionEnabled().length },
  model_experiments: { status: "NOT_RUN", reason: "BF16 live gateway smoke and Analyst slice PASS; E1-E7 task-suite experiments have not run" },
  quantization: { status: "NOT_RUN", reason: "BF16 live smoke PASS; BF16 task-suite baseline and E1-E7 must run before quantization comparison" }
};
const runDirectory = path.join(root, "docs", "experiments", "runs", result.experiment_id);
await mkdir(runDirectory, { recursive: false });
await writeFile(path.join(runDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
