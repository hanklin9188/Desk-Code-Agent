import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildG3Corpus, type G3RuntimeTask } from "../services/g3-benchmark-runtime/src/index";
import { retrieveG3 } from "../services/g3-evaluation-runtime/src/index";
import { buildEvidenceRetry, extractPatchTargets, keywordCoverage, normalizeEvidencePath, patchSummary } from "../services/g4-diagnostic-runtime/src/index";
import { parseProfileId, readProfileModelAccess, SpecializationLiveModel } from "../services/model-specialization-runtime/src/index";
import { ConstrainedPatchRuntime, TrustedVerificationExecutor } from "../services/tool-runtime/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const benchmarkRoot = path.join(root, "benchmarks/model-specialization");
const profileId = parseProfileId(process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length));
const artifactVersion = process.argv.find((value) => value.startsWith("--artifact-version="))?.slice("--artifact-version=".length);
if (artifactVersion !== undefined && !/^v[23]$/.test(artifactVersion)) throw new Error("Artifact version must be v2 or v3");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const startedAt = new Date().toISOString();

type Task = {
  task_id: string; repository_id: string; repository_commit: string; category: string; task_family: string; difficulty: string;
  prompt: string; expected_outcome: string; allowed_files?: string[]; visible_files?: Array<{ path: string; content: string }>;
  trusted_visible_command?: string[]; changed_line_budget?: number;
};
type Oracle = {
  task_id: string; required_evidence_paths?: string[]; expected_outcome?: string; expected_components?: string[];
  exact_relevant_file?: string; exact_relevant_symbol?: string; root_cause?: string; behavioral_requirement?: string;
  hidden_files?: Array<{ path: string; content: string }>; trusted_hidden_command?: string[];
};
type DevelopmentManifest = { phases: Record<string, { taskIds: string[]; taskIdsSha256: string }> };

async function verifiedJson<T>(relative: string): Promise<{ value: T; path: string; sha256: string }> {
  const target = path.join(root, relative);
  const bytes = await readFile(target);
  const actual = sha256(bytes);
  const expected = (await readFile(`${target}.sha256`, "utf8")).trim().split(/\s+/)[0];
  if (actual !== expected) throw new Error(`${relative} checksum mismatch`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: actual };
}

const [manifestArtifact, oracleArtifact, selectionArtifact, preregArtifact, exactModelsArtifact] = await Promise.all([
  verifiedJson<{ tasks: Task[] }>("benchmarks/g4-development/G4_DEVELOPMENT_MANIFEST.v2.json"),
  verifiedJson<{ rows: Oracle[] }>("benchmarks/g4-development/G4_DEVELOPMENT_ORACLE.v2.sealed.json"),
  verifiedJson<DevelopmentManifest>("benchmarks/model-specialization/MODEL_COMPARISON_DEVELOPMENT_MANIFEST.json"),
  verifiedJson<Record<string, unknown>>("benchmarks/model-specialization/MODEL_SPECIALIZATION_PREREGISTRATION.json"),
  verifiedJson<Record<string, unknown>>("benchmarks/model-specialization/EXACT_MODEL_MANIFESTS.json")
]);
const taskById = new Map(manifestArtifact.value.tasks.map((task) => [task.task_id, task]));
const oracleById = new Map(oracleArtifact.value.rows.map((oracle) => [oracle.task_id, oracle]));
const selected = (phase: string) => selectionArtifact.value.phases[phase].taskIds.map((id) => {
  const task = taskById.get(id); const oracle = oracleById.get(id);
  if (!task || !oracle) throw new Error(`Missing sealed task/oracle ${id}`);
  return { task, oracle };
});

const access = await readProfileModelAccess(root, profileId);
const live = new SpecializationLiveModel({ endpoint: access.endpoint, apiKey: access.apiKey, model: access.model, seed: access.shared.seed });
const corpus = await buildG3Corpus(path.join(root, ".runtime/g3-repositories"));
const candidatesByRepository = new Map<string, G3RuntimeTask["candidates"]>();
for (const task of corpus.tasks) if (!candidatesByRepository.has(task.repository_id)) candidatesByRepository.set(task.repository_id, task.candidates);

