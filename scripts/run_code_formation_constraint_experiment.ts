import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { applyCodeFormationConstraint } from "../services/code-formation-constraint/src/index";
import { materializeCodeFormationRequestIntent, type CodeFormationCondition, type CodeFormationPreregistration } from "../services/code-formation-experiment/src/index";
import { SpecializationLiveModel } from "../services/model-specialization-runtime/src/index";
import { normalizePatchInterfaceOutput, sha256Source, type PatchInterfacePolicy } from "../services/patch-interface-runtime/src/index";
import { ConstrainedPatchRuntime, TrustedVerificationExecutor, detectSandboxCapabilities } from "../services/tool-runtime/src/index";

const exec = promisify(execFile), root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const validateOnly = process.argv.includes("--validate-only"), execute = process.argv.includes("--execute-session-b");
if (validateOnly === execute) throw new Error("Choose exactly one explicit code-formation runner mode");

const paths = {
  manifest: "benchmarks/model-specialization/CODE_FORMATION_CONSTRAINT_TASK_MANIFEST.v1.json",
  repositories: "benchmarks/model-specialization/CODE_FORMATION_CONSTRAINT_REPOSITORIES.v1.json",
  oracle: "benchmarks/model-specialization/CODE_FORMATION_CONSTRAINT_ORACLE.v1.sealed.json",
  prereg: "benchmarks/model-specialization/CODE_FORMATION_CONSTRAINT_PREREGISTRATION.v1.json",
  sessionA: "docs/experiments/model-specialization/CODE_FORMATION_CONSTRAINT_EXPERIMENT_SESSION_A.v1.json",
  correction: "docs/experiments/model-specialization/CODE_FORMATION_CONSTRAINT_EXPERIMENT_SESSION_B_CORRECTION.v1.json",
  readiness: "benchmarks/model-specialization/CODE_FORMATION_CONSTRAINT_SESSION_B_CORRECTED_READINESS.v1.json",
  run: "docs/experiments/runs/code-formation-constraint-v1"
} as const;

type FileRow = { path: string; content: string; role: "source" | "test" };
type Repo = { repository_id: string; immutable_revision: string; files: FileRow[] };
type Task = { task_id: string; repository_id: string; repository_revision: string; prompt: string; allowed_file: string; allowed_range: { start_line: number; end_line: number }; changed_line_budget: number; visible_test_path: string };
type Oracle = { task_id: string; original_source_sha256: string; reference_fixed_source: string; hidden_files: FileRow[]; hidden_test_path: string };
type Prereg = CodeFormationPreregistration & { model: { modelId: string; revision: string; precision: string; backendVersion: string }; schedule: Array<{ pair_index: number; task_id: string; order: CodeFormationCondition[] }> };

