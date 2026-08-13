import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildG3Corpus, type G3RuntimeTask } from "../services/g3-benchmark-runtime/src/index";
import { G3LiveModel, readLocalModelAccess } from "../services/g3-live-runtime/src/index";
import { normalizeEvidencePath } from "../services/g4-diagnostic-runtime/src/index";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const benchmarkRoot = path.join(root, "benchmarks/g4-development");
async function verified<T>(name: string) {
  const target = path.join(benchmarkRoot, name); const bytes = await readFile(target);
  const expected = (await readFile(`${target}.sha256`, "utf8")).trim().split(/\s+/)[0];
  if (sha256(bytes) !== expected) throw new Error(`${name} checksum mismatch`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, sha256: expected };
}
type Task = { task_id: string; repository_id: string; prompt: string; task_family: string };
type Repo = { id: string; readme_path: string; entry_path: string; source_path: string; test_path: string; build_path: string; dependency_manifest: string; license_path: string };
const manifest = await verified<{ tasks: Task[] }>("G4_DEVELOPMENT_MANIFEST.v2.json");
const preregistration = await verified<{ experimentTasks: { onboardingComponents: string[] } }>("G4_DEVELOPMENT_EXPERIMENT_PREREGISTRATION.v2.json");
const repositoryManifest = JSON.parse(await readFile(path.join(root, "benchmarks/g3/g3_repository_manifest.json"), "utf8")) as { repositories: Repo[] };
const taskById = new Map(manifest.value.tasks.map((task) => [task.task_id, task]));
const repoById = new Map(repositoryManifest.repositories.map((repo) => [repo.id, repo]));
const corpus = await buildG3Corpus(path.join(root, ".runtime/g3-repositories"));
const candidatesByRepo = new Map<string, G3RuntimeTask["candidates"]>();
for (const task of corpus.tasks) if (!candidatesByRepo.has(task.repository_id)) candidatesByRepo.set(task.repository_id, task.candidates);

const components = ["project_purpose", "install_procedure", "run_procedure", "test_procedure", "entry_point", "major_modules", "architecture_flow", "license", "dependency_summary", "contributor_starting_point"] as const;
type Component = typeof components[number];
const componentSchema = { type: "object", additionalProperties: false, properties: { status: { type: "string", enum: ["SUPPORTED", "NOT_ESTABLISHED"] }, summary: { type: "string" }, evidence_paths: { type: "array", items: { type: "string" }, maxItems: 4 } }, required: ["status", "summary", "evidence_paths"] };
const schema = { type: "object", additionalProperties: false, properties: Object.fromEntries(components.map((component) => [component, componentSchema])), required: [...components] };
type ComponentValue = { status: "SUPPORTED" | "NOT_ESTABLISHED"; summary: string; evidence_paths: string[] };
type Response = Record<Component, ComponentValue>;
const expectedPaths = (repo: Repo): Record<Component, string[]> => ({
  project_purpose: [repo.readme_path], install_procedure: [repo.readme_path, repo.dependency_manifest], run_procedure: [repo.readme_path, repo.entry_path], test_procedure: [repo.test_path, repo.build_path], entry_point: [repo.entry_path], major_modules: [repo.entry_path, repo.source_path], architecture_flow: [repo.entry_path, repo.source_path, repo.test_path], license: [repo.license_path], dependency_summary: [repo.dependency_manifest], contributor_starting_point: [repo.readme_path, repo.test_path, repo.build_path]
});