const analysisSchema = {
  type: "object", additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["ANSWER", "PATCH_PROPOSAL", "REPORT_ONLY", "BLOCKED_MISSING_ORACLE", "NEED_APPROVAL", "BLOCKED_SECURITY_POLICY"] },
    answer: { type: "string" }, evidence_paths: { type: "array", items: { type: "string" }, maxItems: 8 }, target_paths: { type: "array", items: { type: "string" }, maxItems: 6 },
    covered_dimensions: { type: "array", items: { type: "string" }, maxItems: 8 }, confidence: { type: "number", minimum: 0, maximum: 1 }
  }, required: ["status", "answer", "evidence_paths", "target_paths", "covered_dimensions", "confidence"]
};
type AnalysisResponse = { status: string; answer: string; evidence_paths: string[]; target_paths: string[]; covered_dimensions: string[]; confidence: number };
const understandingSchema = {
  type: "object", additionalProperties: false,
  properties: {
    task_type: { type: "string", enum: ["CODE_CHANGE", "DEBUG", "NAVIGATION", "PLANNING", "REPORT"] }, user_goal: { type: "string" }, required_behavior: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
    probable_affected_scope: { type: "array", maxItems: 6, items: { type: "string" } }, mutation_required: { type: "boolean" }, success_criteria: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } }, uncertainties: { type: "array", maxItems: 6, items: { type: "string" } }
  }, required: ["task_type", "user_goal", "required_behavior", "probable_affected_scope", "mutation_required", "success_criteria", "uncertainties"]
};
type UnderstandingResponse = { task_type: string; user_goal: string; required_behavior: string[]; probable_affected_scope: string[]; mutation_required: boolean; success_criteria: string[]; uncertainties: string[] };
const navigationSchema = {
  type: "object", additionalProperties: false,
  properties: { relevant_files: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } }, relevant_symbols: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } }, relevant_tests: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } } },
  required: ["relevant_files", "relevant_symbols", "relevant_tests"]
};
type NavigationResponse = { relevant_files: string[]; relevant_symbols: string[]; relevant_tests: string[] };
const diagnosisSchema = {
  type: "object", additionalProperties: false,
  properties: { root_cause: { type: "string" }, ranked_hypotheses: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } }, evidence: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } } },
  required: ["root_cause", "ranked_hypotheses", "evidence"]
};
type DiagnosisResponse = { root_cause: string; ranked_hypotheses: string[]; evidence: string[] };
const patchSchema = {
  type: "object", additionalProperties: false,
  properties: { status: { type: "string", enum: ["PATCH_PROPOSAL", "BLOCKED_MISSING_ORACLE", "REPORT_ONLY"] }, unified_diff: { type: "string" }, summary: { type: "string" }, evidence_paths: { type: "array", items: { type: "string" }, maxItems: 6 }, target_paths: { type: "array", items: { type: "string" }, maxItems: 4 }, confidence: { type: "number", minimum: 0, maximum: 1 } },
  required: ["status", "unified_diff", "summary", "evidence_paths", "target_paths", "confidence"]
};
type PatchResponse = { status: string; unified_diff: string; summary: string; evidence_paths: string[]; target_paths: string[]; confidence: number };
const planningSchema = {
  type: "object", additionalProperties: false,
  properties: { affected_files: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, change_order: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, dependencies: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, required_tests: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, rollback_concerns: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } } },
  required: ["affected_files", "change_order", "dependencies", "required_tests", "rollback_concerns"]
};
type PlanningResponse = { affected_files: string[]; change_order: string[]; dependencies: string[]; required_tests: string[]; rollback_concerns: string[] };

function evidenceBlock(task: Task, oracle: Oracle): string {
  const candidates = candidatesByRepository.get(task.repository_id) ?? [];
  return (oracle.required_evidence_paths ?? []).map((required) => {
    const candidate = candidates.find((item) => item.path === required);
    return candidate ? `[${candidate.path}]\n${candidate.content.slice(0, 2_400)}` : `[${required}]\nNOT_AVAILABLE`;
  }).join("\n\n");
}

function patchRuntimeTask(task: Task, oracle: Oracle): G3RuntimeTask {
  const visible = task.visible_files ?? [];
  return {
    task_id: task.task_id, repository_id: task.repository_id, repository_commit: task.repository_commit, split: "development", prompt: task.prompt,
    declared_symbols: [], provenance: "sealed G4 behavioral development fixture", category: "local_coding", difficulty: "L3", expected_outcome: "PATCH_PROPOSAL",
    required_evidence_paths: [oracle.exact_relevant_file!, visible.find((file) => file.path.includes("visible.test"))?.path ?? ""].filter(Boolean), target_paths: [oracle.exact_relevant_file!], required_answer_terms: [], security_sensitive: false, hidden_oracle_kind: "PATCH_SCOPE",
    candidates: visible.map((file, index) => ({ id: `${task.task_id}-${index}`, path: file.path, content: file.content, evidenceClass: file.path.includes("test") ? "TEST" : "SYMBOL", role: file.path.includes("test") ? "test" : "source", symbols: file.path === oracle.exact_relevant_file ? [oracle.exact_relevant_symbol!] : [] }))
  };
}

