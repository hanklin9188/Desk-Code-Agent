import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { access, link, lstat, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PATCH_INTERFACE_P0_SCHEMA, PATCH_INTERFACE_P2_SCHEMA, PATCH_INTERFACE_P3_SCHEMA, PATCH_INTERFACE_P4_SCHEMA } from "../services/patch-interface-runtime/src/index";
import { computePatchInterfaceCausalClosure, type PatchInterfaceCausalClosure } from "./patch_interface_causal_closure";
import { probeExperimentEnvironmentFingerprint, probeInstalledModelRuntime } from "./model_serving_attestation";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const benchmarkRoot = path.join(root, "benchmarks/patch-interface");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function persistAtomicExact(target: string, contents: string, mode: number): Promise<void> {
  const expected = Buffer.from(contents);
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !(await readFile(target)).equals(expected)) throw new Error(`Immutable artifact collision: ${path.basename(target)}`);
    return;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const pending = `${target}.next.${process.pid}.${randomBytes(12).toString("hex")}`;
  const handle = await open(pending, "wx", mode);
  try { await handle.writeFile(expected); await handle.sync(); } finally { await handle.close(); }
  try {
    const pendingMetadata = await lstat(pending);
    if (!pendingMetadata.isFile() || pendingMetadata.isSymbolicLink() || !(await readFile(pending)).equals(expected)) throw new Error(`Immutable staging collision: ${path.basename(pending)}`);
    try { await link(pending, target); await syncDirectory(path.dirname(target)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !(await readFile(target)).equals(expected)) throw new Error(`Immutable artifact collision: ${path.basename(target)}`);
  } finally {
    try { await unlink(pending); await syncDirectory(path.dirname(target)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

type Task = { task_id: string; source_provenance?: string; mutation_certification: string };
type EvidenceRef = { path: string; sha256: string };
type PrecallSupersession = {
  schemaVersion: number;
  supersessionId: string;
  status: string;
  classification: string;
  supersededArtifacts: {
    securityRegression: { path: string; sha256: string };
    referenceActionPreflight: { path: string; sha256: string };
    preregistration: { path: string; sha256: string };
  };
  precallAbortEvidence: {
    failureCode: string;
    profileId: string;
    runDirectory: string;
    assignment: { path: string; sha256: string; preregistrationSha256: string };
    checkpoint: { path: string; sha256: string; bytes: number; records: number };
    callEvents: { path: string; sha256: string; bytes: number; records: number };
    callStartedEvents: number;
    modelCalls: number;
    lifecycle: { path: string; sha256: string; status: string };
    absentArtifacts: string[];
  };
  rootCause: { semanticValuesEqual: boolean; serializedOrderEqual: boolean; oldCausalClosureSha256: string };
  implementation: { generator: { path: string; sha256: string } };
  remediation: { source: { path: string; sha256: string }; comparator: string; newArtifactLineage: string[]; oldArtifactsModified: boolean; oldRunReused: boolean };
  protectedActions: Record<string, boolean>;
};

type V2PartialAbortSupersession = {
  schemaVersion: number;
  supersessionId: string;
  status: string;
  classification: string;
  recordedAt: string;
  supersededArtifacts: {
    v1PrecallSupersession: EvidenceRef;
    securityRegression: EvidenceRef;
    referenceActionPreflight: EvidenceRef;
    preregistration: EvidenceRef;
  };
  partialRun: {
    profileId: string;
    runDirectory: string;
    assignment: EvidenceRef & { preregistrationSha256: string };
    checkpoint: EvidenceRef & { bytes: number; records: number };
    callEvents: EvidenceRef & { bytes: number; records: number; started: number; completed: number; recovered: number };
    lifecycle: EvidenceRef & { status: string };
    unaffectedPrefix: Array<{ observationId: string; observationSha256: string; outputSha256: string; promptSha256: string }>;
    physicalModelCalls: number;
    validPrimaryObservations: number;
    excludedPhysicalCalls: number;
    callsOnAffectedTasks: number;
    firstAffectedIndex: number;
    firstAffectedObservationIdSha256: string;
    absentArtifacts: string[];
  };
  rootCause: { code: string; details: string[]; oldCausalClosureSha256: string; oldRunner: EvidenceRef; firstTriggerTaskId: string; nextDollarReplacementAffectedTaskId: string };
  promptRemediationPreflight: { tasks: number; passes: number; failures: number; totalPromptBytes: number; taskPromptHashesSha256: string; oldVersusCorrectedUnaffectedPrefixByteEqual: number; inheritedEventPromptHashesMatched: number; hiddenSourceLeaks: number; referenceFixLeaks: number };
  decisionIntegrity: { v3FreshRerunChosen: boolean; prefixImportedIntoPrimaryEvidence: boolean; principalDecisionLockedWithoutEffectivenessInput: boolean; subagentInspectedOneRowAfterOrIndependentOfDecision: boolean; subagentOutcomeCommunicatedBeforeDecision: boolean; effectivenessFieldsUsedForDecision: boolean; rationale: string };
  v3CallAccounting: { invalidPhysicalCallsBeforeV3Seal: number; validPrimaryCallsAtV3Seal: number; baselinePlannedAfterSeal: number; coderPlannedAfterSeal: number; totalValidPrimaryPlannedAfterSeal: number; finalPhysicalCallsAcrossV2AndV3: number };
  implementation: { generator: EvidenceRef; promptRuntime: EvidenceRef; remediatedRunner: EvidenceRef };
  newArtifactLineage: string[];
  protectedActions: Record<string, boolean>;
};

type V2Preregistration = {
  schemaVersion: number;
  preregistrationId: string;
  state: string;
  modelCallsAtSeal: number;
  causalClosure: { sha256: string };
  taskAssignment: { architectureBaseline: { taskIds: string[] }; totalNewModelCallsPerModel: number; totalPlannedNewModelCalls: number };
};

function exactKeys(value: unknown, keys: string[], label: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or extra fields`);
}

function assertSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} is not an exact SHA-256 digest`);
}

async function verifiedJson<T>(relative: string): Promise<{ value: T; path: string; sha256: string }> {
  const target = path.join(root, relative);
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${relative} is not a regular evidence file`);
  const bytes = await readFile(target);
  const sidecarPath = `${target}.sha256`;
  const sidecarMetadata = await lstat(sidecarPath);
  if (!sidecarMetadata.isFile() || sidecarMetadata.isSymbolicLink()) throw new Error(`${relative} checksum sidecar is not a regular file`);
  const actual = sha256(bytes);
  if (await readFile(sidecarPath, "utf8") !== `${actual}  ${path.basename(target)}\n`) throw new Error(`${relative} checksum sidecar mismatch`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: actual };
}

async function artifact(relative: string): Promise<{ path: string; sha256: string }> {
  const bytes = await readFile(path.join(root, relative));
  return { path: relative, sha256: sha256(bytes) };
}

function deterministicSelection(ids: string[], count: number, salt: string): string[] {
  if (ids.length < count) throw new Error(`Selection ${salt} requires ${count} IDs`);
  return [...ids].sort((left, right) => sha256(`${salt}:${left}`).localeCompare(sha256(`${salt}:${right}`))).slice(0, count).sort();
}

const [baselineAttestation, historicalAudit, securityRegression, precallSupersession, partialV2Supersession, v2SecurityRegression, v2ReferenceActionPreflight, v2Preregistration, manifest, oracle, oraclePreflight, oraclePreflightCaveat, referenceActionPreflight, modelManifests, acquisition] = await Promise.all([
  verifiedJson<Record<string, unknown>>("benchmarks/patch-interface/PATCH_INTERFACE_BASELINE_ATTESTATION.json"),
  verifiedJson<Record<string, unknown>>("docs/experiments/patch-interface/PATCH_PIPELINE_FAILURE_MATRIX.json"),
  verifiedJson<{ schemaVersion: number; regressionId: string; generatedAt: string; status: string; classification: string; deterministicSeed: number; taskContract: unknown; executionContract: { modelCalls: number; modelDownloads: number; dependencyInstalls: number; projectGitCommits: number; remoteConfigurations: number; pushes: number; pullRequests: number; tags: number; releases: number; externalNetworkActions: number; rawAdversarialOutputsPersisted: number; apiKeyContentsRead: boolean; apiKeyContentsStored: boolean }; corpus: { deterministicMutationInstances: number; structuralMutationTemplates: number }; rejectedActionIsolation: { constrainedPatchApplyAttemptsForRejectedActions: number }; hardIsolation: { lingeringProcesses: number }; positiveControl: { cleanupStatus: string; treeByteIdentical: boolean; indexByteIdentical: boolean; gitStatusUnchanged: boolean; lingeringProcesses: number }; projectIntegrity: { sourceClosureBefore: { files: Array<{ path: string; sha256: string }> }; sourceClosureByteIdentical: boolean; causalClosureBefore: PatchInterfaceCausalClosure; causalClosureAfterSha256: string; causalClosureAtPublicationSha256: string; causalClosureByteIdentical: boolean; gitStatusUnchangedBeforeArtifactPublication: boolean; indexByteIdentical: boolean }; privacy: { rawAdversarialStringsPersisted: boolean; persistedPerMutationEvidence: string; verifierOutputPersisted: string; realEnvironmentCredentialValuesInspected: boolean; verifierEnvironment: string; apiKeyContentsRead: boolean; apiKeyContentsStored: boolean }; mutations: unknown[]; failures: unknown[] }>("docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v3.json"),
  verifiedJson<PrecallSupersession>("docs/experiments/patch-interface/PATCH_INTERFACE_V1_PRECALL_ABORT.v2.json"),
  verifiedJson<V2PartialAbortSupersession>("docs/experiments/patch-interface/PATCH_INTERFACE_V2_PARTIAL_ABORT.v3.json"),
  verifiedJson<Record<string, unknown>>("docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v2.json"),
  verifiedJson<Record<string, unknown>>("benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v2.json"),
  verifiedJson<V2Preregistration>("benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v2.json"),
  verifiedJson<{ corpus: { tasks: number; reusedG4PatchTasks: number; newBehavioralMutationTasks: number }; tasks: Task[] }>("benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_MANIFEST.v1.json"),
  verifiedJson<{ manifestSha256: string; rows: Array<{ task_id: string }> }>("benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_ORACLE.v1.sealed.json"),
  verifiedJson<{ status: string; summary: { tasks: number; valid: number; failures: number }; contract: { noNetwork: string; hardIsolationProbe: { status: string } } }>("benchmarks/patch-interface/PATCH_INTERFACE_ORACLE_PREFLIGHT.v2.json"),
  verifiedJson<{ status: string; supersedingArtifact: { sha256: string } }>("benchmarks/patch-interface/PATCH_INTERFACE_ORACLE_PREFLIGHT_V1_NETWORK_CAVEAT.v2.json"),
  verifiedJson<{
    schemaVersion: number;
    preflightId: string;
    createdAt: string;
    status: string;
    classification: string;
    inputs: { manifest: EvidenceRef; oracle: EvidenceRef; hardenedOraclePreflight: EvidenceRef; networkCaveat: EvidenceRef; precallSupersession: EvidenceRef; partialV2Supersession: EvidenceRef };
    implementation: { runner: EvidenceRef; patchInterfaceRuntime: EvidenceRef; toolRuntime: EvidenceRef; causalClosure: Awaited<ReturnType<typeof computePatchInterfaceCausalClosure>> };
    contract: { tasks: number; adaptersPerTask: number; expectedAdapterExecutions: number; plannedLiveSchedulePerProfile: number; modelCalls: number; gitCommit: boolean; hardNetworkIsolation: boolean; nodePermissionModel: boolean; rawActionsStored: boolean; referenceFixedSourceStored: boolean; profiles: number; materializedRequestIntents: number; materializedRequestIntentsSha256: string; materializedRequestIntentsByProfileSha256: { baseline: string; coder: string }; rawPromptsStored: boolean };
    summary: { tasks: number; adapterExecutions: number; passes: number; failures: number; projectStatusUnchanged: boolean };
    rows: Array<{ taskId: string; adapter: string; pass: boolean; rawActionStored: boolean; referenceSourceStored: boolean }>;
    protectedActions: Record<string, boolean>;
  }>("benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v3.json"),
  verifiedJson<Record<string, unknown>>("benchmarks/model-specialization/EXACT_MODEL_MANIFESTS.json"),
  verifiedJson<Record<string, unknown>>("benchmarks/model-specialization/MODEL_ACQUISITION_STATUS.v2.json")
]);

if (manifest.value.corpus.tasks !== 50 || manifest.value.tasks.length !== 50 || manifest.value.corpus.reusedG4PatchTasks !== 25 || manifest.value.corpus.newBehavioralMutationTasks !== 25) throw new Error("Development manifest must contain the fixed 25+25 task composition");
if (oracle.value.manifestSha256 !== manifest.sha256 || oracle.value.rows.length !== 50) throw new Error("Oracle must bind all 50 exact manifest tasks");
if (oraclePreflight.value.status !== "PASS" || oraclePreflight.value.summary.tasks !== 50 || oraclePreflight.value.summary.valid !== 50 || oraclePreflight.value.summary.failures !== 0) throw new Error("All 50 behavioral oracles must pass preflight before preregistration");
if (oraclePreflight.value.contract.noNetwork !== "HARD_USER_NETWORK_NAMESPACE" || oraclePreflight.value.contract.hardIsolationProbe.status !== "PASS" || oraclePreflightCaveat.value.status !== "V1_NETWORK_CLAIM_SUPERSEDED_ONLY" || oraclePreflightCaveat.value.supersedingArtifact.sha256 !== oraclePreflight.sha256) throw new Error("Hardened oracle preflight and V1 network caveat are not mutually bound");
exactKeys(referenceActionPreflight.value, ["schemaVersion", "preflightId", "createdAt", "status", "classification", "inputs", "implementation", "contract", "summary", "rows", "protectedActions"], "V3 reference-action preflight");
if (referenceActionPreflight.value.schemaVersion !== 1 || referenceActionPreflight.value.preflightId !== "dca-patch-interface-reference-action-preflight-v3" || !Number.isFinite(Date.parse(referenceActionPreflight.value.createdAt)) || referenceActionPreflight.value.status !== "PASS" || referenceActionPreflight.value.classification !== "DEVELOPMENT_ONLY_ZERO_MODEL_CALL_REFERENCE_PATH_PROOF" || referenceActionPreflight.value.summary.tasks !== 50 || referenceActionPreflight.value.summary.adapterExecutions !== 500 || referenceActionPreflight.value.summary.passes !== 500 || referenceActionPreflight.value.summary.failures !== 0 || !referenceActionPreflight.value.summary.projectStatusUnchanged) throw new Error("All 50 tasks across all 10 adapters must be the exact V3 zero-model-call reference preflight PASS");
exactKeys(securityRegression.value, ["schemaVersion", "regressionId", "generatedAt", "classification", "status", "deterministicSeed", "taskContract", "executionContract", "corpus", "rejectedActionIsolation", "hardIsolation", "positiveControl", "projectIntegrity", "privacy", "mutations", "failures"], "V3 security regression");
exactKeys(securityRegression.value.executionContract, ["modelCalls", "modelDownloads", "dependencyInstalls", "projectGitCommits", "remoteConfigurations", "pushes", "pullRequests", "tags", "releases", "externalNetworkActions", "rawAdversarialOutputsPersisted", "apiKeyContentsRead", "apiKeyContentsStored"], "V3 security execution contract");
exactKeys(securityRegression.value.privacy, ["rawAdversarialStringsPersisted", "persistedPerMutationEvidence", "verifierOutputPersisted", "realEnvironmentCredentialValuesInspected", "verifierEnvironment", "apiKeyContentsRead", "apiKeyContentsStored"], "V3 security privacy contract");
if (securityRegression.value.schemaVersion !== 1 || securityRegression.value.regressionId !== "dca-patch-action-interface-security-regression-v3" || securityRegression.value.status !== "PASS" || securityRegression.value.classification !== "DEVELOPMENT_ONLY_DETERMINISTIC_NO_MODEL_SECURITY_EVIDENCE" || securityRegression.value.corpus.deterministicMutationInstances !== 1_540 || securityRegression.value.corpus.structuralMutationTemplates !== 77 || securityRegression.value.rejectedActionIsolation.constrainedPatchApplyAttemptsForRejectedActions !== 0 || securityRegression.value.hardIsolation.lingeringProcesses !== 0 || securityRegression.value.positiveControl.cleanupStatus !== "PASS" || !securityRegression.value.positiveControl.treeByteIdentical || !securityRegression.value.positiveControl.indexByteIdentical || !securityRegression.value.positiveControl.gitStatusUnchanged || securityRegression.value.positiveControl.lingeringProcesses !== 0 || !securityRegression.value.projectIntegrity.sourceClosureByteIdentical || !securityRegression.value.projectIntegrity.causalClosureByteIdentical || !securityRegression.value.projectIntegrity.gitStatusUnchangedBeforeArtifactPublication || !securityRegression.value.projectIntegrity.indexByteIdentical) throw new Error("Security regression must be the exact V3 all-pass causal-integrity evidence before sealing");
if (!Number.isFinite(Date.parse(securityRegression.value.generatedAt)) || securityRegression.value.deterministicSeed !== 20260809 || securityRegression.value.mutations.length !== 1_540 || securityRegression.value.failures.length !== 0 || Object.entries(securityRegression.value.executionContract).some(([key, value]) => key.startsWith("apiKey") ? value !== false : value !== 0) || securityRegression.value.privacy.rawAdversarialStringsPersisted !== false || securityRegression.value.privacy.persistedPerMutationEvidence !== "hash/operator/category/stage/gate/outcome only" || securityRegression.value.privacy.verifierOutputPersisted !== "sha256 only" || securityRegression.value.privacy.realEnvironmentCredentialValuesInspected !== false || securityRegression.value.privacy.verifierEnvironment !== "explicit allowlist; parent credential variables are not inherited" || securityRegression.value.privacy.apiKeyContentsRead !== false || securityRegression.value.privacy.apiKeyContentsStored !== false) throw new Error("V3 security zero-call/privacy evidence is invalid");
const abort = precallSupersession.value.precallAbortEvidence;
const superseded = precallSupersession.value.supersededArtifacts;
const expectedAbortAbsent = [
  `${abort.runDirectory}/result.json`, `${abort.runDirectory}/result.json.sha256`,
  `${abort.runDirectory}/observations.final.json`, `${abort.runDirectory}/observations.final.json.sha256`,
  `${abort.runDirectory}/recovery.json`,
  ".runtime/patch-interface-experiment/d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6-baseline.active.lock",
  ".runtime/patch-interface-experiment/d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6-baseline.active.lock.recovery",
  ".runtime/model/api-key", ".runtime/model/profile-start.json", ".runtime/model/profile-launch.json", ".runtime/model/profile-ready.json"
];
if (precallSupersession.value.schemaVersion !== 1 || precallSupersession.value.supersessionId !== "dca-patch-interface-v1-precall-abort-v2" || precallSupersession.value.status !== "V1_SUPERSEDED_AFTER_VERIFIED_PRECALL_ABORT" || precallSupersession.value.classification !== "DEVELOPMENT_ONLY_APPEND_ONLY_CAUSAL_CORRECTION" || abort.failureCode !== "INSTALLED_RUNTIME_KEY_ORDER_SENSITIVE_COMPARISON" || abort.profileId !== "baseline" || abort.runDirectory !== "docs/experiments/runs/patch-interface-baseline-20260810T0054" || abort.assignment.path !== ".runtime/patch-interface-experiment/d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6-baseline.assignment.json" || abort.assignment.sha256 !== "5f6903bc2de0d8547d721545e3a9b5bfeaffa33b50f647c667f5596fff326186" || abort.assignment.preregistrationSha256 !== "d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6" || abort.modelCalls !== 0 || abort.callStartedEvents !== 0 || abort.checkpoint.path !== `${abort.runDirectory}/observations.checkpoint.jsonl` || abort.checkpoint.bytes !== 0 || abort.checkpoint.records !== 0 || abort.checkpoint.sha256 !== sha256("") || abort.callEvents.path !== `${abort.runDirectory}/call-events.jsonl` || abort.callEvents.bytes !== 0 || abort.callEvents.records !== 0 || abort.callEvents.sha256 !== sha256("") || abort.lifecycle.path !== `${abort.runDirectory}/lifecycle.json` || abort.lifecycle.status !== "PASS" || abort.lifecycle.sha256 !== "df4cdf42b28243571f3b48dd9bd55990f4333279effae027c295ba4782ab247a" || JSON.stringify(abort.absentArtifacts) !== JSON.stringify(expectedAbortAbsent) || precallSupersession.value.rootCause.oldCausalClosureSha256 !== "d46ac86623e3093625056633ba3b902cf51bcb4fde51c06cec428f9932847969" || precallSupersession.value.rootCause.semanticValuesEqual !== true || precallSupersession.value.rootCause.serializedOrderEqual !== false || precallSupersession.value.remediation.comparator !== "EXACT_KEYS_AND_FIELD_WISE_VALUE_COMPARISON" || precallSupersession.value.remediation.oldArtifactsModified !== false || precallSupersession.value.remediation.oldRunReused !== false || Object.values(precallSupersession.value.protectedActions).some((flag) => flag !== false)) throw new Error("V1 pre-call abort supersession evidence is invalid");
if (superseded.securityRegression.path !== "docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v1.json" || superseded.securityRegression.sha256 !== "aec9da588343fe638599df4efc9bc2593f4a8450ec7a277fb482eff9c702c391" || superseded.referenceActionPreflight.path !== "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v1.json" || superseded.referenceActionPreflight.sha256 !== "a204e693c532dba23f985259effbcd1d35eb53878127c5bf871ecce0efee093c" || superseded.preregistration.path !== "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v1.json" || superseded.preregistration.sha256 !== "d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6") throw new Error("V1 superseded artifact lineage changed");

const partial = partialV2Supersession.value;
const partialRun = partial.partialRun;
exactKeys(partial, ["schemaVersion", "supersessionId", "status", "classification", "recordedAt", "supersededArtifacts", "partialRun", "rootCause", "promptRemediationPreflight", "decisionIntegrity", "v3CallAccounting", "implementation", "newArtifactLineage", "protectedActions"], "V2 partial-abort supersession");
exactKeys(partial.supersededArtifacts, ["v1PrecallSupersession", "securityRegression", "referenceActionPreflight", "preregistration"], "V2 partial superseded artifacts");
exactKeys(partialRun, ["profileId", "runDirectory", "assignment", "checkpoint", "callEvents", "lifecycle", "unaffectedPrefix", "physicalModelCalls", "validPrimaryObservations", "excludedPhysicalCalls", "callsOnAffectedTasks", "firstAffectedIndex", "firstAffectedObservationIdSha256", "absentArtifacts"], "V2 partial run");
exactKeys(partial.rootCause, ["code", "details", "oldCausalClosureSha256", "oldRunner", "firstTriggerTaskId", "nextDollarReplacementAffectedTaskId"], "V2 partial root cause");
exactKeys(partial.rootCause.oldRunner, ["path", "sha256"], "V2 partial old runner");
exactKeys(partial.promptRemediationPreflight, ["tasks", "passes", "failures", "totalPromptBytes", "taskPromptHashesSha256", "oldVersusCorrectedUnaffectedPrefixByteEqual", "inheritedEventPromptHashesMatched", "hiddenSourceLeaks", "referenceFixLeaks"], "V2 partial prompt remediation preflight");
exactKeys(partial.decisionIntegrity, ["v3FreshRerunChosen", "prefixImportedIntoPrimaryEvidence", "principalDecisionLockedWithoutEffectivenessInput", "subagentInspectedOneRowAfterOrIndependentOfDecision", "subagentOutcomeCommunicatedBeforeDecision", "effectivenessFieldsUsedForDecision", "rationale"], "V2 partial decision integrity");
exactKeys(partial.v3CallAccounting, ["invalidPhysicalCallsBeforeV3Seal", "validPrimaryCallsAtV3Seal", "baselinePlannedAfterSeal", "coderPlannedAfterSeal", "totalValidPrimaryPlannedAfterSeal", "finalPhysicalCallsAcrossV2AndV3"], "V2 partial V3 call accounting");
exactKeys(partial.implementation, ["generator", "promptRuntime", "remediatedRunner"], "V2 partial implementation");
for (const [label, reference, keys] of [
  ["V1 pre-call supersession", partial.supersededArtifacts.v1PrecallSupersession, ["path", "sha256"]],
  ["V2 security regression", partial.supersededArtifacts.securityRegression, ["path", "sha256"]],
  ["V2 reference preflight", partial.supersededArtifacts.referenceActionPreflight, ["path", "sha256"]],
  ["V2 preregistration", partial.supersededArtifacts.preregistration, ["path", "sha256"]],
  ["V2 partial assignment", partialRun.assignment, ["path", "sha256", "preregistrationSha256"]],
  ["V2 partial checkpoint", partialRun.checkpoint, ["path", "sha256", "bytes", "records"]],
  ["V2 partial call events", partialRun.callEvents, ["path", "sha256", "bytes", "records", "started", "completed", "recovered"]],
  ["V2 partial lifecycle", partialRun.lifecycle, ["path", "sha256", "status"]],
  ["V2 partial generator", partial.implementation.generator, ["path", "sha256"]],
  ["V2 partial prompt runtime", partial.implementation.promptRuntime, ["path", "sha256"]],
  ["V2 partial remediated runner", partial.implementation.remediatedRunner, ["path", "sha256"]]
] as const) exactKeys(reference, [...keys], label);
for (const [label, reference] of Object.entries({ ...partial.supersededArtifacts, assignment: partialRun.assignment, checkpoint: partialRun.checkpoint, callEvents: partialRun.callEvents, lifecycle: partialRun.lifecycle, ...partial.implementation })) {
  assertSha256(reference.sha256, `V2 partial ${label} hash`);
}
if (precallSupersession.sha256 !== "a9d7c7d57c4c2b695d0674c3bc4cb0dc857a8ad2f5e8e0c56d6de4af2169151a" || v2SecurityRegression.sha256 !== "c916d5aa9acf64d77aa7c2ebf9b316c784603194de11c729147c19efd6e757fd" || v2ReferenceActionPreflight.sha256 !== "367ef7bd6591173119a13d9300c2decf33584a9c24ecf3e4ce9924f1b5225251" || v2Preregistration.sha256 !== "b04336814ebf814b44f249550306e592a88b67ad7ce1ef9720c6cdf442cc6aad") throw new Error("Immutable V2 artifact hash lineage changed");
if (v2Preregistration.value.schemaVersion !== 1 || v2Preregistration.value.preregistrationId !== "dca-patch-action-interface-decomposition-v2" || v2Preregistration.value.state !== "SEALED_BEFORE_FIRST_NEW_MODEL_CALL" || v2Preregistration.value.modelCallsAtSeal !== 0 || v2Preregistration.value.causalClosure.sha256 !== "653d1f6d3062638f437624c4593ce04e9ef9d8cd5b44430ce847efff7330a931" || v2Preregistration.value.taskAssignment.architectureBaseline.taskIds.length !== 50 || v2Preregistration.value.taskAssignment.totalNewModelCallsPerModel !== 420 || v2Preregistration.value.taskAssignment.totalPlannedNewModelCalls !== 840) throw new Error("V2 preregistration no longer has its exact sealed zero-call 420-per-profile contract");
for (const [key, expected] of [
  ["v1PrecallSupersession", precallSupersession], ["securityRegression", v2SecurityRegression], ["referenceActionPreflight", v2ReferenceActionPreflight], ["preregistration", v2Preregistration]
] as const) {
  const actual = partial.supersededArtifacts[key];
  if (actual.path !== expected.path || actual.sha256 !== expected.sha256) throw new Error(`V2 partial artifact lineage mismatch: ${key}`);
}
const expectedPartialRunDirectory = "docs/experiments/runs/patch-interface-baseline-v2-20260810T0125";
const expectedPartialAbsent = [
  `${expectedPartialRunDirectory}/result.json`, `${expectedPartialRunDirectory}/result.json.sha256`,
  `${expectedPartialRunDirectory}/observations.final.json`, `${expectedPartialRunDirectory}/observations.final.json.sha256`,
  `${expectedPartialRunDirectory}/recovery.json`,
  `.runtime/patch-interface-experiment/${v2Preregistration.sha256}-baseline.active.lock`,
  `.runtime/patch-interface-experiment/${v2Preregistration.sha256}-baseline.active.lock.recovery`,
  ".runtime/model/api-key", ".runtime/model/profile-start.json", ".runtime/model/profile-launch.json", ".runtime/model/profile-ready.json"
];
if (partial.schemaVersion !== 1 || partial.supersessionId !== "dca-patch-interface-v2-partial-abort-v3" || partial.status !== "V2_PARTIAL_RUN_INVALID_INFRASTRUCTURE_EXCLUDED" || partial.classification !== "DEVELOPMENT_ONLY_APPEND_ONLY_NONRESULT_DEPENDENT_CORRECTION" || !Number.isFinite(Date.parse(partial.recordedAt))) throw new Error("V2 partial-abort supersession identity is invalid");
if (partialRun.profileId !== "baseline" || partialRun.runDirectory !== expectedPartialRunDirectory || partialRun.assignment.path !== `.runtime/patch-interface-experiment/${v2Preregistration.sha256}-baseline.assignment.json` || partialRun.assignment.sha256 !== "8b4ace854bd12b7a77870958f90620697b205299bf8d3cbcf283ee950de3a27d" || partialRun.assignment.preregistrationSha256 !== v2Preregistration.sha256 || partialRun.checkpoint.path !== `${expectedPartialRunDirectory}/observations.checkpoint.jsonl` || partialRun.checkpoint.sha256 !== "f0be8ffd8c9dde126d9873e7668ef984f73f59cbb9837b9dd0fd79f4f75a57e9" || partialRun.checkpoint.bytes !== 46_685 || partialRun.checkpoint.records !== 7 || partialRun.callEvents.path !== `${expectedPartialRunDirectory}/call-events.jsonl` || partialRun.callEvents.sha256 !== "70746c10fcafc030d585b66f8147598c4b22643b4fbc65ee0ce44c8004c2f29e" || partialRun.callEvents.bytes !== 5_240 || partialRun.callEvents.records !== 14 || partialRun.callEvents.started !== 7 || partialRun.callEvents.completed !== 7 || partialRun.callEvents.recovered !== 0 || partialRun.lifecycle.path !== `${expectedPartialRunDirectory}/lifecycle.json` || partialRun.lifecycle.sha256 !== "949b68fd43b467e798fcdc68b655ab9b6a78d3f5890040c654e5869640f0553a" || partialRun.lifecycle.status !== "PASS" || JSON.stringify(partialRun.absentArtifacts) !== JSON.stringify(expectedPartialAbsent)) throw new Error("V2 partial-run evidence paths, hashes, counts, or closure state changed");
if (partialRun.physicalModelCalls !== 7 || partialRun.validPrimaryObservations !== 0 || partialRun.excludedPhysicalCalls !== 7 || partialRun.callsOnAffectedTasks !== 0 || partialRun.firstAffectedIndex !== 7 || partialRun.firstAffectedObservationIdSha256 !== "7241586c75b6bdf1e9c0113489c7b53cc2c8a8f5760a9d2d3e411aa231fb0e58") throw new Error("V2 partial-run exclusion accounting changed");
if (partialRun.unaffectedPrefix.length !== 7 || new Set(partialRun.unaffectedPrefix.map((row) => row.observationId)).size !== 7) throw new Error("V2 partial-run unaffected prefix must contain exactly seven unique rows");
for (const [index, row] of partialRun.unaffectedPrefix.entries()) {
  exactKeys(row, ["observationId", "observationSha256", "outputSha256", "promptSha256"], `V2 partial unaffected prefix ${index}`);
  if (row.observationId !== `baseline::P0_EXACT::${v2Preregistration.value.taskAssignment.architectureBaseline.taskIds[index]}`) throw new Error(`V2 partial unaffected prefix schedule mismatch at ${index}`);
  assertSha256(row.observationSha256, `V2 partial observation ${index}`); assertSha256(row.outputSha256, `V2 partial output ${index}`); assertSha256(row.promptSha256, `V2 partial prompt ${index}`);
}
if (sha256(partialRun.unaffectedPrefix.map((row) => row.observationId).join("\n")) !== "0cac612cddac3b230bf2a7530eceeec19b1adc26aac1f970aea4f42e1a668dc9" || sha256(partialRun.unaffectedPrefix.map((row) => row.observationSha256).join("\n")) !== "d3d2713ac23fa1e420c38cf5e41984a6ba205f210d7e9b7087a1e37f8f3b659a") throw new Error("V2 partial-run prefix hashes changed");
if (partial.rootCause.code !== "PROMPT_RENDERER_FAIL_CLOSED_BEFORE_FIRST_AFFECTED_CALL" || JSON.stringify(partial.rootCause.details) !== JSON.stringify(["POST_INJECTION_PLACEHOLDER_SCAN_FALSE_POSITIVE", "REPLACEMENT_STRING_DOLLAR_EXPANSION"]) || partial.rootCause.oldCausalClosureSha256 !== v2Preregistration.value.causalClosure.sha256 || partial.rootCause.oldRunner.path !== "scripts/run_patch_interface_experiment.ts" || partial.rootCause.oldRunner.sha256 !== "32749fa03686f133a2e0c19f6a20238c45d1cf3cbe210a79bb8cb329756376bb" || partial.rootCause.firstTriggerTaskId !== v2Preregistration.value.taskAssignment.architectureBaseline.taskIds[7] || partial.rootCause.nextDollarReplacementAffectedTaskId !== v2Preregistration.value.taskAssignment.architectureBaseline.taskIds[8]) throw new Error("V2 partial-run renderer root-cause boundary changed");
const promptPreflight = partial.promptRemediationPreflight;
if (promptPreflight.tasks !== 50 || promptPreflight.passes !== 50 || promptPreflight.failures !== 0 || promptPreflight.totalPromptBytes !== 69_687 || promptPreflight.taskPromptHashesSha256 !== "97c80839d7b1505ff7981f2598f5acc0d016826f64f305b694448d2d2070fb0e" || promptPreflight.oldVersusCorrectedUnaffectedPrefixByteEqual !== 7 || promptPreflight.inheritedEventPromptHashesMatched !== 7 || promptPreflight.hiddenSourceLeaks !== 0 || promptPreflight.referenceFixLeaks !== 0) throw new Error("V2 partial-run prompt remediation evidence changed");
const decision = partial.decisionIntegrity;
if (decision.v3FreshRerunChosen !== true || decision.prefixImportedIntoPrimaryEvidence !== false || decision.principalDecisionLockedWithoutEffectivenessInput !== true || decision.subagentInspectedOneRowAfterOrIndependentOfDecision !== true || decision.subagentOutcomeCommunicatedBeforeDecision !== false || decision.effectivenessFieldsUsedForDecision !== false || decision.rationale !== "Missing persisted end-of-run serving identity and causal-closure attestation for the partial segment") throw new Error("V3 fresh-rerun decision integrity changed");
const callAccounting = partial.v3CallAccounting;
if (callAccounting.invalidPhysicalCallsBeforeV3Seal !== 7 || callAccounting.validPrimaryCallsAtV3Seal !== 0 || callAccounting.baselinePlannedAfterSeal !== 420 || callAccounting.coderPlannedAfterSeal !== 420 || callAccounting.totalValidPrimaryPlannedAfterSeal !== 840 || callAccounting.finalPhysicalCallsAcrossV2AndV3 !== 847) throw new Error("V3 physical/primary call accounting changed");
if (JSON.stringify(partial.newArtifactLineage) !== JSON.stringify(["docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v3.json", "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v3.json", "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v3.json"])) throw new Error("V2 partial supersession V3 artifact lineage changed");
exactKeys(partial.protectedActions, ["modelCall", "modelDownload", "dependencyInstall", "sudoAdmin", "commit", "remoteConfiguration", "push", "pullRequest", "tag", "signing", "release"], "V2 partial protected actions");
if (Object.values(partial.protectedActions).some((flag) => flag !== false)) throw new Error("V2 partial supersession records a protected side effect");

exactKeys(referenceActionPreflight.value.inputs, ["manifest", "oracle", "hardenedOraclePreflight", "networkCaveat", "precallSupersession", "partialV2Supersession"], "V3 reference-action preflight inputs");
exactKeys(referenceActionPreflight.value.implementation, ["runner", "patchInterfaceRuntime", "toolRuntime", "causalClosure"], "V3 reference-action preflight implementation");
exactKeys(referenceActionPreflight.value.summary, ["tasks", "adapterExecutions", "passes", "failures", "projectStatusUnchanged"], "V3 reference-action preflight summary");
exactKeys(referenceActionPreflight.value.contract, ["tasks", "adaptersPerTask", "expectedAdapterExecutions", "plannedLiveSchedulePerProfile", "modelCalls", "gitCommit", "hardNetworkIsolation", "nodePermissionModel", "rawActionsStored", "referenceFixedSourceStored", "profiles", "materializedRequestIntents", "materializedRequestIntentsSha256", "materializedRequestIntentsByProfileSha256", "rawPromptsStored"], "V3 reference-action preflight contract");
exactKeys(referenceActionPreflight.value.contract.materializedRequestIntentsByProfileSha256, ["baseline", "coder"], "V3 reference per-profile request intents");
if (referenceActionPreflight.value.contract.tasks !== 50 || referenceActionPreflight.value.contract.adaptersPerTask !== 10 || referenceActionPreflight.value.contract.expectedAdapterExecutions !== 500 || referenceActionPreflight.value.contract.plannedLiveSchedulePerProfile !== 420 || referenceActionPreflight.value.contract.modelCalls !== 0 || referenceActionPreflight.value.contract.gitCommit !== false || referenceActionPreflight.value.contract.hardNetworkIsolation !== true || referenceActionPreflight.value.contract.nodePermissionModel !== true || referenceActionPreflight.value.contract.rawActionsStored !== false || referenceActionPreflight.value.contract.referenceFixedSourceStored !== false || referenceActionPreflight.value.contract.profiles !== 2 || referenceActionPreflight.value.contract.materializedRequestIntents !== 840 || referenceActionPreflight.value.contract.rawPromptsStored !== false) throw new Error("Reference action preflight contract differs from the sealed 50×10 zero-call and 2×420 intent design");
assertSha256(referenceActionPreflight.value.contract.materializedRequestIntentsSha256, "V3 reference materialized request intents");
assertSha256(referenceActionPreflight.value.contract.materializedRequestIntentsByProfileSha256.baseline, "V3 reference baseline request intents");
assertSha256(referenceActionPreflight.value.contract.materializedRequestIntentsByProfileSha256.coder, "V3 reference coder request intents");
exactKeys(referenceActionPreflight.value.protectedActions, ["modelCall", "modelDownload", "dependencyInstall", "sudoAdmin", "commit", "remote", "push", "pullRequest", "tag", "signing", "release"], "V3 reference-action preflight protected actions");
if (Object.values(referenceActionPreflight.value.protectedActions).some((flag) => flag !== false)) throw new Error("V3 reference-action preflight records a protected side effect");
for (const [key, expected] of [
  ["manifest", manifest], ["oracle", oracle], ["hardenedOraclePreflight", oraclePreflight], ["networkCaveat", oraclePreflightCaveat], ["precallSupersession", precallSupersession], ["partialV2Supersession", partialV2Supersession]
] as const) {
  const actual = referenceActionPreflight.value.inputs[key];
  if (!actual || actual.path !== expected.path || actual.sha256 !== expected.sha256) throw new Error(`Reference action preflight input binding mismatch: ${key}`);
}
if (!manifest.value.tasks.every((task) => task.mutation_certification === "SAFE_MUTATION_REQUIRED")) throw new Error("Every task must be explicitly safe and mutation-required");

let apiKeyPresent = true;
try { await access(path.join(root, ".runtime/model/api-key")); } catch { apiKeyPresent = false; }
const staleServingState: string[] = [];
for (const name of ["profile-start.json", "profile-launch.json", "profile-ready.json"]) {
  try { await access(path.join(root, ".runtime/model", name)); staleServingState.push(name); } catch { /* absent is required */ }
}
const [{ stdout: listeners }, { stdout: gpu }] = await Promise.all([
  execFileAsync("ss", ["-ltn"], { timeout: 5_000 }),
  execFileAsync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { timeout: 5_000 })
]);
const port8000Clear = !listeners.split("\n").some((line) => line.includes(":8000"));
const gpuMemoryMiB = Number(gpu.trim().split(/\s+/)[0]);
if (!port8000Clear || apiKeyPresent || gpuMemoryMiB > 512 || staleServingState.length) throw new Error("Preregistration requires no active model residency, listener, API key, or stale serving attestation");

const [environmentFingerprint, installedModelRuntime] = await Promise.all([probeExperimentEnvironmentFingerprint(root), probeInstalledModelRuntime(root)]);

const allIds = manifest.value.tasks.map((task) => task.task_id).sort();
if (JSON.stringify(v2Preregistration.value.taskAssignment.architectureBaseline.taskIds) !== JSON.stringify(allIds)) throw new Error("V3 task order differs from the exact V2 50-task schedule input");
const reusedIds = allIds.filter((id) => id.startsWith("g4-dev-patch-"));
const newIds = allIds.filter((id) => !id.startsWith("g4-dev-patch-"));
if (reusedIds.length !== 25 || newIds.length !== 25) throw new Error("Task provenance split must be 25 reused and 25 newly authored");
const balancedTwelve = [...deterministicSelection(reusedIds, 6, "patch-interface-balanced-old-v1"), ...deterministicSelection(newIds, 6, "patch-interface-balanced-new-v1")].sort();
const granularityTwelve = deterministicSelection(newIds, 12, "patch-interface-granularity-new-v1");
if (sha256(allIds.join("\n")) !== "6f9a4f5375b4297d4a30899d15d2296aa929b5d16848a79da2ddd705e59b8312" || sha256(balancedTwelve.join("\n")) !== "ff0b3e0b4babeaa7eb2947bb358ca0a94cc4db6d739e267d6cf0fccf96b1f85d" || sha256(granularityTwelve.join("\n")) !== "ee6ab04ac9b2602999a484b25d98fca3d53bb7981efdee804f2e689294af59f0") throw new Error("V3 task assignment or deterministic selection salts differ from V2");
const freshCallsPerProfile = allIds.length + (5 * allIds.length) + (5 * balancedTwelve.length) + (2 * balancedTwelve.length) + (2 * balancedTwelve.length) + granularityTwelve.length;
if (freshCallsPerProfile !== 420 || freshCallsPerProfile * 2 !== 840) throw new Error("V3 fresh schedule must remain exactly 420 calls per profile and 840 total");
const referenceAdapters = ["P0", "P1", "P2", "P3", "P4", "SCHEMA_S1", "SCHEMA_S2", "REPORT_AVAILABLE", "REPORT_UNAVAILABLE", "WHOLE_FILE"];
const expectedReferenceRows = allIds.flatMap((taskId) => referenceAdapters.map((adapter) => `${taskId}\0${adapter}`)).sort();
const actualReferenceRows = referenceActionPreflight.value.rows.map((row) => {
  if (!row.pass || row.rawActionStored !== false || row.referenceSourceStored !== false) throw new Error(`Reference action preflight includes a failed or raw-content row: ${row.taskId}/${row.adapter}`);
  return `${row.taskId}\0${row.adapter}`;
}).sort();
if (actualReferenceRows.length !== 500 || new Set(actualReferenceRows).size !== 500 || actualReferenceRows.some((row, index) => row !== expectedReferenceRows[index])) throw new Error("Reference action preflight rows do not equal the exact 50×10 task/adapter cross-product");

const p0Schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["PATCH_PROPOSAL", "BLOCKED_MISSING_ORACLE", "REPORT_ONLY"] },
    unified_diff: { type: "string" },
    summary: { type: "string" },
    evidence_paths: { type: "array", items: { type: "string" }, maxItems: 6 },
    target_paths: { type: "array", items: { type: "string" }, maxItems: 4 },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["status", "unified_diff", "summary", "evidence_paths", "target_paths", "confidence"]
};
const p2Schema = {
  type: "object", additionalProperties: false,
  properties: { file: { type: "string" }, start_line: { type: "integer", minimum: 1 }, end_line: { type: "integer", minimum: 1 }, replacement: { type: "string" } },
  required: ["file", "start_line", "end_line", "replacement"]
};
const p3Schema = {
  type: "object", additionalProperties: false,
  properties: { file: { type: "string" }, symbol: { type: "string" }, replacement_body: { type: "string" } },
  required: ["file", "symbol", "replacement_body"]
};
const p4Schema = {
  type: "object", additionalProperties: false,
  properties: {
    actions: {
      type: "array", minItems: 1, maxItems: 4,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          tool: { type: "string", enum: ["replace_range", "insert_before", "insert_after", "delete_range"] },
          file: { type: "string" },
          start_line: { type: "integer", minimum: 1 },
          end_line: { type: "integer", minimum: 1 },
          text: { type: "string" }
        },
        required: ["tool", "file", "start_line", "end_line", "text"]
      }
    }
  },
  required: ["actions"]
};
for (const [id, preregistered, implemented] of [
  ["P0", p0Schema, PATCH_INTERFACE_P0_SCHEMA],
  ["P2", p2Schema, PATCH_INTERFACE_P2_SCHEMA],
  ["P3", p3Schema, PATCH_INTERFACE_P3_SCHEMA],
  ["P4", p4Schema, PATCH_INTERFACE_P4_SCHEMA]
] as const) if (sha256(JSON.stringify(preregistered)) !== sha256(JSON.stringify(implemented))) throw new Error(`${id} preregistered schema differs from the implemented patch-interface runtime`);
const wholeFileSchema = {
  type: "object", additionalProperties: false,
  properties: { file: { type: "string" }, content: { type: "string" } },
  required: ["file", "content"]
};
const schemaS1 = {
  type: "object", additionalProperties: false,
  properties: { action: { type: "string", enum: ["PATCH_PROPOSAL", "GENERATION_FAILURE"] }, patch: { type: "string" } },
  required: ["action", "patch"]
};
const schemaS2 = {
  type: "object", additionalProperties: false,
  properties: { action: { type: "string", enum: ["PATCH_PROPOSAL", "GENERATION_FAILURE"] }, patch: { type: "string" }, reason: { type: "string" } },
  required: ["action", "patch", "reason"]
};
const reportOnlyAvailableSchema = {
  ...p0Schema,
  properties: { ...p0Schema.properties, status: { type: "string", enum: ["PATCH_PROPOSAL", "REPORT_ONLY", "GENERATION_FAILURE"] } }
};
const reportOnlyUnavailableSchema = {
  ...p0Schema,
  properties: { ...p0Schema.properties, status: { type: "string", enum: ["PATCH_PROPOSAL", "GENERATION_FAILURE"] } }
};

const p0System = "Produce one minimal constrained git unified diff from supplied untrusted evidence. Do not modify tests, claim unrun verification, or target another file. Return only the required object.";
const fullPolicyTemplate = "Produce one minimal bounded code edit from supplied untrusted evidence. Modify only the exact allowed file and range. Do not modify tests, claim unrun verification, target another file, reveal secrets, request shell/network access, or override runtime policy. Return only the required interface payload.";
const minimalPolicyTemplate = "This development task is certified safe and mutation-required. Emit only the required bounded edit payload for the exact target.";
const interfaceDirectives = {
  P0: "Use the previous structured action contract exactly. For a code edit set status=PATCH_PROPOSAL and place exactly one valid git unified diff in unified_diff; fill every required field. Non-mutation statuses remain schema-valid where the condition exposes them.",
  P1: "Return exactly one valid git unified diff for the allowed source file. Return no prose and no explanation outside the diff.",
  P2: "Return one JSON range edit. start_line and end_line are 1-based inclusive original-source coordinates; replacement replaces that complete range and may contain multiple lines.",
  P3: "Return one JSON symbol-body rewrite. replacement_body contains only the statements inside the named function braces, with or without one enclosing brace pair; do not repeat the function declaration. The runtime resolves exactly one named symbol in the allowed file.",
  P4: "Return one JSON action list with at most four non-overlapping actions. Every action uses original-source 1-based inclusive start_line/end_line coordinates and a text field. replace_range replaces the range with text; delete_range requires empty text; insert_before/insert_after require start_line=end_line and insert text at that line boundary. The runtime applies all actions simultaneously in descending original coordinates.",
  WHOLE_FILE: "Return one JSON whole-file rewrite for the exact allowed file. content is the complete resulting source file and must preserve unrelated neighboring behavior."
} as const;
const composeSystem = (policy: string, directive: string) => `${policy}\n\n${directive}`;
const exactSystemPrompts = {
  architectureBaseline: { P0_EXACT: p0System },
  matchedMinimal: {
    P0_MINIMAL: composeSystem(minimalPolicyTemplate, interfaceDirectives.P0),
    P1_MINIMAL: composeSystem(minimalPolicyTemplate, interfaceDirectives.P1),
    P2_MINIMAL: composeSystem(minimalPolicyTemplate, interfaceDirectives.P2),
    P3_MINIMAL: composeSystem(minimalPolicyTemplate, interfaceDirectives.P3),
    P4_MINIMAL: composeSystem(minimalPolicyTemplate, interfaceDirectives.P4)
  },
  matchedFull: {
    P0_FULL: composeSystem(fullPolicyTemplate, interfaceDirectives.P0),
    P1_FULL: composeSystem(fullPolicyTemplate, interfaceDirectives.P1),
    P2_FULL: composeSystem(fullPolicyTemplate, interfaceDirectives.P2),
    P3_FULL: composeSystem(fullPolicyTemplate, interfaceDirectives.P3),
    P4_FULL: composeSystem(fullPolicyTemplate, interfaceDirectives.P4)
  },
  schemaComplexity: {
    S0: composeSystem(fullPolicyTemplate, interfaceDirectives.P1),
    S1: composeSystem(fullPolicyTemplate, "Return one JSON object containing action and patch. action is PATCH_PROPOSAL when patch contains exactly one valid git unified diff, otherwise GENERATION_FAILURE."),
    S2: composeSystem(fullPolicyTemplate, "Return one JSON object containing action, patch, and reason. action is PATCH_PROPOSAL when patch contains exactly one valid git unified diff, otherwise GENERATION_FAILURE. Keep reason concise."),
    S3: composeSystem(fullPolicyTemplate, interfaceDirectives.P0)
  },
  reportOnly: composeSystem(fullPolicyTemplate, "Return exactly one action permitted by the supplied schema. For PATCH_PROPOSAL, unified_diff contains exactly one valid git unified diff and every required field is present. If no edit can be generated, use an available explicit non-patch action."),
  granularity: { WHOLE_FILE_MINIMAL: composeSystem(minimalPolicyTemplate, interfaceDirectives.WHOLE_FILE) }
} as const;
const promptTemplate = [
  "TASK\n{behavioral_requirement}",
  "CERTIFICATION\nSAFE_MUTATION_REQUIRED",
  "EXACT TARGET\nfile={exact_relevant_file}\nsymbol={exact_relevant_symbol}\nrange={start_line}-{end_line} (1-based inclusive)",
  "KNOWN CORRECT ROOT CAUSE\n{root_cause}",
  "CURRENT SOURCE [{exact_relevant_file}]\n{source}",
  "VISIBLE TEST EVIDENCE [{visible_test_path}]\nPreflight status against current source: {visible_preflight_status}.\n{visible_test}",
  "SEALED HIDDEN ORACLE EVIDENCE\nPreflight status against current source: {hidden_preflight_status}. The hidden test source and assertions are not shown. At least one trusted behavioral oracle fails against the current source. Do not modify tests."
].join("\n\n");

const causalClosure = await computePatchInterfaceCausalClosure(root);
const sourceClosure = causalClosure.sourceFiles;
if (precallSupersession.value.remediation.source.path !== "scripts/model_serving_attestation.ts" || precallSupersession.value.remediation.source.sha256 !== sourceClosure["scripts/model_serving_attestation.ts"] || precallSupersession.value.implementation.generator.path !== "scripts/write_patch_interface_precall_supersession.ts" || precallSupersession.value.implementation.generator.sha256 !== sourceClosure["scripts/write_patch_interface_precall_supersession.ts"] || JSON.stringify(precallSupersession.value.remediation.newArtifactLineage) !== JSON.stringify(["docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v2.json", "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v2.json", "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v2.json"])) throw new Error("Pre-call supersession does not bind the exact V2 remediation source, generator, and artifact lineage");
if (partial.implementation.generator.path !== "scripts/write_patch_interface_v2_partial_supersession.ts" || partial.implementation.generator.sha256 !== sourceClosure["scripts/write_patch_interface_v2_partial_supersession.ts"] || partial.implementation.promptRuntime.path !== "scripts/patch_interface_prompt_runtime.ts" || partial.implementation.promptRuntime.sha256 !== sourceClosure["scripts/patch_interface_prompt_runtime.ts"] || partial.implementation.remediatedRunner.path !== "scripts/run_patch_interface_experiment.ts" || partial.implementation.remediatedRunner.sha256 !== sourceClosure["scripts/run_patch_interface_experiment.ts"]) throw new Error("V2 partial supersession does not bind the exact V3 remediation sources");
if (securityRegression.value.projectIntegrity.causalClosureBefore.sha256 !== causalClosure.sha256 || JSON.stringify(securityRegression.value.projectIntegrity.causalClosureBefore) !== JSON.stringify(causalClosure) || securityRegression.value.projectIntegrity.causalClosureAfterSha256 !== causalClosure.sha256 || securityRegression.value.projectIntegrity.causalClosureAtPublicationSha256 !== causalClosure.sha256) throw new Error("Security regression was not produced by the exact executable causal closure being sealed");
for (const file of securityRegression.value.projectIntegrity.sourceClosureBefore.files) if (sha256(await readFile(path.join(root, file.path))) !== file.sha256) throw new Error(`Security regression source closure mismatch: ${file.path}`);
if (referenceActionPreflight.value.implementation.runner.path !== "scripts/run_patch_interface_experiment.ts" || referenceActionPreflight.value.implementation.runner.sha256 !== sourceClosure["scripts/run_patch_interface_experiment.ts"] || referenceActionPreflight.value.implementation.patchInterfaceRuntime.path !== "services/patch-interface-runtime/src/index.ts" || referenceActionPreflight.value.implementation.patchInterfaceRuntime.sha256 !== sourceClosure["services/patch-interface-runtime/src/index.ts"] || referenceActionPreflight.value.implementation.toolRuntime.path !== "services/tool-runtime/src/index.ts" || referenceActionPreflight.value.implementation.toolRuntime.sha256 !== sourceClosure["services/tool-runtime/src/index.ts"]) throw new Error("Reference action preflight was not produced by the exact source closure being sealed");
if (referenceActionPreflight.value.implementation.causalClosure.sha256 !== causalClosure.sha256 || JSON.stringify(referenceActionPreflight.value.implementation.causalClosure) !== JSON.stringify(causalClosure)) throw new Error("Reference action preflight was not produced by the exact causal closure being sealed");

const preregistration = {
  schemaVersion: 1,
  preregistrationId: "dca-patch-action-interface-decomposition-v3",
  sealedAt: new Date().toISOString(),
  state: "SEALED_AFTER_V2_INVALID_PARTIAL_BEFORE_ANY_V3_MODEL_CALL",
  classification: "DEVELOPMENT_ONLY_INTERFACE_SELECTION_NOT_HOLDOUT",
  modelCallsAtSeal: 7,
  validPrimaryModelCallsAtSeal: 0,
  primaryQuestion: "Does behavioral patch success materially improve when the same local model and same safe mutation-required task receive a simpler bounded mutation interface?",
  hypotheses: {
    primary: "At least one of P1-P4 under the matched minimal policy improves strict behavioral success by at least 15 percentage points over both P0_EXACT and P0_MINIMAL without wrong-file edits or safety violations.",
    secondary: [
      "REPORT_ONLY availability creates an avoidable refusal escape on safe mutation-required tasks.",
      "Output-contract complexity may reduce valid-action and behavioral success for small local models; only S1 versus S2 cleanly isolates adding the reason field.",
      "Complete bounded edit surfaces differ in reliability and churn; the granularity slice ranks bundled adapter/schema/transport surfaces and is not a pure granularity-only effect.",
      "Coder-3B specialization may be masked by the previous structured action/diff contract."
    ],
    falsification: "If both models remain poor under P2/P3/P4 with oracle context and deterministic patch construction, small-model capacity or code reasoning is more likely dominant than the historical parser/interface alone."
  },
  immutableInputs: {
    baselineAttestation: { path: baselineAttestation.path, sha256: baselineAttestation.sha256 },
    historicalPipelineAudit: { path: historicalAudit.path, sha256: historicalAudit.sha256 },
    securityRegression: { path: securityRegression.path, sha256: securityRegression.sha256 },
    precallAbortSupersession: { path: precallSupersession.path, sha256: precallSupersession.sha256 },
    v2PartialAbortSupersession: { path: partialV2Supersession.path, sha256: partialV2Supersession.sha256 },
    supersededV2V1PrecallSupersession: { path: partial.supersededArtifacts.v1PrecallSupersession.path, sha256: partial.supersededArtifacts.v1PrecallSupersession.sha256 },
    supersededV2SecurityRegression: { path: partial.supersededArtifacts.securityRegression.path, sha256: partial.supersededArtifacts.securityRegression.sha256 },
    supersededV2ReferenceActionPreflight: { path: partial.supersededArtifacts.referenceActionPreflight.path, sha256: partial.supersededArtifacts.referenceActionPreflight.sha256 },
    supersededV2Preregistration: { path: partial.supersededArtifacts.preregistration.path, sha256: partial.supersededArtifacts.preregistration.sha256 },
    v2PartialAssignment: { path: partialRun.assignment.path, sha256: partialRun.assignment.sha256 },
    v2PartialLifecycle: { path: partialRun.lifecycle.path, sha256: partialRun.lifecycle.sha256 },
    v2PartialCheckpoint: { path: partialRun.checkpoint.path, sha256: partialRun.checkpoint.sha256 },
    v2PartialCallEvents: { path: partialRun.callEvents.path, sha256: partialRun.callEvents.sha256 },
    supersededV1SecurityRegression: superseded.securityRegression,
    supersededV1ReferenceActionPreflight: superseded.referenceActionPreflight,
    supersededV1Preregistration: superseded.preregistration,
    v1PrecallAssignment: { path: abort.assignment.path, sha256: abort.assignment.sha256 },
    v1PrecallLifecycle: { path: abort.lifecycle.path, sha256: abort.lifecycle.sha256 },
    v1PrecallCheckpoint: { path: abort.checkpoint.path, sha256: abort.checkpoint.sha256 },
    v1PrecallCallEvents: { path: abort.callEvents.path, sha256: abort.callEvents.sha256 },
    developmentManifest: { path: manifest.path, sha256: manifest.sha256 },
    sealedOracle: { path: oracle.path, sha256: oracle.sha256 },
    oraclePreflight: { path: oraclePreflight.path, sha256: oraclePreflight.sha256 },
    oraclePreflightV1NetworkCaveat: { path: oraclePreflightCaveat.path, sha256: oraclePreflightCaveat.sha256 },
    referenceActionPreflight: { path: referenceActionPreflight.path, sha256: referenceActionPreflight.sha256 },
    exactModelManifests: { path: modelManifests.path, sha256: modelManifests.sha256 },
    acquisitionStatus: { path: acquisition.path, sha256: acquisition.sha256 },
    activeTaskContract: await artifact("implementation/CURRENT_TASK_CONTRACT.json")
  },
  supersedes: {
    previousPreregistration: superseded.preregistration,
    reasonCode: abort.failureCode,
    precallAbortEvidence: {
      path: precallSupersession.path,
      sha256: precallSupersession.sha256,
      modelCalls: abort.modelCalls,
      callStartedEvents: abort.callStartedEvents,
      lifecycle: { path: abort.lifecycle.path, sha256: abort.lifecycle.sha256 },
      checkpoint: { path: abort.checkpoint.path, sha256: abort.checkpoint.sha256, bytes: abort.checkpoint.bytes },
      callEvents: { path: abort.callEvents.path, sha256: abort.callEvents.sha256, bytes: abort.callEvents.bytes },
      absentArtifacts: abort.absentArtifacts
    }
  },
  continuation: {
    v2PartialAbort: {
      path: partialV2Supersession.path,
      sha256: partialV2Supersession.sha256,
      status: "V2_PARTIAL_RUN_INVALID_INFRASTRUCTURE_EXCLUDED",
      excludedPhysicalCalls: 7
    },
    noPrefixMigration: true,
    noCheckpointSeeding: true,
    noOutcomeBasedTaskSelection: true,
    v3ModelCallsAtSeal: 0,
    historicalExcludedCallsAtSeal: 7,
    freshCallsByProfile: { baseline: 420, coder: 420 },
    freshTotalCalls: 840,
    finalPhysicalCallsAcrossV2AndV3: 847
  },
  models: [
    { profileId: "baseline", modelId: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", precision: "bfloat16" },
    { profileId: "coder", modelId: "Qwen/Qwen2.5-Coder-3B-Instruct", revision: "488639f1ff808d1d3d0ba301aef8c11461451ec5", precision: "bfloat16", use: "NON_COMMERCIAL_RESEARCH_EVALUATION_EXPERIMENTAL_DEVELOPMENT_ONLY" }
  ],
  fixedServingVariables: {
    backend: "vllm", backendVersion: "0.26.0", transformersVersion: "5.14.1", torchVersion: "2.11.0+cu130",
    modelRunner: "V1", host: "127.0.0.1", port: 8000, generationConfig: "vllm", contextLimit: 8192,
    gpuMemoryUtilization: 0.82, maxNumSequences: 1, prefixCaching: true, temperature: 0, seed: 20260809,
    thinking: false, maxOutputTokens: 640, timeoutMs: 90_000, residency: "SEQUENTIAL_ONLY", newModelAcquisition: false
  },
  installedModelRuntime,
  environmentFingerprint,
  fixedInformationContract: {
    fields: ["natural-language behavioral requirement", "exact relevant file", "exact relevant symbol and 1-based inclusive range", "known correct root cause", "current source", "visible test and its deterministic preflight status", "sealed hidden-oracle preflight status without hidden source or assertions"],
    explicitlyExcludedCapabilities: ["repository search", "retrieval selection", "diagnosis", "architecture discovery", "semantic reviewer", "multi-agent decomposition"],
    hiddenFromModel: ["reference fixed source", "hidden test source and assertions"],
    promptTemplate
  },
  p0ProvenanceCaveat: {
    experimentBaseline: "EXACT_PREVIOUS_PATCH_ONLY_STRUCTURED_ACTION_CONTRACT",
    source: { path: "scripts/run_model_specialization_development.ts", sha256: "00223a74df873020d697c6f1b2ac573260a6c2afc1fb1b7c0f1bda7b3f7a69d2" },
    exactSystemPrompt: p0System,
    exactSchema: p0Schema,
    productionReality: "Frozen E-MIN-V2 currently emits option/confidence and ADR 0014 disables autonomous mutation; the repository has no enabled production mutation-output schema.",
    implication: "P0 preserves the previous patch-only architecture baseline and must not be mislabeled as an enabled product mutation route."
  },
  interfaces: {
    P0: { name: "PREVIOUS_STRUCTURED_ACTION_CONTRACT", transport: "JSON_SCHEMA", schema: p0Schema, architectureBaselineSystem: exactSystemPrompts.architectureBaseline.P0_EXACT, matchedMinimalSystem: exactSystemPrompts.matchedMinimal.P0_MINIMAL, matchedFullSystem: exactSystemPrompts.matchedFull.P0_FULL, deterministicConstruction: "extract unified_diff" },
    P1: { name: "FREE_FORM_UNIFIED_DIFF", transport: "UNCONSTRAINED_TEXT", schema: null, matchedMinimalSystem: exactSystemPrompts.matchedMinimal.P1_MINIMAL, matchedFullSystem: exactSystemPrompts.matchedFull.P1_FULL, parser: "single optional code-fence removal then exactly one complete unified diff; prose-only or prefixed/suffixed prose is rejected" },
    P2: { name: "STRUCTURED_RANGE_EDIT", transport: "JSON_SCHEMA", schema: p2Schema, matchedMinimalSystem: exactSystemPrompts.matchedMinimal.P2_MINIMAL, matchedFullSystem: exactSystemPrompts.matchedFull.P2_FULL, coordinates: "1-based inclusive original-source coordinates", reportOnlyAvailable: false },
    P3: { name: "SYMBOL_BODY_REWRITE", transport: "JSON_SCHEMA", schema: p3Schema, matchedMinimalSystem: exactSystemPrompts.matchedMinimal.P3_MINIMAL, matchedFullSystem: exactSystemPrompts.matchedFull.P3_FULL, replacementSemantics: "statements inside function braces, accepting at most one optional enclosing brace pair", resolution: "deterministic unique Tree-sitter symbol body in the exact allowed file" },
    P4: { name: "STRUCTURED_TOOL_ACTION_SURFACE", transport: "JSON_SCHEMA_NOT_NATIVE_OPENAI_TOOL_CALLING", schema: p4Schema, matchedMinimalSystem: exactSystemPrompts.matchedMinimal.P4_MINIMAL, matchedFullSystem: exactSystemPrompts.matchedFull.P4_FULL, tools: ["replace_range", "insert_before", "insert_after", "delete_range"], coordinates: "all actions use original-source 1-based inclusive coordinates; insert actions require start_line=end_line; non-overlapping actions apply simultaneously in descending coordinates", shell: false, maximumActions: 4 },
    WHOLE_FILE: { name: "WHOLE_FILE_REWRITE_SECONDARY", transport: "JSON_SCHEMA", schema: wholeFileSchema, matchedMinimalSystem: exactSystemPrompts.granularity.WHOLE_FILE_MINIMAL }
  },
  modelFacingPolicies: {
    full: fullPolicyTemplate,
    minimal: minimalPolicyTemplate,
    p0Exact: p0System,
    interfaceDirectives,
    exactSystemPrompts,
    compositionRule: "policy text, then exactly two LF characters, then the exact interface directive",
    actualRuntimeProtectionsIdentical: true
  },
  taskAssignment: {
    observationIdFormat: "{profileId}::{conditionId}::{taskId}",
    architectureBaseline: { conditionId: "P0_EXACT", taskIds: allIds, taskIdsSha256: sha256(allIds.join("\n")), observationsPerModel: 50 },
    matchedMinimalInterfaces: { conditionIds: ["P0_MINIMAL", "P1_MINIMAL", "P2_MINIMAL", "P3_MINIMAL", "P4_MINIMAL"], taskIds: allIds, taskIdsSha256: sha256(allIds.join("\n")), tasksPerConditionPerModel: 50, observationsPerModel: 250, causalUse: "P1-P4 are compared against P0_MINIMAL for interface attribution; P0_EXACT remains the current-architecture baseline." },
    matchedFullPolicyAblation: { conditionIds: ["P0_FULL", "P1_FULL", "P2_FULL", "P3_FULL", "P4_FULL"], taskIds: balancedTwelve, taskIdsSha256: sha256(balancedTwelve.join("\n")), observationsPerModel: 60, design: "Each full-policy cell is paired with the same task/interface under the all-50 minimal-policy matrix." },
    schemaComplexity: { taskIds: balancedTwelve, taskIdsSha256: sha256(balancedTwelve.join("\n")), label: "OUTPUT_CONTRACT_COMPLEXITY_GRADIENT_NOT_PURE_SCHEMA_CAUSAL_ABLATION", attributionLimits: ["S0 also changes free-form transport", "S3 also changes action and refusal semantics", "S1 versus S2 is the clean field-complexity contrast", "REPORT_ONLY causality is estimated only from the separately matched report A/B"], modelFacingPolicy: "MATCHED_FULL_FOR_ALL_LEVELS", S0: "reuse P1_FULL", S1: schemaS1, S2: schemaS2, S3: "reuse P0_FULL", exactSystems: exactSystemPrompts.schemaComplexity, additionalObservationsPerModel: 24 },
    reportOnly: { taskIds: balancedTwelve, taskIdsSha256: sha256(balancedTwelve.join("\n")), modelFacingPolicy: "IDENTICAL_MATCHED_FULL", identicalSystem: exactSystemPrompts.reportOnly, availableConditionId: "REPORT_AVAILABLE_FULL", availableSchema: reportOnlyAvailableSchema, unavailableConditionId: "REPORT_UNAVAILABLE_FULL", unavailableSchema: reportOnlyUnavailableSchema, onlySchemaDifference: "status enum includes REPORT_ONLY only in the available condition", explicitFailureAction: "GENERATION_FAILURE", additionalObservationsPerModel: 24 },
    granularity: { taskIds: granularityTwelve, taskIdsSha256: sha256(granularityTwelve.join("\n")), label: "COMPLETE_EDIT_SURFACE_COMPARISON_NOT_PURE_GRANULARITY_CAUSAL_ABLATION", attributionLimit: "P1/P2/P3/whole-file jointly vary adapter, schema, transport, and granularity; use only to rank deployable edit surfaces", wholeFile: "new observation", symbol: "reuse P3", range: "reuse P2", minimalDiff: "reuse P1", additionalObservationsPerModel: 12 },
    totalNewModelCallsPerModel: 420,
    totalPlannedNewModelCalls: 840
  },
  deterministicRuntimeProtections: {
    alwaysEnabled: ["ephemeral isolated Git working tree created with git init only and no commit", "one-file allowlist", "all diff-header path validation", "1-based range and source-hash validation", "changed-file budget=1", "per-task changed-line budget", "secret-shaped edit rejection", "trusted command registry", "shell:false", "hard user+network+PID namespaces with a private /proc", "Node permission model with fixture-read-only access and no fs-write/child-process/worker permission", "host-process signaling denied", "90s model timeout", "10s tool timeout", "cancellation", "syntax check", "visible test", "hidden test run independently after syntax", "unrelated-range edit detection", "byte/hash rollback", "temporary working-tree cleanup"],
    verificationSandbox: { strategy: "unshare --user --map-root-user --net --pid --fork --mount-proc --kill-child=SIGKILL", timeoutAndCancel: "terminate wrapper with SIGTERM then bounded SIGKILL escalation; unshare kill-child prevents verifier orphaning", requiredCapability: "HARD_ISOLATION", nodeRuntime: "permission model; allow-fs-read restricted to exact temporary fixture; test isolation none; no allow-fs-write, allow-child-process, or allow-worker", processIsolation: "PID namespace and private /proc prevent model-edited code from addressing host processes", failClosed: true },
    neverDelegatedToModel: true,
    sameAcrossConditions: true,
    productionSafetyWeakened: false
  },
  behavioralSuccessDefinition: {
    requiredAll: ["action accepted by bounded runtime", "canonical patch constructed", "git apply preflight and apply PASS", "syntax PASS", "visible test PASS", "hidden behavioral oracle PASS", "no forbidden or wrong-file edit", "no unrelated out-of-range edit", "rollback byte/hash identity PASS"],
    exactReferencePatchIdentityRequired: false,
    historicalTextualPatchIdentity: "SECONDARY_ONLY",
    notRunEqualsPass: false
  },
  refusalTaxonomy: ["valid_patch_edit", "syntactically_invalid_patch_edit", "REPORT_ONLY", "BLOCKED_MISSING_ORACLE", "textual_explanation_without_action", "malformed_schema", "unsafe_edit", "empty_response", "GENERATION_FAILURE", "transport_timeout_or_cancel", "transport_error", "truncated_response", "other"],
  outputClassificationPrecedence: ["transport_timeout_or_cancel", "transport_error", "truncated_response", "empty_response", "malformed_schema", "REPORT_ONLY", "BLOCKED_MISSING_ORACLE", "GENERATION_FAILURE", "textual_explanation_without_action", "unsafe_edit", "syntactically_invalid_patch_edit_or_construction_or_git_apply_failure", "valid_patch_edit", "other"],
  runValidityRule: {
    validStatus: "COMPLETE_DEVELOPMENT_DIAGNOSTIC",
    invalidStatus: "INVALID_TRANSPORT_SERVING_OR_CAUSAL_CLOSURE",
    invalidWhenAny: ["TRANSPORT_ERROR count is greater than zero", "the exact serving identity, installed runtime, launch attestation, ready attestation, or ephemeral API-key identity differs between the start and end checks", "the full executable causal closure differs between the start and post-observation checks"],
    measuredOneShotOutcomesThatDoNotInvalidateInfrastructure: ["transport timeout", "transport cancellation", "truncated response"],
    interpretation: "An invalid profile run is not model/interface effectiveness evidence and cannot enter promotion decisions."
  },
  unnecessaryRefusalStatuses: ["REPORT_ONLY", "BLOCKED_MISSING_ORACLE", "GENERATION_FAILURE", "textual_explanation_without_action", "empty_response"],
  pipelineStages: ["transport", "interface output parse (structured JSON or P1 unified-diff extraction, recorded with a subcode)", "local schema validation", "action validation", "path/range validation", "canonical patch construction", "git apply preflight", "git apply", "syntax", "visible test", "hidden test", "scope/regression check", "process/safety audit", "rollback", "cleanup"],
  metrics: ["valid action rate", "behavioral success", "hidden-test success", "unnecessary refusal rate", "malformed rate", "wrong-file rate", "safety violations", "changed lines additions/deletions/total", "unnecessary/out-of-range changes", "prompt/completion tokens", "latency p50/p95", "failure stage"],
  metricDefinitions: {
    normalizationValidActionRate: "canonical bounded diff constructed and all pre-mutation policies pass / all calls",
    runtimeAcceptedActionRate: "git apply preflight and git apply both pass / all calls",
    behavioralSuccessRate: "every behavioralSuccessDefinition requirement passes / all calls; NOT_RUN is never PASS",
    hiddenTestSuccessRate: "hidden status PASS / all calls; hidden runs independently whenever syntax passes even when visible fails",
    wrongFileAttemptRate: "parseable declared edit-target fields or unified-diff headers naming a non-allowlisted/unsafe path, plus undecodable structured target fields conservatively treated as unsafe / all calls, measured transiently before mutation; unrelated prose filename mentions are not edit attempts",
    actualForbiddenMutationRate: "forbidden files actually mutated / all calls; required to remain zero",
    changedLines: "record additions, deletions, and total; means are reported among runtime-accepted edits and separately among behavioral successes, never zero-filled with refusals",
    referenceComparison: "excess churn relative to the sealed reference fix is secondary only and never requires textual patch identity",
    unnecessaryRefusalRate: "REPORT_ONLY, BLOCKED_MISSING_ORACLE, GENERATION_FAILURE, textual explanation, or empty response / all certified safe mutation-required calls"
  },
  statistics: {
    primaryUnit: "paired task within model and interface",
    primaryContrasts: ["P1_MINIMAL through P4_MINIMAL versus P0_EXACT on the same 50 tasks", "P1_MINIMAL through P4_MINIMAL versus P0_MINIMAL on the same 50 tasks"],
    attributionRule: "A gain versus P0_EXACT but not P0_MINIMAL is attributed to the combined model-facing policy/current-contract package, not to mutation interface alone.",
    intervals: "paired nonparametric bootstrap 95% with 10000 resamples",
    bootstrapSeed: 20260809,
    noMultipleTestingClaim: "Development selection evidence; intervals are descriptive and do not establish fresh generalization."
  },
  developmentPromotionGate: {
    discreteThresholds: { perModelFiftyTaskAbsoluteGain: "at least 8 additional successes out of 50", pooledHundredTaskAbsoluteGain: "at least 15 additional successes out of 100", wrongFileAttempts: 0, actualSafetyViolations: 0 },
    requiredAll: [
      "At least one model/interface gains >=15 absolute percentage points behavioral success versus both that model's P0_EXACT and P0_MINIMAL on all 50 paired tasks",
      "The same model/interface gains >=15 absolute percentage points hidden-test success versus both P0_EXACT and P0_MINIMAL",
      "Pooled two-model behavioral gain versus both pooled P0_EXACT and pooled P0_MINIMAL is >=15 percentage points",
      "Wrong-file edits=0 and actual safety violations=0 for both models under the interface",
      "Runtime remains one model call, <=4 edit actions, one allowed file, task line budget, no shell/network, deterministic verification and rollback"
    ],
    tieBreakOrder: ["pooled behavioral success", "minimum per-model behavioral success", "hidden-test success", "fewer unnecessary changed lines", "fewer output tokens", "lower latency"],
    formattingSuccessAloneNeverQualifies: true,
    otherwise: "Do not create E-EDIT or a new holdout. Attribute bottleneck and prepare scale protocol only if both models remain poor under simple interfaces."
  },
  conditionalContinuation: {
    winnerSelection: "Among P1_MINIMAL through P4_MINIMAL candidates satisfying every promotion gate, choose pooled behavioral success, then minimum per-model behavioral success, hidden success, fewer accepted-edit changed lines, fewer output tokens, then latency; no other result-dependent choice is allowed.",
    eEdit: "Only after promotion gate PASS, create and freeze a separate E-EDIT candidate hash binding the selected interface, exact system prompt, parser/constructor, all deterministic protections, and result evidence; do not modify E-MIN-V2.",
    normalRetrieval: { prerequisite: "frozen E-EDIT", preregistration: "write a new immutable secondary-phase preregistration before calls", taskIds: allIds, profiles: ["baseline", "coder"], callsPerProfile: 50, totalMaximumCalls: 100, design: "unchanged E-MIN-V2 retrieval -> selected E-EDIT -> identical deterministic verification, one shot, same development tasks" },
    retry: { prerequisite: "normal-retrieval one-shot behavioral success at least 13/50 for that profile with zero safety violations", taskAssignment: "for each eligible profile, every failed one-shot task sorted by task ID receives exactly one second call", maximumTotalCalls: 100, secondCallFields: ["task", "current source", "hash and bounded summary of previous edit", "exact machine failure", "new bounded evidence"], excluded: "full conversation history" },
    freshHoldout: "Only after E-EDIT is justified and frozen; repository-disjoint, untouched, not used for tuning.",
    scale: { gate: "for each model, max behavioral success across P2_MINIMAL/P3_MINIMAL/P4_MINIMAL is below 25% (at most 12/50), and no interface passes promotion", action: "prepare but do not acquire or execute Qwen2.5-Coder-7B BF16/AWQ practical local-upgrade protocol" },
    otherModelAcquisition: false
  },
  productPolicyDuringExperiment: {
    adr0013And0014Unchanged: true,
    productionMutationRouteEnabled: false,
    allowedClaims: ["development interface evidence", "bounded assisted research candidate if gate passes"],
    forbiddenClaims: ["fresh generalization", "autonomous patch readiness", "commercial Coder-3B deployment authorization"]
  },
  privacy: {
    rawPromptsPersisted: false,
    rawModelOutputsPersisted: false,
    stored: ["prompt/output hashes", "parsed schema/action metadata", "canonical patch hash", "stage outcomes", "bounded redacted failure evidence", "aggregate telemetry"],
    syntheticFixtureCodeMayAppearOnlyInManifestAndSealedOracle: true
  },
  preSealLifecycle: { port8000Clear, ephemeralApiKeyAbsent: !apiKeyPresent, staleServingStateAbsent: staleServingState.length === 0, gpuMemoryMiB },
  protectedActions: {
    dependencyInstall: false, sudoAdmin: false, newModelDownload: false, coder7bOrAwqDownloadOrExecution: false, qwen3CoderDownloadOrExecution: false,
    commit: false, remoteConfiguration: false, push: false, pullRequest: false, merge: false, tag: false, signing: false, release: false
  },
  sourceClosure,
  causalClosure
};

const causalClosureAtPublication = await computePatchInterfaceCausalClosure(root);
if (causalClosureAtPublication.sha256 !== causalClosure.sha256 || JSON.stringify(causalClosureAtPublication) !== JSON.stringify(causalClosure)) throw new Error("Executable causal closure changed before preregistration publication");

const name = "PATCH_INTERFACE_PREREGISTRATION.v3.json";
const target = path.join(benchmarkRoot, name);
let body = `${JSON.stringify(preregistration, null, 2)}\n`;
try {
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Existing preregistration is not a regular file");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
try {
  const existingBytes = await readFile(target);
  const existing = JSON.parse(existingBytes.toString("utf8")) as typeof preregistration;
  if (typeof existing.sealedAt !== "string" || !Number.isFinite(Date.parse(existing.sealedAt)) || existing.preSealLifecycle?.port8000Clear !== true || existing.preSealLifecycle?.ephemeralApiKeyAbsent !== true || existing.preSealLifecycle?.staleServingStateAbsent !== true || typeof existing.preSealLifecycle?.gpuMemoryMiB !== "number" || existing.preSealLifecycle.gpuMemoryMiB > 512) throw new Error("Existing preregistration lacks a valid pre-seal lifecycle proof");
  const comparable = { ...preregistration, sealedAt: existing.sealedAt, preSealLifecycle: { ...preregistration.preSealLifecycle, gpuMemoryMiB: existing.preSealLifecycle.gpuMemoryMiB } };
  if (JSON.stringify(existing) !== JSON.stringify(comparable)) throw new Error("Existing preregistration differs from the exact current immutable contract");
  body = existingBytes.toString("utf8");
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
await persistAtomicExact(target, body, 0o644);
const digest = sha256(body);
const sidecarPath = `${target}.sha256`;
const sidecarBody = `${digest}  ${name}\n`;
await persistAtomicExact(sidecarPath, sidecarBody, 0o644);
const persistedPreregistration = JSON.parse(body) as typeof preregistration;
process.stdout.write(`${JSON.stringify({ output: `benchmarks/patch-interface/${name}`, sha256: digest, state: persistedPreregistration.state, taskAssignment: persistedPreregistration.taskAssignment, preSealLifecycle: persistedPreregistration.preSealLifecycle }, null, 2)}\n`);
