import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { retrieveG3 } from "../services/g3-evaluation-runtime/src/index";
import type { G3RuntimeTask } from "../services/g3-benchmark-runtime/src/index";
import {
  inspectSnapshot,
  parseProfileId,
  readModelSpecializationRegistry,
  readProfileModelAccess,
  SpecializationLiveModel,
  type ModelSpecializationProfileId
} from "../services/model-specialization-runtime/src/index";
import { normalizePatchInterfaceOutput, validateCanonicalDiffPolicy, type PatchInterfacePolicy } from "../services/patch-interface-runtime/src/index";
import { ConstrainedPatchRuntime, TrustedVerificationExecutor, detectSandboxCapabilities, type SandboxCapabilities } from "../services/tool-runtime/src/index";
import { assertExactInstalledModelRuntime, probeInstalledModelRuntime, verifyServingLaunchAndMarkReady } from "./model_serving_attestation";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const posix = (value: string) => value.split(path.sep).join("/");
const profileId = parseProfileId(process.argv.find((value) => value.startsWith("--profile="))?.slice(10));
const runDirectoryArg = process.argv.find((value) => value.startsWith("--run-directory="))?.slice(16);
const preregRelative = "benchmarks/patch-interface/E_EDIT_NORMAL_RETRIEVAL_PREREGISTRATION.v1.json";
const manifestRelative = "benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_MANIFEST.v1.json";
const oracleRelative = "benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_ORACLE.v1.sealed.json";
const exactModelsRelative = "benchmarks/model-specialization/EXACT_MODEL_MANIFESTS.json";
const expectedCalls = 50;

type SourceFile = { path: string; content: string };
type Task = {
  task_id: string; repository_id?: string; repository_commit?: string; prompt: string; allowed_files: string[];
  visible_files: SourceFile[]; trusted_visible_command: string[]; changed_line_budget: number;
  mutation_certification: string;
};
type Oracle = {
  task_id: string; exact_relevant_file: string; exact_relevant_symbol: string;
  exact_relevant_range_1_based: { start_line: number; end_line: number; semantics: string };
  behavioral_requirement: string; root_cause: string; original_source_sha256: string; reference_fixed_source: string;
  hidden_files: SourceFile[]; trusted_hidden_command: string[];
};
type Ref = { path: string; sha256: string };
type Prereg = {
  schemaVersion: number; preregistrationId: string; state: string; modelCallsAtSeal: number;
  candidate: { path: string; sha256: string; interfaceId: string; systemPrompt: string; schema: object; promptTemplate: string };
  immutableInputs: Record<string, Ref>; sourceClosure: Record<string, string>;
  models: Array<{ profileId: string; modelId: string; revision: string; precision: string }>;
  taskIds: string[]; taskIdsSha256: string;
  requestIntents: { byProfileSha256: Record<ModelSpecializationProfileId, string>; combinedSha256: string; countPerProfile: number; total: number };
  evaluation: { retrieval: string; contextBudget: number; callsPerProfile: number; oneShot: boolean; retries: number; maxTokens: number; timeoutMs: number };
};
type Verified<T> = { value: T; path: string; sha256: string };

async function verifiedJson<T>(relative: string): Promise<Verified<T>> {
  const target = path.join(root, relative);
  const metadata = await lstat(target);
  const sidecarMetadata = await lstat(`${target}.sha256`);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !sidecarMetadata.isFile() || sidecarMetadata.isSymbolicLink()) throw new Error(`Unsafe immutable input ${relative}`);
  const bytes = await readFile(target);
  const digest = sha256(bytes);
  const sidecar = await readFile(`${target}.sha256`, "utf8");
  if (sidecar !== `${digest}  ${path.basename(relative)}\n`) throw new Error(`Checksum mismatch ${relative}`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: digest };
}

async function persistImmutable(relative: string, value: unknown): Promise<Ref> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const digest = sha256(body);
  for (const [file, contents] of [[target, body], [`${target}.sha256`, `${digest}  ${path.basename(target)}\n`]] as const) {
    try {
      const handle = await open(file, "wx", 0o600);
      try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const metadata = await lstat(file);
      if (!metadata.isFile() || metadata.isSymbolicLink() || await readFile(file, "utf8") !== contents) throw new Error(`Immutable collision ${relative}`);
    }
  }
  return { path: relative, sha256: digest };
}

async function appendDurable(target: string, value: unknown): Promise<void> {
  const handle = await open(target, "a", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync(); } finally { await handle.close(); }
}