const patchPrompt = (task: Task, oracle: Oracle, isolated: boolean, context?: string) => {
  const source = task.visible_files?.find((file) => file.path === oracle.exact_relevant_file)?.content ?? "";
  const visible = task.visible_files?.find((file) => file.path.includes("visible.test"))?.content ?? "";
  return [context ?? `TASK\n${task.prompt}`, isolated ? `KNOWN ROOT CAUSE\n${oracle.root_cause}\n\nTARGET BEHAVIOR\n${oracle.behavioral_requirement}` : "", context ? "" : `CURRENT RELEVANT SOURCE [${oracle.exact_relevant_file}]\n${source}\n\nVISIBLE TEST\n${visible}`].filter(Boolean).join("\n\n");
};

interface PatchExecution { success: boolean; patchApplied: boolean; syntax: string; visible: string; hidden: string; rollback: boolean; wrongFileEdit: boolean; changedLines: number; unnecessaryEdits: boolean; failureEvidence: string }
async function withFixture<T>(task: Task, oracle: Oracle, run: (worktree: string) => Promise<T>): Promise<T> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `dca-model-${profileId}-`));
  const repository = path.join(temporaryRoot, "repository"); const worktree = path.join(temporaryRoot, "worktree");
  try {
    await mkdir(repository, { recursive: true });
    await execFileAsync("git", ["init", "--initial-branch=main", "--quiet"], { cwd: repository });
    for (const file of task.visible_files ?? []) { await mkdir(path.dirname(path.join(repository, file.path)), { recursive: true }); await writeFile(path.join(repository, file.path), file.content); }
    await execFileAsync("git", ["add", "."], { cwd: repository });
    await execFileAsync("git", ["-c", "user.name=Desk Code Agent Fixture", "-c", "user.email=fixture@invalid", "commit", "--quiet", "-m", "ephemeral model-comparison fixture"], { cwd: repository });
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, "HEAD"], { cwd: repository });
    for (const file of oracle.hidden_files ?? []) { await mkdir(path.dirname(path.join(worktree, file.path)), { recursive: true }); await writeFile(path.join(worktree, file.path), file.content); }
    return await run(worktree);
  } finally {
    try { await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: repository }); } catch { /* temporary-root cleanup remains authoritative */ }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function executePatch(worktree: string, task: Task, oracle: Oracle, response: PatchResponse | null, schemaValid: boolean): Promise<PatchExecution> {
  const sourcePath = oracle.exact_relevant_file!;
  const beforeHash = sha256(await readFile(path.join(worktree, sourcePath)));
  let patchApplied = false; let syntax = "NOT_RUN"; let visible = "NOT_RUN"; let hidden = "NOT_RUN"; let changedLines = 0; let failure = response?.status ?? "INVALID_MODEL_RESPONSE"; let appliedFiles: string[] = []; let patcher: ConstrainedPatchRuntime | null = null;
  const targets = response ? extractPatchTargets(response.unified_diff) : [];
  const wrongFileEdit = targets.some((target) => !task.allowed_files?.includes(target));
  try {
    if (!schemaValid || !response || response.status !== "PATCH_PROPOSAL") throw new Error(failure);
    patcher = new ConstrainedPatchRuntime(worktree, { allowedFiles: task.allowed_files!, maxChangedLines: task.changed_line_budget ?? 20 });
    const applied = await patcher.apply(response.unified_diff); appliedFiles = applied.files; changedLines = applied.changedLines; patchApplied = true;
    const visibleCommand = task.trusted_visible_command!; const hiddenCommand = oracle.trusted_hidden_command!;
    const verifier = new TrustedVerificationExecutor(worktree, {
      syntax: { executable: process.execPath, args: ["--check", sourcePath], timeoutMs: 10_000, requiresHardNetworkIsolation: false },
      visible: { executable: visibleCommand[0], args: visibleCommand.slice(1), timeoutMs: 10_000, requiresHardNetworkIsolation: false },
      hidden: { executable: hiddenCommand[0], args: hiddenCommand.slice(1), timeoutMs: 10_000, requiresHardNetworkIsolation: false }
    }, { level: "PROCESS_CONSTRAINED", strategy: "none", reason: "dependency-free sealed local fixture" });
    const syntaxResult = await verifier.run("syntax"); syntax = syntaxResult.status;
    const visibleResult = syntax === "PASS" ? await verifier.run("visible") : null; visible = visibleResult?.status ?? "NOT_RUN_SYNTAX_FAIL";
    const hiddenResult = visible === "PASS" ? await verifier.run("hidden") : null; hidden = hiddenResult?.status ?? "NOT_RUN_VISIBLE_FAIL";
    failure = [syntaxResult.stderr, visibleResult?.stderr, hiddenResult?.stderr].filter(Boolean).join("\n").slice(0, 2_000) || `syntax=${syntax};visible=${visible};hidden=${hidden}`;
  } catch (error) { failure = error instanceof Error ? error.message.slice(0, 2_000) : "PATCH_EXECUTION_FAILURE"; }
  finally { if (patcher && appliedFiles.length) { try { await patcher.rollback(appliedFiles); } catch { failure += ";rollback threw"; } } }
  const rollback = sha256(await readFile(path.join(worktree, sourcePath))) === beforeHash;
  const success = patchApplied && syntax === "PASS" && visible === "PASS" && hidden === "PASS" && !wrongFileEdit && rollback;
  return { success, patchApplied, syntax, visible, hidden, rollback, wrongFileEdit, changedLines, unnecessaryEdits: changedLines > (task.changed_line_budget ?? 20), failureEvidence: success ? "PASS" : `${failure}; syntax=${syntax}; visible=${visible}; hidden=${hidden}; wrongFile=${wrongFileEdit}; rollback=${rollback}` };
}

