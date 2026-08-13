import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { applyCodeFormationConstraint } from "../services/code-formation-constraint/src/index";
import { deriveParserStageTelemetry, materializeRecoveryIntent, RECOVERY_GENERATION_SEED, type RecoveryCondition, type RecoveryOracle, type RecoveryRepository, type RecoveryTask } from "../services/code-formation-control-recovery/src/index";
import { SpecializationLiveModel } from "../services/model-specialization-runtime/src/index";
import { normalizePatchInterfaceOutput, sha256Source, type PatchInterfacePolicy } from "../services/patch-interface-runtime/src/index";
import { ConstrainedPatchRuntime, TrustedVerificationExecutor, detectSandboxCapabilities } from "../services/tool-runtime/src/index";

const exec = promisify(execFile), root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const validateOnly = process.argv.includes("--validate-only"), execute = process.argv.includes("--execute-session-b");
if (validateOnly === execute) throw new Error("Choose exactly one recovery runner mode");

const p = {
  manifest: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_TASK_MANIFEST.v1.json",
  repositories: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_REPOSITORIES.v1.json",
  oracle: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_ORACLE.v1.sealed.json",
  prereg: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_PREREGISTRATION.v2.json",
  seal: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_RUNNER_SEAL.v2.json",
  sessionA: "docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_SESSION_A.v2.json",
  run: "docs/experiments/runs/code-formation-control-recovery-v1"
} as const;

type Prereg = { state: string; generationSeed: number; scheduleSeed: number; control: { systemPrompt: string }; schema: object; model: { modelId: string; revision: string; backendVersion: string }; schedule: Array<{ pair_index: number; task_id: string; order: RecoveryCondition[] }>; sanityFixture: { task: RecoveryTask; repository: RecoveryRepository; oracle: RecoveryOracle } };
type Material = { task: RecoveryTask; repository: RecoveryRepository; oracle: RecoveryOracle; source: { path: string; content: string } };