function sourceFor(task: Task, oracle: Oracle): SourceFile {
  const source = task.visible_files.find((file) => file.path === oracle.exact_relevant_file);
  if (!source || sha256(source.content) !== oracle.original_source_sha256) throw new Error(`Source binding mismatch ${task.task_id}`);
  return source;
}

function visibleTestFor(task: Task): SourceFile {
  const test = task.visible_files.find((file) => file.path.includes("visible.test"));
  if (!test) throw new Error(`Visible test missing ${task.task_id}`);
  return test;
}

function runtimeTask(task: Task, oracle: Oracle): G3RuntimeTask {
  return {
    task_id: task.task_id,
    repository_id: task.repository_id ?? `patch-interface-${task.task_id}`,
    repository_commit: task.repository_commit ?? "SEALED_FIXTURE",
    split: "development",
    prompt: task.prompt,
    declared_symbols: [],
    provenance: "PATCH_INTERFACE_DEVELOPMENT_NORMAL_RETRIEVAL",
    category: "local_coding",
    difficulty: "L3",
    expected_outcome: "PATCH_PROPOSAL",
    required_evidence_paths: [oracle.exact_relevant_file, visibleTestFor(task).path],
    target_paths: [oracle.exact_relevant_file],
    required_answer_terms: [],
    security_sensitive: false,
    hidden_oracle_kind: "PATCH_SCOPE",
    candidates: task.visible_files.map((file, index) => ({
      id: `${task.task_id}-${index}`,
      path: file.path,
      content: file.content,
      evidenceClass: file.path.includes("test") ? "TEST" : "SYMBOL",
      role: file.path.includes("test") ? "test" : "source",
      symbols: file.path === oracle.exact_relevant_file ? [oracle.exact_relevant_symbol] : []
    }))
  };
}

function renderPrompt(prereg: Prereg, task: Task, oracle: Oracle): { prompt: string; retrieval: ReturnType<typeof retrieveG3> } {
  const retrievalTask = runtimeTask(task, oracle);
  const retrieval = retrieveG3(retrievalTask, "E-MIN-V2", prereg.evaluation.contextBudget);
  const replacements: Record<string, string> = {
    retrieval_context: retrieval.context,
    allowed_file: oracle.exact_relevant_file,
    start_line: String(oracle.exact_relevant_range_1_based.start_line),
    end_line: String(oracle.exact_relevant_range_1_based.end_line)
  };
  const template = prereg.candidate.promptTemplate;
  const tokens = template.match(/\{[a-z0-9_]+\}/g) ?? [];
  if (tokens.length !== 4 || new Set(tokens).size !== 4 || tokens.some((token) => !Object.hasOwn(replacements, token.slice(1, -1)))) throw new Error("E-EDIT prompt template contract mismatch");
  const prompt = template.replace(/\{([a-z0-9_]+)\}/g, (_token, name: string) => replacements[name]);
  if (prompt.includes(oracle.root_cause) || prompt.includes(oracle.reference_fixed_source) || oracle.hidden_files.some((file) => prompt.includes(file.content))) throw new Error(`Oracle leakage ${task.task_id}`);
  return { prompt, retrieval };
}

function requestIntent(prereg: Prereg, task: Task, oracle: Oracle, selectedProfile: ModelSpecializationProfileId): string {
  const { prompt, retrieval } = renderPrompt(prereg, task, oracle);
  return [
    `e-edit-normal-${selectedProfile}-${task.task_id}`,
    selectedProfile,
    task.task_id,
    sha256(prereg.candidate.systemPrompt),
    sha256(JSON.stringify(prereg.candidate.schema)),
    sha256(prompt),
    sha256(JSON.stringify({ selectedPaths: retrieval.selectedPaths, includedPaths: retrieval.includedPaths, omittedPaths: retrieval.omittedPaths, context: retrieval.context }))
  ].join("\0");
}

type Execution = {
  patchApplied: boolean; syntax: string; visible: string; hidden: string; rollback: string; cleanup: string;
  actualSafetyViolation: boolean; errorCode: string | null; errorSha256: string | null;
};

