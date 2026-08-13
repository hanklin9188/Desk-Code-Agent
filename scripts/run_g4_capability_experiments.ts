import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildG3Corpus, type G3RuntimeTask } from "../services/g3-benchmark-runtime/src/index";
import { retrieveG3 } from "../services/g3-evaluation-runtime/src/index";
import { G3LiveModel, readLocalModelAccess } from "../services/g3-live-runtime/src/index";
import { buildEvidenceRetry, extractPatchTargets, keywordCoverage, normalizeEvidencePath, patchSummary } from "../services/g4-diagnostic-runtime/src/index";
import { ConstrainedPatchRuntime, TrustedVerificationExecutor } from "../services/tool-runtime/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const benchmarkRoot = path.join(root, "benchmarks/g4-development");
const outputRoot = path.join(root, "docs/experiments/g4-capability");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const startedAt = new Date().toISOString();
const experimentId = `g4-capability-${startedAt.replace(/[:.]/g, "-")}`;

type Task = {
  task_id: string; repository_id: string; repository_commit: string; category: string; task_family: string; difficulty: string;
  prompt: string; expected_outcome: string; allowed_files?: string[]; visible_files?: Array<{ path: string; content: string }>;
  trusted_visible_command?: string[]; changed_line_budget?: number;
};
type Oracle = {
  task_id: string; required_evidence_paths?: string[]; expected_outcome?: string; expected_components?: string[];
  exact_relevant_file?: string; exact_relevant_symbol?: string; root_cause?: string; behavioral_requirement?: string;
  reference_fixed_source?: string; fixed_source_sha256?: string; hidden_files?: Array<{ path: string; content: string }>;
  trusted_hidden_command?: string[];
};
type Preregistration = { experimentTasks: Record<string, string[]>; conditions: Record<string, unknown>; eIterDevelopmentGate: Record<string, unknown> };

