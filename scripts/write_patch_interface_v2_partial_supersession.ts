import { createHash, randomBytes } from "node:crypto";
import { link, lstat, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { renderPatchInterfacePrompt, type PatchInterfacePromptReplacements } from "./patch_interface_prompt_runtime";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const runDirectory = "docs/experiments/runs/patch-interface-baseline-v2-20260810T0125";
const checkpointRelative = `${runDirectory}/observations.checkpoint.jsonl`;
const eventsRelative = `${runDirectory}/call-events.jsonl`;
const lifecycleRelative = `${runDirectory}/lifecycle.json`;
const v2Preregistration = { path: "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v2.json", sha256: "b04336814ebf814b44f249550306e592a88b67ad7ce1ef9720c6cdf442cc6aad" };
const v2Artifacts = {
  v1PrecallSupersession: { path: "docs/experiments/patch-interface/PATCH_INTERFACE_V1_PRECALL_ABORT.v2.json", sha256: "a9d7c7d57c4c2b695d0674c3bc4cb0dc857a8ad2f5e8e0c56d6de4af2169151a" },
  securityRegression: { path: "docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v2.json", sha256: "c916d5aa9acf64d77aa7c2ebf9b316c784603194de11c729147c19efd6e757fd" },
  referenceActionPreflight: { path: "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v2.json", sha256: "367ef7bd6591173119a13d9300c2decf33584a9c24ecf3e4ce9924f1b5225251" },
  preregistration: v2Preregistration
} as const;
const v2CausalClosureSha256 = "653d1f6d3062638f437624c4593ce04e9ef9d8cd5b44430ce847efff7330a931";
const checkpointSha256 = "f0be8ffd8c9dde126d9873e7668ef984f73f59cbb9837b9dd0fd79f4f75a57e9";
const eventsSha256 = "70746c10fcafc030d585b66f8147598c4b22643b4fbc65ee0ce44c8004c2f29e";
const lifecycleSha256 = "949b68fd43b467e798fcdc68b655ab9b6a78d3f5890040c654e5869640f0553a";
const assignmentSha256 = "8b4ace854bd12b7a77870958f90620697b205299bf8d3cbcf283ee950de3a27d";
const assignmentRelative = `.runtime/patch-interface-experiment/${v2Preregistration.sha256}-baseline.assignment.json`;

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function persistAtomicExact(target: string, contents: string | Buffer, mode: number): Promise<void> {
  const expected = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !(await readFile(target)).equals(expected)) throw new Error(`Immutable artifact collision: ${path.basename(target)}`);
    return;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const pending = `${target}.next.${process.pid}.${randomBytes(12).toString("hex")}`;
  const handle = await open(pending, "wx", mode);
  try { await handle.writeFile(expected); await handle.sync(); } finally { await handle.close(); }
  try {
    const metadata = await lstat(pending);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !(await readFile(pending)).equals(expected)) throw new Error(`Immutable staging collision: ${path.basename(pending)}`);
    try { await link(pending, target); await syncDirectory(path.dirname(target)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const published = await lstat(target);
    if (!published.isFile() || published.isSymbolicLink() || !(await readFile(target)).equals(expected)) throw new Error(`Immutable artifact collision: ${path.basename(target)}`);
  } finally {
    try { await unlink(pending); await syncDirectory(path.dirname(target)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

async function readRegularFile(relative: string, label = "Evidence"): Promise<Buffer> {
  const target = path.join(root, relative);
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} is not a regular file: ${relative}`);
  return readFile(target);
}

async function verifiedJson<T>(relative: string, exactSha256?: string): Promise<{ value: T; path: string; sha256: string }> {
  const bytes = await readRegularFile(relative);
  const digest = sha256(bytes);
  if (exactSha256 && digest !== exactSha256) throw new Error(`Evidence hash changed: ${relative}`);
  const sidecar = await readRegularFile(`${relative}.sha256`, "Evidence sidecar");
  if (sidecar.toString("utf8") !== `${digest}  ${path.basename(relative)}\n`) throw new Error(`Evidence sidecar mismatch: ${relative}`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: digest };
}

async function assertAbsent(relative: string): Promise<void> {
  try { await lstat(path.join(root, relative)); throw new Error(`Expected absent path exists: ${relative}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

function exactKeys(value: unknown, keys: string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  const actual = Object.keys(value as Record<string, unknown>).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or extra fields`);
}

function boundedMetadata(value: unknown, label: string): void {
  if (typeof value === "string") {
    if (value.length > 512 || /[\r\n\0]/.test(value)) throw new Error(`${label} contains unbounded persisted text`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item) => boundedMetadata(item, label)); return; }
  if (value && typeof value === "object") Object.values(value).forEach((item) => boundedMetadata(item, label));
}

function parseExactJsonLines(bytes: Buffer, label: string): Array<Record<string, unknown>> {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) throw new Error(`${label} has an incomplete trailing record`);
  const lines = text.slice(0, -1).split("\n");
  if (lines.some((line) => !line)) throw new Error(`${label} contains an empty record`);
  return lines.map((line, index) => {
    try {
      const value = JSON.parse(line) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
      return value as Record<string, unknown>;
    } catch {
      throw new Error(`${label} record ${index + 1} is not exact JSON object evidence`);
    }
  });
}

function renderLegacyV2Prompt(
  template: string,
  replacements: PatchInterfacePromptReplacements,
  taskId: string,
  blockedExactValues: string[]
): string {
  let prompt = template;
  for (const [name, value] of Object.entries(replacements)) prompt = prompt.replaceAll(`{${name}}`, value);
  if (/\{[a-z0-9_]+\}/i.test(prompt)) throw new Error(`Legacy V2 prompt has unresolved placeholders for ${taskId}`);
  for (const blocked of blockedExactValues) if (blocked && prompt.includes(blocked)) throw new Error(`Legacy V2 prompt leaks hidden oracle or reference source for ${taskId}`);
  return prompt;
}

type SourceFile = { path: string; content: string };
type ManifestTask = { task_id: string; visible_files: SourceFile[] };
type OracleRow = { task_id: string; behavioral_requirement: string; exact_relevant_file: string; exact_relevant_symbol: string; exact_relevant_range_1_based: { start_line: number; end_line: number }; root_cause: string; reference_fixed_source: string; hidden_files: SourceFile[] };
type PreflightRow = { taskId: string; before: { visible: { status: string }; hidden: { status: string } } };
type V2Preregistration = {
  state: string;
  modelCallsAtSeal: number;
  causalClosure: { sha256: string };
  sourceClosure: Record<string, string>;
  immutableInputs: Record<string, { path: string; sha256: string }>;
  fixedInformationContract: { promptTemplate: string };
  taskAssignment: { architectureBaseline: { taskIds: string[] } };
  modelFacingPolicies: { exactSystemPrompts: { architectureBaseline: { P0_EXACT: string } } };
};

const [prereg, manifest, oracle, preflight, lifecycle] = await Promise.all([
  verifiedJson<V2Preregistration>(v2Preregistration.path, v2Preregistration.sha256),
  verifiedJson<{ tasks: ManifestTask[] }>("benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_MANIFEST.v1.json"),
  verifiedJson<{ rows: OracleRow[] }>("benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_ORACLE.v1.sealed.json"),
  verifiedJson<{ status: string; rows: PreflightRow[] }>("benchmarks/patch-interface/PATCH_INTERFACE_ORACLE_PREFLIGHT.v2.json"),
  verifiedJson<{ status: string; checkedAt: string; profileId: string; runDirectory: string; checks: Record<string, unknown>; runtimeStateCleanup: { verifiedAbsent: boolean }; privacy: { secretsStored: boolean; apiKeyRead: boolean } }>(lifecycleRelative, lifecycleSha256)
]);
const [v1PrecallSupersession, securityRegression, referenceActionPreflight] = await Promise.all([
  verifiedJson<{ status: string }>(v2Artifacts.v1PrecallSupersession.path, v2Artifacts.v1PrecallSupersession.sha256),
  verifiedJson<{ status: string }>(v2Artifacts.securityRegression.path, v2Artifacts.securityRegression.sha256),
  verifiedJson<{ status: string }>(v2Artifacts.referenceActionPreflight.path, v2Artifacts.referenceActionPreflight.sha256)
]);
if (prereg.value.state !== "SEALED_BEFORE_FIRST_NEW_MODEL_CALL" || prereg.value.modelCallsAtSeal !== 0 || prereg.value.causalClosure.sha256 !== v2CausalClosureSha256) throw new Error("V2 preregistration identity changed");
const oldRunnerSha256 = prereg.value.sourceClosure["scripts/run_patch_interface_experiment.ts"];
if (!/^[0-9a-f]{64}$/.test(oldRunnerSha256 ?? "")) throw new Error("V2 preregistration lacks the exact old runner source hash");
if (v1PrecallSupersession.value.status !== "V1_SUPERSEDED_AFTER_VERIFIED_PRECALL_ABORT" || securityRegression.value.status !== "PASS" || referenceActionPreflight.value.status !== "PASS" || preflight.value.status !== "PASS") throw new Error("V2 inherited evidence status changed");
for (const [key, artifact] of [
  ["developmentManifest", manifest],
  ["sealedOracle", oracle],
  ["oraclePreflight", preflight],
  ["precallAbortSupersession", v1PrecallSupersession],
  ["securityRegression", securityRegression],
  ["referenceActionPreflight", referenceActionPreflight]
] as const) {
  const binding = prereg.value.immutableInputs[key];
  if (!binding || binding.path !== artifact.path || binding.sha256 !== artifact.sha256) throw new Error(`V2 preregistration input binding changed: ${key}`);
}
if (lifecycle.value.status !== "PASS" || lifecycle.value.profileId !== "baseline" || lifecycle.value.runDirectory !== runDirectory || lifecycle.value.runtimeStateCleanup.verifiedAbsent !== true || lifecycle.value.checks.exactModelProcessAbsent !== true || lifecycle.value.checks.loopbackPort8000Clear !== true || lifecycle.value.checks.ephemeralApiKeyAbsent !== true || lifecycle.value.checks.gpuMemoryReleased !== true || lifecycle.value.privacy.secretsStored !== false || lifecycle.value.privacy.apiKeyRead !== false) throw new Error("V2 partial-run lifecycle evidence is incomplete");

const assignmentBytes = await readRegularFile(assignmentRelative, "V2 partial-run assignment");
const expectedAssignment = `${JSON.stringify({ schemaVersion: 1, preregistrationSha256: v2Preregistration.sha256, profileId: "baseline", runDirectory })}\n`;
if (!assignmentBytes.equals(Buffer.from(expectedAssignment)) || sha256(assignmentBytes) !== assignmentSha256) throw new Error("V2 partial-run assignment changed");

const checkpointPath = path.join(root, checkpointRelative); const eventsPath = path.join(root, eventsRelative);
const [checkpointBytes, eventsBytes] = await Promise.all([
  readRegularFile(checkpointRelative, "V2 partial-run checkpoint"),
  readRegularFile(eventsRelative, "V2 partial-run call ledger")
]);
if (checkpointBytes.length !== 46_685 || sha256(checkpointBytes) !== checkpointSha256 || eventsBytes.length !== 5_240 || sha256(eventsBytes) !== eventsSha256) throw new Error("V2 partial-run ledger bytes changed");
const rows = parseExactJsonLines(checkpointBytes, "V2 partial-run checkpoint");
const events = parseExactJsonLines(eventsBytes, "V2 partial-run call ledger");
if (rows.length !== 7 || events.length !== 14) throw new Error("V2 partial run must contain exactly 7 rows and 14 events");

const taskById = new Map(manifest.value.tasks.map((task) => [task.task_id, task]));
const oracleById = new Map(oracle.value.rows.map((row) => [row.task_id, row]));
const preflightById = new Map(preflight.value.rows.map((row) => [row.taskId, row]));
const promptRows = prereg.value.taskAssignment.architectureBaseline.taskIds.map((taskId, index) => {
  const task = taskById.get(taskId); const oracleRow = oracleById.get(taskId); const preflightRow = preflightById.get(taskId);
  if (!task || !oracleRow || !preflightRow) throw new Error(`Prompt preflight binding missing: ${taskId}`);
  const source = task.visible_files.find((file) => file.path === oracleRow.exact_relevant_file);
  const visible = task.visible_files.find((file) => file.path !== oracleRow.exact_relevant_file && file.path.includes("visible.test"));
  if (!source || !visible) throw new Error(`Prompt preflight files missing: ${taskId}`);
  const replacements: PatchInterfacePromptReplacements = {
    behavioral_requirement: oracleRow.behavioral_requirement,
    exact_relevant_file: oracleRow.exact_relevant_file,
    exact_relevant_symbol: oracleRow.exact_relevant_symbol,
    start_line: String(oracleRow.exact_relevant_range_1_based.start_line),
    end_line: String(oracleRow.exact_relevant_range_1_based.end_line),
    root_cause: oracleRow.root_cause,
    source: source.content,
    visible_test_path: visible.path,
    visible_test: visible.content,
    visible_preflight_status: preflightRow.before.visible.status,
    hidden_preflight_status: preflightRow.before.hidden.status
  };
  const blockedExactValues = [...oracleRow.hidden_files.map((file) => file.content), oracleRow.reference_fixed_source];
  const prompt = renderPatchInterfacePrompt(prereg.value.fixedInformationContract.promptTemplate, replacements, { taskId, blockedExactValues });
  if (!prompt.includes(source.content) || !prompt.includes(visible.content)) throw new Error(`Prompt preflight did not preserve visible evidence: ${taskId}`);
  const legacyV2Prompt = index < 7 ? renderLegacyV2Prompt(prereg.value.fixedInformationContract.promptTemplate, replacements, taskId, blockedExactValues) : null;
  return { taskId, promptSha256: sha256(prompt), promptBytes: Buffer.byteLength(prompt), legacyV2ByteEqual: legacyV2Prompt === null ? null : legacyV2Prompt === prompt };
});
if (promptRows.length !== 50 || promptRows.reduce((sum, row) => sum + row.promptBytes, 0) !== 69_687 || sha256(promptRows.map((row) => `${row.taskId}\0${row.promptSha256}`).join("\n")) !== "97c80839d7b1505ff7981f2598f5acc0d016826f64f305b694448d2d2070fb0e") throw new Error("Corrected renderer did not reproduce the exact 50-task prompt preflight");
const legacyPrefixByteEqual = promptRows.slice(0, 7).filter((row) => row.legacyV2ByteEqual === true).length;
if (legacyPrefixByteEqual !== 7 || promptRows.slice(7).some((row) => row.legacyV2ByteEqual !== null)) throw new Error("Corrected renderer is not byte-identical to V2 for the exact unaffected prefix");

const topKeys = ["schemaVersion", "observationId", "observationIndex", "profileId", "taskId", "taskProvenance", "condition", "fixedInput", "modelCall", "normalizedAction", "pipeline", "execution", "metrics", "outcome", "evidence", "privacy"];
const prefix: Array<{ observationId: string; observationSha256: string; outputSha256: string; promptSha256: string }> = [];
let inheritedEventPromptHashesMatched = 0;
let previousCompletedAt = Number.NEGATIVE_INFINITY;
for (let index = 0; index < 7; index += 1) {
  const taskId = prereg.value.taskAssignment.architectureBaseline.taskIds[index];
  const observationId = `baseline::P0_EXACT::${taskId}`;
  const row = rows[index]; const started = events[index * 2]; const completed = events[index * 2 + 1];
  exactKeys(row, topKeys, `partial row ${index}`);
  exactKeys(started, ["event", "observationId", "observationIndex", "requestIdSha256", "systemSha256", "promptSha256", "startedAt"], `partial start ${index}`);
  exactKeys(completed, ["event", "observationId", "observationIndex", "outputSha256", "observationSha256", "completedAt"], `partial completion ${index}`);
  const modelCall = row.modelCall as Record<string, unknown>; const privacy = row.privacy as Record<string, unknown>; const evidence = row.evidence as Record<string, unknown>; const condition = row.condition as Record<string, unknown>;
  const prompt = promptRows[index];
  const hashes = [modelCall.requestIdSha256, modelCall.systemSha256, modelCall.promptSha256, modelCall.outputSha256, completed.observationSha256];
  const startedAt = Date.parse(String(started.startedAt)); const completedAt = Date.parse(String(completed.completedAt));
  if (row.schemaVersion !== 1 || row.observationId !== observationId || row.observationIndex !== index || row.profileId !== "baseline" || row.taskId !== taskId || condition.conditionId !== "P0_EXACT" || condition.oneShot !== true || condition.retries !== 0 || modelCall.calls !== 1 || hashes.some((hash) => typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) || modelCall.requestIdSha256 !== sha256(`patch-interface-baseline-P0_EXACT-${taskId}`) || modelCall.systemSha256 !== sha256(prereg.value.modelFacingPolicies.exactSystemPrompts.architectureBaseline.P0_EXACT) || modelCall.promptSha256 !== prompt.promptSha256 || prompt.legacyV2ByteEqual !== true || modelCall.rawPromptStored !== false || modelCall.rawOutputStored !== false || started.event !== "CALL_STARTED" || started.observationId !== observationId || started.observationIndex !== index || started.requestIdSha256 !== modelCall.requestIdSha256 || started.systemSha256 !== modelCall.systemSha256 || started.promptSha256 !== modelCall.promptSha256 || !Number.isFinite(startedAt) || !Number.isFinite(completedAt) || startedAt < previousCompletedAt || completedAt < startedAt || completed.event !== "CALL_COMPLETED" || completed.observationId !== observationId || completed.observationIndex !== index || completed.outputSha256 !== modelCall.outputSha256 || completed.observationSha256 !== sha256(JSON.stringify(row)) || privacy.rawPromptStored !== false || privacy.rawModelOutputStored !== false || privacy.rawDiffStored !== false || privacy.replacementTextStored !== false || privacy.hiddenOracleSourceStored !== false || evidence.rawFailureTextStored !== false) throw new Error(`V2 partial row/event binding failed: ${observationId}`);
  boundedMetadata(row, `partial row ${index}`); boundedMetadata(started, `partial start ${index}`); boundedMetadata(completed, `partial completion ${index}`);
  inheritedEventPromptHashesMatched += 1;
  previousCompletedAt = completedAt;
  prefix.push({ observationId, observationSha256: sha256(JSON.stringify(row)), outputSha256: String(modelCall.outputSha256), promptSha256: prompt.promptSha256 });
}
const lifecycleCheckedAt = Date.parse(lifecycle.value.checkedAt);
if (inheritedEventPromptHashesMatched !== 7 || !Number.isFinite(lifecycleCheckedAt) || lifecycleCheckedAt < previousCompletedAt) throw new Error("V2 prefix chronology or prompt commitments are incomplete");

const firstAffectedObservationId = `baseline::P0_EXACT::${prereg.value.taskAssignment.architectureBaseline.taskIds[7]}`;
if (events.some((event) => event.observationId === firstAffectedObservationId) || rows.some((row) => row.observationId === firstAffectedObservationId)) throw new Error("The first affected task unexpectedly has a model-call event or row");
const absentArtifacts = [
  `${runDirectory}/result.json`, `${runDirectory}/result.json.sha256`, `${runDirectory}/observations.final.json`, `${runDirectory}/observations.final.json.sha256`, `${runDirectory}/recovery.json`,
  `.runtime/patch-interface-experiment/${v2Preregistration.sha256}-baseline.active.lock`, `.runtime/patch-interface-experiment/${v2Preregistration.sha256}-baseline.active.lock.recovery`,
  ".runtime/model/api-key", ".runtime/model/profile-start.json", ".runtime/model/profile-launch.json", ".runtime/model/profile-ready.json"
];
await Promise.all(absentArtifacts.map(assertAbsent));

await persistAtomicExact(`${checkpointPath}.sha256`, `${checkpointSha256}  ${path.basename(checkpointPath)}\n`, 0o600);
await persistAtomicExact(`${eventsPath}.sha256`, `${eventsSha256}  ${path.basename(eventsPath)}\n`, 0o600);

const generatorRelative = "scripts/write_patch_interface_v2_partial_supersession.ts";
const promptRuntimeRelative = "scripts/patch_interface_prompt_runtime.ts";
const runnerRelative = "scripts/run_patch_interface_experiment.ts";
const artifact = {
  schemaVersion: 1,
  supersessionId: "dca-patch-interface-v2-partial-abort-v3",
  status: "V2_PARTIAL_RUN_INVALID_INFRASTRUCTURE_EXCLUDED",
  classification: "DEVELOPMENT_ONLY_APPEND_ONLY_NONRESULT_DEPENDENT_CORRECTION",
  recordedAt: lifecycle.value.checkedAt,
  supersededArtifacts: v2Artifacts,
  partialRun: {
    profileId: "baseline",
    runDirectory,
    assignment: { path: assignmentRelative, sha256: assignmentSha256, preregistrationSha256: v2Preregistration.sha256 },
    checkpoint: { path: checkpointRelative, sha256: checkpointSha256, bytes: checkpointBytes.length, records: rows.length },
    callEvents: { path: eventsRelative, sha256: eventsSha256, bytes: eventsBytes.length, records: events.length, started: 7, completed: 7, recovered: 0 },
    lifecycle: { path: lifecycleRelative, sha256: lifecycle.sha256, status: lifecycle.value.status },
    unaffectedPrefix: prefix,
    physicalModelCalls: 7,
    validPrimaryObservations: 0,
    excludedPhysicalCalls: 7,
    callsOnAffectedTasks: 0,
    firstAffectedIndex: 7,
    firstAffectedObservationIdSha256: sha256(firstAffectedObservationId),
    absentArtifacts
  },
  rootCause: {
    code: "PROMPT_RENDERER_FAIL_CLOSED_BEFORE_FIRST_AFFECTED_CALL",
    details: ["POST_INJECTION_PLACEHOLDER_SCAN_FALSE_POSITIVE", "REPLACEMENT_STRING_DOLLAR_EXPANSION"],
    oldCausalClosureSha256: v2CausalClosureSha256,
    oldRunner: { path: "scripts/run_patch_interface_experiment.ts", sha256: oldRunnerSha256 },
    firstTriggerTaskId: prereg.value.taskAssignment.architectureBaseline.taskIds[7],
    nextDollarReplacementAffectedTaskId: prereg.value.taskAssignment.architectureBaseline.taskIds[8]
  },
  promptRemediationPreflight: {
    tasks: 50,
    passes: promptRows.length,
    failures: 0,
    totalPromptBytes: promptRows.reduce((sum, row) => sum + row.promptBytes, 0),
    taskPromptHashesSha256: sha256(promptRows.map((row) => `${row.taskId}\0${row.promptSha256}`).join("\n")),
    oldVersusCorrectedUnaffectedPrefixByteEqual: legacyPrefixByteEqual,
    inheritedEventPromptHashesMatched,
    hiddenSourceLeaks: 0,
    referenceFixLeaks: 0
  },
  decisionIntegrity: {
    v3FreshRerunChosen: true,
    prefixImportedIntoPrimaryEvidence: false,
    principalDecisionLockedWithoutEffectivenessInput: true,
    subagentInspectedOneRowAfterOrIndependentOfDecision: true,
    subagentOutcomeCommunicatedBeforeDecision: false,
    effectivenessFieldsUsedForDecision: false,
    rationale: "Missing persisted end-of-run serving identity and causal-closure attestation for the partial segment"
  },
  v3CallAccounting: { invalidPhysicalCallsBeforeV3Seal: 7, validPrimaryCallsAtV3Seal: 0, baselinePlannedAfterSeal: 420, coderPlannedAfterSeal: 420, totalValidPrimaryPlannedAfterSeal: 840, finalPhysicalCallsAcrossV2AndV3: 847 },
  implementation: {
    generator: { path: generatorRelative, sha256: sha256(await readRegularFile(generatorRelative, "V3 supersession generator")) },
    promptRuntime: { path: promptRuntimeRelative, sha256: sha256(await readRegularFile(promptRuntimeRelative, "Corrected prompt runtime")) },
    remediatedRunner: { path: runnerRelative, sha256: sha256(await readRegularFile(runnerRelative, "Remediated experiment runner")) }
  },
  newArtifactLineage: [
    "docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v3.json",
    "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v3.json",
    "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v3.json"
  ],
  protectedActions: { modelCall: false, modelDownload: false, dependencyInstall: false, sudoAdmin: false, commit: false, remoteConfiguration: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
};

const name = "PATCH_INTERFACE_V2_PARTIAL_ABORT.v3.json";
const target = path.join(root, "docs/experiments/patch-interface", name);
const body = `${JSON.stringify(artifact, null, 2)}\n`;
await persistAtomicExact(target, body, 0o644);
await persistAtomicExact(`${target}.sha256`, `${sha256(body)}  ${name}\n`, 0o644);
process.stdout.write(`${JSON.stringify({ output: path.relative(root, target).split(path.sep).join("/"), sha256: sha256(body), status: artifact.status, excludedPhysicalCalls: 7, promptPreflight: artifact.promptRemediationPreflight }, null, 2)}\n`);