async function executeDiff(task: Task, oracle: Oracle, diff: string, sandbox: SandboxCapabilities): Promise<Execution> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `dca-patch-interface-e-edit-${profileId}-`));
  const source = sourceFor(task, oracle);
  let patcher: ConstrainedPatchRuntime | null = null;
  let files: string[] = [];
  let result: Execution = { patchApplied: false, syntax: "NOT_RUN", visible: "NOT_RUN", hidden: "NOT_RUN", rollback: "PASS", cleanup: "PASS", actualSafetyViolation: false, errorCode: null, errorSha256: null };
  try {
    await execFileAsync("git", ["init", "--initial-branch=main", "--quiet"], { cwd: temporaryRoot, timeout: 10_000 });
    for (const file of [...task.visible_files, ...oracle.hidden_files]) {
      const target = path.join(temporaryRoot, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, { flag: "wx" });
    }
    patcher = new ConstrainedPatchRuntime(temporaryRoot, { allowedFiles: task.allowed_files, maxChangedLines: task.changed_line_budget });
    const applied = await patcher.apply(diff);
    files = applied.files;
    result.patchApplied = true;
    const readOnly = `--allow-fs-read=${temporaryRoot}`;
    const visiblePath = visibleTestFor(task).path;
    const hiddenPath = oracle.hidden_files.find((file) => file.path.includes("hidden.test"))?.path;
    if (!hiddenPath) throw new Error("Hidden test path missing");
    const verifier = new TrustedVerificationExecutor(temporaryRoot, {
      syntax: { executable: process.execPath, args: ["--permission", readOnly, "--check", source.path], timeoutMs: 10_000, requiresHardNetworkIsolation: true, maxOutputBytes: 256_000 },
      visible: { executable: process.execPath, args: ["--permission", readOnly, "--test-isolation=none", "--test", visiblePath], timeoutMs: 10_000, requiresHardNetworkIsolation: true, maxOutputBytes: 256_000 },
      hidden: { executable: process.execPath, args: ["--permission", readOnly, "--test-isolation=none", "--test", hiddenPath], timeoutMs: 10_000, requiresHardNetworkIsolation: true, maxOutputBytes: 256_000 }
    }, sandbox);
    result.syntax = (await verifier.run("syntax")).status;
    if (result.syntax === "PASS") {
      result.visible = (await verifier.run("visible")).status;
      result.hidden = (await verifier.run("hidden")).status;
    }
  } catch (error) {
    result.errorCode = result.patchApplied ? "VERIFICATION_FAILED" : "PATCH_APPLY_FAILED";
    result.errorSha256 = sha256(error instanceof Error ? error.message : "EXECUTION_FAILURE");
  } finally {
    if (patcher && files.length) {
      try { await patcher.rollback(files); }
      catch (error) { result.rollback = "FAIL"; result.actualSafetyViolation = true; result.errorSha256 ??= sha256(error instanceof Error ? error.message : "ROLLBACK_FAILURE"); }
    }
    try { if (sha256(await readFile(path.join(temporaryRoot, source.path))) !== oracle.original_source_sha256) { result.rollback = "FAIL"; result.actualSafetyViolation = true; } }
    catch { result.rollback = "FAIL"; result.actualSafetyViolation = true; }
    await rm(temporaryRoot, { recursive: true, force: true });
    try { await lstat(temporaryRoot); result.cleanup = "FAIL"; result.actualSafetyViolation = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") { result.cleanup = "FAIL"; result.actualSafetyViolation = true; } }
  }
  return result;
}

async function verifySourceClosure(prereg: Prereg): Promise<void> {
  for (const [relative, expected] of Object.entries(prereg.sourceClosure)) {
    if (sha256(await readFile(path.join(root, relative))) !== expected) throw new Error(`Secondary source closure drift: ${relative}`);
  }
}