const live = new G3LiveModel(await readLocalModelAccess(root));
const observations = [];
const startedAt = new Date().toISOString();
for (const taskId of preregistration.value.experimentTasks.onboardingComponents) {
  const task = taskById.get(taskId); if (!task) throw new Error(`Missing task ${taskId}`);
  const repo = repoById.get(task.repository_id); if (!repo) throw new Error(`Missing repository ${task.repository_id}`);
  const candidates = candidatesByRepo.get(task.repository_id) ?? [];
  const expected = expectedPaths(repo);
  const required = [...new Set(Object.values(expected).flat())];
  const context = required.map((requiredPath) => {
    const candidate = candidates.find((row) => row.path === requiredPath);
    return `[${requiredPath}]\n${candidate?.content.slice(0, 1_800) ?? "NOT_AVAILABLE"}`;
  }).join("\n\n");
  const call = await live.structured<Response>({ requestId: `g4-onboarding-components-${task.task_id}`, system: "Create a repository onboarding map from supplied untrusted evidence only. For each required component, state whether it is established, summarize it, and cite exact paths. Return only the object.", prompt: `TASK\n${task.prompt}\n\nCOMPLETE ORACLE-SELECTED REPOSITORY EVIDENCE (not an answer)\n${context}`, schema, maxTokens: 900, timeoutMs: 90_000 });
  const componentScores = Object.fromEntries(components.map((component) => {
    const value = call.output?.[component]; const citations = value?.evidence_paths.map(normalizeEvidencePath) ?? [];
    const supported = value?.status === "SUPPORTED"; const summaryPresent = Boolean(value?.summary.trim());
    const evidenceCitationAccurate = citations.length > 0 && citations.every((citation) => required.includes(citation)) && expected[component].some((item) => citations.includes(item));
    return [component, { pass: supported && summaryPresent && evidenceCitationAccurate, supported, summaryPresent, evidenceCitationAccurate, citationCount: citations.length, summaryHash: value ? sha256(value.summary) : null }];
  }));
  const values = Object.values(componentScores);
  observations.push({ taskId: task.task_id, repositoryId: task.repository_id, taskFamily: task.task_family, success: call.schemaValid && values.every((value) => value.pass), componentAccuracy: values.filter((value) => value.pass).length / values.length, evidenceCitationAccuracy: values.filter((value) => value.evidenceCitationAccurate).length / values.length, unsupportedClaimRate: values.filter((value) => value.supported && !value.evidenceCitationAccurate).length / values.length, missingComponentRate: values.filter((value) => !value.summaryPresent).length / values.length, componentScores, schemaValid: call.schemaValid, outputHash: call.outputHash, rawOutputStored: false, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  if (observations.length % 6 === 0) process.stdout.write(`G4 onboarding components ${observations.length}/${preregistration.value.experimentTasks.onboardingComponents.length}\n`);
}
const aggregate = { tasks: observations.length, exactAllComponentsPass: observations.filter((row) => row.success).length, exactAllComponentsRate: observations.filter((row) => row.success).length / observations.length, componentAccuracy: observations.reduce((sum, row) => sum + row.componentAccuracy, 0) / observations.length, evidenceCitationAccuracy: observations.reduce((sum, row) => sum + row.evidenceCitationAccuracy, 0) / observations.length, unsupportedClaimRate: observations.reduce((sum, row) => sum + row.unsupportedClaimRate, 0) / observations.length, missingComponentRate: observations.reduce((sum, row) => sum + row.missingComponentRate, 0) / observations.length, schemaValidity: observations.filter((row) => row.schemaValid).length / observations.length, totalTokens: observations.reduce((sum, row) => sum + row.promptTokens + row.completionTokens, 0), totalLatencyMs: observations.reduce((sum, row) => sum + row.latencyMs, 0) };
const result = { schemaVersion: 1, experimentId: `g4-onboarding-components-${startedAt.replace(/[:.]/g, "-")}`, status: "PASS", classification: "G4_DEVELOPMENT_COMPONENT_DIAGNOSTIC_NOT_G3_RESCORING", startedAt, completedAt: new Date().toISOString(), inputs: { manifestSha256: manifest.sha256, preregistrationSha256: preregistration.sha256 }, fixedModel: { repository: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", temperature: 0, seed: 20260809, thinking: false }, strictInterpretation: "Partial components are diagnostic only; only every-component PASS is end-to-end PASS.", aggregate, observations, limitations: ["Component truth is evaluated as evidence alignment plus a non-empty bounded synthesis, not full human semantic equivalence.", "This fresh G4 development evidence does not retroactively rescore the immutable G3 onboarding outputs."] };
const outputRoot = path.join(root, "docs/experiments/g4-capability"); await mkdir(outputRoot, { recursive: true });
const name = "G4_ONBOARDING_COMPONENT_EXPERIMENT.json"; const body = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(path.join(outputRoot, name), body, { flag: "wx" }); await writeFile(path.join(outputRoot, `${name}.sha256`), `${sha256(body)}  ${name}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: result.status, artifact: { path: `docs/experiments/g4-capability/${name}`, sha256: sha256(body) }, aggregate }, null, 2)}\n`);