async function regular(relative: string) { const target = path.join(root, relative), stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not regular: ${relative}`); return readFile(target); }
async function verified<T>(relative: string) { const body = await regular(relative), digest = sha256(body), sidecar = await regular(`${relative}.sha256`); if (sidecar.toString() !== `${digest}  ${path.basename(relative)}\n`) throw new Error(`Artifact drift: ${relative}`); return { value: JSON.parse(body.toString()) as T, sha256: digest }; }
async function append(relative: string, value: unknown) { const handle = await open(path.join(root, relative), "a", 0o600); try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync(); } finally { await handle.close(); } }
async function publish(relative: string, value: unknown) { const body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body), target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); const pending = `${target}.next.${process.pid}.${randomUUID()}`; await writeFile(pending, body, { flag: "wx", mode: 0o600 }); try { await link(pending, target); } finally { await rm(pending, { force: true }); } await writeFile(`${target}.sha256`, `${digest}  ${path.basename(target)}\n`, { flag: "wx", mode: 0o600 }); return { path: relative, sha256: digest }; }

async function materials() {
  const [manifest, repositories, oracle, prereg, seal] = await Promise.all([
    verified<{ tasks: RecoveryTask[]; taskIdsSha256: string }>(p.manifest), verified<{ repositories: RecoveryRepository[] }>(p.repositories),
    verified<{ rows: RecoveryOracle[]; taskIdsSha256: string }>(p.oracle), verified<Prereg>(p.prereg), verified<any>(p.seal)
  ]);
  if (manifest.value.tasks.length !== 40 || repositories.value.repositories.length !== 40 || oracle.value.rows.length !== 40 || prereg.value.schedule.length !== 40 || manifest.value.taskIdsSha256 !== oracle.value.taskIdsSha256 || prereg.value.state !== "FROZEN_BEFORE_FIRST_RECOVERY_TARGET_MODEL_CALL" || prereg.value.generationSeed !== RECOVERY_GENERATION_SEED || prereg.value.generationSeed === prereg.value.scheduleSeed || seal.value.state !== "SEALED_BEFORE_FIRST_RECOVERY_TARGET_MODEL_CALL") throw new Error("Recovery frozen input gate failed");
  for (const entry of seal.value.sourceClosure.entries as Array<{ path: string; sha256: string }>) if (sha256(await regular(entry.path)) !== entry.sha256) throw new Error(`Recovery source closure drift: ${entry.path}`);
  const repoBy = new Map(repositories.value.repositories.map((row) => [row.repository_id, row])), oracleBy = new Map(oracle.value.rows.map((row) => [row.task_id, row]));
  const rows = manifest.value.tasks.map((task): Material => { const repository = repoBy.get(task.repository_id), truth = oracleBy.get(task.task_id); if (!repository || !truth) throw new Error("Recovery material missing"); const source = repository.files.find((file) => file.path === task.allowed_file); if (!source || sha256Source(source.content) !== truth.original_source_sha256) throw new Error("Recovery source binding failed"); return { task, repository, oracle: truth, source }; });
  return { prereg: prereg.value, rows };
}

function policy(row: Material): PatchInterfacePolicy { return { allowedFiles: [row.task.allowed_file], allowedRanges: { [row.task.allowed_file]: [{ startLine: row.task.allowed_range.start_line, endLine: row.task.allowed_range.end_line }] }, expectedSourceSha256: { [row.task.allowed_file]: row.oracle.original_source_sha256 }, maxChangedFiles: 1, maxChangedLines: row.task.changed_line_budget }; }

async function verify(row: Material, diff: string) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "dca-formation-recovery-")); let patcher: ConstrainedPatchRuntime | null = null, changed: string[] = [];
  try {
    for (const file of [...row.repository.files, ...row.oracle.hidden_files]) { const target = path.join(temporary, file.path); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content, { flag: "wx" }); }
    await exec("git", ["init", "--initial-branch=main", "--quiet"], { cwd: temporary }); patcher = new ConstrainedPatchRuntime(temporary, { allowedFiles: [row.task.allowed_file], maxChangedLines: row.task.changed_line_budget }); changed = (await patcher.apply(diff)).files;
    const sandbox = await detectSandboxCapabilities(); if (sandbox.level !== "HARD_ISOLATION") throw new Error("Hard isolation required"); const readOnly = `--allow-fs-read=${temporary}`;
    const verifier = new TrustedVerificationExecutor(temporary, { syntax: { executable: process.execPath, args: ["--permission", readOnly, "--check", row.task.allowed_file], timeoutMs: 10_000, requiresHardNetworkIsolation: true }, visible: { executable: process.execPath, args: ["--permission", readOnly, "--test-isolation=none", "--test", row.task.visible_test_path], timeoutMs: 10_000, requiresHardNetworkIsolation: true }, hidden: { executable: process.execPath, args: ["--permission", readOnly, "--test-isolation=none", "--test", row.oracle.hidden_test_path], timeoutMs: 10_000, requiresHardNetworkIsolation: true } }, sandbox);
    const syntax = (await verifier.run("syntax")).status, visible = syntax === "PASS" ? (await verifier.run("visible")).status : "NOT_RUN", hidden = syntax === "PASS" ? (await verifier.run("hidden")).status : "NOT_RUN";
    await patcher.rollback(changed); const rollback = sha256Source(await readFile(path.join(temporary, row.task.allowed_file))) === row.oracle.original_source_sha256 ? "PASS" : "FAIL";
    return { syntax, visible, hidden, rollback, strictSuccess: syntax === "PASS" && visible === "PASS" && hidden === "PASS" && rollback === "PASS" };
  } catch (error) { if (patcher && changed.length) try { await patcher.rollback(changed); } catch {} return { syntax: "NOT_RUN", visible: "NOT_RUN", hidden: "NOT_RUN", rollback: "FAIL", strictSuccess: false, errorSha256: sha256(error instanceof Error ? error.message : "failure") }; }
  finally { await rm(temporary, { recursive: true, force: true }); }
}

async function emptyLedgers() { for (const name of ["call-events.jsonl", "paired-observations.jsonl", "sanity-events.jsonl"]) if ((await regular(`${p.run}/${name}`)).length !== 0) throw new Error(`Recovery ${name} is not empty`); }

if (validateOnly) {
  const core = await materials(); await emptyLedgers();
  for (const pair of core.prereg.schedule) { const row = core.rows.find((item) => item.task.task_id === pair.task_id); if (!row) throw new Error("Schedule task missing"); for (const condition of pair.order) materializeRecoveryIntent({ pairIndex: pair.pair_index, condition, task: row.task, repository: row.repository, oracle: row.oracle, controlSystem: core.prereg.control.systemPrompt, schema: core.prereg.schema }); }
  process.stdout.write(`${JSON.stringify({ status: "PASS_ZERO_CALL", tasks: 40, intents: 80, targetModelCalls: 0 })}\n`);
} else {
  const core = await materials(), sessionA = await verified<any>(p.sessionA); await emptyLedgers(); if (sessionA.value.status !== "PASS_ZERO_CALL_FREEZE") throw new Error("Recovery Session A gate failed");
  const apiKey = (await readFile(path.join(root, ".runtime/model/tournament-api-key"), "utf8")).trim(), launch = JSON.parse(await readFile(path.join(root, ".runtime/model/tournament-launch.json"), "utf8"));
  if (launch.modelId !== core.prereg.model.modelId || launch.revision !== core.prereg.model.revision || launch.installedRuntime.vllm !== core.prereg.model.backendVersion) throw new Error("Recovery serving identity mismatch");
  const live = new SpecializationLiveModel({ endpoint: "http://127.0.0.1:8000/v1", apiKey, model: core.prereg.model.modelId, seed: RECOVERY_GENERATION_SEED });
  const fixture = core.prereg.sanityFixture, fixtureSource = fixture.repository.files.find((file) => file.path === fixture.task.allowed_file); if (!fixtureSource) throw new Error("Sanity fixture source missing");
  const fixtureMaterial: Material = { task: fixture.task, repository: fixture.repository, oracle: fixture.oracle, source: fixtureSource };
  const fixtureIntent = materializeRecoveryIntent({ pairIndex: 0, condition: "CONTROL", task: fixture.task, repository: fixture.repository, oracle: fixture.oracle, controlSystem: core.prereg.control.systemPrompt, schema: core.prereg.schema });
  const sanityId = `formation-recovery-sanity-${randomUUID()}`; await append(`${p.run}/sanity-events.jsonl`, { event: "CALL_STARTED", callId: sanityId, requestSha256: fixtureIntent.requestIntentSha256 });
  const sanity = await live.structured<any>({ requestId: sanityId, system: fixtureIntent.system, prompt: fixtureIntent.prompt, schema: fixtureIntent.schema, maxTokens: 2048, timeoutMs: 120_000 });
  const sanityRaw = sanity.rawText ?? JSON.stringify(sanity.output ?? {}), sanityNormalized = normalizePatchInterfaceOutput({ interfaceId: "P2", rawOutput: sanityRaw, sources: { [fixture.task.allowed_file]: fixtureSource.content }, policy: policy(fixtureMaterial) });
  const sanityTelemetry = deriveParserStageTelemetry({ rawText: sanity.rawText, schemaValid: sanity.schemaValid, error: sanity.error, finishReason: sanity.finishReason, outputChars: sanity.outputChars, parsedOutput: sanity.output, normalization: sanityNormalized });
  await append(`${p.run}/sanity-events.jsonl`, { event: "CALL_COMPLETED", callId: sanityId, outputSha256: sanity.outputHash, telemetry: sanityTelemetry });
  if (!sanityTelemetry.validP2Action) { await publish(`${p.run}/CONTROL_SANITY_GATE_FAIL.json`, { schemaVersion: 1, status: "CONTROL_SANITY_GATE_FAIL", primaryCalls: 0, sanityCalls: 1, telemetry: sanityTelemetry, retries: 0 }); throw new Error("CONTROL_SANITY_GATE_FAIL before primary calls"); }
  for (const pair of core.prereg.schedule) {
    const row = core.rows.find((item) => item.task.task_id === pair.task_id); if (!row) throw new Error("Schedule task missing");
    for (const condition of pair.order) {
      const intent = materializeRecoveryIntent({ pairIndex: pair.pair_index, condition, task: row.task, repository: row.repository, oracle: row.oracle, controlSystem: core.prereg.control.systemPrompt, schema: core.prereg.schema });
      const callId = `formation-recovery-${String(pair.pair_index).padStart(2, "0")}-${condition.toLowerCase()}-${randomUUID()}`; await append(`${p.run}/call-events.jsonl`, { event: "CALL_STARTED", callId, taskId: pair.task_id, condition, requestSha256: intent.requestIntentSha256 });
      const call = await live.structured<any>({ requestId: callId, system: intent.system, prompt: intent.prompt, schema: intent.schema, maxTokens: 2048, timeoutMs: 120_000 });
      if (call.error && call.rawText === null) throw new Error("Recovery pre-response failure; retry forbidden");
      const raw = call.rawText ?? JSON.stringify(call.output ?? {}), base = normalizePatchInterfaceOutput({ interfaceId: "P2", rawOutput: raw, sources: { [row.task.allowed_file]: row.source.content }, policy: policy(row) });
      const telemetry = deriveParserStageTelemetry({ rawText: call.rawText, schemaValid: call.schemaValid, error: call.error, finishReason: call.finishReason, outputChars: call.outputChars, parsedOutput: call.output, normalization: base });
      const constrained = condition === "TREATMENT" ? applyCodeFormationConstraint({ rawOutput: raw, sources: { [row.task.allowed_file]: row.source.content }, policy: policy(row) }) : null;
      const accepted = condition === "CONTROL" ? telemetry.validP2Action : constrained!.accepted, verification = accepted && base.canonicalDiff ? await verify(row, base.canonicalDiff) : { syntax: "NOT_RUN", visible: "NOT_RUN", hidden: "NOT_RUN", rollback: "PASS", strictSuccess: false };
      const persisted = { schemaVersion: 1, pairIndex: pair.pair_index, taskId: pair.task_id, condition, callId, requestSha256: intent.requestIntentSha256, outputSha256: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, telemetry, patchConstructed: base.canonicalDiff !== null, formation: constrained ? { invoked: telemetry.validP2Action, accepted: constrained.accepted, code: constrained.code } : null, verification, wrongFileAttempt: base.targets.length > 0 && !base.targets.every((target) => target === row.task.allowed_file), privacy: { rawOutputStored: false, rawEditBodyStored: false, L2: false } };
      const serialized = JSON.stringify(persisted); if (serialized.includes(raw) || typeof call.output?.replacement === "string" && serialized.includes(call.output.replacement)) throw new Error("Recovery raw response/edit persistence blocked");
      await append(`${p.run}/paired-observations.jsonl`, persisted); await append(`${p.run}/call-events.jsonl`, { event: "CALL_COMPLETED", callId, taskId: pair.task_id, condition, outputSha256: call.outputHash });
    }
  }
  await publish(`${p.run}/SESSION_B_COMPLETE.json`, { schemaVersion: 1, status: "PASS", sanityCalls: 1, primaryCalls: 80, retries: 0, reviewers: 0, rawOutputsStored: 0, rawEditBodiesStored: 0, L2: false });
}
