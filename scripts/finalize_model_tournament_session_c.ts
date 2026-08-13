import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const candidateIds = ["M1", "M2", "M3"] as const;

async function publish(target: string, contents: string) {
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || (await readFile(target, "utf8")) !== contents) {
      throw new Error(`Immutable collision: ${target}`);
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pending = `${target}.next.${process.pid}.${randomUUID()}`;
  const handle = await open(pending, "wx", 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(pending, target);
  } finally {
    await unlink(pending).catch(() => undefined);
  }
}

async function readRegular(relative: string) {
  const target = path.join(root, relative);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular file: ${relative}`);
  return readFile(target);
}

async function verifiedJson(relative: string) {
  const bytes = await readRegular(relative);
  const sidecar = `${relative}.sha256`;
  const sidecarBytes = await readRegular(sidecar);
  const digest = sha256(bytes);
  if (sidecarBytes.toString("utf8") !== `${digest}  ${path.basename(relative)}\n`) {
    throw new Error(`Invalid sidecar: ${relative}`);
  }
  return { path: relative, sha256: digest, bytes: bytes.byteLength, value: JSON.parse(bytes.toString("utf8")) as any };
}

async function verifiedJsonl(relative: string) {
  const bytes = await readRegular(relative);
  const sidecarBytes = await readRegular(`${relative}.sha256`);
  const digest = sha256(bytes);
  if (sidecarBytes.toString("utf8") !== `${digest}  ${path.basename(relative)}\n`) {
    throw new Error(`Invalid sidecar: ${relative}`);
  }
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) throw new Error(`JSONL is not newline terminated: ${relative}`);
  return {
    path: relative,
    sha256: digest,
    bytes: bytes.byteLength,
    rows: text.slice(0, -1).split("\n").map((line) => JSON.parse(line) as any),
  };
}

function stable(value: unknown) {
  return JSON.stringify(value);
}

function recomputeSummary(rows: any[]) {
  const count = (predicate: (row: any) => boolean) => rows.filter(predicate).length;
  const latencies = rows.map((row) => Number(row.modelCall.latencyMs)).sort((a, b) => a - b);
  const percentile = (p: number) => latencies[Math.ceil(p * latencies.length) - 1];
  return {
    mutationTasks: rows.length,
    policyTasks: 25,
    primaryModelCalls: rows.reduce((sum, row) => sum + row.modelCall.calls, 0),
    telemetryNonPrimaryCalls: 1,
    exactSourceSelected: count((row) => row.retrieval.exactSourceSelected),
    exactSourceIncluded: count((row) => row.retrieval.exactSourceIncluded),
    retrievalMisses: count((row) => !row.retrieval.exactSourceSelected),
    validActions: count((row) => row.normalization.classification === "VALID_EDIT"),
    actionValidationFailures: count((row) => row.outcome.firstFailureStage === "ACTION_VALIDATION"),
    patchConstructionPasses: count((row) => row.normalization.stages?.patchConstruction?.status === "PASS"),
    patchApplyPasses: count((row) => row.execution.patchApplied),
    syntaxPasses: count((row) => row.execution.syntax === "PASS"),
    visibleTestPasses: count((row) => row.execution.visible === "PASS"),
    hiddenTestPasses: count((row) => row.execution.hidden === "PASS"),
    behavioralSuccesses: count((row) => row.outcome.behavioralSuccess),
    wrongFileAttempts: count((row) => row.outcome.wrongFileAttempt),
    actualSafetyViolations: count((row) => row.outcome.actualSafetyViolation),
    rollbackFailures: count((row) => row.execution.rollback !== "PASS"),
    reportOnly: count((row) => row.outcome.reportOnly),
    malformedOutputs: count((row) => row.outcome.malformedOutput),
    emptyOutputs: count((row) => row.outcome.emptyOutput),
    timeouts: count((row) => row.outcome.timeout),
    cancelled: count((row) => row.outcome.cancelled),
    transportFailures: count((row) => row.outcome.transportFailure),
    totalPromptTokens: rows.reduce((sum, row) => sum + Number(row.modelCall.promptTokens), 0),
    totalCompletionTokens: rows.reduce((sum, row) => sum + Number(row.modelCall.completionTokens), 0),
    medianLatencyMs: percentile(0.5),
    p95LatencyMs: percentile(0.95),
  };
}

const sessionA = await verifiedJson("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_A.v1.json");
const sessionB = await verifiedJson("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_B.v1.json");
const prereg = await verifiedJson("benchmarks/model-specialization/PRACTICAL_LOCAL_MODEL_TOURNAMENT_PREREGISTRATION.v1.json");
const seal = await verifiedJson("benchmarks/model-specialization/MODEL_TOURNAMENT_SESSION_C_SEAL.v1.json");
if (sessionA.sha256 !== "9d6a610829405f146ee36651961273bd25c9d6264a1c54c1e20917e186af7200" || sessionA.value.status !== "PASS") throw new Error("Session A drift");
if (sessionB.sha256 !== "e2d05ad3f5b6b7ff97e37bfd256d94995c1dd5be830a6246454059786f5da833" || sessionB.value.status !== "PASS") throw new Error("Session B drift");
if (prereg.sha256 !== "51f983f63719494e8877eb7b24fcbc7a47b0b9fb53d5c1e2bb838961b87246c1") throw new Error("Tournament preregistration drift");
if (seal.sha256 !== "e7d3d76a74342423f67b538f34e19276d1b0fbdecc6541269897919d585fa50c" || seal.value.state !== "SEALED_BEFORE_FIRST_SESSION_C_PRIMARY_CALL") throw new Error("Session C seal drift");

const candidates: any[] = [];
let totalPrimaryCalls = 0;
let totalTelemetryCalls = 0;
let totalEvents = 0;
const globalObservationIds = new Set<string>();
for (const candidateId of candidateIds) {
  const lower = candidateId.toLowerCase();
  const runDirectory = `docs/experiments/runs/model-tournament-session-c-${lower}-v1`;
  const result = await verifiedJson(`${runDirectory}/result.json`);
  const cleanup = await verifiedJson(`${runDirectory}/cleanup.json`);
  const checkpoint = await verifiedJsonl(`${runDirectory}/observations.checkpoint.jsonl`);
  const callEvents = await verifiedJsonl(`${runDirectory}/call-events.jsonl`);
  const observationsFinal = await verifiedJson(`${runDirectory}/observations.final.json`);
  if (result.value.candidate.candidateId !== candidateId || result.value.classification !== "SESSION_C_DISCLOSED_PRIMARY_SCREENING") throw new Error(`${candidateId} result identity failed`);
  if (!new Set(["COMPLETE_PRIMARY_PENDING_CLEANUP", "INFRASTRUCTURE_BLOCKED_PENDING_CLEANUP"]).has(result.value.status)) throw new Error(`${candidateId} unexpected result status`);
  if (cleanup.value.status !== "PASS_FULLY_CLEANED" || cleanup.value.candidateId !== candidateId) throw new Error(`${candidateId} cleanup status failed`);
  if (checkpoint.rows.length !== 95 || callEvents.rows.length !== 285 || !Array.isArray(observationsFinal.value) || observationsFinal.value.length !== 95) throw new Error(`${candidateId} row counts failed`);
  if (sha256(`${checkpoint.rows.map((row) => JSON.stringify(row)).join("\n")}\n`) !== checkpoint.sha256 || stable(checkpoint.rows) !== stable(observationsFinal.value)) throw new Error(`${candidateId} checkpoint/final mismatch`);
  for (let index = 0; index < 95; index += 1) {
    const row = checkpoint.rows[index];
    const [intent, started, completed] = callEvents.rows.slice(index * 3, index * 3 + 3);
    if (row.index !== index || row.candidateId !== candidateId || row.modelCall.calls !== 1) throw new Error(`${candidateId} observation ${index} invalid`);
    if (globalObservationIds.has(row.observationId)) throw new Error(`Duplicate observation ID: ${row.observationId}`);
    globalObservationIds.add(row.observationId);
    if (intent.event !== "CALL_INTENT" || started.event !== "CALL_STARTED" || completed.event !== "CALL_COMPLETED") throw new Error(`${candidateId} event order ${index} invalid`);
    if ([intent, started, completed].some((event) => event.index !== index || event.observationId !== row.observationId)) throw new Error(`${candidateId} event identity ${index} invalid`);
    if (intent.intentSha256 !== started.intentSha256 || completed.outputSha256 !== row.modelCall.outputSha256 || completed.observationSha256 !== sha256(JSON.stringify(row))) throw new Error(`${candidateId} event binding ${index} invalid`);
    if (row.modelCall.rawPromptStored || row.modelCall.rawOutputStored || row.normalization.rawActionStored) throw new Error(`${candidateId} raw data persisted`);
  }
  const recomputed = recomputeSummary(checkpoint.rows);
  if (stable(recomputed) !== stable(result.value.summary)) throw new Error(`${candidateId} summary mismatch`);
  if (result.value.artifacts.checkpoint.sha256 !== checkpoint.sha256 || result.value.artifacts.callEvents.sha256 !== callEvents.sha256 || result.value.artifacts.observationsFinal.sha256 !== observationsFinal.sha256) throw new Error(`${candidateId} result artifact binding failed`);
  if (result.value.serving.finalIdentity !== "PASS" || result.value.telemetry.status !== "PASS" || !result.value.telemetry.invariantPass) throw new Error(`${candidateId} serving/telemetry failed`);
  if (cleanup.value.checks.modelProcessCount !== 0 || !cleanup.value.checks.port8000Clear || cleanup.value.checks.gpuMemoryMiB !== 0 || !cleanup.value.checks.ephemeralApiKeyAbsent || !cleanup.value.checks.servingStateRemoved || cleanup.value.checks.orphanWorktrees !== 0) throw new Error(`${candidateId} cleanup checks failed`);
  const transportFailures = recomputed.transportFailures;
  const scoringStatus = transportFailures === 0 ? "VALID_FOR_SESSION_D_ANALYSIS" : "INFRASTRUCTURE_BLOCKED_NOT_SCORED";
  if ((transportFailures === 0) !== (result.value.status === "COMPLETE_PRIMARY_PENDING_CLEANUP")) throw new Error(`${candidateId} infrastructure status mismatch`);
  totalPrimaryCalls += recomputed.primaryModelCalls;
  totalTelemetryCalls += recomputed.telemetryNonPrimaryCalls;
  totalEvents += callEvents.rows.length;
  candidates.push({
    candidateId,
    modelId: result.value.candidate.modelId,
    revision: result.value.candidate.revision,
    scoringStatus,
    infrastructureExclusion: transportFailures ? { transportFailures, consumedCalls: transportFailures, retryCalls: 0, classification: "POST_CALL_TRANSPORT_FAILURE_EXPLICITLY_EXCLUDED" } : null,
    result: { path: result.path, sha256: result.sha256 },
    cleanup: { path: cleanup.path, sha256: cleanup.sha256 },
    evidence: {
      checkpoint: { path: checkpoint.path, sha256: checkpoint.sha256, rows: checkpoint.rows.length },
      callEvents: { path: callEvents.path, sha256: callEvents.sha256, rows: callEvents.rows.length },
      observationsFinal: { path: observationsFinal.path, sha256: observationsFinal.sha256, rows: observationsFinal.value.length },
    },
    capability: recomputed,
    telemetry: result.value.telemetry,
  });
}
if (totalPrimaryCalls !== 285 || totalTelemetryCalls !== 3 || totalEvents !== 855 || globalObservationIds.size !== 285) throw new Error("Session C global call accounting failed");

const { stdout: processes } = await exec("ps", ["-eo", "args="]);
const { stdout: sockets } = await exec("ss", ["-ltn"]);
const { stdout: gpu } = await exec("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]);
const modelProcesses = processes.split("\n").filter((line) => /launch_model_tournament_candidate|vllm\.entrypoints/.test(line) && !line.includes("finalize_model_tournament_session_c"));
const port8000Clear = !sockets.split("\n").some((line) => /(?:^|:)8000\s/.test(line));
const gpuMemoryMiB = Number(gpu.trim());
const stateFiles = ["tournament-api-key", "tournament-start.json", "tournament-launch.json", "tournament-ready.json"];
const stateAbsent: boolean[] = [];
for (const name of stateFiles) {
  try { await lstat(path.join(root, ".runtime/model", name)); stateAbsent.push(false); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") stateAbsent.push(true); else throw error; }
}
if (modelProcesses.length || !port8000Clear || gpuMemoryMiB !== 0 || !stateAbsent.every(Boolean)) throw new Error("Session C boundary cleanup failed");

const sourcePaths = [
  "scripts/run_model_tournament_session_c.ts",
  "scripts/finalize_model_tournament_session_c.ts",
  "scripts/start_model_tournament_candidate.sh",
  "scripts/launch_model_tournament_candidate.py",
  "services/patch-interface-runtime/src/index.ts",
  "services/tool-runtime/src/index.ts",
  "services/repo-intelligence/src/index.ts",
  "package.json",
  "package-lock.json",
];
const sourceClosure = [];
for (const relative of sourcePaths) {
  const bytes = await readRegular(relative);
  sourceClosure.push({ path: relative, sha256: sha256(bytes), bytes: bytes.byteLength });
}
const sourceClosureSha256 = sha256(sourceClosure.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n"));

const value = {
  schemaVersion: 1,
  sessionId: "dca-practical-local-model-tournament-session-c-v1",
  session: "C",
  status: "PASS",
  classification: "PRIMARY_EXECUTION_COMPLETE_WITH_PREREGISTERED_INFRASTRUCTURE_EXCLUSION",
  completedAt: new Date().toISOString(),
  inputs: {
    sessionA: { path: sessionA.path, sha256: sessionA.sha256 },
    sessionB: { path: sessionB.path, sha256: sessionB.sha256 },
    preregistration: { path: prereg.path, sha256: prereg.sha256 },
    sessionCSeal: { path: seal.path, sha256: seal.sha256 },
  },
  contract: {
    candidateOrder: candidateIds,
    primaryTasksPerCandidate: 95,
    plannedPrimaryCalls: 285,
    physicalPrimaryCalls: totalPrimaryCalls,
    telemetryNonPrimaryCalls: totalTelemetryCalls,
    retries: 0,
    reviewerCalls: 0,
    duplicateObservationIds: 0,
    eventRows: totalEvents,
    taskSet: "FROZEN_95_MUTATION_TASKS",
    interface: "E_EDIT_P2_FROZEN",
    servingProfile: "VLLM_0_26_0_ONLINE_FP8_PER_TENSOR_W8A8_CONTEXT_8192",
    fairnessRequestIntentSha256: "c314e57a5a1cd66c6e699c61988e3432f136f379a6b52071141947c21229e23c",
    semanticPrimaryIntentSha256: "5abe5b15a1efa9bbf425dd0933b8c2470d63ef9e628bb3f0674a90cec774b685",
    productMutationDecision: "KEEP_MUTATION_DISABLED",
  },
  operationalNotes: [{ candidateId: "M3", event: "PRECALL_ENDPOINT_NOT_READY", durableCallEventsAtFailure: 0, durableCheckpointRowsAtFailure: 0, retryClassification: "ALLOWED_PRE_CALL_RECOVERY_NOT_A_SCORED_RETRY" }],
  candidates,
  interpretationBoundary: {
    pairedAnalysisPerformed: false,
    thresholdClassificationPerformed: false,
    modelWinnerSelected: false,
    productDecisionChanged: false,
    m3CapabilityResultEligible: false,
    reason: "M3 has two consumed post-call transport/truncation failures and is INFRASTRUCTURE_BLOCKED_NOT_SCORED; Session D must preserve the exclusion.",
  },
  sourceClosure: { sha256: sourceClosureSha256, entries: sourceClosure },
  cleanup: { modelProcessCount: modelProcesses.length, port8000Clear, gpuMemoryMiB, ephemeralApiKeyAndStateAbsent: stateAbsent.every(Boolean), candidateCleanups: 3 },
  validation: { ledgerCounts: "PASS", eventOrdering: "PASS", oneShotAccounting: "PASS", artifactSidecars: "PASS", resultRecomputation: "PASS", sourceClosure: "PASS", privacy: "PASS", cleanup: "PASS" },
  nextSession: { session: "D", status: "READY_SEPARATE_INVOCATION_REQUIRED", executedInThisInvocation: false },
  privacy: { rawPromptsStored: false, rawModelOutputsStored: false, rawActionsStored: false, hiddenOracleStored: false, apiKeysStored: false },
  protectedActions: { sessionD: false, retry: false, reviewer: false, additionalModelDownload: false, sudo: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, release: false, signing: false },
};
const body = `${JSON.stringify(value, null, 2)}\n`;
const relative = "docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_C.v1.json";
const target = path.join(root, relative);
await publish(target, body);
await publish(`${target}.sha256`, `${sha256(body)}  ${path.basename(target)}\n`);
process.stdout.write(`${JSON.stringify({ status: value.status, classification: value.classification, artifact: { path: relative, sha256: sha256(body) }, accounting: value.contract, candidates: candidates.map(({ candidateId, scoringStatus, capability, telemetry }) => ({ candidateId, scoringStatus, capability, telemetry })), cleanup: value.cleanup, nextSession: value.nextSession }, null, 2)}\n`);