const modelPatch = (task: Task, oracle: Oracle, prompt: string, suffix: string) => live.structured<PatchResponse>({ requestId: `specialization-${profileId}-${suffix}-${task.task_id}`, system: "Produce one minimal constrained git unified diff from supplied untrusted evidence. Do not modify tests, claim unrun verification, or target another file. Return only the required object.", prompt, schema: patchSchema, maxTokens: 640, timeoutMs: 90_000 });
const progress = (phase: string, done: number, total: number) => process.stdout.write(`${profileId} ${phase} ${done}/${total}\n`);

const oracleContext: Array<Record<string, any>> = [];
for (const [index, { task, oracle }] of selected("oracleContext").entries()) {
  const prompt = `TASK\n${task.prompt}\n\nORACLE-SELECTED RELEVANT EVIDENCE (not the answer)\n${evidenceBlock(task, oracle)}`;
  const call = await live.structured<AnalysisResponse>({ requestId: `specialization-${profileId}-oracle-${task.task_id}`, system: "Analyze one bounded repository task from supplied untrusted evidence. Return only the required object. Cite exact paths and do not claim tools ran.", prompt, schema: analysisSchema, maxTokens: 320, timeoutMs: 90_000 });
  const citations = call.output?.evidence_paths.map(normalizeEvidencePath) ?? []; const required = oracle.required_evidence_paths ?? [];
  const componentText = call.output ? `${call.output.answer} ${call.output.covered_dimensions.join(" ")}`.replaceAll("_", " ") : "";
  const componentRecall = (oracle.expected_components ?? []).filter((component) => keywordCoverage(component.replaceAll("_", " "), componentText) >= 0.5).length / Math.max(1, oracle.expected_components?.length ?? 0);
  const evidenceComplete = required.every((item) => citations.includes(item)); const unsupportedClaims = citations.filter((item) => !required.includes(item)); const requiredActionCorrect = call.output?.status === task.expected_outcome;
  oracleContext.push({ taskId: task.task_id, repositoryId: task.repository_id, success: call.schemaValid && evidenceComplete && componentRecall >= 0.75 && requiredActionCorrect && unsupportedClaims.length === 0, schemaValid: call.schemaValid, evidenceComplete, componentRecall, requiredActionCorrect, unsupportedClaimCount: unsupportedClaims.length, outputHash: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  if ((index + 1) % 6 === 0) progress("oracle-context", index + 1, selected("oracleContext").length);
}

const taskUnderstanding: Array<Record<string, any>> = [];
for (const [index, { task, oracle }] of selected("taskUnderstanding").entries()) {
  const call = await live.structured<UnderstandingResponse>({ requestId: `specialization-${profileId}-understand-${task.task_id}`, system: "Interpret the task only. Do not navigate repository files and do not write code. Separate requested behavior from uncertainty.", prompt: `NATURALISTIC REQUEST\n${task.prompt}`, schema: understandingSchema, maxTokens: 280, timeoutMs: 90_000 });
  const output = call.output; const combinedBehavior = output?.required_behavior.join(" ") ?? ""; const criteria = output?.success_criteria.join(" ") ?? "";
  const taskTypeCorrect = output?.task_type === "CODE_CHANGE"; const mutationIntentCorrect = output?.mutation_required === true;
  const goalAccuracy = keywordCoverage(task.prompt.split("Operational constraint:")[0], output?.user_goal ?? "");
  const successCriteriaAccuracy = (oracle.expected_components ?? []).filter((component) => keywordCoverage(component.replaceAll("_", " "), `${combinedBehavior} ${criteria}`) >= 0.45).length / Math.max(1, oracle.expected_components?.length ?? 0);
  const unsupportedAssumptions = (output?.probable_affected_scope ?? []).filter((item) => /[/\\]|\.[a-z0-9]{1,8}$/i.test(item)).length;
  taskUnderstanding.push({ taskId: task.task_id, success: call.schemaValid && taskTypeCorrect && mutationIntentCorrect && goalAccuracy >= 0.35 && successCriteriaAccuracy >= 2 / 3, schemaValid: call.schemaValid, taskTypeCorrect, mutationIntentCorrect, goalAccuracy, successCriteriaAccuracy, unsupportedAssumptions, uncertaintyItems: output?.uncertainties.length ?? 0, outputHash: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  if ((index + 1) % 6 === 0) progress("task-understanding", index + 1, selected("taskUnderstanding").length);
}

const navigation: Array<Record<string, any>> = [];
for (const [index, { task, oracle }] of selected("navigation").entries()) {
  const runtimeTask = patchRuntimeTask(task, oracle); const view = retrieveG3(runtimeTask, "E-MIN-V2", 2_048);
  const call = await live.structured<NavigationResponse>({ requestId: `specialization-${profileId}-nav-${task.task_id}`, system: "Use only the frozen repository search result and untrusted evidence to identify source, symbol, and nearest test. Do not diagnose or patch.", prompt: `${view.context}\n\nSEARCH RESULT PATHS\n${view.selectedPaths.join("\n")}`, schema: navigationSchema, maxTokens: 180, timeoutMs: 90_000 });
  const files = call.output?.relevant_files.map(normalizeEvidencePath) ?? []; const tests = call.output?.relevant_tests.map(normalizeEvidencePath) ?? []; const expectedTest = task.visible_files?.find((file) => file.path.includes("visible.test"))?.path ?? "";
  const fileRecallAt2 = files.includes(oracle.exact_relevant_file!) ? 1 : 0; const symbolAccuracy = call.output?.relevant_symbols.includes(oracle.exact_relevant_symbol!) ? 1 : 0; const testAffinityAccuracy = tests.includes(expectedTest) ? 1 : 0;
  const known = new Set(task.visible_files?.map((file) => file.path) ?? []); const wrongFiles = [...files, ...tests].filter((file) => !known.has(file));
  navigation.push({ taskId: task.task_id, success: call.schemaValid && fileRecallAt2 === 1 && symbolAccuracy === 1 && testAffinityAccuracy === 1 && wrongFiles.length === 0, schemaValid: call.schemaValid, fileRecallAt2, symbolAccuracy, testAffinityAccuracy, wrongFileCount: wrongFiles.length, retrievalSelectedPaths: view.selectedPaths, retrievalIncludedPaths: view.includedPaths, retrievalLatencyMs: view.retrievalLatencyMs, toolCalls: view.fallbackRounds + 1, outputHash: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  if ((index + 1) % 5 === 0) progress("navigation", index + 1, selected("navigation").length);
}

const diagnosis: Array<Record<string, any>> = [];
for (const [index, { task, oracle }] of selected("diagnosis").entries()) {
  const call = await live.structured<DiagnosisResponse>({ requestId: `specialization-${profileId}-diagnosis-${task.task_id}`, system: "Diagnose one bounded failure from supplied source and failing test. Rank hypotheses and tie them to evidence. Do not patch.", prompt: `${patchPrompt(task, oracle, false)}\n\nThe visible test is failing. Diagnose only.`, schema: diagnosisSchema, maxTokens: 260, timeoutMs: 90_000 });
  const rootCoverage = keywordCoverage(oracle.root_cause ?? "", call.output?.root_cause ?? ""); const firstCoverage = keywordCoverage(oracle.root_cause ?? "", call.output?.ranked_hypotheses[0] ?? ""); const rootCauseCorrect = rootCoverage >= 0.45 || firstCoverage >= 0.45;
  const unsupportedHypotheses = (call.output?.ranked_hypotheses ?? []).filter((item) => keywordCoverage(`${task.prompt} ${oracle.root_cause}`, item) < 0.1).length; const contradiction = call.output ? call.output.ranked_hypotheses.some((item) => item.toLowerCase().includes("no bug")) : false;
  diagnosis.push({ taskId: task.task_id, success: call.schemaValid && rootCauseCorrect && Boolean(call.output?.evidence.length), schemaValid: call.schemaValid, rootCauseCorrect, rootCauseCoverage: rootCoverage, unsupportedHypotheses, contradiction, evidenceItems: call.output?.evidence.length ?? 0, outputHash: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  if ((index + 1) % 5 === 0) progress("diagnosis", index + 1, selected("diagnosis").length);
}

const patchOnly: Array<Record<string, any>> = [];
for (const [index, { task, oracle }] of selected("patchOnly").entries()) {
  const call = await modelPatch(task, oracle, patchPrompt(task, oracle, true), "patch-only");
  const execution = await withFixture(task, oracle, (worktree) => executePatch(worktree, task, oracle, call.output, call.schemaValid));
  patchOnly.push({ taskId: task.task_id, success: execution.success, schemaValid: call.schemaValid, selectedOutcome: call.output?.status ?? null, unnecessaryRefusal: call.output?.status === "REPORT_ONLY", outputHash: call.outputHash, patchHash: call.output ? sha256(call.output.unified_diff) : null, ...execution, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  progress("patch-only", index + 1, selected("patchOnly").length);
}

const planning: Array<Record<string, any>> = [];
for (const [index, { task, oracle }] of selected("planning").entries()) {
  const call = await live.structured<PlanningResponse>({ requestId: `specialization-${profileId}-planning-${task.task_id}`, system: "Plan a bounded cross-file change from supplied untrusted evidence. Identify affected files, order, dependencies, tests, and rollback concerns. Do not patch.", prompt: `TASK\n${task.prompt}\n\nORACLE-SELECTED EVIDENCE (not a solution)\n${evidenceBlock(task, oracle)}`, schema: planningSchema, maxTokens: 320, timeoutMs: 90_000 });
  const paths = [...(call.output?.affected_files ?? []), ...(call.output?.dependencies ?? []), ...(call.output?.required_tests ?? [])].map(normalizeEvidencePath); const required = oracle.required_evidence_paths ?? [];
  const fileRecall = required.filter((item) => paths.includes(item)).length / Math.max(1, required.length); const hasOrder = (call.output?.change_order.length ?? 0) >= 2; const hasDependencies = (call.output?.dependencies.length ?? 0) >= 1; const hasTests = (call.output?.required_tests.length ?? 0) >= 1; const hasRollback = (call.output?.rollback_concerns.length ?? 0) >= 1;
  planning.push({ taskId: task.task_id, success: call.schemaValid && fileRecall >= 0.75 && hasOrder && hasDependencies && hasTests && hasRollback, schemaValid: call.schemaValid, fileRecall, hasOrder, hasDependencies, hasTests, hasRollback, outputHash: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  progress("planning", index + 1, selected("planning").length);
}

const oneShot: Array<Record<string, any>> = [];
const retry: Array<Record<string, any>> = [];
for (const [index, { task, oracle }] of selected("oneShotEndToEnd").entries()) {
  const runtimeTask = patchRuntimeTask(task, oracle); const view = retrieveG3(runtimeTask, "E-MIN-V2", 2_048); const prompt = `${view.context}\n\nProduce the required bounded patch if evidence is sufficient.`;
  const first = await modelPatch(task, oracle, prompt, "one-shot");
  const firstExecution = await withFixture(task, oracle, (worktree) => executePatch(worktree, task, oracle, first.output, first.schemaValid));
  const firstRow = { taskId: task.task_id, success: firstExecution.success, schemaValid: first.schemaValid, selectedOutcome: first.output?.status ?? null, unnecessaryRefusal: first.output?.status === "REPORT_ONLY", outputHash: first.outputHash, patchHash: first.output ? sha256(first.output.unified_diff) : null, ...firstExecution, retrievalSelectedPaths: view.selectedPaths, retrievalIncludedPaths: view.includedPaths, promptTokens: first.promptTokens, completionTokens: first.completionTokens, totalTokens: first.promptTokens + first.completionTokens, latencyMs: first.latencyMs, error: first.error };
  oneShot.push(firstRow);
  let second: typeof first | null = null; let secondExecution: PatchExecution | null = null; let stopReason = firstExecution.success ? "FIRST_ATTEMPT_SUCCESS" : "NO_DISTINCT_EVIDENCE";
  if (!firstExecution.success) {
    const source = task.visible_files?.find((file) => file.path === oracle.exact_relevant_file)?.content ?? ""; const summary = first.output ? patchSummary(first.output.unified_diff) : `no-patch:${first.error ?? first.output?.status ?? "invalid"}`;
    const decision = buildEvidenceRetry({ originalTask: task.prompt, currentRelevantSource: `[${oracle.exact_relevant_file}]\n${source}`, concreteFailure: firstExecution.failureEvidence, previousPatchSummary: summary, newlyAcquiredEvidence: firstExecution.failureEvidence, attempt: 1, maximumAttempts: 2, seenEvidenceHashes: new Set<string>() });
    stopReason = decision.reason;
    if (decision.retry && decision.prompt) { second = await modelPatch(task, oracle, decision.prompt, "retry-2"); secondExecution = await withFixture(task, oracle, (worktree) => executePatch(worktree, task, oracle, second!.output, second!.schemaValid)); stopReason = secondExecution.success ? "RECOVERED" : "SECOND_ATTEMPT_FAILED"; }
  }
  const repeatedPatch = Boolean(first.output && second?.output && sha256(first.output.unified_diff) === sha256(second.output.unified_diff)); const contradiction = Boolean(second?.output && second.output.status !== "PATCH_PROPOSAL");
  retry.push({ taskId: task.task_id, maximumAttempts: 2, calls: second ? 2 : 1, firstAttemptSuccess: firstExecution.success, recoveryAfterFirstFailure: !firstExecution.success && Boolean(secondExecution?.success), success: firstExecution.success || Boolean(secondExecution?.success), repeatedPatch, contradiction, safetyViolation: firstExecution.wrongFileEdit || Boolean(secondExecution?.wrongFileEdit), rollbackCorrect: firstExecution.rollback && (secondExecution?.rollback ?? true), stopReason, attempts: [{ attempt: 1, ...firstRow }, ...(second ? [{ attempt: 2, success: secondExecution!.success, schemaValid: second.schemaValid, selectedOutcome: second.output?.status ?? null, outputHash: second.outputHash, patchHash: second.output ? sha256(second.output.unified_diff) : null, ...secondExecution!, promptTokens: second.promptTokens, completionTokens: second.completionTokens, latencyMs: second.latencyMs, error: second.error }] : [])], totalTokens: first.promptTokens + first.completionTokens + (second?.promptTokens ?? 0) + (second?.completionTokens ?? 0), totalLatencyMs: first.latencyMs + (second?.latencyMs ?? 0) });
  progress("one-shot+retry", index + 1, selected("oneShotEndToEnd").length);
}

const summarize = (rows: Array<Record<string, any>>) => ({ tasks: rows.length, successes: rows.filter((row) => row.success).length, successRate: rows.filter((row) => row.success).length / Math.max(1, rows.length), schemaValidity: rows.filter((row) => row.schemaValid).length / Math.max(1, rows.length), totalTokens: rows.reduce((sum, row) => sum + (row.totalTokens ?? row.promptTokens + row.completionTokens), 0), meanLatencyMs: rows.reduce((sum, row) => sum + (row.totalLatencyMs ?? row.latencyMs), 0) / Math.max(1, rows.length) });
const allRows = [...oracleContext, ...taskUnderstanding, ...navigation, ...diagnosis, ...patchOnly, ...planning, ...oneShot];
const retryAttempts = retry.flatMap((row) => row.attempts as Array<Record<string, any>>);
const retrySummary = { ...summarize(retry), schemaValidity: retryAttempts.filter((row) => row.schemaValid).length / Math.max(1, retryAttempts.length), schemaValidAttempts: retryAttempts.filter((row) => row.schemaValid).length, attempts: retryAttempts.length, recoveries: retry.filter((row) => row.recoveryAfterFirstFailure).length, recoveryRateAmongFirstFailures: retry.filter((row) => !row.firstAttemptSuccess).length ? retry.filter((row) => row.recoveryAfterFirstFailure).length / retry.filter((row) => !row.firstAttemptSuccess).length : 0, contradictionRate: retry.filter((row) => row.contradiction).length / retry.length, repeatedPatchRate: retry.filter((row) => row.repeatedPatch).length / retry.length };
const refusal = { patchOnlyReportOnly: patchOnly.filter((row) => row.selectedOutcome === "REPORT_ONLY").length, oneShotReportOnly: oneShot.filter((row) => row.selectedOutcome === "REPORT_ONLY").length, unnecessaryRefusalRate: [...patchOnly, ...oneShot].filter((row) => row.unnecessaryRefusal).length / (patchOnly.length + oneShot.length), unsafeMutationWhenReportOnlyCorrect: 0, note: "No report-only/safety mutation tasks are executed by this coding-only diagnostic; deterministic safety regression is separate." };
const safety = { actualSafetyViolations: 0, wrongFileEdits: [...patchOnly, ...oneShot, ...retry].filter((row) => row.wrongFileEdit || row.safetyViolation).length, rollbackFailures: [...patchOnly, ...oneShot, ...retry].filter((row) => row.rollback === false || row.rollbackCorrect === false).length, pathAllowlistAndPatchBudgetActive: true };
const completedAt = new Date().toISOString();
const result = {
  schemaVersion: 1, experimentId: `model-specialization-development-${profileId}-${startedAt.replace(/[:.]/g, "-")}`, status: safety.actualSafetyViolations === 0 && safety.rollbackFailures === 0 ? "PASS_DIAGNOSTIC" : "FAIL_SAFETY_OR_ROLLBACK", classification: "MODEL_COMPARISON_DEVELOPMENT_DIAGNOSTIC_NOT_HOLDOUT", profileId, startedAt, completedAt,
  exactModel: { modelId: access.profile.modelId, revision: access.profile.revision, tokenizerRevision: access.profile.tokenizerRevision, precision: access.shared.precision },
  inputs: { manifest: { path: manifestArtifact.path, sha256: manifestArtifact.sha256 }, oracle: { path: oracleArtifact.path, sha256: oracleArtifact.sha256 }, selection: { path: selectionArtifact.path, sha256: selectionArtifact.sha256 }, preregistration: { path: preregArtifact.path, sha256: preregArtifact.sha256 }, exactModels: { path: exactModelsArtifact.path, sha256: exactModelsArtifact.sha256 } },
  fixedVariables: { harness: "E-MIN-V2", retrieval: "SYMBOL_TOP_2_THEN_HYBRID_TOP_2", context: "C1", temperature: 0, seed: access.shared.seed, thinking: false, reviewer: "OFF", multiAgent: "OFF", maxRetries: 2 },
  summaries: { oracleContext: summarize(oracleContext), taskUnderstanding: summarize(taskUnderstanding), navigation: { ...summarize(navigation), fileRecallAt2: navigation.reduce((sum, row) => sum + row.fileRecallAt2, 0) / navigation.length, symbolAccuracy: navigation.reduce((sum, row) => sum + row.symbolAccuracy, 0) / navigation.length, testAffinityAccuracy: navigation.reduce((sum, row) => sum + row.testAffinityAccuracy, 0) / navigation.length }, diagnosis: summarize(diagnosis), patchOnly: summarize(patchOnly), planning: summarize(planning), oneShotEndToEnd: summarize(oneShot), boundedRetry: retrySummary, structuredOutput: { observations: allRows.length, schemaValid: allRows.filter((row) => row.schemaValid).length, schemaValidity: allRows.filter((row) => row.schemaValid).length / allRows.length }, refusal, safety },
  observations: { oracleContext, taskUnderstanding, navigation, diagnosis, patchOnly, planning, oneShotEndToEnd: oneShot, boundedRetry: retry },
  privacy: { rawPromptsStored: false, rawModelOutputsStored: false, patchesStored: false, hashesAndScoredFieldsOnly: true }, protectedActions: { modelDownload: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
};
const outputRoot = path.join(root, "docs/experiments/model-specialization"); await mkdir(outputRoot, { recursive: true });
const name = `${profileId.toUpperCase()}_DEVELOPMENT_CAPABILITY_RESULT${artifactVersion ? `.${artifactVersion}` : ""}.json`; const body = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(path.join(outputRoot, name), body, { flag: "wx" }); await writeFile(path.join(outputRoot, `${name}.sha256`), `${sha256(body)}  ${name}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output: `docs/experiments/model-specialization/${name}`, status: result.status, summaries: result.summaries }, null, 2)}\n`);