async function regular(relative: string) { const target = path.join(root, relative), stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular file: ${relative}`); return readFile(target); }
async function verified<T>(relative: string) { const body = await regular(relative), digest = sha256(body), sidecar = await regular(`${relative}.sha256`); if (sidecar.toString() !== `${digest}  ${path.basename(relative)}\n`) throw new Error(`Checksum drift: ${relative}`); return JSON.parse(body.toString()) as T; }
async function append(relative: string, value: unknown) { const handle = await open(path.join(root, relative), "a", 0o600); try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync(); } finally { await handle.close(); } }
async function publish(relative: string, value: unknown) { const body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body), target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); const pending = `${target}.next.${process.pid}.${randomUUID()}`; await writeFile(pending, body, { flag: "wx", mode: 0o600 }); try { await link(pending, target); } finally { await rm(pending, { force: true }); } await writeFile(`${target}.sha256`, `${digest}  ${path.basename(target)}\n`, { flag: "wx", mode: 0o600 }); return { path: relative, sha256: digest }; }

async function material() {
  const [manifest, repositories, oracle, prereg, sessionA, correction, readiness] = await Promise.all([
    verified<{ tasks: Task[]; taskIdsSha256: string }>(paths.manifest), verified<{ repositories: Repo[] }>(paths.repositories),
    verified<{ rows: Oracle[]; taskIdsSha256: string }>(paths.oracle), verified<Prereg>(paths.prereg), verified<any>(paths.sessionA),
    verified<any>(paths.correction), verified<any>(paths.readiness)
  ]);
  if (sessionA.status !== "PASS" || correction.status !== "PASS_ZERO_CALL_INFRASTRUCTURE_CORRECTION" || readiness.status !== "PASS_READY_FOR_SEPARATE_SESSION_B" || manifest.tasks.length !== 40 || oracle.rows.length !== 40 || prereg.schedule.length !== 40 || manifest.taskIdsSha256 !== oracle.taskIdsSha256) throw new Error("Corrected Session-B material gate failed");
  for (const entry of sessionA.sourceClosure.entries) if (entry.path !== "scripts/run_code_formation_constraint_experiment.ts" && sha256(await regular(entry.path)) !== entry.sha256) throw new Error(`Historical source closure drift: ${entry.path}`);
  for (const entry of readiness.correctedSourceClosure.entries) if (sha256(await regular(entry.path)) !== entry.sha256) throw new Error(`Corrected source closure drift: ${entry.path}`);
  const repoBy = new Map(repositories.repositories.map((row) => [row.repository_id, row])), oracleBy = new Map(oracle.rows.map((row) => [row.task_id, row]));
  return { prereg, rows: manifest.tasks.map((task) => { const repo = repoBy.get(task.repository_id), truth = oracleBy.get(task.task_id); if (!repo || !truth || repo.immutable_revision !== task.repository_revision) throw new Error("Material lineage mismatch"); const source = repo.files.find((file) => file.path === task.allowed_file); if (!source || sha256Source(source.content) !== truth.original_source_sha256) throw new Error("Source binding mismatch"); return { task, repo, truth, source }; }) };
}

function policy(row: Awaited<ReturnType<typeof material>>["rows"][number]): PatchInterfacePolicy { return { allowedFiles: [row.task.allowed_file], allowedRanges: { [row.task.allowed_file]: [{ startLine: row.task.allowed_range.start_line, endLine: row.task.allowed_range.end_line }] }, expectedSourceSha256: { [row.task.allowed_file]: row.truth.original_source_sha256 }, maxChangedFiles: 1, maxChangedLines: row.task.changed_line_budget }; }

async function verify(row: Awaited<ReturnType<typeof material>>["rows"][number], diff: string) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "dca-formation-v1-")); let patcher: ConstrainedPatchRuntime | null = null, changed: string[] = [];
  try {
    for (const file of [...row.repo.files, ...row.truth.hidden_files]) { const target = path.join(temp, file.path); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content, { flag: "wx" }); }
    await exec("git", ["init", "--initial-branch=main", "--quiet"], { cwd: temp });
    patcher = new ConstrainedPatchRuntime(temp, { allowedFiles: [row.task.allowed_file], maxChangedLines: row.task.changed_line_budget }); changed = (await patcher.apply(diff)).files;
    const sandbox = await detectSandboxCapabilities(); if (sandbox.level !== "HARD_ISOLATION") throw new Error("Hard isolation required");
    const ro = `--allow-fs-read=${temp}`, verifier = new TrustedVerificationExecutor(temp, {
      syntax: { executable: process.execPath, args: ["--permission", ro, "--check", row.task.allowed_file], timeoutMs: 10_000, requiresHardNetworkIsolation: true },
      visible: { executable: process.execPath, args: ["--permission", ro, "--test-isolation=none", "--test", row.task.visible_test_path], timeoutMs: 10_000, requiresHardNetworkIsolation: true },
      hidden: { executable: process.execPath, args: ["--permission", ro, "--test-isolation=none", "--test", row.truth.hidden_test_path], timeoutMs: 10_000, requiresHardNetworkIsolation: true }
    }, sandbox);
    const syntax = (await verifier.run("syntax")).status, visible = syntax === "PASS" ? (await verifier.run("visible")).status : "NOT_RUN", hidden = syntax === "PASS" ? (await verifier.run("hidden")).status : "NOT_RUN";
    await patcher.rollback(changed); const rollback = sha256Source(await readFile(path.join(temp, row.task.allowed_file))) === row.truth.original_source_sha256 ? "PASS" : "FAIL";
    return { syntax, visible, hidden, rollback, strictSuccess: syntax === "PASS" && visible === "PASS" && hidden === "PASS" && rollback === "PASS" };
  } catch (error) { if (patcher && changed.length) try { await patcher.rollback(changed); } catch {} return { syntax: "NOT_RUN", visible: "NOT_RUN", hidden: "NOT_RUN", rollback: "FAIL", strictSuccess: false, errorSha256: sha256(error instanceof Error ? error.message : "failure") }; }
  finally { await rm(temp, { recursive: true, force: true }); }
}

async function preflight() {
  const core = await material(), events = path.join(root, paths.run, "call-events.jsonl"), rows = path.join(root, paths.run, "paired-observations.jsonl");
  if ((await readFile(events)).length !== 0 || (await readFile(rows)).length !== 0) throw new Error("Future ledgers are not empty");
  return core;
}

if (validateOnly) {
  const core = await preflight();
  process.stdout.write(`${JSON.stringify({ status: "PASS", mode: "VALIDATE_ONLY", tasks: core.rows.length, targetModelCalls: 0 })}\n`);
} else {
  const core = await preflight(), apiKey = (await readFile(path.join(root, ".runtime/model/tournament-api-key"), "utf8")).trim(), launch = JSON.parse(await readFile(path.join(root, ".runtime/model/tournament-launch.json"), "utf8"));
  if (launch.modelId !== core.prereg.model.modelId || launch.revision !== core.prereg.model.revision || launch.installedRuntime.vllm !== core.prereg.model.backendVersion) throw new Error("Serving identity mismatch");
  const live = new SpecializationLiveModel({ endpoint: "http://127.0.0.1:8000/v1", apiKey, model: core.prereg.model.modelId, seed: core.prereg.seed });
  for (const pair of core.prereg.schedule) {
    const row = core.rows.find((value) => value.task.task_id === pair.task_id); if (!row) throw new Error("Schedule task missing");
    for (const condition of pair.order) {
      const callId = `formation-v1-${String(pair.pair_index).padStart(2, "0")}-${condition.toLowerCase()}-${randomUUID()}`;
      const intent = materializeCodeFormationRequestIntent({ pairIndex: pair.pair_index, condition, prereg: core.prereg, task: row.task, source: row.source.content });
      const requestSha256 = intent.requestIntentSha256; await append(`${paths.run}/call-events.jsonl`, { event: "CALL_STARTED", callId, taskId: pair.task_id, condition, requestSha256 });
      const call = await live.structured<any>({ requestId: callId, system: intent.system, prompt: intent.prompt, schema: intent.schema, maxTokens: 2048, timeoutMs: 120_000 });
      if (call.error && call.rawText === null) throw new Error("Pre-response failure; retry forbidden"); const raw = call.rawText ?? JSON.stringify(call.output ?? {}), base = normalizePatchInterfaceOutput({ interfaceId: "P2", rawOutput: raw, sources: { [row.task.allowed_file]: row.source.content }, policy: policy(row) }), constrained = condition === "TREATMENT" ? applyCodeFormationConstraint({ rawOutput: raw, sources: { [row.task.allowed_file]: row.source.content }, policy: policy(row) }) : null;
      const accepted = condition === "CONTROL" ? base.classification === "VALID_EDIT" : constrained!.accepted, diff = accepted ? base.canonicalDiff : null, verification = diff ? await verify(row, diff) : { syntax: "NOT_RUN", visible: "NOT_RUN", hidden: "NOT_RUN", rollback: "PASS", strictSuccess: false };
      const persisted = { schemaVersion: 1, pairIndex: pair.pair_index, taskId: pair.task_id, condition, callId, requestSha256, outputSha256: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, actionValid: base.classification === "VALID_EDIT", patchConstructed: base.canonicalDiff !== null, constraint: constrained ? { accepted: constrained.accepted, code: constrained.code } : null, verification, wrongFileAttempt: base.targets.length > 0 && !base.targets.every((target) => target === row.task.allowed_file), privacy: { rawOutputStored: false, rawEditBodyStored: false, L2: false } };
      if (JSON.stringify(persisted).includes(raw) || typeof call.output?.replacement === "string" && JSON.stringify(persisted).includes(call.output.replacement)) throw new Error("Raw response persistence blocked");
      await append(`${paths.run}/paired-observations.jsonl`, persisted); await append(`${paths.run}/call-events.jsonl`, { event: "CALL_COMPLETED", callId, taskId: pair.task_id, condition, outputSha256: call.outputHash });
    }
  }
  await publish(`${paths.run}/SESSION_B_COMPLETE.json`, { schemaVersion: 1, status: "PASS", physicalCalls: 80, retries: 0, rawOutputsStored: 0, rawEditBodiesStored: 0 });
}