async function verifiedJson<T>(name: string): Promise<{ value: T; sha256: string; path: string }> {
  const target = path.join(benchmarkRoot, name);
  const bytes = await readFile(target);
  const expected = (await readFile(`${target}.sha256`, "utf8")).trim().split(/\s+/)[0];
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${name} checksum mismatch`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, sha256: actual, path: `benchmarks/g4-development/${name}` };
}
const manifestArtifact = await verifiedJson<{ tasks: Task[] }>("G4_DEVELOPMENT_MANIFEST.v2.json");
const oracleArtifact = await verifiedJson<{ rows: Oracle[] }>("G4_DEVELOPMENT_ORACLE.v2.sealed.json");
const preregArtifact = await verifiedJson<Preregistration>("G4_DEVELOPMENT_EXPERIMENT_PREREGISTRATION.v2.json");
const taskById = new Map(manifestArtifact.value.tasks.map((task) => [task.task_id, task]));
const oracleById = new Map(oracleArtifact.value.rows.map((oracle) => [oracle.task_id, oracle]));
const tasksFor = (key: string) => preregArtifact.value.experimentTasks[key].map((id) => {
  const task = taskById.get(id); const oracle = oracleById.get(id);
  if (!task || !oracle) throw new Error(`Missing preregistered task/oracle ${id}`);
  return { task, oracle };
});

const live = new G3LiveModel(await readLocalModelAccess(root));
const corpus = await buildG3Corpus(path.join(root, ".runtime/g3-repositories"));
const candidatesByRepository = new Map<string, G3RuntimeTask["candidates"]>();
for (const task of corpus.tasks) if (!candidatesByRepository.has(task.repository_id)) candidatesByRepository.set(task.repository_id, task.candidates);
const fixedVariables = { model: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", precision: "bfloat16", temperature: 0, seed: 20260809, thinking: false, semanticReviewer: "OFF", multiAgent: "OFF", rawModelOutputStored: false };

const analysisSchema = {
  type: "object", additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["ANSWER", "PATCH_PROPOSAL", "REPORT_ONLY", "BLOCKED_MISSING_ORACLE", "NEED_APPROVAL", "BLOCKED_SECURITY_POLICY"] },
    answer: { type: "string" }, evidence_paths: { type: "array", items: { type: "string" }, maxItems: 8 },
    target_paths: { type: "array", items: { type: "string" }, maxItems: 6 }, covered_dimensions: { type: "array", items: { type: "string" }, maxItems: 8 },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["status", "answer", "evidence_paths", "target_paths", "covered_dimensions", "confidence"]
};
type AnalysisResponse = { status: string; answer: string; evidence_paths: string[]; target_paths: string[]; covered_dimensions: string[]; confidence: number };
const patchSchema = {
  type: "object", additionalProperties: false,
  properties: { status: { type: "string", enum: ["PATCH_PROPOSAL", "BLOCKED_MISSING_ORACLE", "REPORT_ONLY"] }, unified_diff: { type: "string" }, summary: { type: "string" }, evidence_paths: { type: "array", items: { type: "string" }, maxItems: 6 }, target_paths: { type: "array", items: { type: "string" }, maxItems: 4 }, confidence: { type: "number", minimum: 0, maximum: 1 } },
  required: ["status", "unified_diff", "summary", "evidence_paths", "target_paths", "confidence"]
};
type PatchResponse = { status: string; unified_diff: string; summary: string; evidence_paths: string[]; target_paths: string[]; confidence: number };
const navigationSchema = {
  type: "object", additionalProperties: false,
  properties: { target_file: { type: "string" }, target_symbol: { type: "string" }, root_cause: { type: "string" }, evidence_paths: { type: "array", items: { type: "string" }, maxItems: 4 }, confidence: { type: "number", minimum: 0, maximum: 1 } },
  required: ["target_file", "target_symbol", "root_cause", "evidence_paths", "confidence"]
};
type NavigationResponse = { target_file: string; target_symbol: string; root_cause: string; evidence_paths: string[]; confidence: number };
const diagnosisSchema = {
  type: "object", additionalProperties: false,
  properties: { root_cause: { type: "string" }, ranked_hypotheses: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } }, evidence: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } }, confidence: { type: "number", minimum: 0, maximum: 1 } },
  required: ["root_cause", "ranked_hypotheses", "evidence", "confidence"]
};
type DiagnosisResponse = { root_cause: string; ranked_hypotheses: string[]; evidence: string[]; confidence: number };
const planningSchema = {
  type: "object", additionalProperties: false,
  properties: { affected_files: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, change_order: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, dependencies: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, required_tests: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, risks: { type: "array", maxItems: 6, items: { type: "string" } } },
  required: ["affected_files", "change_order", "dependencies", "required_tests", "risks"]
};
type PlanningResponse = { affected_files: string[]; change_order: string[]; dependencies: string[]; required_tests: string[]; risks: string[] };

function evidenceBlock(task: Task, oracle: Oracle): string {
  const candidates = candidatesByRepository.get(task.repository_id) ?? [];
  return (oracle.required_evidence_paths ?? []).map((required) => {
    const candidate = candidates.find((item) => item.path === required);
    return candidate ? `[${candidate.path}]\n${candidate.content.slice(0, 2_400)}` : `[${required}]\nNOT_AVAILABLE`;
  }).join("\n\n");
}
function normalContext(task: Task, oracle: Oracle): { context: string; paths: string[]; coverage: number } {
  const candidates = candidatesByRepository.get(task.repository_id) ?? [];
  const runtime = {
    task_id: task.task_id, repository_id: task.repository_id, repository_commit: task.repository_commit, split: "development", prompt: task.prompt,
    declared_symbols: [], provenance: "G4 development normal retrieval condition", category: task.category === "long_horizon_diagnosis" ? "diagnosis" : task.category === "ambiguous_task_location" ? "navigation" : task.category === "repository_onboarding" ? "understanding" : task.category === "open_ended_coding" ? "local_coding" : "review",
    difficulty: task.difficulty, expected_outcome: task.expected_outcome, required_evidence_paths: oracle.required_evidence_paths ?? [], target_paths: [], required_answer_terms: [], security_sensitive: false, hidden_oracle_kind: task.expected_outcome === "PATCH_PROPOSAL" ? "PATCH_SCOPE" : "PINNED_ARTIFACT", candidates
  } as G3RuntimeTask;
  const view = retrieveG3(runtime, "E-MIN-V2", 2_048);
  return { context: view.context, paths: view.includedPaths, coverage: view.coverageRatio };
}
const statusExpected = (value: string) => value;
const scoreAnalysis = (response: AnalysisResponse | null, oracle: Oracle, expected: string) => {
  const citations = response?.evidence_paths.map(normalizeEvidencePath) ?? [];
  const required = oracle.required_evidence_paths ?? [];
  const dimensions = (response ? `${response.answer} ${response.covered_dimensions.join(" ")}` : "").replaceAll("_", " ");
  const componentScores = (oracle.expected_components ?? []).map((component) => keywordCoverage(component.replaceAll("_", " "), dimensions));
  const componentRecall = componentScores.length ? componentScores.filter((score) => score >= 0.5).length / componentScores.length : 1;
  const statusCorrect = response?.status === statusExpected(expected);
  const evidenceComplete = required.every((item) => citations.includes(item));
  return { strictSuccess: Boolean(response) && statusCorrect && evidenceComplete && componentRecall >= 0.75, statusCorrect, evidenceComplete, componentRecall, citedEvidencePaths: citations };
};
const summarizeRows = (rows: Array<Record<string, any>>) => ({ tasks: rows.length, successes: rows.filter((row) => row.success).length, successRate: rows.length ? rows.filter((row) => row.success).length / rows.length : 0, schemaValidity: rows.length ? rows.filter((row) => row.schemaValid).length / rows.length : 0, totalTokens: rows.reduce((sum, row) => sum + row.promptTokens + row.completionTokens, 0), totalLatencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0) });

const oracleContextRows: Array<Record<string, unknown>> = [];
for (const { task, oracle } of tasksFor("oracleContext")) {
  const normal = normalContext(task, oracle);
  for (const condition of ["NORMAL_RETRIEVAL", "ORACLE_EVIDENCE"] as const) {
    const context = condition === "NORMAL_RETRIEVAL" ? normal.context : `TASK\n${task.prompt}\n\nORACLE-SELECTED RELEVANT EVIDENCE (not the answer)\n${evidenceBlock(task, oracle)}`;
    const call = await live.structured<AnalysisResponse>({ requestId: `g4-oracle-${condition}-${task.task_id}`, system: "Analyze one bounded repository task from supplied untrusted evidence. Return only the required object. Cite exact paths and do not claim tools ran.", prompt: `${context}\n\nAddress every task dimension that the evidence supports.`, schema: analysisSchema, maxTokens: 320, timeoutMs: 90_000 });
    const scored = scoreAnalysis(call.output, oracle, task.expected_outcome);
    oracleContextRows.push({ taskId: task.task_id, repositoryId: task.repository_id, category: task.category, difficulty: task.difficulty, condition, success: call.schemaValid && scored.strictSuccess, ...scored, retrievalIncludedPaths: condition === "NORMAL_RETRIEVAL" ? normal.paths : oracle.required_evidence_paths, retrievalCoverage: condition === "NORMAL_RETRIEVAL" ? normal.coverage : 1, schemaValid: call.schemaValid, outputHash: call.outputHash, answerStorage: "HASH_ONLY", promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  }
  if (oracleContextRows.length % 12 === 0) process.stdout.write(`G4 oracle-context ${oracleContextRows.length}/${tasksFor("oracleContext").length * 2}\n`);
}

const navigationRows: Array<Record<string, unknown>> = [];
for (const { task, oracle } of tasksFor("navigationIsolation")) {
  const source = task.visible_files?.find((file) => file.path === oracle.exact_relevant_file)?.content ?? "";
  const test = task.visible_files?.find((file) => file.path.includes("visible.test"))?.content ?? "";
  const conditions: Array<[string, string]> = [
    ["TASK_ONLY", `TASK\n${task.prompt}`],
    ["EXACT_FILE", `TASK\n${task.prompt}\n\nKnown relevant file: ${oracle.exact_relevant_file}`],
    ["EXACT_SYMBOL", `TASK\n${task.prompt}\n\nKnown relevant symbol: ${oracle.exact_relevant_symbol}`],
    ["ORACLE_SOURCE_AND_TEST_CONTEXT", `TASK\n${task.prompt}\n\n[${oracle.exact_relevant_file}]\n${source}\n\n[visible test]\n${test}`]
  ];
  for (const [condition, prompt] of conditions) {
    const call = await live.structured<NavigationResponse>({ requestId: `g4-nav-${condition}-${task.task_id}`, system: "Locate the action boundary and diagnose it from only the supplied untrusted evidence. Do not write a patch.", prompt, schema: navigationSchema, maxTokens: 220, timeoutMs: 90_000 });
    const response = call.output;
    const locationCorrect = normalizeEvidencePath(response?.target_file ?? "") === oracle.exact_relevant_file;
    const symbolCorrect = response?.target_symbol === oracle.exact_relevant_symbol;
    const rootCauseCoverage = keywordCoverage(oracle.root_cause ?? "", response?.root_cause ?? "");
    const rootCauseCorrect = rootCauseCoverage >= 0.45;
    navigationRows.push({ taskId: task.task_id, condition, success: call.schemaValid && locationCorrect && symbolCorrect && rootCauseCorrect, locationCorrect, symbolCorrect, rootCauseCorrect, rootCauseCoverage, citedEvidencePaths: response?.evidence_paths.map(normalizeEvidencePath) ?? [], schemaValid: call.schemaValid, outputHash: call.outputHash, responseStorage: "HASH_AND_SCORED_FIELDS_ONLY", promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
  }
  if (navigationRows.length % 12 === 0) process.stdout.write(`G4 navigation ${navigationRows.length}/${tasksFor("navigationIsolation").length * 4}\n`);
}

interface PatchExecution {
  success: boolean; patchApplied: boolean; syntax: string; visible: string; hidden: string; rollback: boolean; wrongFileEdit: boolean;
  changedLines: number; patchError: string | null; failureEvidence: string; failureEvidenceHash: string;
}
async function withFixture<T>(task: Task, oracle: Oracle, run: (worktree: string) => Promise<T>): Promise<T> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "dca-g4-dev-"));
  const repository = path.join(temporaryRoot, "repository");
  const worktree = path.join(temporaryRoot, "worktree");
  try {
    await mkdir(repository, { recursive: true });
    await execFileAsync("git", ["init", "--initial-branch=main", "--quiet"], { cwd: repository });
    for (const file of task.visible_files ?? []) { await mkdir(path.dirname(path.join(repository, file.path)), { recursive: true }); await writeFile(path.join(repository, file.path), file.content); }
    await execFileAsync("git", ["add", "."], { cwd: repository });
    await execFileAsync("git", ["-c", "user.name=Desk Code Agent Fixture", "-c", "user.email=fixture@invalid", "commit", "--quiet", "-m", "ephemeral G4 development fixture"], { cwd: repository });
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, "HEAD"], { cwd: repository });
    for (const file of oracle.hidden_files ?? []) { await mkdir(path.dirname(path.join(worktree, file.path)), { recursive: true }); await writeFile(path.join(worktree, file.path), file.content); }
    return await run(worktree);
  } finally {
    try { await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: repository }); } catch { /* temporary root cleanup is authoritative */ }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
async function executePatch(worktree: string, task: Task, oracle: Oracle, response: PatchResponse | null, schemaValid: boolean): Promise<PatchExecution> {
  const sourcePath = oracle.exact_relevant_file!;
  const beforeHash = sha256(await readFile(path.join(worktree, sourcePath)));
  let patchApplied = false; let syntax = "NOT_RUN"; let visible = "NOT_RUN"; let hidden = "NOT_RUN"; let rollback = true; let changedLines = 0; let patchError: string | null = null;
  const targets = response ? extractPatchTargets(response.unified_diff) : [];
  const wrongFileEdit = targets.some((target) => !task.allowed_files?.includes(target));
  let appliedFiles: string[] = [];
  try {
    if (!schemaValid || !response || response.status !== "PATCH_PROPOSAL") throw new Error(response?.status ?? "INVALID_MODEL_RESPONSE");
    const patcher = new ConstrainedPatchRuntime(worktree, { allowedFiles: task.allowed_files!, maxChangedLines: task.changed_line_budget ?? 20 });
    const applied = await patcher.apply(response.unified_diff);
    patchApplied = true; changedLines = applied.changedLines; appliedFiles = applied.files;
    const visibleCommand = task.trusted_visible_command!;
    const hiddenCommand = oracle.trusted_hidden_command!;
    const verifier = new TrustedVerificationExecutor(worktree, {
      syntax: { executable: process.execPath, args: ["--check", sourcePath], timeoutMs: 10_000, requiresHardNetworkIsolation: false },
      visible: { executable: visibleCommand[0], args: visibleCommand.slice(1), timeoutMs: 10_000, requiresHardNetworkIsolation: false },
      hidden: { executable: hiddenCommand[0], args: hiddenCommand.slice(1), timeoutMs: 10_000, requiresHardNetworkIsolation: false }
    }, { level: "PROCESS_CONSTRAINED", strategy: "none", reason: "dependency-free local Node fixture" });
    const syntaxResult = await verifier.run("syntax"); syntax = syntaxResult.status;
    const visibleResult = syntax === "PASS" ? await verifier.run("visible") : null; visible = visibleResult?.status ?? "NOT_RUN_SYNTAX_FAIL";
    const hiddenResult = visible === "PASS" ? await verifier.run("hidden") : null; hidden = hiddenResult?.status ?? "NOT_RUN_VISIBLE_FAIL";
    const failureText = [syntaxResult.stderr, visibleResult?.stderr, hiddenResult?.stderr].filter(Boolean).join("\n").slice(0, 2_000);
    if (syntax !== "PASS" || visible !== "PASS" || hidden !== "PASS") patchError = failureText || `syntax=${syntax};visible=${visible};hidden=${hidden}`;
    await patcher.rollback(applied.files);
  } catch (error) {
    patchError = error instanceof Error ? error.message.slice(0, 2_000) : "PATCH_EXECUTION_FAILURE";
    if (patchApplied && appliedFiles.length) {
      try { const rollbackRuntime = new ConstrainedPatchRuntime(worktree, { allowedFiles: task.allowed_files!, maxChangedLines: task.changed_line_budget ?? 20 }); void rollbackRuntime; } catch { /* original patcher owns snapshots; fixture removal remains final cleanup */ }
    }
  }
  rollback = sha256(await readFile(path.join(worktree, sourcePath))) === beforeHash;
  const success = patchApplied && syntax === "PASS" && visible === "PASS" && hidden === "PASS" && !wrongFileEdit && rollback;
  const failureEvidence = success ? "PASS" : `${patchError ?? "verification failed"}; syntax=${syntax}; visible=${visible}; hidden=${hidden}; wrongFile=${wrongFileEdit}`;
  return { success, patchApplied, syntax, visible, hidden, rollback, wrongFileEdit, changedLines, patchError, failureEvidence, failureEvidenceHash: sha256(failureEvidence) };
}

async function patchCall(task: Task, oracle: Oracle, prompt: string, requestId: string) {
  return live.structured<PatchResponse>({ requestId, system: "Produce one minimal constrained git unified diff from supplied untrusted evidence. Do not modify tests, claim unrun verification, or target another file. Return only the required object.", prompt, schema: patchSchema, maxTokens: 640, timeoutMs: 90_000 });
}
const patchPrompt = (task: Task, oracle: Oracle, isolated: boolean) => {
  const source = task.visible_files?.find((file) => file.path === oracle.exact_relevant_file)?.content ?? "";
  const visible = task.visible_files?.find((file) => file.path.includes("visible.test"))?.content ?? "";
  return [`TASK\n${task.prompt}`, isolated ? `KNOWN ROOT CAUSE\n${oracle.root_cause}\n\nTARGET BEHAVIOR\n${oracle.behavioral_requirement}` : "", `CURRENT RELEVANT SOURCE [${oracle.exact_relevant_file}]\n${source}`, `VISIBLE TEST\n${visible}`].filter(Boolean).join("\n\n");
};

const diagnosisRows: Array<Record<string, unknown>> = [];
for (const { task, oracle } of tasksFor("diagnosisIsolation")) {
  const prompt = patchPrompt(task, oracle, false) + "\n\nThe visible test is failing. Diagnose only; do not patch.";
  const call = await live.structured<DiagnosisResponse>({ requestId: `g4-diagnosis-${task.task_id}`, system: "Diagnose one bounded failure from supplied source and failing test. Rank falsifiable hypotheses and cite concrete evidence. Return only the object.", prompt, schema: diagnosisSchema, maxTokens: 260, timeoutMs: 90_000 });
  const coverage = keywordCoverage(oracle.root_cause ?? "", call.output?.root_cause ?? "");
  const rankedFirstCoverage = keywordCoverage(oracle.root_cause ?? "", call.output?.ranked_hypotheses?.[0] ?? "");
  const rootCauseCorrect = coverage >= 0.45 || rankedFirstCoverage >= 0.45;
  diagnosisRows.push({ taskId: task.task_id, success: call.schemaValid && rootCauseCorrect && Boolean(call.output?.evidence.length), rootCauseCorrect, rootCauseCoverage: coverage, rankedFirstCoverage, evidenceItems: call.output?.evidence.length ?? 0, schemaValid: call.schemaValid, outputHash: call.outputHash, responseStorage: "HASH_AND_SCORES_ONLY", promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
}

const patchGenerationRows: Array<Record<string, unknown>> = [];
for (const { task, oracle } of tasksFor("patchGenerationIsolation")) {
  const call = await patchCall(task, oracle, patchPrompt(task, oracle, true), `g4-patch-only-${task.task_id}`);
  const execution = await withFixture(task, oracle, (worktree) => executePatch(worktree, task, oracle, call.output, call.schemaValid));
  patchGenerationRows.push({ taskId: task.task_id, success: execution.success, schemaValid: call.schemaValid, selectedOutcome: call.output?.status ?? null, outputHash: call.outputHash, patchHash: call.output ? sha256(call.output.unified_diff) : null, responseStorage: "HASH_ONLY", ...execution, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
}

const planningRows: Array<Record<string, unknown>> = [];
for (const { task, oracle } of tasksFor("planningIsolation")) {
  const prompt = `TASK\n${task.prompt}\n\nCOMPLETE ORACLE-SELECTED EVIDENCE (not a solution)\n${evidenceBlock(task, oracle)}\n\nProduce only a structured implementation plan; do not patch.`;
  const call = await live.structured<PlanningResponse>({ requestId: `g4-planning-${task.task_id}`, system: "Plan a bounded cross-file change from supplied untrusted evidence. Identify affected files, order, dependencies, and verification. Return only the object.", prompt, schema: planningSchema, maxTokens: 320, timeoutMs: 90_000 });
  const expectedPaths = oracle.required_evidence_paths ?? [];
  const returnedPaths = [...(call.output?.affected_files ?? []), ...(call.output?.required_tests ?? []), ...(call.output?.dependencies ?? [])].map(normalizeEvidencePath);
  const fileRecall = expectedPaths.filter((item) => returnedPaths.includes(item)).length / Math.max(1, expectedPaths.length);
  const hasOrder = (call.output?.change_order.length ?? 0) >= 2;
  const hasTests = (call.output?.required_tests.length ?? 0) >= 1;
  const hasDependencies = (call.output?.dependencies.length ?? 0) >= 1;
  planningRows.push({ taskId: task.task_id, repositoryId: task.repository_id, success: call.schemaValid && fileRecall >= 0.75 && hasOrder && hasTests && hasDependencies, fileRecall, hasOrder, hasTests, hasDependencies, schemaValid: call.schemaValid, outputHash: call.outputHash, responseStorage: "HASH_AND_SCORES_ONLY", promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
}

async function runPatchSequence(task: Task, oracle: Oracle, maximumAttempts: number) {
  return withFixture(task, oracle, async (worktree) => {
    const attempts: Array<Record<string, any>> = [];
    const seenEvidenceHashes = new Set<string>();
    let prompt = patchPrompt(task, oracle, false);
    let stopReason = "ATTEMPT_BUDGET_EXHAUSTED";
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const call = await patchCall(task, oracle, prompt, `g4-retry-${maximumAttempts}-${attempt}-${task.task_id}`);
      const execution = await executePatch(worktree, task, oracle, call.output, call.schemaValid);
      const summary = call.output ? patchSummary(call.output.unified_diff) : `no-patch:${call.error ?? call.output?.status ?? "invalid"}`;
      attempts.push({ attempt, success: execution.success, schemaValid: call.schemaValid, selectedOutcome: call.output?.status ?? null, outputHash: call.outputHash, patchHash: call.output ? sha256(call.output.unified_diff) : null, patchSummaryHash: sha256(summary), ...execution, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, error: call.error });
      if (execution.success) { stopReason = "SUCCESS"; break; }
      const source = task.visible_files?.find((file) => file.path === oracle.exact_relevant_file)?.content ?? "";
      const decision = buildEvidenceRetry({ originalTask: task.prompt, currentRelevantSource: `[${oracle.exact_relevant_file}]\n${source}`, concreteFailure: execution.failureEvidence, previousPatchSummary: summary, newlyAcquiredEvidence: execution.failureEvidence, attempt, maximumAttempts, seenEvidenceHashes });
      stopReason = decision.reason;
      if (!decision.retry || !decision.prompt || !decision.evidenceHash) break;
      seenEvidenceHashes.add(decision.evidenceHash);
      prompt = decision.prompt;
    }
    const patchHashes = attempts.map((row) => row.patchHash).filter(Boolean);
    const repeatedPatch = new Set(patchHashes).size < patchHashes.length;
    const contradiction = attempts.slice(1).some((row) => row.selectedOutcome !== "PATCH_PROPOSAL" || row.wrongFileEdit);
    return { taskId: task.task_id, maximumAttempts, calls: attempts.length, success: attempts.some((row) => row.success), firstAttemptSuccess: Boolean(attempts[0]?.success), recoveryAfterFirstFailure: !attempts[0]?.success && attempts.some((row) => row.success), repeatedPatch, contradiction, safetyViolation: attempts.some((row) => row.wrongFileEdit), rollbackCorrect: attempts.every((row) => row.rollback), stopReason, totalTokens: attempts.reduce((sum, row) => sum + row.promptTokens + row.completionTokens, 0), totalLatencyMs: attempts.reduce((sum, row) => sum + row.latencyMs, 0), attempts };
  });
}
const retryRows: Array<Record<string, any>> = [];
for (const maximumAttempts of [1, 2, 3]) {
  for (const { task, oracle } of tasksFor("retryDepth")) {
    retryRows.push(await runPatchSequence(task, oracle, maximumAttempts));
    process.stdout.write(`G4 retry depth=${maximumAttempts} ${retryRows.filter((row) => row.maximumAttempts === maximumAttempts).length}/${tasksFor("retryDepth").length}\n`);
  }
}

// Validate every reference implementation against both visible and hidden behavior oracles after model calls are complete.
const referenceValidation = [];
for (const { task, oracle } of manifestArtifact.value.tasks.filter((task) => task.category === "behavioral_patch").map((task) => ({ task, oracle: oracleById.get(task.task_id)! }))) {
  const result = await withFixture(task, oracle, async (worktree) => {
    await writeFile(path.join(worktree, oracle.exact_relevant_file!), oracle.reference_fixed_source!);
    const visible = task.trusted_visible_command!; const hidden = oracle.trusted_hidden_command!;
    const verifier = new TrustedVerificationExecutor(worktree, {
      syntax: { executable: process.execPath, args: ["--check", oracle.exact_relevant_file!], timeoutMs: 10_000, requiresHardNetworkIsolation: false },
      visible: { executable: visible[0], args: visible.slice(1), timeoutMs: 10_000, requiresHardNetworkIsolation: false },
      hidden: { executable: hidden[0], args: hidden.slice(1), timeoutMs: 10_000, requiresHardNetworkIsolation: false }
    }, { level: "PROCESS_CONSTRAINED", strategy: "none" });
    return { syntax: (await verifier.run("syntax")).status, visible: (await verifier.run("visible")).status, hidden: (await verifier.run("hidden")).status, fixedSourceHashCorrect: sha256(await readFile(path.join(worktree, oracle.exact_relevant_file!))) === oracle.fixed_source_sha256 };
  });
  referenceValidation.push({ taskId: task.task_id, ...result, success: result.syntax === "PASS" && result.visible === "PASS" && result.hidden === "PASS" && result.fixedSourceHashCorrect });
}
if (!referenceValidation.every((row) => row.success)) throw new Error(`G4 patch oracle reference validation failed: ${referenceValidation.filter((row) => !row.success).map((row) => row.taskId).join(",")}`);

const byCondition = (rows: Array<Record<string, any>>, field = "condition") => Object.fromEntries([...new Set(rows.map((row) => String(row[field])))].map((condition) => [condition, summarizeRows(rows.filter((row) => row[field] === condition))]));
const retrySummaries = Object.fromEntries([1, 2, 3].map((depth) => {
  const rows = retryRows.filter((row) => row.maximumAttempts === depth);
  return [String(depth), { tasks: rows.length, successes: rows.filter((row) => row.success).length, successRate: rows.filter((row) => row.success).length / rows.length, recoveries: rows.filter((row) => row.recoveryAfterFirstFailure).length, recoveryRateAmongFirstFailures: rows.filter((row) => !row.firstAttemptSuccess).length ? rows.filter((row) => row.recoveryAfterFirstFailure).length / rows.filter((row) => !row.firstAttemptSuccess).length : 0, repeatedPatchRate: rows.filter((row) => row.repeatedPatch).length / rows.length, contradictionRate: rows.filter((row) => row.contradiction).length / rows.length, safetyViolations: rows.filter((row) => row.safetyViolation).length, rollbackPassRate: rows.filter((row) => row.rollbackCorrect).length / rows.length, meanTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0) / rows.length, meanLatencyMs: rows.reduce((sum, row) => sum + row.totalLatencyMs, 0) / rows.length, meanCalls: rows.reduce((sum, row) => sum + row.calls, 0) / rows.length }];
}));
const one = retrySummaries["1"] as any; const two = retrySummaries["2"] as any; const three = retrySummaries["3"] as any;
const eIterGate = {
  improvement2Vs1Pp: (two.successRate - one.successRate) * 100,
  recovery2: two.recoveryRateAmongFirstFailures,
  repeated2: two.repeatedPatchRate,
  contradiction2: two.contradictionRate,
  safety2: two.safetyViolations,
  tokenRatio2Vs1: two.meanTokens / Math.max(1, one.meanTokens),
  improvement3Vs2Pp: (three.successRate - two.successRate) * 100,
  passed: (two.successRate - one.successRate) >= 0.10 && two.recoveryRateAmongFirstFailures >= 0.15 && two.repeatedPatchRate <= 0.10 && two.contradictionRate <= 0.05 && two.safetyViolations === 0 && two.meanTokens <= one.meanTokens * 2.2,
  thirdCallJustified: (three.successRate - two.successRate) >= 0.05 && three.safetyViolations === 0
};

await mkdir(outputRoot, { recursive: true });
async function writeArtifact(name: string, value: object) {
  const body = `${JSON.stringify(value, null, 2)}\n`; const target = path.join(outputRoot, name);
  await writeFile(target, body, { flag: "wx" }); await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
  return { path: `docs/experiments/g4-capability/${name}`, sha256: sha256(body) };
}
const common = { schemaVersion: 1, experimentId, classification: "G4_DEVELOPMENT_DIAGNOSTIC_NOT_HOLDOUT", startedAt, completedAt: new Date().toISOString(), inputs: { manifest: { path: manifestArtifact.path, sha256: manifestArtifact.sha256 }, oracle: { path: oracleArtifact.path, sha256: oracleArtifact.sha256 }, preregistration: { path: preregArtifact.path, sha256: preregArtifact.sha256 } }, fixedVariables, protectedActions: { persistentCommit: false, remote: false, push: false, pullRequest: false, tag: false, release: false, signing: false, modelDownload: false }, privacy: { rawPromptsStored: false, rawModelOutputsStored: false, hashesAndScoredFieldsOnly: true } };
const artifacts = [];
artifacts.push(await writeArtifact("ORACLE_CONTEXT_EXPERIMENT.json", { ...common, status: "PASS", conditions: byCondition(oracleContextRows as any), byCategory: Object.fromEntries([...new Set(oracleContextRows.map((row) => String(row.category)))].map((category) => [category, byCondition(oracleContextRows.filter((row) => row.category === category) as any)])), observations: oracleContextRows }));
artifacts.push(await writeArtifact("NAVIGATION_ISOLATION_EXPERIMENT.json", { ...common, status: "PASS", conditions: byCondition(navigationRows as any), observations: navigationRows }));
artifacts.push(await writeArtifact("DIAGNOSIS_ISOLATION_EXPERIMENT.json", { ...common, status: "PASS", summary: summarizeRows(diagnosisRows as any), observations: diagnosisRows }));
artifacts.push(await writeArtifact("PATCH_GENERATION_ISOLATION_EXPERIMENT.json", { ...common, status: patchGenerationRows.every((row) => row.rollback) ? "PASS" : "FAIL_ROLLBACK", summary: summarizeRows(patchGenerationRows as any), referenceOracleValidation: { tasks: referenceValidation.length, passes: referenceValidation.filter((row) => row.success).length, rows: referenceValidation }, observations: patchGenerationRows }));
artifacts.push(await writeArtifact("PLANNING_ISOLATION_EXPERIMENT.json", { ...common, status: "PASS", summary: summarizeRows(planningRows as any), observations: planningRows }));
artifacts.push(await writeArtifact("RETRY_DEPTH_ABLATION.json", { ...common, status: retryRows.every((row) => row.rollbackCorrect) ? "PASS" : "FAIL_ROLLBACK", preregisteredGate: preregArtifact.value.eIterDevelopmentGate, summaries: retrySummaries, eIterGate, observations: retryRows }));
const index = await writeArtifact("G4_CAPABILITY_EXPERIMENT_INDEX.json", { ...common, status: "PASS", artifacts, summaries: { oracleContext: byCondition(oracleContextRows as any), navigation: byCondition(navigationRows as any), diagnosis: summarizeRows(diagnosisRows as any), patchGeneration: summarizeRows(patchGenerationRows as any), planning: summarizeRows(planningRows as any), retryDepth: retrySummaries }, eIterGate });
process.stdout.write(`${JSON.stringify({ status: "PASS", outputRoot: path.relative(root, outputRoot), index, summaries: { oracleContext: byCondition(oracleContextRows as any), navigation: byCondition(navigationRows as any), diagnosis: summarizeRows(diagnosisRows as any), patchGeneration: summarizeRows(patchGenerationRows as any), planning: summarizeRows(planningRows as any), retryDepth: retrySummaries }, eIterGate }, null, 2)}\n`);
