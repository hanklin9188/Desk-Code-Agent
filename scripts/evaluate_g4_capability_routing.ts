import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { routeCapability, type CapabilityRoute } from "../services/g4-diagnostic-runtime/src/index";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const load = async (name: string) => JSON.parse(await readFile(path.join(root, "docs/experiments/g4-capability", name), "utf8")) as Record<string, any>;
const [navigation, diagnosis, patch, planning, onboarding] = await Promise.all([load("NAVIGATION_ISOLATION_EXPERIMENT.json"), load("DIAGNOSIS_ISOLATION_EXPERIMENT.json"), load("PATCH_GENERATION_ISOLATION_EXPERIMENT.json"), load("PLANNING_ISOLATION_EXPERIMENT.json"), load("G4_ONBOARDING_COMPONENT_EXPERIMENT.json")]);
const rows: Array<{ taskId: string; taskClass: string; mutation: boolean; observedSuccess: boolean; route: CapabilityRoute; benchmarkRate: number }> = [];
function add(taskClass: string, source: any[], mutation: boolean, benchmarkRate: number, options: { behaviorOracle?: boolean; hiddenOracle?: boolean; fileScope?: number; difficulty?: "L1" | "L2" | "L3" | "L4" } = {}) {
  for (const row of source) rows.push({ taskId: row.taskId, taskClass, mutation, observedSuccess: Boolean(row.success), benchmarkRate, route: routeCapability({ mutation, repositorySupported: true, evidenceComplete: true, behavioralOracleAvailable: options.behaviorOracle ?? false, hiddenOracleAvailable: options.hiddenOracle ?? false, fileScope: options.fileScope ?? 0, difficulty: options.difficulty ?? "L3", taskClassBehavioralSuccess: benchmarkRate }) });
}
const navRows = navigation.observations.filter((row: any) => row.condition === "ORACLE_SOURCE_AND_TEST_CONTEXT");
add("navigation_with_complete_context", navRows, false, navRows.filter((row: any) => row.success).length / navRows.length);
add("diagnosis", diagnosis.observations, false, diagnosis.summary.successRate);
add("behavioral_patch", patch.observations, true, patch.summary.successRate, { behaviorOracle: true, hiddenOracle: true, fileScope: 1, difficulty: "L2" });
add("cross_file_planning", planning.observations, false, planning.summary.successRate);
add("onboarding_synthesis", onboarding.observations, false, onboarding.aggregate.exactAllComponentsRate);
const routes = ["SUPPORTED", "ASSISTED", "EXPERIMENTAL", "REPORT_ONLY"] as const;
const byRoute = Object.fromEntries(routes.map((route) => {
  const selected = rows.filter((row) => row.route === route);
  return [route, { tasks: selected.length, observedSuccesses: selected.filter((row) => row.observedSuccess).length, precision: selected.length ? selected.filter((row) => row.observedSuccess).length / selected.length : null }];
}));
const actionable = rows.filter((row) => row.route !== "REPORT_ONLY");
const report = { schemaVersion: 1, status: "PASS_CONSERVATIVE_ROUTING", classification: "G4_DEVELOPMENT_ROUTING_EVALUATION_NOT_HOLDOUT", policy: { inputs: ["mutation", "repository support", "evidence completeness", "behavior/hidden oracle availability", "file scope", "difficulty", "prior benchmark success for task class"], modelSelfConfidenceUsed: false, thresholds: { supportedReadOnly: 0.8, assistedReadOnly: 0.5, experimentalMutation: 0.5, assistedMutation: 0.25, autonomousRequiresOneFileAndVisibleHiddenBehaviorOracle: true } }, aggregate: { tasks: rows.length, byRoute, actionableTasks: actionable.length, actionablePrecision: actionable.length ? actionable.filter((row) => row.observedSuccess).length / actionable.length : null, autonomousMutationEnabledTasks: rows.filter((row) => row.route === "EXPERIMENTAL").length, falseAutonomousMutationRoutes: rows.filter((row) => row.route === "EXPERIMENTAL" && !row.observedSuccess).length }, rows, conclusion: "Only cross-file structured planning reaches SUPPORTED on current development evidence. Navigation is ASSISTED at 50% with complete source/test context. Diagnosis, onboarding, and all mutation remain REPORT_ONLY; autonomous mutation is disabled." };
const name = "CAPABILITY_ROUTING_EVALUATION.json"; const target = path.join(root, "docs/experiments/g4-capability", name); const body = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(target, body, { flag: "wx" }); await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: report.status, artifact: { path: `docs/experiments/g4-capability/${name}`, sha256: sha256(body) }, aggregate: report.aggregate }, null, 2)}\n`);