async function main(): Promise<void> {
  if (!runDirectoryArg || path.isAbsolute(runDirectoryArg) || !/^docs\/experiments\/runs\/e-edit-normal-(baseline|coder)-[A-Za-z0-9TZ-]+$/.test(runDirectoryArg)) throw new Error("Invalid --run-directory");
  const [prereg, manifest, oracleArtifact, exactModels] = await Promise.all([
    verifiedJson<Prereg>(preregRelative),
    verifiedJson<{ tasks: Task[] }>(manifestRelative),
    verifiedJson<{ rows: Oracle[] }>(oracleRelative),
    verifiedJson<any>(exactModelsRelative)
  ]);
  if (prereg.value.preregistrationId !== "dca-e-edit-normal-retrieval-development-v1" || prereg.value.state !== "SEALED_BEFORE_FIRST_SECONDARY_MODEL_CALL" || prereg.value.modelCallsAtSeal !== 0 || prereg.value.candidate.interfaceId !== "P2_MINIMAL" || prereg.value.evaluation.retrieval !== "E-MIN-V2" || prereg.value.evaluation.callsPerProfile !== expectedCalls || !prereg.value.evaluation.oneShot || prereg.value.evaluation.retries !== 0) throw new Error("Secondary preregistration contract mismatch");
  await verifySourceClosure(prereg.value);
  const tasks = prereg.value.taskIds.map((id) => manifest.value.tasks.find((task) => task.task_id === id)!).filter(Boolean);
  const oracleById = new Map(oracleArtifact.value.rows.map((row) => [row.task_id, row]));
  if (tasks.length !== expectedCalls || sha256(prereg.value.taskIds.join("\n")) !== prereg.value.taskIdsSha256) throw new Error("Secondary task schedule mismatch");
  const intents = tasks.map((task) => requestIntent(prereg.value, task, oracleById.get(task.task_id)!, profileId));
  if (sha256(intents.join("\n")) !== prereg.value.requestIntents.byProfileSha256[profileId]) throw new Error("Secondary request intents differ from preregistration");
  const registry = await readModelSpecializationRegistry(root);
  const selected = registry.profiles[profileId];
  const sealed = prereg.value.models.find((model) => model.profileId === profileId);
  if (!sealed || sealed.modelId !== selected.modelId || sealed.revision !== selected.revision || sealed.precision !== registry.sharedServing.precision) throw new Error("Exact model differs from secondary preregistration");
  const snapshot = await inspectSnapshot(root, profileId, selected, exactModels.value.models[profileId].snapshotFiles);
  if (snapshot.status !== "PASS") throw new Error("Exact snapshot verification failed");
  const sandbox = await detectSandboxCapabilities();
  if (sandbox.level !== "HARD_ISOLATION" || sandbox.strategy !== "unshare_user_network_pid") throw new Error("Hard sandbox unavailable");
  if ((await readdir(os.tmpdir())).some((name) => name.startsWith("dca-patch-interface-"))) throw new Error("Stale patch fixture exists");

  const runDirectory = path.join(root, runDirectoryArg);
  try { await mkdir(runDirectory, { recursive: false }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const metadata = await lstat(runDirectory);
  const canonical = await realpath(runDirectory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !canonical.startsWith(`${await realpath(root)}${path.sep}`)) throw new Error("Unsafe run directory");
  const checkpoint = path.join(runDirectory, "observations.checkpoint.jsonl");
  const events = path.join(runDirectory, "call-events.jsonl");
  for (const file of [checkpoint, events]) {
    try { const m = await lstat(file); if (!m.isFile() || m.isSymbolicLink()) throw new Error("Unsafe ledger"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") await writeFile(file, "", { flag: "wx", mode: 0o600 }); else throw error; }
  }
  const existingCheckpoint = (await readFile(checkpoint, "utf8")).trim();
  const existingEvents = (await readFile(events, "utf8")).trim();
  if (existingCheckpoint || existingEvents) throw new Error("Secondary runs are fresh-only; nonempty ledger requires explicit append-only supersession");

  const access = await readProfileModelAccess(root, profileId);
  const installed = await probeInstalledModelRuntime(root);
  const serving = await verifyServingLaunchAndMarkReady(root, profileId, prereg.sha256, installed);
  const live = new SpecializationLiveModel({ endpoint: access.endpoint, apiKey: access.apiKey, model: access.model, seed: access.shared.seed });
  const observations: Array<Record<string, unknown>> = [];
  for (const [index, task] of tasks.entries()) {
    const oracle = oracleById.get(task.task_id)!;
    const { prompt, retrieval } = renderPrompt(prereg.value, task, oracle);
    const observationId = `e-edit-normal-${profileId}-${task.task_id}`;
    const start = { event: "CALL_STARTED", observationId, index, requestIntentSha256: sha256(intents[index]), startedAt: new Date().toISOString() };
    await appendDurable(events, start);
    const call = await live.structured<unknown>({ requestId: observationId, system: prereg.value.candidate.systemPrompt, prompt, schema: prereg.value.candidate.schema, maxTokens: prereg.value.evaluation.maxTokens, timeoutMs: prereg.value.evaluation.timeoutMs });
    const source = sourceFor(task, oracle);
    const policy: PatchInterfacePolicy = {
      allowedFiles: task.allowed_files,
      allowedRanges: { [oracle.exact_relevant_file]: [{ startLine: oracle.exact_relevant_range_1_based.start_line, endLine: oracle.exact_relevant_range_1_based.end_line }] },
      expectedSourceSha256: { [oracle.exact_relevant_file]: oracle.original_source_sha256 },
      maxChangedFiles: 1,
      maxChangedLines: task.changed_line_budget
    };
    const normalization = call.schemaValid
      ? normalizePatchInterfaceOutput({ interfaceId: "P2", rawOutput: call.rawText ?? JSON.stringify(call.output), sources: { [source.path]: source.content }, policy })
      : null;
    const canonicalPolicy = normalization?.canonicalDiff ? validateCanonicalDiffPolicy(normalization.canonicalDiff, { [source.path]: source.content }, policy) : null;
    const rawFileTargets = [...(call.rawText?.matchAll(/\"file\"\s*:\s*\"([^\"]{1,240})\"/g) ?? [])].map((match) => match[1]);
    const wrongFileAttempt = rawFileTargets.some((target) => !task.allowed_files.includes(target));
    const execution = normalization?.classification === "VALID_EDIT" && normalization.canonicalDiff && canonicalPolicy?.valid
      ? await executeDiff(task, oracle, normalization.canonicalDiff, sandbox)
      : { patchApplied: false, syntax: "NOT_RUN", visible: "NOT_RUN", hidden: "NOT_RUN", rollback: "PASS", cleanup: "PASS", actualSafetyViolation: false, errorCode: "NORMALIZATION_REJECTED", errorSha256: null };
    const behavioralSuccess = execution.patchApplied && execution.syntax === "PASS" && execution.visible === "PASS" && execution.hidden === "PASS" && execution.rollback === "PASS" && execution.cleanup === "PASS" && !wrongFileAttempt && !execution.actualSafetyViolation;
    const row = {
      schemaVersion: 1, observationId, index, profileId, taskId: task.task_id,
      retrieval: { configuration: retrieval.configuration, contextVariant: retrieval.contextVariant, selectedPathHashes: retrieval.selectedPaths.map(sha256), includedPathHashes: retrieval.includedPaths.map(sha256), omittedPathHashes: retrieval.omittedPaths.map(sha256), exactSourceSelected: retrieval.selectedPaths.includes(oracle.exact_relevant_file), exactSourceIncluded: retrieval.includedPaths.includes(oracle.exact_relevant_file), visibleTestSelected: retrieval.selectedPaths.includes(visibleTestFor(task).path), estimatedContextTokens: retrieval.estimatedContextTokens, retrievalLatencyMs: retrieval.retrievalLatencyMs, contextSha256: sha256(retrieval.context) },
      modelCall: { calls: 1, requestIntentSha256: sha256(intents[index]), promptSha256: sha256(prompt), systemSha256: sha256(prereg.value.candidate.systemPrompt), schemaSha256: sha256(JSON.stringify(prereg.value.candidate.schema)), outputSha256: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, finishReason: call.finishReason, errorCode: call.error, rawPromptStored: false, rawOutputStored: false },
      normalization: normalization ? { classification: normalization.classification, stages: normalization.stages, canonicalDiffSha256: normalization.canonicalDiff ? sha256(normalization.canonicalDiff) : null, changedFiles: normalization.changedFiles, changedLines: normalization.changedLines, targetsSha256: normalization.targets.map(sha256), rawActionStored: false, replacementStored: false, diffStored: false } : { classification: "MALFORMED_SCHEMA", stages: null, canonicalDiffSha256: null, changedFiles: 0, changedLines: 0, targetsSha256: [], rawActionStored: false, replacementStored: false, diffStored: false },
      execution,
      outcome: { behavioralSuccess, hiddenSuccess: execution.hidden === "PASS", wrongFileAttempt, actualSafetyViolation: execution.actualSafetyViolation, firstFailureStage: !call.schemaValid ? "schema" : normalization?.classification !== "VALID_EDIT" ? "action_validation" : !execution.patchApplied ? "patch_apply" : execution.syntax !== "PASS" ? "syntax" : execution.visible !== "PASS" ? "visible" : execution.hidden !== "PASS" ? "hidden" : execution.actualSafetyViolation ? "safety" : "COMPLETE" },
      privacy: { oracleRootCauseStored: false, referenceFixStored: false, hiddenSourceStored: false, rawPromptStored: false, rawOutputStored: false }
    };
    const serialized = JSON.stringify(row);
    if (serialized.includes(access.apiKey) || serialized.includes(oracle.reference_fixed_source) || serialized.includes(oracle.root_cause)) throw new Error("Secondary privacy guard rejected persisted row");
    await appendDurable(checkpoint, row);
    observations.push(row);
    await appendDurable(events, { event: "CALL_COMPLETED", observationId, index, outputSha256: call.outputHash, observationSha256: sha256(serialized), completedAt: new Date().toISOString() });
    if ((index + 1) % 5 === 0) process.stdout.write(`${profileId} e-edit-normal ${index + 1}/${tasks.length}\n`);
  }

  const finalAccess = await readProfileModelAccess(root, profileId);
  const finalInstalled = await probeInstalledModelRuntime(root);
  assertExactInstalledModelRuntime(finalInstalled, installed, "secondary final installed runtime");
  const finalServing = await verifyServingLaunchAndMarkReady(root, profileId, prereg.sha256, finalInstalled);
  if (sha256(finalAccess.apiKey) !== sha256(access.apiKey) || finalServing.launch.sha256 !== serving.launch.sha256 || finalServing.ready.sha256 !== serving.ready.sha256) throw new Error("Secondary serving identity drift");
  await verifySourceClosure(prereg.value);
  const successes = observations.filter((row) => (row.outcome as any).behavioralSuccess).length;
  const safety = observations.filter((row) => (row.outcome as any).actualSafetyViolation).length;
  const wrongFile = observations.filter((row) => (row.outcome as any).wrongFileAttempt).length;
  const result = {
    schemaVersion: 1, experimentId: `dca-e-edit-normal-retrieval-${profileId}-v1`, status: safety === 0 ? "COMPLETE_DEVELOPMENT_DIAGNOSTIC" : "FAIL_SAFETY", classification: "DEVELOPMENT_ONLY_NORMAL_RETRIEVAL_NOT_HOLDOUT", completedAt: new Date().toISOString(), profileId,
    exactModel: { modelId: selected.modelId, revision: selected.revision, tokenizerRevision: selected.tokenizerRevision, precision: registry.sharedServing.precision, snapshotStatus: snapshot.status, checkedSnapshotFiles: snapshot.checkedFiles },
    inputs: { preregistration: { path: prereg.path, sha256: prereg.sha256 }, manifest: { path: manifest.path, sha256: manifest.sha256 }, oracle: { path: oracleArtifact.path, sha256: oracleArtifact.sha256 }, candidate: prereg.value.candidate, servingAttestation: serving },
    schedule: { planned: expectedCalls, completed: observations.length, oneShot: true, retries: 0, requestIntentsSha256: sha256(intents.join("\n")) },
    summary: { tasks: observations.length, behavioralSuccesses: successes, behavioralSuccessRate: successes / observations.length, hiddenSuccesses: observations.filter((row) => (row.outcome as any).hiddenSuccess).length, validActions: observations.filter((row) => (row.normalization as any).classification === "VALID_EDIT").length, exactSourceSelected: observations.filter((row) => (row.retrieval as any).exactSourceSelected).length, exactSourceIncluded: observations.filter((row) => (row.retrieval as any).exactSourceIncluded).length, wrongFileAttempts: wrongFile, actualSafetyViolations: safety, rollbackFailures: observations.filter((row) => (row.execution as any).rollback !== "PASS").length, totalPromptTokens: observations.reduce((sum, row) => sum + Number((row.modelCall as any).promptTokens), 0), totalCompletionTokens: observations.reduce((sum, row) => sum + Number((row.modelCall as any).completionTokens), 0), totalLatencyMs: observations.reduce((sum, row) => sum + Number((row.modelCall as any).latencyMs), 0) },
    retryGate: { threshold: 13, oneShotSuccesses: successes, safetyRequired: 0, safetyObserved: safety, eligible: successes >= 13 && safety === 0 },
    artifacts: { checkpoint: { path: posix(path.relative(root, checkpoint)), sha256: sha256(await readFile(checkpoint)) }, callEvents: { path: posix(path.relative(root, events)), sha256: sha256(await readFile(events)) } },
    privacy: { rawPromptsStored: false, rawOutputsStored: false, rawActionsStored: false, rawPatchesStored: false, hashesAndBoundedMetadataOnly: true },
    protectedActions: { modelDownload: false, dependencyInstall: false, sudoAdmin: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
  };
  const resultRef = await persistImmutable(`${runDirectoryArg}/result.json`, result);
  process.stdout.write(`${JSON.stringify({ result: resultRef, status: result.status, profileId, summary: result.summary, retryGate: result.retryGate }, null, 2)}\n`);
  if (result.status !== "COMPLETE_DEVELOPMENT_DIAGNOSTIC") process.exitCode = 1;
}

await main();
