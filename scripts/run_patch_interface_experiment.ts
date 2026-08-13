import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import {
  lstat,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import {
  PATCH_INTERFACE_P0_SCHEMA,
  PATCH_INTERFACE_P2_SCHEMA,
  PATCH_INTERFACE_P3_SCHEMA,
  PATCH_INTERFACE_P4_SCHEMA,
  buildCanonicalUnifiedDiff,
  normalizePatchInterfaceOutput,
  sha256Source,
  validateCanonicalDiffPolicy,
  type PatchInterfaceId,
  type PatchInterfaceNormalizationResult,
  type PatchInterfacePolicy
} from "../services/patch-interface-runtime/src/index";
import {
  inspectSnapshot,
  parseProfileId,
  readModelSpecializationRegistry,
  readProfileModelAccess,
  SpecializationLiveModel,
  type ModelSpecializationProfileId,
  type SnapshotFileExpectation
} from "../services/model-specialization-runtime/src/index";
import {
  ConstrainedPatchRuntime,
  TrustedVerificationExecutor,
  detectSandboxCapabilities,
  type SandboxCapabilities,
  type VerificationExecution
} from "../services/tool-runtime/src/index";
import { computePatchInterfaceCausalClosure, type PatchInterfaceCausalClosure } from "./patch_interface_causal_closure";
import { assertExactInstalledModelRuntime, probeExperimentEnvironmentFingerprint, probeInstalledModelRuntime, verifyServingLaunchAndMarkReady, type ExperimentEnvironmentFingerprint, type InstalledModelRuntime, type VerifiedServingAttestation } from "./model_serving_attestation";
import { renderPatchInterfacePrompt, type PatchInterfacePromptReplacements } from "./patch_interface_prompt_runtime";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const posix = (value: string) => value.split(path.sep).join("/");
const dryRun = process.argv.includes("--dry-run");
const profileArgument = process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length);
const profileId = parseProfileId(profileArgument ?? (dryRun ? "baseline" : undefined));
const runDirectoryArgument = process.argv.find((value) => value.startsWith("--run-directory="))?.slice("--run-directory=".length);
const preregistrationRelative = "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v3.json";
const manifestRelative = "benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_MANIFEST.v1.json";
const oracleRelative = "benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_ORACLE.v1.sealed.json";
const preflightRelative = "benchmarks/patch-interface/PATCH_INTERFACE_ORACLE_PREFLIGHT.v2.json";
const preflightCaveatRelative = "benchmarks/patch-interface/PATCH_INTERFACE_ORACLE_PREFLIGHT_V1_NETWORK_CAVEAT.v2.json";
const referencePreflightRelative = "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v3.json";
const securityRegressionRelative = "docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v3.json";
const precallSupersessionRelative = "docs/experiments/patch-interface/PATCH_INTERFACE_V1_PRECALL_ABORT.v2.json";
const partialV2SupersessionRelative = "docs/experiments/patch-interface/PATCH_INTERFACE_V2_PARTIAL_ABORT.v3.json";
const baselineAttestationRelative = "benchmarks/patch-interface/PATCH_INTERFACE_BASELINE_ATTESTATION.json";
const historicalAuditRelative = "docs/experiments/patch-interface/PATCH_PIPELINE_FAILURE_MATRIX.json";
const activeTaskContractRelative = "implementation/CURRENT_TASK_CONTRACT.json";
const exactModelsRelative = "benchmarks/model-specialization/EXACT_MODEL_MANIFESTS.json";
const acquisitionRelative = "benchmarks/model-specialization/MODEL_ACQUISITION_STATUS.v2.json";
const expectedCallsPerProfile = 420;
const outputTokenLimit = 640;
const modelTimeoutMs = 90_000;

type SourceFile = { path: string; content: string };
type ManifestTask = {
  task_id: string;
  dataset_role: string;
  prompt: string;
  allowed_files: string[];
  visible_files: SourceFile[];
  trusted_visible_command: string[];
  changed_line_budget: number;
  mutation_certification: string;
  relevant_range_1_based: { start_line: number; end_line: number; semantics: string };
};
type OracleRow = {
  task_id: string;
  exact_relevant_file: string;
  exact_relevant_symbol: string;
  exact_relevant_range_1_based: { start_line: number; end_line: number; semantics: string };
  root_cause: string;
  behavioral_requirement: string;
  original_source_sha256: string;
  relevant_range_source_sha256: string;
  reference_fixed_source: string;
  fixed_source_sha256: string;
  reference_fixed_range_1_based?: { start_line: number; end_line: number; semantics: string };
  hidden_files: SourceFile[];
  trusted_hidden_command: string[];
  mutation_certification: { classification: string; certified: boolean };
};
type PreflightStatus = "PASS" | "FAIL" | "TIMED_OUT" | "CANCELLED" | "NOT_RUN";
type PreflightRow = {
  taskId: string;
  valid: boolean;
  before: { syntax: { status: PreflightStatus }; visible: { status: PreflightStatus }; hidden: { status: PreflightStatus } };
  referenceFix: { syntax: { status: PreflightStatus }; visible: { status: PreflightStatus }; hidden: { status: PreflightStatus } };
};

type ConditionId =
  | "P0_EXACT"
  | "P0_MINIMAL" | "P1_MINIMAL" | "P2_MINIMAL" | "P3_MINIMAL" | "P4_MINIMAL"
  | "P0_FULL" | "P1_FULL" | "P2_FULL" | "P3_FULL" | "P4_FULL"
  | "SCHEMA_S1_FULL" | "SCHEMA_S2_FULL"
  | "REPORT_AVAILABLE_FULL" | "REPORT_UNAVAILABLE_FULL"
  | "WHOLE_FILE_MINIMAL";
type ConditionFamily = "ARCHITECTURE_BASELINE" | "MATCHED_MINIMAL" | "MATCHED_FULL" | "SCHEMA_COMPLEXITY" | "REPORT_ONLY" | "GRANULARITY";
type TransportKind = "TEXT" | "STRUCTURED";
type AdapterKind = PatchInterfaceId | "SCHEMA_S1" | "SCHEMA_S2" | "REPORT_AVAILABLE" | "REPORT_UNAVAILABLE" | "WHOLE_FILE";
type PolicyLevel = "P0_EXACT" | "MINIMAL" | "FULL";
type SchemaLevel = "P0" | "P1_RAW" | "P2" | "P3" | "P4" | "S1" | "S2" | "REPORT_AVAILABLE" | "REPORT_UNAVAILABLE" | "WHOLE_FILE";
type Granularity = "UNIFIED_DIFF" | "RANGE" | "SYMBOL_BODY" | "BOUNDED_TOOLS" | "WHOLE_FILE";
type ConditionDefinition = {
  conditionId: ConditionId;
  family: ConditionFamily;
  adapter: AdapterKind;
  transport: TransportKind;
  policy: PolicyLevel;
  schemaLevel: SchemaLevel;
  granularity: Granularity;
  system: string;
  schema: object | null;
  taskIds: string[];
};
type ScheduledObservation = ConditionDefinition & { index: number; taskId: string; observationId: string };

type ArtifactRef<T> = { value: T; path: string; sha256: string };
type Preregistration = {
  schemaVersion: number;
  preregistrationId: string;
  state: string;
  modelCallsAtSeal: number;
  validPrimaryModelCallsAtSeal: number;
  continuation: {
    v2PartialAbort: { path: string; sha256: string; status: string; excludedPhysicalCalls: number };
    noPrefixMigration: boolean;
    noCheckpointSeeding: boolean;
    noOutcomeBasedTaskSelection: boolean;
    v3ModelCallsAtSeal: number;
    historicalExcludedCallsAtSeal: number;
    freshCallsByProfile: Record<ModelSpecializationProfileId, number>;
    freshTotalCalls: number;
    finalPhysicalCallsAcrossV2AndV3: number;
  };
  immutableInputs: Record<string, { path: string; sha256: string }>;
  supersedes: {
    previousPreregistration: { path: string; sha256: string };
    reasonCode: string;
    precallAbortEvidence: { path: string; sha256: string; modelCalls: number; callStartedEvents: number; lifecycle: { path: string; sha256: string }; checkpoint: { path: string; sha256: string; bytes: number }; callEvents: { path: string; sha256: string; bytes: number }; absentArtifacts: string[] };
  };
  models: Array<{ profileId: string; modelId: string; revision: string; precision: string }>;
  fixedInformationContract: { promptTemplate: string; hiddenFromModel: string[] };
  interfaces: Record<string, Record<string, unknown> & { schema?: object | null }>;
  modelFacingPolicies: {
    exactSystemPrompts: {
      architectureBaseline: { P0_EXACT: string };
      matchedMinimal: Record<string, string>;
      matchedFull: Record<string, string>;
      schemaComplexity: { S0: string; S1: string; S2: string; S3: string };
      reportOnly: string;
      granularity: { WHOLE_FILE_MINIMAL: string };
    };
  };
  taskAssignment: {
    observationIdFormat: string;
    architectureBaseline: { conditionId: string; taskIds: string[]; taskIdsSha256: string; observationsPerModel: number };
    matchedMinimalInterfaces: { conditionIds: string[]; taskIds: string[]; taskIdsSha256: string; observationsPerModel: number };
    matchedFullPolicyAblation: { conditionIds: string[]; taskIds: string[]; taskIdsSha256: string; observationsPerModel: number };
    schemaComplexity: { taskIds: string[]; taskIdsSha256: string; S1: object; S2: object; additionalObservationsPerModel: number };
    reportOnly: {
      taskIds: string[];
      taskIdsSha256: string;
      availableConditionId: string;
      availableSchema: object;
      unavailableConditionId: string;
      unavailableSchema: object;
      additionalObservationsPerModel: number;
    };
    granularity: { taskIds: string[]; taskIdsSha256: string; additionalObservationsPerModel: number };
    totalNewModelCallsPerModel: number;
    totalPlannedNewModelCalls: number;
  };
  sourceClosure: Record<string, string>;
  causalClosure: PatchInterfaceCausalClosure;
  installedModelRuntime: InstalledModelRuntime;
  environmentFingerprint: ExperimentEnvironmentFingerprint;
  fixedServingVariables: Record<string, unknown>;
  runValidityRule: Record<string, unknown>;
};

async function readVerifiedJson<T>(relative: string): Promise<ArtifactRef<T>> {
  const target = path.join(root, relative);
  const [targetMetadata, sidecarMetadata] = await Promise.all([lstat(target), lstat(`${target}.sha256`)]);
  if (!targetMetadata.isFile() || targetMetadata.isSymbolicLink() || !sidecarMetadata.isFile() || sidecarMetadata.isSymbolicLink()) throw new Error(`${relative} or its checksum sidecar is not a regular file`);
  const bytes = await readFile(target);
  const actual = sha256(bytes);
  if (await readFile(`${target}.sha256`, "utf8") !== `${actual}  ${path.basename(target)}\n`) throw new Error(`${relative} checksum mismatch`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: actual };
}

async function readOptionalPreregistration(): Promise<ArtifactRef<Preregistration> | null> {
  try { return await readVerifiedJson<Preregistration>(preregistrationRelative); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readDirectArtifact<T>(relative: string): Promise<ArtifactRef<T>> {
  const bytes = await readFile(path.join(root, relative));
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: sha256(bytes) };
}

function hashTaskIds(taskIds: string[]): string { return sha256(taskIds.join("\n")); }

function deterministicSelection(ids: string[], count: number, salt: string): string[] {
  if (ids.length < count) throw new Error(`Selection ${salt} requires ${count} task IDs`);
  return [...ids].sort((left, right) => sha256(`${salt}:${left}`).localeCompare(sha256(`${salt}:${right}`))).slice(0, count).sort();
}

const fallbackPromptTemplate = [
  "TASK\n{behavioral_requirement}",
  "CERTIFICATION\nSAFE_MUTATION_REQUIRED",
  "EXACT TARGET\nfile={exact_relevant_file}\nsymbol={exact_relevant_symbol}\nrange={start_line}-{end_line} (1-based inclusive)",
  "KNOWN CORRECT ROOT CAUSE\n{root_cause}",
  "CURRENT SOURCE [{exact_relevant_file}]\n{source}",
  "VISIBLE TEST EVIDENCE [{visible_test_path}]\nPreflight status against current source: {visible_preflight_status}.\n{visible_test}",
  "SEALED HIDDEN ORACLE EVIDENCE\nPreflight status against current source: {hidden_preflight_status}. The hidden test source and assertions are not shown. At least one trusted behavioral oracle fails against the current source. Do not modify tests."
].join("\n\n");

function assertExactIds(actual: string[], expected: string[], label: string): void {
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) throw new Error(`${label} task IDs do not match the sealed deterministic assignment`);
}

function assertPreregistration(
  prereg: ArtifactRef<Preregistration>,
  artifacts: { baselineAttestation: ArtifactRef<unknown>; historicalAudit: ArtifactRef<unknown>; activeTaskContract: ArtifactRef<unknown>; securityRegression: ArtifactRef<unknown>; precallSupersession: ArtifactRef<PrecallSupersessionDocument>; partialV2Supersession: ArtifactRef<PartialV2SupersessionDocument>; v2Preregistration: ArtifactRef<ArchivedV2SchedulePreregistration>; manifest: ArtifactRef<unknown>; oracle: ArtifactRef<unknown>; preflight: ArtifactRef<unknown>; preflightCaveat: ArtifactRef<unknown>; referencePreflight: ArtifactRef<unknown>; exactModels: ArtifactRef<unknown>; acquisition: ArtifactRef<unknown> },
  allIds: string[],
  balancedIds: string[],
  granularityIds: string[]
): void {
  const value = prereg.value;
  if (value.preregistrationId !== "dca-patch-action-interface-decomposition-v3" || value.state !== "SEALED_AFTER_V2_INVALID_PARTIAL_BEFORE_ANY_V3_MODEL_CALL" || value.modelCallsAtSeal !== 7 || value.validPrimaryModelCallsAtSeal !== 0) throw new Error("Live execution requires the exact sealed V3 fresh-rerun preregistration");
  const continuation = value.continuation;
  if (continuation.v2PartialAbort.path !== artifacts.partialV2Supersession.path || continuation.v2PartialAbort.sha256 !== artifacts.partialV2Supersession.sha256 || continuation.v2PartialAbort.status !== "V2_PARTIAL_RUN_INVALID_INFRASTRUCTURE_EXCLUDED" || continuation.v2PartialAbort.excludedPhysicalCalls !== 7 || !continuation.noPrefixMigration || !continuation.noCheckpointSeeding || !continuation.noOutcomeBasedTaskSelection || continuation.v3ModelCallsAtSeal !== 0 || continuation.historicalExcludedCallsAtSeal !== 7 || continuation.freshCallsByProfile.baseline !== 420 || continuation.freshCallsByProfile.coder !== 420 || continuation.freshTotalCalls !== 840 || continuation.finalPhysicalCallsAcrossV2AndV3 !== 847) throw new Error("V3 continuation contract does not preserve the fresh-rerun decision and exact physical-call accounting");
  if (value.taskAssignment.observationIdFormat !== "{profileId}::{conditionId}::{taskId}") throw new Error("Unexpected observation ID contract");
  if (JSON.stringify(value.interfaces) !== JSON.stringify(artifacts.v2Preregistration.value.interfaces) || JSON.stringify(value.modelFacingPolicies.exactSystemPrompts) !== JSON.stringify(artifacts.v2Preregistration.value.modelFacingPolicies.exactSystemPrompts) || JSON.stringify(value.taskAssignment) !== JSON.stringify(artifacts.v2Preregistration.value.taskAssignment) || value.fixedInformationContract.promptTemplate !== artifacts.v2Preregistration.value.fixedInformationContract.promptTemplate) throw new Error("V3 changed the exact V2 interface, schema, assignment, system-prompt, or prompt-template request contract");
  if (value.taskAssignment.totalNewModelCallsPerModel !== expectedCallsPerProfile || value.taskAssignment.totalPlannedNewModelCalls !== expectedCallsPerProfile * 2) throw new Error("Preregistered call counts must be exactly 420/profile and 840 total");
  const boundInputs = [
    ["baselineAttestation", artifacts.baselineAttestation], ["historicalPipelineAudit", artifacts.historicalAudit], ["activeTaskContract", artifacts.activeTaskContract], ["securityRegression", artifacts.securityRegression], ["precallAbortSupersession", artifacts.precallSupersession], ["v2PartialAbortSupersession", artifacts.partialV2Supersession],
    ["developmentManifest", artifacts.manifest], ["sealedOracle", artifacts.oracle], ["oraclePreflight", artifacts.preflight], ["oraclePreflightV1NetworkCaveat", artifacts.preflightCaveat], ["referenceActionPreflight", artifacts.referencePreflight],
    ["exactModelManifests", artifacts.exactModels], ["acquisitionStatus", artifacts.acquisition]
  ] as const;
  for (const [key, artifact] of boundInputs) {
    const expected = value.immutableInputs[key];
    if (!expected || expected.path !== artifact.path || expected.sha256 !== artifact.sha256) throw new Error(`Preregistration input binding mismatch: ${key}`);
  }
  const partialV2 = artifacts.partialV2Supersession.value;
  for (const [key, reference] of [
    ["supersededV2V1PrecallSupersession", partialV2.supersededArtifacts.v1PrecallSupersession],
    ["supersededV2SecurityRegression", partialV2.supersededArtifacts.securityRegression],
    ["supersededV2ReferenceActionPreflight", partialV2.supersededArtifacts.referenceActionPreflight],
    ["supersededV2Preregistration", partialV2.supersededArtifacts.preregistration],
    ["v2PartialAssignment", partialV2.partialRun.assignment],
    ["v2PartialLifecycle", partialV2.partialRun.lifecycle],
    ["v2PartialCheckpoint", partialV2.partialRun.checkpoint],
    ["v2PartialCallEvents", partialV2.partialRun.callEvents]
  ] as const) {
    const expected = value.immutableInputs[key];
    if (!expected || expected.path !== reference.path || expected.sha256 !== reference.sha256) throw new Error(`Preregistration V2 partial-run lineage binding mismatch: ${key}`);
  }
  const abort = artifacts.precallSupersession.value.precallAbortEvidence;
  const previous = artifacts.precallSupersession.value.supersededArtifacts;
  for (const [key, reference] of [
    ["supersededV1SecurityRegression", previous.securityRegression],
    ["supersededV1ReferenceActionPreflight", previous.referenceActionPreflight],
    ["supersededV1Preregistration", previous.preregistration],
    ["v1PrecallAssignment", abort.assignment],
    ["v1PrecallLifecycle", abort.lifecycle],
    ["v1PrecallCheckpoint", abort.checkpoint],
    ["v1PrecallCallEvents", abort.callEvents]
  ] as const) {
    const expected = value.immutableInputs[key];
    if (!expected || expected.path !== reference.path || expected.sha256 !== reference.sha256) throw new Error(`Preregistration supersession binding mismatch: ${key}`);
  }
  if (value.supersedes.previousPreregistration.path !== previous.preregistration.path || value.supersedes.previousPreregistration.sha256 !== previous.preregistration.sha256 || value.supersedes.reasonCode !== abort.failureCode || value.supersedes.precallAbortEvidence.path !== artifacts.precallSupersession.path || value.supersedes.precallAbortEvidence.sha256 !== artifacts.precallSupersession.sha256 || value.supersedes.precallAbortEvidence.modelCalls !== 0 || value.supersedes.precallAbortEvidence.callStartedEvents !== 0 || value.supersedes.precallAbortEvidence.lifecycle.path !== abort.lifecycle.path || value.supersedes.precallAbortEvidence.lifecycle.sha256 !== abort.lifecycle.sha256 || value.supersedes.precallAbortEvidence.checkpoint.path !== abort.checkpoint.path || value.supersedes.precallAbortEvidence.checkpoint.sha256 !== abort.checkpoint.sha256 || value.supersedes.precallAbortEvidence.checkpoint.bytes !== 0 || value.supersedes.precallAbortEvidence.callEvents.path !== abort.callEvents.path || value.supersedes.precallAbortEvidence.callEvents.sha256 !== abort.callEvents.sha256 || value.supersedes.precallAbortEvidence.callEvents.bytes !== 0 || JSON.stringify(value.supersedes.precallAbortEvidence.absentArtifacts) !== JSON.stringify(abort.absentArtifacts)) throw new Error("Preregistration does not preserve the exact V1 zero-call supersession evidence");
  const assignment = value.taskAssignment;
  assertExactIds(assignment.architectureBaseline.taskIds, allIds, "architectureBaseline");
  assertExactIds(assignment.matchedMinimalInterfaces.taskIds, allIds, "matchedMinimalInterfaces");
  assertExactIds(assignment.matchedFullPolicyAblation.taskIds, balancedIds, "matchedFullPolicyAblation");
  assertExactIds(assignment.schemaComplexity.taskIds, balancedIds, "schemaComplexity");
  assertExactIds(assignment.reportOnly.taskIds, balancedIds, "reportOnly");
  assertExactIds(assignment.granularity.taskIds, granularityIds, "granularity");
  for (const [label, ids, digest] of [
    ["architectureBaseline", assignment.architectureBaseline.taskIds, assignment.architectureBaseline.taskIdsSha256],
    ["matchedMinimalInterfaces", assignment.matchedMinimalInterfaces.taskIds, assignment.matchedMinimalInterfaces.taskIdsSha256],
    ["matchedFullPolicyAblation", assignment.matchedFullPolicyAblation.taskIds, assignment.matchedFullPolicyAblation.taskIdsSha256],
    ["schemaComplexity", assignment.schemaComplexity.taskIds, assignment.schemaComplexity.taskIdsSha256],
    ["reportOnly", assignment.reportOnly.taskIds, assignment.reportOnly.taskIdsSha256],
    ["granularity", assignment.granularity.taskIds, assignment.granularity.taskIdsSha256]
  ] as const) if (hashTaskIds(ids) !== digest) throw new Error(`${label} task ID digest mismatch`);
  if (!value.fixedInformationContract.promptTemplate.includes("{visible_preflight_status}") || !value.fixedInformationContract.promptTemplate.includes("{hidden_preflight_status}")) throw new Error("Sealed prompt must carry accurate visible and hidden preflight-status placeholders");
  if (!value.fixedInformationContract.hiddenFromModel.includes("reference fixed source") || !value.fixedInformationContract.hiddenFromModel.some((item) => item.includes("hidden test source"))) throw new Error("Sealed information contract does not hide reference and hidden oracle sources");
  const expectedValidityRule = {
    validStatus: "COMPLETE_DEVELOPMENT_DIAGNOSTIC",
    invalidStatus: "INVALID_TRANSPORT_SERVING_OR_CAUSAL_CLOSURE",
    invalidWhenAny: ["TRANSPORT_ERROR count is greater than zero", "the exact serving identity, installed runtime, launch attestation, ready attestation, or ephemeral API-key identity differs between the start and end checks", "the full executable causal closure differs between the start and post-observation checks"],
    measuredOneShotOutcomesThatDoNotInvalidateInfrastructure: ["transport timeout", "transport cancellation", "truncated response"],
    interpretation: "An invalid profile run is not model/interface effectiveness evidence and cannot enter promotion decisions."
  };
  if (JSON.stringify(value.runValidityRule) !== JSON.stringify(expectedValidityRule)) throw new Error("Preregistered transport/serving run-validity rule differs from the fail-closed analysis contract");
}

function exactFixedServingVariables(shared: Awaited<ReturnType<typeof readModelSpecializationRegistry>>["sharedServing"]): Record<string, unknown> {
  return {
    backend: shared.backend,
    backendVersion: shared.backendVersion,
    transformersVersion: "5.14.1",
    torchVersion: "2.11.0+cu130",
    modelRunner: "V1",
    host: shared.host,
    port: shared.port,
    generationConfig: shared.generationConfig,
    contextLimit: shared.comparisonContextLimit,
    gpuMemoryUtilization: shared.gpuMemoryUtilization,
    maxNumSequences: shared.maxNumSequences,
    prefixCaching: shared.prefixCaching,
    temperature: shared.temperature,
    seed: shared.seed,
    thinking: shared.reasoningMode,
    maxOutputTokens: outputTokenLimit,
    timeoutMs: modelTimeoutMs,
    residency: shared.residency,
    newModelAcquisition: false
  };
}

async function verifySourceClosure(prereg: ArtifactRef<Preregistration>): Promise<string> {
  const entries = Object.entries(prereg.value.sourceClosure).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.some(([relative]) => relative === "scripts/run_patch_interface_experiment.ts")) throw new Error("Preregistration source closure does not include this runner");
  for (const [relative, expected] of entries) {
    const actual = sha256(await readFile(path.join(root, relative)));
    if (actual !== expected) throw new Error(`Preregistered source closure mismatch: ${relative}`);
  }
  return sha256(entries.map(([relative, digest]) => `${relative}\0${digest}`).join("\n"));
}

type SchedulePreregistration = Pick<Preregistration, "interfaces" | "modelFacingPolicies" | "taskAssignment">;
type ArchivedV2SchedulePreregistration = SchedulePreregistration & { fixedInformationContract: { promptTemplate: string } };

function buildSchedule(prereg: SchedulePreregistration, profile: ModelSpecializationProfileId): ScheduledObservation[] {
  const assignment = prereg.taskAssignment;
  const systems = prereg.modelFacingPolicies.exactSystemPrompts;
  const interfaces = prereg.interfaces;
  const definitions: ConditionDefinition[] = [
    { conditionId: "P0_EXACT", family: "ARCHITECTURE_BASELINE", adapter: "P0", transport: "STRUCTURED", policy: "P0_EXACT", schemaLevel: "P0", granularity: "UNIFIED_DIFF", system: systems.architectureBaseline.P0_EXACT, schema: interfaces.P0.schema ?? null, taskIds: assignment.architectureBaseline.taskIds },
    ...(["P0", "P1", "P2", "P3", "P4"] as const).map((id): ConditionDefinition => ({
      conditionId: `${id}_MINIMAL` as ConditionId, family: "MATCHED_MINIMAL", adapter: id, transport: id === "P1" ? "TEXT" : "STRUCTURED", policy: "MINIMAL", schemaLevel: id === "P1" ? "P1_RAW" : id,
      granularity: id === "P2" ? "RANGE" : id === "P3" ? "SYMBOL_BODY" : id === "P4" ? "BOUNDED_TOOLS" : "UNIFIED_DIFF",
      system: systems.matchedMinimal[`${id}_MINIMAL`], schema: interfaces[id].schema ?? null, taskIds: assignment.matchedMinimalInterfaces.taskIds
    })),
    ...(["P0", "P1", "P2", "P3", "P4"] as const).map((id): ConditionDefinition => ({
      conditionId: `${id}_FULL` as ConditionId, family: "MATCHED_FULL", adapter: id, transport: id === "P1" ? "TEXT" : "STRUCTURED", policy: "FULL", schemaLevel: id === "P1" ? "P1_RAW" : id,
      granularity: id === "P2" ? "RANGE" : id === "P3" ? "SYMBOL_BODY" : id === "P4" ? "BOUNDED_TOOLS" : "UNIFIED_DIFF",
      system: systems.matchedFull[`${id}_FULL`], schema: interfaces[id].schema ?? null, taskIds: assignment.matchedFullPolicyAblation.taskIds
    })),
    { conditionId: "SCHEMA_S1_FULL", family: "SCHEMA_COMPLEXITY", adapter: "SCHEMA_S1", transport: "STRUCTURED", policy: "FULL", schemaLevel: "S1", granularity: "UNIFIED_DIFF", system: systems.schemaComplexity.S1, schema: assignment.schemaComplexity.S1, taskIds: assignment.schemaComplexity.taskIds },
    { conditionId: "SCHEMA_S2_FULL", family: "SCHEMA_COMPLEXITY", adapter: "SCHEMA_S2", transport: "STRUCTURED", policy: "FULL", schemaLevel: "S2", granularity: "UNIFIED_DIFF", system: systems.schemaComplexity.S2, schema: assignment.schemaComplexity.S2, taskIds: assignment.schemaComplexity.taskIds },
    { conditionId: "REPORT_AVAILABLE_FULL", family: "REPORT_ONLY", adapter: "REPORT_AVAILABLE", transport: "STRUCTURED", policy: "FULL", schemaLevel: "REPORT_AVAILABLE", granularity: "UNIFIED_DIFF", system: systems.reportOnly, schema: assignment.reportOnly.availableSchema, taskIds: assignment.reportOnly.taskIds },
    { conditionId: "REPORT_UNAVAILABLE_FULL", family: "REPORT_ONLY", adapter: "REPORT_UNAVAILABLE", transport: "STRUCTURED", policy: "FULL", schemaLevel: "REPORT_UNAVAILABLE", granularity: "UNIFIED_DIFF", system: systems.reportOnly, schema: assignment.reportOnly.unavailableSchema, taskIds: assignment.reportOnly.taskIds },
    { conditionId: "WHOLE_FILE_MINIMAL", family: "GRANULARITY", adapter: "WHOLE_FILE", transport: "STRUCTURED", policy: "MINIMAL", schemaLevel: "WHOLE_FILE", granularity: "WHOLE_FILE", system: systems.granularity.WHOLE_FILE_MINIMAL, schema: interfaces.WHOLE_FILE.schema ?? null, taskIds: assignment.granularity.taskIds }
  ];
  const expectedConditions: ConditionId[] = ["P0_EXACT", "P0_MINIMAL", "P1_MINIMAL", "P2_MINIMAL", "P3_MINIMAL", "P4_MINIMAL", "P0_FULL", "P1_FULL", "P2_FULL", "P3_FULL", "P4_FULL", "SCHEMA_S1_FULL", "SCHEMA_S2_FULL", "REPORT_AVAILABLE_FULL", "REPORT_UNAVAILABLE_FULL", "WHOLE_FILE_MINIMAL"];
  if (definitions.some((condition, index) => condition.conditionId !== expectedConditions[index] || !condition.system || (condition.transport === "STRUCTURED" && !condition.schema))) throw new Error("Preregistered condition definitions are incomplete or out of order");
  const schedule = definitions.flatMap((condition) => condition.taskIds.map((taskId) => ({ ...condition, index: -1, taskId, observationId: `${profile}::${condition.conditionId}::${taskId}` }))).map((row, index) => ({ ...row, index }));
  if (schedule.length !== expectedCallsPerProfile || new Set(schedule.map((row) => row.observationId)).size !== schedule.length) throw new Error(`Schedule must contain exactly ${expectedCallsPerProfile} unique observations`);
  return schedule;
}

function makeDryRunPreregistration(allIds: string[], balancedIds: string[], granularityIds: string[]): SchedulePreregistration {
  const schemaS1 = { type: "object", additionalProperties: false, properties: { action: { type: "string", enum: ["PATCH_PROPOSAL", "GENERATION_FAILURE"] }, patch: { type: "string" } }, required: ["action", "patch"] };
  const schemaS2 = { type: "object", additionalProperties: false, properties: { action: { type: "string", enum: ["PATCH_PROPOSAL", "GENERATION_FAILURE"] }, patch: { type: "string" }, reason: { type: "string" } }, required: ["action", "patch", "reason"] };
  const reportAvailable = { ...PATCH_INTERFACE_P0_SCHEMA, properties: { ...PATCH_INTERFACE_P0_SCHEMA.properties, status: { type: "string", enum: ["PATCH_PROPOSAL", "REPORT_ONLY", "GENERATION_FAILURE"] } } };
  const reportUnavailable = { ...PATCH_INTERFACE_P0_SCHEMA, properties: { ...PATCH_INTERFACE_P0_SCHEMA.properties, status: { type: "string", enum: ["PATCH_PROPOSAL", "GENERATION_FAILURE"] } } };
  const wholeFile = { type: "object", additionalProperties: false, properties: { file: { type: "string" }, content: { type: "string" } }, required: ["file", "content"] };
  const systems = {
    architectureBaseline: { P0_EXACT: "DRY_RUN_NO_MODEL_P0_EXACT" },
    matchedMinimal: Object.fromEntries(["P0", "P1", "P2", "P3", "P4"].map((id) => [`${id}_MINIMAL`, `DRY_RUN_NO_MODEL_${id}_MINIMAL`])),
    matchedFull: Object.fromEntries(["P0", "P1", "P2", "P3", "P4"].map((id) => [`${id}_FULL`, `DRY_RUN_NO_MODEL_${id}_FULL`])),
    schemaComplexity: { S0: "DRY_RUN_NO_MODEL_S0", S1: "DRY_RUN_NO_MODEL_S1", S2: "DRY_RUN_NO_MODEL_S2", S3: "DRY_RUN_NO_MODEL_S3" },
    reportOnly: "DRY_RUN_NO_MODEL_REPORT",
    granularity: { WHOLE_FILE_MINIMAL: "DRY_RUN_NO_MODEL_WHOLE_FILE" }
  };
  return {
    interfaces: { P0: { schema: PATCH_INTERFACE_P0_SCHEMA }, P1: { schema: null }, P2: { schema: PATCH_INTERFACE_P2_SCHEMA }, P3: { schema: PATCH_INTERFACE_P3_SCHEMA }, P4: { schema: PATCH_INTERFACE_P4_SCHEMA }, WHOLE_FILE: { schema: wholeFile } },
    modelFacingPolicies: { exactSystemPrompts: systems },
    taskAssignment: {
      observationIdFormat: "{profileId}::{conditionId}::{taskId}",
      architectureBaseline: { conditionId: "P0_EXACT", taskIds: allIds, taskIdsSha256: hashTaskIds(allIds), observationsPerModel: 50 },
      matchedMinimalInterfaces: { conditionIds: ["P0_MINIMAL", "P1_MINIMAL", "P2_MINIMAL", "P3_MINIMAL", "P4_MINIMAL"], taskIds: allIds, taskIdsSha256: hashTaskIds(allIds), observationsPerModel: 250 },
      matchedFullPolicyAblation: { conditionIds: ["P0_FULL", "P1_FULL", "P2_FULL", "P3_FULL", "P4_FULL"], taskIds: balancedIds, taskIdsSha256: hashTaskIds(balancedIds), observationsPerModel: 60 },
      schemaComplexity: { taskIds: balancedIds, taskIdsSha256: hashTaskIds(balancedIds), S1: schemaS1, S2: schemaS2, additionalObservationsPerModel: 24 },
      reportOnly: { taskIds: balancedIds, taskIdsSha256: hashTaskIds(balancedIds), availableConditionId: "REPORT_AVAILABLE_FULL", availableSchema: reportAvailable, unavailableConditionId: "REPORT_UNAVAILABLE_FULL", unavailableSchema: reportUnavailable, additionalObservationsPerModel: 24 },
      granularity: { taskIds: granularityIds, taskIdsSha256: hashTaskIds(granularityIds), additionalObservationsPerModel: 12 },
      totalNewModelCallsPerModel: expectedCallsPerProfile,
      totalPlannedNewModelCalls: expectedCallsPerProfile * 2
    }
  };
}

function assertSafeFixturePath(relative: string): void {
  if (!relative || relative.includes("\0") || relative.includes("\\") || path.posix.isAbsolute(relative) || path.posix.normalize(relative) !== relative || relative.split("/").includes("..")) throw new Error(`Unsafe fixture path: ${sha256(relative)}`);
}

function sourceFor(task: ManifestTask, oracle: OracleRow): SourceFile {
  const source = task.visible_files.find((file) => file.path === oracle.exact_relevant_file);
  if (!source) throw new Error(`${task.task_id} lacks its exact source file`);
  return source;
}

function visibleTestFor(task: ManifestTask, oracle: OracleRow): SourceFile {
  const sourcePath = oracle.exact_relevant_file;
  const file = task.visible_files.find((candidate) => candidate.path !== sourcePath && candidate.path.includes("visible.test"));
  if (!file) throw new Error(`${task.task_id} lacks its visible test`);
  return file;
}

function assertTaskBindings(task: ManifestTask, oracle: OracleRow, preflight: PreflightRow): void {
  const source = sourceFor(task, oracle);
  const range = oracle.exact_relevant_range_1_based;
  const logicalLines = source.content.endsWith("\n") ? source.content.slice(0, -1).split("\n") : source.content.split("\n");
  if (task.dataset_role !== "DEVELOPMENT_ONLY" || task.mutation_certification !== "SAFE_MUTATION_REQUIRED" || !oracle.mutation_certification.certified || oracle.mutation_certification.classification !== "SAFE_MUTATION_REQUIRED") throw new Error(`${task.task_id} is not certified development-only safe mutation work`);
  if (task.allowed_files.length !== 1 || task.allowed_files[0] !== oracle.exact_relevant_file) throw new Error(`${task.task_id} must allow exactly its oracle source`);
  if (sha256Source(source.content) !== oracle.original_source_sha256 || sha256Source(oracle.reference_fixed_source) !== oracle.fixed_source_sha256) throw new Error(`${task.task_id} source/oracle hash binding mismatch`);
  if (range.start_line !== task.relevant_range_1_based.start_line || range.end_line !== task.relevant_range_1_based.end_line || range.start_line < 1 || range.end_line < range.start_line || range.end_line > logicalLines.length) throw new Error(`${task.task_id} exact range binding mismatch`);
  if (sha256(logicalLines.slice(range.start_line - 1, range.end_line).join("\n")) !== oracle.relevant_range_source_sha256) throw new Error(`${task.task_id} range hash mismatch`);
  if (!preflight.valid || preflight.referenceFix.syntax.status !== "PASS" || preflight.referenceFix.visible.status !== "PASS" || preflight.referenceFix.hidden.status !== "PASS") throw new Error(`${task.task_id} reference oracle preflight is not valid`);
  if (preflight.before.syntax.status !== "PASS" || (preflight.before.visible.status !== "FAIL" && preflight.before.hidden.status !== "FAIL")) throw new Error(`${task.task_id} does not bind a real pre-mutation behavioral failure`);
  for (const file of [...task.visible_files, ...oracle.hidden_files]) assertSafeFixturePath(file.path);
  if (!path.isAbsolute(task.trusted_visible_command[0] ?? "") || !path.isAbsolute(oracle.trusted_hidden_command[0] ?? "")) throw new Error(`${task.task_id} trusted commands require exact absolute executables`);
}

function renderPrompt(template: string, task: ManifestTask, oracle: OracleRow, preflight: PreflightRow): string {
  const source = sourceFor(task, oracle);
  const visibleTest = visibleTestFor(task, oracle);
  const replacements: PatchInterfacePromptReplacements = {
    behavioral_requirement: oracle.behavioral_requirement,
    exact_relevant_file: oracle.exact_relevant_file,
    exact_relevant_symbol: oracle.exact_relevant_symbol,
    start_line: String(oracle.exact_relevant_range_1_based.start_line),
    end_line: String(oracle.exact_relevant_range_1_based.end_line),
    root_cause: oracle.root_cause,
    source: source.content,
    visible_test_path: visibleTest.path,
    visible_test: visibleTest.content,
    visible_preflight_status: preflight.before.visible.status,
    hidden_preflight_status: preflight.before.hidden.status
  };
  return renderPatchInterfacePrompt(template, replacements, { taskId: task.task_id, blockedExactValues: [...oracle.hidden_files.map((file) => file.content), oracle.reference_fixed_source] });
}

function interfacePolicy(task: ManifestTask, oracle: OracleRow): PatchInterfacePolicy {
  return {
    allowedFiles: task.allowed_files,
    allowedRanges: { [oracle.exact_relevant_file]: [{ startLine: oracle.exact_relevant_range_1_based.start_line, endLine: oracle.exact_relevant_range_1_based.end_line }] },
    allowedSymbols: { [oracle.exact_relevant_file]: [oracle.exact_relevant_symbol] },
    expectedSourceSha256: { [oracle.exact_relevant_file]: oracle.original_source_sha256 },
    maxChangedFiles: 1,
    maxChangedLines: task.changed_line_budget,
    maxToolActions: 4
  };
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validatorCache = new Map<string, ValidateFunction>();
function validateSchema(schema: object, value: unknown): boolean {
  const key = JSON.stringify(schema);
  let validate = validatorCache.get(key);
  if (!validate) { validate = ajv.compile(schema); validatorCache.set(key, validate); }
  return Boolean(validate(value));
}

const stage = (status: "PASS" | "FAIL" | "NOT_APPLICABLE" | "NOT_RUN", code: string) => ({ status, code });
function syntheticNormalization(input: {
  classification: PatchInterfaceNormalizationResult["classification"];
  jsonParsed: boolean;
  schemaValidated: boolean;
  parsedAction: unknown;
  errorCode: string;
  canonicalDiff?: string | null;
  targets?: string[];
  changedFiles?: number;
  changedLines?: number;
  parse?: "PASS" | "FAIL" | "NOT_RUN";
  schema?: "PASS" | "FAIL" | "NOT_APPLICABLE";
  action?: "PASS" | "FAIL" | "NOT_RUN";
  construction?: "PASS" | "FAIL" | "NOT_RUN";
}): PatchInterfaceNormalizationResult {
  return {
    canonicalDiff: input.canonicalDiff ?? null,
    classification: input.classification,
    jsonParsed: input.jsonParsed,
    schemaValidated: input.schemaValidated,
    stages: {
      parse: stage(input.parse ?? (input.jsonParsed ? "PASS" : "FAIL"), input.jsonParsed ? "JSON_PARSED" : input.errorCode),
      schemaValidation: stage(input.schema ?? (input.schemaValidated ? "PASS" : "FAIL"), input.schemaValidated ? "LOCAL_SCHEMA_VALID" : input.errorCode),
      actionValidation: stage(input.action ?? "NOT_RUN", input.action === "PASS" ? "ACTION_ACCEPTED" : input.errorCode),
      patchConstruction: stage(input.construction ?? "NOT_RUN", input.construction === "PASS" ? "CANONICAL_DIFF_CONSTRUCTED" : input.errorCode)
    },
    targets: input.targets ?? [],
    changedFiles: input.changedFiles ?? 0,
    changedLines: input.changedLines ?? 0,
    parsedAction: input.parsedAction,
    error: input.errorCode
  };
}

function normalizeWrappedPatch(
  adapter: AdapterKind,
  value: unknown,
  schema: object,
  sources: Record<string, string>,
  policy: PatchInterfacePolicy
): PatchInterfaceNormalizationResult {
  if (!validateSchema(schema, value)) return syntheticNormalization({ classification: "MALFORMED_SCHEMA", jsonParsed: true, schemaValidated: false, parsedAction: value, errorCode: "LOCAL_SCHEMA_INVALID", parse: "PASS", schema: "FAIL" });
  const record = value as Record<string, unknown>;
  const wrapInnerPatch = (patch: string): PatchInterfaceNormalizationResult => {
    if (!patch.trim()) return syntheticNormalization({ classification: "SYNTACTICALLY_INVALID_EDIT", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: "EMPTY_PATCH_ACTION", parse: "PASS", schema: "PASS", action: "FAIL" });
    const inner = normalizePatchInterfaceOutput({ interfaceId: "P1", rawOutput: patch, sources, policy });
    return {
      ...inner,
      jsonParsed: true,
      schemaValidated: true,
      parsedAction: value,
      stages: {
        parse: stage("PASS", "JSON_PARSED"),
        schemaValidation: stage("PASS", "LOCAL_SCHEMA_VALID"),
        actionValidation: inner.stages.actionValidation,
        patchConstruction: inner.stages.patchConstruction
      }
    };
  };
  if (adapter === "SCHEMA_S1" || adapter === "SCHEMA_S2") {
    if (record.action === "GENERATION_FAILURE") return syntheticNormalization({ classification: "GENERATION_FAILURE", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: "EXPLICIT_GENERATION_FAILURE", parse: "PASS", schema: "PASS", action: "PASS" });
    return wrapInnerPatch(String(record.patch ?? ""));
  }
  if (adapter === "REPORT_AVAILABLE" || adapter === "REPORT_UNAVAILABLE") {
    if (record.status === "REPORT_ONLY") return syntheticNormalization({ classification: "REPORT_ONLY", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: "EXPLICIT_REPORT_ONLY", parse: "PASS", schema: "PASS", action: "PASS" });
    if (record.status === "BLOCKED_MISSING_ORACLE") return syntheticNormalization({ classification: "BLOCKED_MISSING_ORACLE", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: "EXPLICIT_BLOCKED_MISSING_ORACLE", parse: "PASS", schema: "PASS", action: "PASS" });
    if (record.status === "GENERATION_FAILURE") return syntheticNormalization({ classification: "GENERATION_FAILURE", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: "EXPLICIT_GENERATION_FAILURE", parse: "PASS", schema: "PASS", action: "PASS" });
    return wrapInnerPatch(String(record.unified_diff ?? ""));
  }
  if (adapter === "WHOLE_FILE") {
    const file = typeof record.file === "string" ? record.file : "";
    const content = typeof record.content === "string" ? record.content : "";
    const source = sources[file];
    if (!source || !policy.allowedFiles.includes(file)) return syntheticNormalization({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: "WRONG_OR_UNAVAILABLE_FILE", targets: file ? [file] : [], parse: "PASS", schema: "PASS", action: "FAIL" });
    const canonicalDiff = buildCanonicalUnifiedDiff(file, source, content);
    if (!canonicalDiff) return syntheticNormalization({ classification: "OTHER", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: "NO_CHANGES", targets: [file], parse: "PASS", schema: "PASS", action: "PASS", construction: "FAIL" });
    const bounded = validateCanonicalDiffPolicy(canonicalDiff, sources, policy);
    if (!bounded.valid) return syntheticNormalization({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: bounded.errorCode ?? "DIFF_POLICY_REJECTED", targets: bounded.targets, changedFiles: bounded.changedFiles, changedLines: bounded.changedLines, parse: "PASS", schema: "PASS", action: "FAIL", construction: "FAIL" });
    return syntheticNormalization({ classification: "VALID_EDIT", jsonParsed: true, schemaValidated: true, parsedAction: value, errorCode: "PASS", canonicalDiff, targets: bounded.targets, changedFiles: bounded.changedFiles, changedLines: bounded.changedLines, parse: "PASS", schema: "PASS", action: "PASS", construction: "PASS" });
  }
  throw new Error(`Unsupported wrapped adapter: ${adapter}`);
}

function normalizeConditionOutput(
  condition: Pick<ConditionDefinition, "adapter" | "schema">,
  rawText: string | null,
  structuredValue: unknown,
  sources: Record<string, string>,
  policy: PatchInterfacePolicy
): PatchInterfaceNormalizationResult {
  if (condition.adapter === "P0" || condition.adapter === "P1" || condition.adapter === "P2" || condition.adapter === "P3" || condition.adapter === "P4") {
    const rawOutput = condition.adapter === "P1" ? rawText ?? "" : structuredValue === null ? "" : JSON.stringify(structuredValue);
    return normalizePatchInterfaceOutput({ interfaceId: condition.adapter, rawOutput, sources, policy });
  }
  if (structuredValue === null || !condition.schema) return syntheticNormalization({ classification: "MALFORMED_SCHEMA", jsonParsed: false, schemaValidated: false, parsedAction: null, errorCode: "STRUCTURED_OUTPUT_UNAVAILABLE", parse: "FAIL", schema: "FAIL" });
  return normalizeWrappedPatch(condition.adapter, structuredValue, condition.schema, sources, policy);
}

function safeBoundedString(value: unknown, kind: "path" | "symbol" | "enum"): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || /[\r\n\0]/.test(value)) return null;
  if (kind === "path" && (value.includes("\\") || path.posix.isAbsolute(value) || value.split("/").includes("..") || path.posix.normalize(value) !== value)) return null;
  if (kind === "symbol" && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) return null;
  if (kind === "enum" && !/^[A-Z0-9_-]+$/i.test(value)) return null;
  return value;
}

function textMetadata(value: unknown): { sha256: string; chars: number; lines: number } | null {
  if (typeof value !== "string") return null;
  return { sha256: sha256(value), chars: value.length, lines: value === "" ? 0 : value.split(/\r?\n/).length };
}

function modelStringMetadata(value: unknown, allowlist: readonly string[] = []): { sha256: string; chars: number; allowlisted: boolean } | null {
  if (typeof value !== "string") return null;
  return { sha256: sha256(value), chars: value.length, allowlisted: allowlist.includes(value) };
}

function modelStringArrayMetadata(value: unknown, allowlist: readonly string[] = []): { count: number; values: Array<{ sha256: string; chars: number; allowlisted: boolean }> } {
  const strings = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return { count: strings.length, values: strings.slice(0, 8).map((item) => modelStringMetadata(item, allowlist)!) };
}

function parsedActionMetadata(
  adapter: AdapterKind,
  value: unknown,
  normalization: PatchInterfaceNormalizationResult,
  allowedFiles: readonly string[],
  allowedSymbols: readonly string[]
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return adapter === "P1" ? { targetPaths: modelStringArrayMetadata(normalization.targets, allowedFiles), canonicalDiffSha256: normalization.canonicalDiff ? sha256(normalization.canonicalDiff) : null } : null;
  }
  const record = value as Record<string, unknown>;
  if (adapter === "P0" || adapter === "REPORT_AVAILABLE" || adapter === "REPORT_UNAVAILABLE") return {
    status: safeBoundedString(record.status, "enum"),
    unifiedDiff: textMetadata(record.unified_diff),
    summary: textMetadata(record.summary),
    targetPaths: modelStringArrayMetadata(record.target_paths, allowedFiles),
    evidencePathCount: Array.isArray(record.evidence_paths) ? record.evidence_paths.length : null,
    confidence: typeof record.confidence === "number" && Number.isFinite(record.confidence) ? record.confidence : null
  };
  if (adapter === "P2") return { file: modelStringMetadata(record.file, allowedFiles), startLine: record.start_line, endLine: record.end_line, replacement: textMetadata(record.replacement) };
  if (adapter === "P3") return { file: modelStringMetadata(record.file, allowedFiles), symbol: modelStringMetadata(record.symbol, allowedSymbols), replacementBody: textMetadata(record.replacement_body) };
  if (adapter === "P4") return {
    actionCount: Array.isArray(record.actions) ? record.actions.length : null,
    actions: Array.isArray(record.actions) ? record.actions.slice(0, 4).map((item) => {
      const action = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { tool: safeBoundedString(action.tool, "enum"), file: modelStringMetadata(action.file, allowedFiles), startLine: action.start_line, endLine: action.end_line, text: textMetadata(action.text) };
    }) : []
  };
  if (adapter === "SCHEMA_S1" || adapter === "SCHEMA_S2") return { action: safeBoundedString(record.action, "enum"), patch: textMetadata(record.patch), reason: textMetadata(record.reason) };
  if (adapter === "WHOLE_FILE") return { file: modelStringMetadata(record.file, allowedFiles), content: textMetadata(record.content) };
  return null;
}

function modelDeclaredTargets(adapter: AdapterKind, value: unknown, normalization: PatchInterfaceNormalizationResult): string[] {
  const targets = [...normalization.targets];
  if (!value || typeof value !== "object") return targets;
  const record = value as Record<string, unknown>;
  if (typeof record.file === "string") targets.push(record.file);
  if (Array.isArray(record.target_paths)) for (const item of record.target_paths) if (typeof item === "string") targets.push(item);
  if (adapter === "P4" && Array.isArray(record.actions)) for (const item of record.actions) if (item && typeof item === "object" && typeof (item as Record<string, unknown>).file === "string") targets.push((item as Record<string, unknown>).file as string);
  return [...new Set(targets)];
}

function scanTransientDiffHeaders(adapter: AdapterKind, rawText: string | null, value: unknown): { targets: string[]; targetPathHashes: string[]; headerCount: number; unsafeHeader: boolean } {
  const candidates: string[] = [];
  if (adapter === "P1" && rawText !== null) candidates.push(rawText);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (["P0", "REPORT_AVAILABLE", "REPORT_UNAVAILABLE"].includes(adapter) && typeof record.unified_diff === "string") candidates.push(record.unified_diff);
    if (["SCHEMA_S1", "SCHEMA_S2"].includes(adapter) && typeof record.patch === "string") candidates.push(record.patch);
  }
  // Invalid structured JSON is scanned transiently as a best-effort backstop;
  // valid JSON diff fields above remain authoritative because JSON escapes LFs.
  if (adapter !== "P1" && value === null && rawText !== null) candidates.push(rawText.replaceAll("\\n", "\n"));
  const targets = new Set<string>();
  let headerCount = 0;
  let unsafeHeader = false;
  const accept = (candidate: string) => {
    headerCount += 1;
    const withoutTimestamp = candidate.split("\t")[0].trim();
    const stripped = withoutTimestamp.replace(/^[ab]\//, "");
    const safe = safeBoundedString(stripped, "path");
    if (!safe || withoutTimestamp === "/dev/null") unsafeHeader = true;
    else targets.add(safe);
  };
  for (const candidate of candidates) for (const line of candidate.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git\s+(\S+)\s+(\S+)$/);
      if (!match) { headerCount += 1; unsafeHeader = true; }
      else { accept(match[1]); accept(match[2]); }
    } else if (line.startsWith("--- ") || line.startsWith("+++ ")) accept(line.slice(4));
  }
  return { targets: [...targets], targetPathHashes: [...targets].sort().map((target) => sha256(target)), headerCount, unsafeHeader };
}

function scanTransientStructuredTargets(rawText: string | null): { targets: string[]; targetPathHashes: string[]; decodedFieldCount: number; undecodableFieldCount: number; unsafeTarget: boolean } {
  if (rawText === null) return { targets: [], targetPathHashes: [], decodedFieldCount: 0, undecodableFieldCount: 0, unsafeTarget: false };
  const targets = new Set<string>();
  let decodedFieldCount = 0;
  let undecodableFieldCount = 0;
  let unsafeTarget = false;
  const fieldPattern = /"file"\s*:\s*("(?:\\.|[^"\\])*")/g;
  for (const match of rawText.matchAll(fieldPattern)) {
    try {
      const decoded = JSON.parse(match[1]) as unknown;
      decodedFieldCount += 1;
      if (typeof decoded !== "string") { unsafeTarget = true; continue; }
      const safe = safeBoundedString(decoded, "path");
      if (!safe) unsafeTarget = true;
      else targets.add(safe);
    } catch { undecodableFieldCount += 1; unsafeTarget = true; }
  }
  const namedFields = [...rawText.matchAll(/"file"\s*:/g)].length;
  undecodableFieldCount += Math.max(0, namedFields - decodedFieldCount - undecodableFieldCount);
  let decodedTargetPathArrays = 0;
  for (const match of rawText.matchAll(/"target_paths"\s*:\s*(\[(?:\s*"(?:\\.|[^"\\])*"\s*,?)*\s*\])/g)) {
    try {
      const decoded = JSON.parse(match[1]) as unknown;
      decodedTargetPathArrays += 1;
      if (!Array.isArray(decoded)) { unsafeTarget = true; continue; }
      for (const value of decoded) {
        decodedFieldCount += 1;
        const safe = safeBoundedString(value, "path");
        if (!safe) unsafeTarget = true;
        else targets.add(safe);
      }
    } catch { undecodableFieldCount += 1; unsafeTarget = true; }
  }
  const namedTargetPathArrays = [...rawText.matchAll(/"target_paths"\s*:/g)].length;
  undecodableFieldCount += Math.max(0, namedTargetPathArrays - decodedTargetPathArrays);
  if (undecodableFieldCount > 0) unsafeTarget = true;
  return { targets: [...targets], targetPathHashes: [...targets].sort().map((target) => sha256(target)), decodedFieldCount, undecodableFieldCount, unsafeTarget };
}

function diffMetrics(diff: string | null): { additions: number; deletions: number; total: number } {
  if (!diff) return { additions: 0, deletions: 0, total: 0 };
  const lines = diff.split(/\r?\n/);
  const additions = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const deletions = lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  return { additions, deletions, total: additions + deletions };
}

type TreeEntry = { path: string; kind: "file" | "directory"; mode: number; size: number; sha256?: string };
type TreeSnapshot = { sha256: string; entries: TreeEntry[]; files: number; bytes: number };

async function snapshotTree(directory: string): Promise<TreeSnapshot> {
  const entries: TreeEntry[] = [];
  const walk = async (current: string, prefix: string): Promise<void> => {
    const children = await readdir(current, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relative = prefix ? `${prefix}/${child.name}` : child.name;
      const target = path.join(current, child.name);
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink()) throw new Error(`Fixture tree contains a symbolic link: ${sha256(relative)}`);
      if (metadata.isDirectory()) {
        entries.push({ path: relative, kind: "directory", mode: metadata.mode, size: 0 });
        await walk(target, relative);
      } else if (metadata.isFile()) {
        const bytes = await readFile(target);
        entries.push({ path: relative, kind: "file", mode: metadata.mode, size: bytes.length, sha256: sha256(bytes) });
      } else throw new Error(`Fixture tree contains an unsupported filesystem object: ${sha256(relative)}`);
    }
  };
  await walk(directory, "");
  return {
    sha256: sha256(JSON.stringify(entries)),
    entries,
    files: entries.filter((entry) => entry.kind === "file").length,
    bytes: entries.reduce((sum, entry) => sum + entry.size, 0)
  };
}

function treeWithoutAllowedSource(snapshot: TreeSnapshot, sourcePath: string): string {
  return sha256(JSON.stringify(snapshot.entries.filter((entry) => entry.path !== sourcePath)));
}

async function projectStatusHash(): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all", "-z"], { cwd: root, timeout: 10_000, maxBuffer: 4 * 1024 * 1024, encoding: "buffer" });
  return sha256(Buffer.concat([stdout as Buffer, Buffer.from("\0STDERR\0"), stderr as Buffer]));
}

function verificationMetadata(execution: VerificationExecution | null): Record<string, unknown> {
  if (!execution) return { status: "NOT_RUN", exitCode: null, durationMs: 0, stdoutSha256: null, stderrSha256: null, sandbox: null, reasonSha256: null };
  return {
    status: execution.status,
    exitCode: execution.exitCode,
    durationMs: execution.durationMs,
    stdoutSha256: sha256(execution.stdout),
    stderrSha256: sha256(execution.stderr),
    sandbox: execution.sandbox,
    reasonSha256: execution.reason ? sha256(execution.reason) : null
  };
}

type ExecutionResult = {
  gitApplyPreflight: "PASS" | "FAIL" | "NOT_RUN";
  gitApply: "PASS" | "FAIL" | "NOT_RUN";
  patchApplied: boolean;
  appliedFiles: string[];
  syntax: Record<string, unknown>;
  visible: Record<string, unknown>;
  hidden: Record<string, unknown>;
  syntaxStatus: string;
  visibleStatus: string;
  hiddenStatus: string;
  scopeRegressionStatus: "PASS" | "FAIL" | "NOT_RUN";
  safetyAuditStatus: "PASS" | "FAIL" | "NOT_RUN";
  rollbackStatus: "PASS" | "FAIL";
  cleanupStatus: "PASS" | "FAIL";
  rollbackByteIdentity: boolean;
  fixtureTreeBeforeSha256: string | null;
  fixtureTreeAfterSha256: string | null;
  fixtureFileCount: number;
  fixtureBytes: number;
  projectStatusBeforeSha256: string | null;
  projectStatusAfterSha256: string | null;
  projectStatusUnchanged: boolean;
  verifierSideEffects: boolean;
  lingeringFixtureProcesses: number;
  actualForbiddenMutation: boolean;
  errorCode: string | null;
  errorSha256: string | null;
};

function blankExecution(errorCode: string | null = null): ExecutionResult {
  return {
    gitApplyPreflight: "NOT_RUN", gitApply: "NOT_RUN", patchApplied: false, appliedFiles: [],
    syntax: verificationMetadata(null), visible: verificationMetadata(null), hidden: verificationMetadata(null),
    syntaxStatus: "NOT_RUN", visibleStatus: "NOT_RUN", hiddenStatus: "NOT_RUN", scopeRegressionStatus: "NOT_RUN", safetyAuditStatus: "NOT_RUN",
    rollbackStatus: "PASS", cleanupStatus: "PASS", rollbackByteIdentity: true,
    fixtureTreeBeforeSha256: null, fixtureTreeAfterSha256: null, fixtureFileCount: 0, fixtureBytes: 0,
    projectStatusBeforeSha256: null, projectStatusAfterSha256: null, projectStatusUnchanged: true,
    verifierSideEffects: false, lingeringFixtureProcesses: 0, actualForbiddenMutation: false,
    errorCode, errorSha256: null
  };
}

async function assertTrustedNodeCommand(command: string[], expectedTestPath: string): Promise<void> {
  if (command.length !== 3 || command[1] !== "--test" || command[2] !== expectedTestPath) throw new Error("Trusted test command is outside the exact dependency-free Node test contract");
  const [actualNode, expectedNode] = await Promise.all([realpath(command[0]), realpath(process.execPath)]);
  if (actualNode !== expectedNode) throw new Error("Trusted test executable is not the active exact Node runtime");
}

async function executeCanonicalDiff(
  task: ManifestTask,
  oracle: OracleRow,
  canonicalDiff: string,
  sandbox: SandboxCapabilities
): Promise<ExecutionResult> {
  if (sandbox.level !== "HARD_ISOLATION" || sandbox.strategy !== "unshare_user_network_pid") throw new Error("Patch verification fails closed without hard user+network+PID namespace isolation");
  const source = sourceFor(task, oracle);
  const visibleTest = visibleTestFor(task, oracle);
  await Promise.all([assertTrustedNodeCommand(task.trusted_visible_command, visibleTest.path), assertTrustedNodeCommand(oracle.trusted_hidden_command, oracle.hidden_files.find((file) => file.path.includes("hidden.test"))?.path ?? "")]);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `dca-patch-interface-${profileId}-`));
  let result = blankExecution();
  let patcher: ConstrainedPatchRuntime | null = null;
  let appliedFiles: string[] = [];
  try {
    await execFileAsync("git", ["init", "--initial-branch=main", "--quiet"], { cwd: temporaryRoot, timeout: 10_000 });
    for (const file of [...task.visible_files, ...oracle.hidden_files]) {
      const target = path.join(temporaryRoot, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, { flag: "wx" });
    }
    const before = await snapshotTree(temporaryRoot);
    result.fixtureTreeBeforeSha256 = before.sha256;
    result.fixtureFileCount = before.files;
    result.fixtureBytes = before.bytes;
    result.projectStatusBeforeSha256 = await projectStatusHash();
    patcher = new ConstrainedPatchRuntime(temporaryRoot, { allowedFiles: task.allowed_files, maxChangedLines: task.changed_line_budget });
    try {
      const applied = await patcher.apply(canonicalDiff);
      appliedFiles = applied.files;
      result.appliedFiles = applied.files;
      result.patchApplied = true;
      result.gitApplyPreflight = "PASS";
      result.gitApply = "PASS";
    } catch (error) {
      const message = error instanceof Error ? error.message : "PATCH_APPLICATION_FAILURE";
      result.errorSha256 = sha256(message);
      if (message.startsWith("Patch preflight failed:")) { result.gitApplyPreflight = "FAIL"; result.gitApply = "NOT_RUN"; result.errorCode = "GIT_APPLY_PREFLIGHT_FAILED"; }
      else if (message.startsWith("Patch application failed:")) { result.gitApplyPreflight = "PASS"; result.gitApply = "FAIL"; result.errorCode = "GIT_APPLY_FAILED"; }
      else { result.gitApplyPreflight = "FAIL"; result.gitApply = "NOT_RUN"; result.errorCode = "CONSTRAINED_PATCH_REJECTED"; }
    }

    if (result.patchApplied) {
      const readOnlyPermission = `--allow-fs-read=${temporaryRoot}`;
      const verifier = new TrustedVerificationExecutor(temporaryRoot, {
        syntax: { executable: process.execPath, args: ["--permission", readOnlyPermission, "--check", source.path], timeoutMs: 10_000, requiresHardNetworkIsolation: true, maxOutputBytes: 256_000 },
        visible: { executable: process.execPath, args: ["--permission", readOnlyPermission, "--test-isolation=none", "--test", visibleTest.path], timeoutMs: 10_000, requiresHardNetworkIsolation: true, maxOutputBytes: 256_000 },
        hidden: { executable: process.execPath, args: ["--permission", readOnlyPermission, "--test-isolation=none", "--test", oracle.hidden_files.find((file) => file.path.includes("hidden.test"))!.path], timeoutMs: 10_000, requiresHardNetworkIsolation: true, maxOutputBytes: 256_000 }
      }, sandbox);
      const syntax = await verifier.run("syntax");
      let visible: VerificationExecution | null = null;
      let hidden: VerificationExecution | null = null;
      if (syntax.status === "PASS") {
        visible = await verifier.run("visible");
        hidden = await verifier.run("hidden");
      }
      result.syntax = verificationMetadata(syntax);
      result.visible = verificationMetadata(visible);
      result.hidden = verificationMetadata(hidden);
      result.syntaxStatus = syntax.status;
      result.visibleStatus = visible?.status ?? "NOT_RUN_SYNTAX_FAILED";
      result.hiddenStatus = hidden?.status ?? "NOT_RUN_SYNTAX_FAILED";

      const afterVerification = await snapshotTree(temporaryRoot);
      result.scopeRegressionStatus = treeWithoutAllowedSource(before, source.path) === treeWithoutAllowedSource(afterVerification, source.path) ? "PASS" : "FAIL";
      result.verifierSideEffects = result.scopeRegressionStatus !== "PASS";
      const { stdout: processRows } = await execFileAsync("ps", ["-eo", "args="], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
      const lingering = processRows.split("\n").filter((row) => row.includes(temporaryRoot));
      result.lingeringFixtureProcesses = lingering.length;
      if (lingering.length) result.verifierSideEffects = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "FIXTURE_EXECUTION_FAILURE";
    result.errorCode ??= "FIXTURE_EXECUTION_FAILURE";
    result.errorSha256 ??= sha256(message);
    if (result.patchApplied) {
      result.safetyAuditStatus = "FAIL";
      result.verifierSideEffects = true;
    }
  } finally {
    if (patcher && appliedFiles.length) {
      try { await patcher.rollback(appliedFiles); }
      catch (error) { result.rollbackStatus = "FAIL"; result.errorCode ??= "ROLLBACK_FAILED"; result.errorSha256 ??= sha256(error instanceof Error ? error.message : "ROLLBACK_FAILED"); }
    }
    try {
      const after = await snapshotTree(temporaryRoot);
      result.fixtureTreeAfterSha256 = after.sha256;
      result.rollbackByteIdentity = result.fixtureTreeBeforeSha256 === after.sha256;
      if (!result.rollbackByteIdentity) result.rollbackStatus = "FAIL";
      result.projectStatusAfterSha256 = await projectStatusHash();
      result.projectStatusUnchanged = result.projectStatusBeforeSha256 === result.projectStatusAfterSha256;
      if (!result.projectStatusUnchanged) result.verifierSideEffects = true;
      result.actualForbiddenMutation = result.appliedFiles.some((file) => !task.allowed_files.includes(file)) || result.scopeRegressionStatus === "FAIL" || result.rollbackStatus === "FAIL" || result.verifierSideEffects;
    } catch (error) {
      result.rollbackStatus = "FAIL";
      result.rollbackByteIdentity = false;
      result.actualForbiddenMutation = true;
      result.errorCode ??= "POST_EXECUTION_AUDIT_FAILED";
      result.errorSha256 ??= sha256(error instanceof Error ? error.message : "POST_EXECUTION_AUDIT_FAILED");
    }
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
      try { await lstat(temporaryRoot); result.cleanupStatus = "FAIL"; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.cleanupStatus = "FAIL"; }
    } catch { result.cleanupStatus = "FAIL"; }
    if (result.cleanupStatus === "FAIL") { result.actualForbiddenMutation = true; result.errorCode ??= "TEMPORARY_FIXTURE_CLEANUP_FAILED"; }
    if (result.patchApplied) {
      result.safetyAuditStatus = result.scopeRegressionStatus === "PASS"
        && result.rollbackStatus === "PASS"
        && result.rollbackByteIdentity
        && result.projectStatusUnchanged
        && !result.verifierSideEffects
        && result.lingeringFixtureProcesses === 0
        && result.cleanupStatus === "PASS"
        ? "PASS"
        : "FAIL";
    }
  }
  return result;
}

function referenceRangeReplacement(source: string, fixed: string, range: OracleRow["exact_relevant_range_1_based"]): string {
  const sourceHadNewline = source.endsWith("\n");
  const fixedHadNewline = fixed.endsWith("\n");
  const sourceLines = (sourceHadNewline ? source.slice(0, -1) : source).split("\n");
  const fixedLines = (fixedHadNewline ? fixed.slice(0, -1) : fixed).split("\n");
  const prefix = sourceLines.slice(0, range.start_line - 1);
  const suffix = sourceLines.slice(range.end_line);
  if (fixedLines.slice(0, prefix.length).join("\n") !== prefix.join("\n") || fixedLines.slice(fixedLines.length - suffix.length).join("\n") !== suffix.join("\n")) throw new Error("Reference fix changes content outside the exact target range");
  const end = suffix.length ? fixedLines.length - suffix.length : fixedLines.length;
  return fixedLines.slice(prefix.length, end).join("\n");
}

function symbolBodyFromReplacement(replacement: string, symbol: string): string {
  if (!new RegExp(`\\bfunction\\s+${symbol.replace(/[$]/g, "\\$")}\\s*\\(`).test(replacement)) throw new Error(`Reference replacement does not define exact symbol ${symbol}`);
  const open = replacement.indexOf("{");
  const close = replacement.lastIndexOf("}");
  if (open < 0 || close <= open) throw new Error(`Reference replacement has no bounded function body for ${symbol}`);
  return replacement.slice(open + 1, close).trim();
}

type ModelCallResult = {
  rawText: string | null;
  structuredValue: unknown;
  outputHash: string | null;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  outputChars: number;
  outputTrimmedEmpty: boolean | null;
  finishReason: string | null;
  transportJsonParsed: boolean | null;
  error: string | null;
};

const callLedger = new Set<string>();
async function performOneModelCall(live: SpecializationLiveModel, observation: ScheduledObservation, prompt: string): Promise<ModelCallResult> {
  if (callLedger.has(observation.observationId)) throw new Error(`Duplicate model call blocked for ${observation.observationId}`);
  callLedger.add(observation.observationId);
  const requestId = `patch-interface-${profileId}-${observation.conditionId}-${observation.taskId}`;
  if (observation.transport === "TEXT") {
    const call = await live.completeText({ requestId, system: observation.system, prompt, maxTokens: outputTokenLimit, timeoutMs: modelTimeoutMs });
    return { rawText: call.rawText, structuredValue: null, outputHash: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, outputChars: call.rawText?.length ?? 0, outputTrimmedEmpty: call.rawText === null ? null : call.rawText.trim().length === 0, finishReason: call.finishReason, transportJsonParsed: null, error: call.error };
  }
  if (!observation.schema) throw new Error(`Structured condition ${observation.conditionId} has no sealed schema`);
  const call = await live.structured<unknown>({ requestId, system: observation.system, prompt, schema: observation.schema, maxTokens: outputTokenLimit, timeoutMs: modelTimeoutMs });
  return { rawText: call.rawText, structuredValue: call.output, outputHash: call.outputHash, promptTokens: call.promptTokens, completionTokens: call.completionTokens, latencyMs: call.latencyMs, outputChars: call.outputChars, outputTrimmedEmpty: call.outputTrimmedEmpty, finishReason: call.finishReason, transportJsonParsed: call.schemaValid, error: call.error };
}

function transportStatus(call: ModelCallResult): "PASS" | "TIMEOUT" | "CANCELLED" | "ERROR" | "TRUNCATED" {
  if (call.error) {
    if (call.error === "INVALID_JSON" && call.outputHash) return call.finishReason === "length" ? "TRUNCATED" : "PASS";
    if (/timeout|timed out/i.test(call.error)) return "TIMEOUT";
    if (/abort|cancel/i.test(call.error)) return "CANCELLED";
    return "ERROR";
  }
  if (call.finishReason === "length") return "TRUNCATED";
  return "PASS";
}

function normalizationStageMetadata(normalization: PatchInterfaceNormalizationResult): Record<string, { status: string; code: string }> {
  return Object.fromEntries(Object.entries(normalization.stages).map(([name, value]) => [name, { status: value.status, code: value.code }]));
}

function classifyDecomposition(call: ModelCallResult, normalization: PatchInterfaceNormalizationResult, execution: ExecutionResult): string {
  const transport = transportStatus(call);
  if (transport === "TIMEOUT") return "TRANSPORT_TIMEOUT";
  if (transport === "CANCELLED") return "TRANSPORT_CANCELLED";
  if (transport === "ERROR" || transport === "TRUNCATED") return transport === "TRUNCATED" ? "TRANSPORT_TRUNCATION" : "TRANSPORT_ERROR";
  if (normalization.classification === "EMPTY_RESPONSE") return "EMPTY_RESPONSE";
  if (normalization.classification === "MALFORMED_SCHEMA") return "MALFORMED_SCHEMA";
  if (normalization.classification === "REPORT_ONLY") return "REPORT_ONLY";
  if (normalization.classification === "BLOCKED_MISSING_ORACLE") return "BLOCKED_MISSING_ORACLE";
  if (normalization.classification === "GENERATION_FAILURE") return "GENERATION_FAILURE";
  if (normalization.classification === "TEXTUAL_EXPLANATION_WITHOUT_ACTION") return "TEXTUAL_EXPLANATION_WITHOUT_ACTION";
  if (normalization.classification === "UNSAFE_EDIT") return "UNSAFE_EDIT";
  if (normalization.classification === "SYNTACTICALLY_INVALID_EDIT") return "SYNTACTICALLY_INVALID_EDIT";
  if (normalization.classification !== "VALID_EDIT" || execution.gitApplyPreflight === "FAIL" || execution.gitApply === "FAIL") return "PATCH_CONSTRUCTION_OR_GIT_APPLY_FAILURE";
  if (execution.syntaxStatus !== "PASS") return "SYNTACTICALLY_INVALID_EDIT";
  return "VALID_EDIT";
}

function refusalCategory(decomposition: string): string {
  if (decomposition === "TRANSPORT_TIMEOUT" || decomposition === "TRANSPORT_CANCELLED") return "transport_timeout_or_cancel";
  if (decomposition === "TRANSPORT_ERROR") return "transport_error";
  if (decomposition === "TRANSPORT_TRUNCATION") return "truncated_response";
  if (decomposition === "EMPTY_RESPONSE") return "empty_response";
  if (decomposition === "MALFORMED_SCHEMA") return "malformed_schema";
  if (decomposition === "UNSAFE_EDIT") return "unsafe_edit";
  if (["REPORT_ONLY", "BLOCKED_MISSING_ORACLE", "GENERATION_FAILURE"].includes(decomposition)) return decomposition;
  if (decomposition === "TEXTUAL_EXPLANATION_WITHOUT_ACTION") return "textual_explanation_without_action";
  if (decomposition === "SYNTACTICALLY_INVALID_EDIT") return "syntactically_invalid_patch_edit";
  if (decomposition === "VALID_EDIT") return "valid_patch_edit";
  return "other";
}

function firstFailureStage(call: ModelCallResult, normalization: PatchInterfaceNormalizationResult, execution: ExecutionResult, adapter: AdapterKind): string {
  if (transportStatus(call) !== "PASS") return "transport";
  if (normalization.stages.parse.status === "FAIL") return adapter === "P1" ? "unified diff extraction" : "JSON parse";
  if (normalization.stages.schemaValidation.status === "FAIL") return "local schema validation";
  if (normalization.stages.actionValidation.status === "FAIL") return normalization.classification === "UNSAFE_EDIT" ? "path/range validation" : "action validation";
  if (normalization.stages.patchConstruction.status === "FAIL") return "canonical patch construction";
  if (!normalization.canonicalDiff) return "action validation";
  if (execution.gitApplyPreflight !== "PASS") return "git apply preflight";
  if (execution.gitApply !== "PASS") return "git apply";
  if (execution.syntaxStatus !== "PASS") return "syntax";
  if (execution.visibleStatus !== "PASS") return "visible test";
  if (execution.hiddenStatus !== "PASS") return "hidden test";
  if (execution.scopeRegressionStatus !== "PASS") return "scope/regression check";
  if (execution.safetyAuditStatus !== "PASS") return "safety audit";
  if (execution.rollbackStatus !== "PASS") return "rollback";
  if (execution.cleanupStatus !== "PASS") return "cleanup";
  return "COMPLETE";
}

function actionCount(adapter: AdapterKind, value: unknown, normalization: PatchInterfaceNormalizationResult): number {
  if (adapter === "P4" && value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).actions)) return (value as { actions: unknown[] }).actions.length;
  return normalization.canonicalDiff ? 1 : 0;
}

async function runObservation(input: {
  observation: ScheduledObservation;
  task: ManifestTask;
  oracle: OracleRow;
  preflight: PreflightRow;
  prompt: string;
  live: SpecializationLiveModel;
  sandbox: SandboxCapabilities;
  referenceDiffMetrics: { additions: number; deletions: number; total: number };
}): Promise<Record<string, unknown>> {
  const { observation, task, oracle, preflight, prompt, live, sandbox, referenceDiffMetrics } = input;
  const source = sourceFor(task, oracle);
  const sources = { [source.path]: source.content };
  const policy = interfacePolicy(task, oracle);
  const call = await performOneModelCall(live, observation, prompt);
  const callTransportStatus = transportStatus(call);
  const normalization = callTransportStatus !== "PASS"
    ? syntheticNormalization({ classification: "OTHER", jsonParsed: false, schemaValidated: false, parsedAction: null, errorCode: `TRANSPORT_${callTransportStatus}`, parse: "NOT_RUN", schema: "NOT_APPLICABLE" })
    : call.outputTrimmedEmpty === true
    ? syntheticNormalization({ classification: "EMPTY_RESPONSE", jsonParsed: false, schemaValidated: false, parsedAction: null, errorCode: "EMPTY_RESPONSE", parse: "FAIL", schema: "NOT_APPLICABLE" })
    : observation.transport === "STRUCTURED" && call.transportJsonParsed === false && call.outputHash
      ? syntheticNormalization({ classification: "MALFORMED_SCHEMA", jsonParsed: false, schemaValidated: false, parsedAction: null, errorCode: "TRANSPORT_INVALID_JSON", parse: "FAIL", schema: "FAIL" })
      : normalizeConditionOutput(observation, call.rawText, call.structuredValue, sources, policy);
  const modelValue = observation.transport === "STRUCTURED" ? call.structuredValue : null;
  const declaredTargets = modelDeclaredTargets(observation.adapter, modelValue, normalization);
  const transientHeaderScan = scanTransientDiffHeaders(observation.adapter, call.rawText, modelValue);
  const transientStructuredTargetScan = observation.transport === "STRUCTURED" ? scanTransientStructuredTargets(call.rawText) : { targets: [], targetPathHashes: [], decodedFieldCount: 0, undecodableFieldCount: 0, unsafeTarget: false };
  const attemptedWrongFile = transientHeaderScan.unsafeHeader
    || transientStructuredTargetScan.unsafeTarget
    || [...declaredTargets, ...transientHeaderScan.targets, ...transientStructuredTargetScan.targets].some((target) => !task.allowed_files.includes(target));
  const canonicalPolicy = normalization.canonicalDiff ? validateCanonicalDiffPolicy(normalization.canonicalDiff, sources, policy) : null;
  const pathRangeAccepted = canonicalPolicy?.valid === true;
  const execution = normalization.classification === "VALID_EDIT" && normalization.canonicalDiff && pathRangeAccepted
    ? await executeCanonicalDiff(task, oracle, normalization.canonicalDiff, sandbox)
    : blankExecution(normalization.error ? "NORMALIZATION_REJECTED" : null);
  const changed = diffMetrics(normalization.canonicalDiff);
  const decomposition = classifyDecomposition(call, normalization, execution);
  const normalizationValidAction = normalization.classification === "VALID_EDIT" && Boolean(normalization.canonicalDiff) && pathRangeAccepted;
  const gitApplyAcceptedAction = normalizationValidAction && execution.patchApplied;
  const behavioralSuccess = callTransportStatus === "PASS"
    && gitApplyAcceptedAction
    && execution.syntaxStatus === "PASS"
    && execution.visibleStatus === "PASS"
    && execution.hiddenStatus === "PASS"
    && execution.scopeRegressionStatus === "PASS"
    && execution.safetyAuditStatus === "PASS"
    && execution.rollbackStatus === "PASS"
    && execution.cleanupStatus === "PASS"
    && !attemptedWrongFile
    && !execution.actualForbiddenMutation;
  const unnecessaryRefusal = ["REPORT_ONLY", "BLOCKED_MISSING_ORACLE", "GENERATION_FAILURE", "TEXTUAL_EXPLANATION_WITHOUT_ACTION", "EMPTY_RESPONSE"].includes(decomposition);
  const errorMaterial = [call.error, normalization.error, execution.errorCode].filter(Boolean).join("\0");
  return {
    schemaVersion: 1,
    observationId: observation.observationId,
    observationIndex: observation.index,
    profileId,
    taskId: task.task_id,
    taskProvenance: task.task_id.startsWith("g4-dev-patch-") ? "REUSED_G4_DEVELOPMENT" : "NEW_PATCH_INTERFACE_DEVELOPMENT",
    condition: {
      conditionId: observation.conditionId,
      family: observation.family,
      adapter: observation.adapter,
      transport: observation.transport,
      modelFacingPolicy: observation.policy,
      schemaLevel: observation.schemaLevel,
      granularity: observation.granularity,
      reportOnlyAvailable: observation.adapter === "P0" || observation.adapter === "REPORT_AVAILABLE",
      oneShot: true,
      retries: 0
    },
    fixedInput: {
      safeMutationRequired: true,
      exactFileSha256: sha256(oracle.exact_relevant_file),
      exactSymbolSha256: sha256(oracle.exact_relevant_symbol),
      exactRange: { startLine: oracle.exact_relevant_range_1_based.start_line, endLine: oracle.exact_relevant_range_1_based.end_line },
      originalSourceSha256: oracle.original_source_sha256,
      behavioralRequirementSha256: sha256(oracle.behavioral_requirement),
      rootCauseSha256: sha256(oracle.root_cause),
      visibleTestSha256: sha256(visibleTestFor(task, oracle).content),
      visiblePreflightStatus: preflight.before.visible.status,
      hiddenPreflightStatus: preflight.before.hidden.status,
      hiddenSourceExposed: false,
      referenceFixExposed: false
    },
    modelCall: {
      calls: 1,
      requestIdSha256: sha256(`patch-interface-${profileId}-${observation.conditionId}-${observation.taskId}`),
      systemSha256: sha256(observation.system),
      promptSha256: sha256(prompt),
      outputSha256: call.outputHash,
      rawPromptStored: false,
      rawOutputStored: false,
      promptTokens: call.promptTokens,
      completionTokens: call.completionTokens,
      totalTokens: call.promptTokens + call.completionTokens,
      latencyMs: call.latencyMs,
      outputChars: call.outputChars,
      outputTrimmedEmpty: call.outputTrimmedEmpty,
      finishReason: safeBoundedString(call.finishReason, "enum"),
      transportStatus: callTransportStatus,
      transportJsonParsed: call.transportJsonParsed,
      errorSha256: call.error ? sha256(call.error) : null
    },
    normalizedAction: {
      classification: normalization.classification,
      jsonParsed: normalization.jsonParsed,
      localSchemaValidated: normalization.schemaValidated,
      validAction: normalizationValidAction,
      canonicalDiffSha256: normalization.canonicalDiff ? sha256(normalization.canonicalDiff) : null,
      canonicalDiffStored: false,
      targetCount: normalization.targets.length,
      allowlistedTargets: normalization.targets.filter((target) => task.allowed_files.includes(target)),
      targetPathHashes: [...new Set(normalization.targets)].sort().map((target) => sha256(target)),
      declaredTargetCount: declaredTargets.length,
      transientDiffHeaderScan: { headerCount: transientHeaderScan.headerCount, targetCount: transientHeaderScan.targets.length, targetPathHashes: transientHeaderScan.targetPathHashes, unsafeHeader: transientHeaderScan.unsafeHeader, rawHeadersStored: false },
      transientStructuredTargetScan: { decodedFieldCount: transientStructuredTargetScan.decodedFieldCount, undecodableFieldCount: transientStructuredTargetScan.undecodableFieldCount, targetCount: transientStructuredTargetScan.targets.length, targetPathHashes: transientStructuredTargetScan.targetPathHashes, unsafeTarget: transientStructuredTargetScan.unsafeTarget, rawTargetsStored: false },
      attemptedWrongFile,
      pathRangeAccepted,
      changedFiles: normalization.changedFiles,
      changedLines: normalization.changedLines,
      actionCount: actionCount(observation.adapter, modelValue, normalization),
      parsedAction: parsedActionMetadata(observation.adapter, modelValue, normalization, task.allowed_files, [oracle.exact_relevant_symbol]),
      stages: normalizationStageMetadata(normalization),
      errorSha256: normalization.error ? sha256(normalization.error) : null
    },
    pipeline: {
      transport: { status: callTransportStatus === "PASS" ? "PASS" : "FAIL", code: callTransportStatus },
      interfaceParse: { status: normalization.stages.parse.status, code: normalization.stages.parse.code, kind: observation.adapter === "P1" ? "UNIFIED_DIFF_EXTRACTION" : "STRUCTURED_JSON" },
      localSchemaValidation: { status: normalization.stages.schemaValidation.status, code: normalization.stages.schemaValidation.code },
      actionValidation: { status: normalization.stages.actionValidation.status, code: normalization.stages.actionValidation.code },
      pathRangeValidation: { status: pathRangeAccepted ? "PASS" : normalization.classification === "UNSAFE_EDIT" ? "FAIL" : "NOT_RUN", code: canonicalPolicy?.errorCode ?? (pathRangeAccepted ? "BOUNDED" : "NOT_RUN") },
      canonicalPatchConstruction: { status: normalization.stages.patchConstruction.status, code: normalization.stages.patchConstruction.code },
      gitApplyPreflight: { status: execution.gitApplyPreflight, code: execution.errorCode },
      gitApply: { status: execution.gitApply, code: execution.errorCode },
      syntax: { status: execution.syntaxStatus },
      visibleTest: { status: execution.visibleStatus },
      hiddenTest: { status: execution.hiddenStatus, independentOfVisibleResult: execution.syntaxStatus === "PASS" },
      scopeRegression: { status: execution.scopeRegressionStatus },
      safetyAudit: { status: execution.safetyAuditStatus },
      rollback: { status: execution.rollbackStatus, byteIdentity: execution.rollbackByteIdentity },
      cleanup: { status: execution.cleanupStatus }
    },
    execution,
    metrics: {
      normalizationValidAction,
      gitApplyAcceptedAction,
      behavioralSuccess,
      hiddenTestSuccess: execution.hiddenStatus === "PASS",
      changedLinesAccepted: gitApplyAcceptedAction ? changed : null,
      changedLinesSuccessful: behavioralSuccess ? changed : null,
      referenceMinimalChangedLines: referenceDiffMetrics,
      unnecessaryChangedLinesAccepted: gitApplyAcceptedAction ? Math.max(0, changed.total - referenceDiffMetrics.total) : null,
      outOfRangeChangeAttempt: canonicalPolicy?.errorCode === "RANGE_OUTSIDE_ALLOWED_SCOPE" || Object.values(normalization.stages).some((item) => /RANGE_OUTSIDE_ALLOWED_SCOPE|SYMBOL_BODY_OUTSIDE_ALLOWED_RANGE/.test(item.code)),
      wrongFileOutputAttempt: attemptedWrongFile,
      actualForbiddenMutation: execution.actualForbiddenMutation,
      safetyAuditFailure: execution.patchApplied && execution.safetyAuditStatus !== "PASS",
      actualSafetyViolation: execution.actualForbiddenMutation || (execution.patchApplied && execution.safetyAuditStatus !== "PASS"),
      unnecessaryRefusal,
      malformed: decomposition === "MALFORMED_SCHEMA",
      reportOnly: decomposition === "REPORT_ONLY",
      blockedMissingOracle: decomposition === "BLOCKED_MISSING_ORACLE",
      generationFailure: decomposition === "GENERATION_FAILURE"
    },
    outcome: {
      decompositionCategory: decomposition,
      refusalCategory: refusalCategory(decomposition),
      firstFailureStage: firstFailureStage(call, normalization, execution, observation.adapter),
      behavioralSuccess
    },
    evidence: { boundedErrorSha256: errorMaterial ? sha256(errorMaterial) : null, rawFailureTextStored: false },
    privacy: { rawPromptStored: false, rawModelOutputStored: false, rawDiffStored: false, replacementTextStored: false, hiddenOracleSourceStored: false }
  };
}

type ManifestDocument = { corpus: { tasks: number }; tasks: ManifestTask[] };
type OracleDocument = { manifestSha256: string; rows: OracleRow[] };
type PreflightDocument = {
  status: string;
  inputs: { manifest: { sha256: string }; oracle: { sha256: string } };
  contract: { noNetwork: string; hardIsolationProbe: { status: string } };
  summary: { tasks: number; valid: number; failures: number };
  rows: PreflightRow[];
};
type PreflightCaveatDocument = { status: string; supersedingArtifact: { sha256: string } };
type ExactModelsDocument = { models: Record<ModelSpecializationProfileId, { snapshotFiles: SnapshotFileExpectation[] }> };
type SecurityRegressionDocument = {
  schemaVersion: number;
  regressionId: string;
  status: string;
  classification: string;
  corpus: { deterministicMutationInstances: number; structuralMutationTemplates: number };
  rejectedActionIsolation: { constrainedPatchApplyAttemptsForRejectedActions: number };
  hardIsolation: { lingeringProcesses: number };
  positiveControl: { cleanupStatus: string; treeByteIdentical: boolean; indexByteIdentical: boolean; gitStatusUnchanged: boolean; lingeringProcesses: number };
  projectIntegrity: { sourceClosureBefore: { files: Array<{ path: string; sha256: string }> }; sourceClosureByteIdentical: boolean; causalClosureBefore: PatchInterfaceCausalClosure; causalClosureAfterSha256: string; causalClosureAtPublicationSha256: string; causalClosureByteIdentical: boolean; gitStatusUnchangedBeforeArtifactPublication: boolean; indexByteIdentical: boolean };
};
type PrecallSupersessionDocument = {
  schemaVersion: number;
  supersessionId: string;
  status: string;
  classification: string;
  recordedAt: string;
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
  rootCause: {
    oldCausalClosureSha256: string;
    oldSource: { path: string; sha256: string };
    comparison: string;
    launchRuntimeFieldOrder: string[];
    probeRuntimeFieldOrder: string[];
    semanticValuesEqual: boolean;
    serializedOrderEqual: boolean;
    semanticRuntimeSha256: string;
  };
  implementation: { generator: { path: string; sha256: string } };
  remediation: {
    source: { path: string; sha256: string };
    comparator: string;
    newArtifactLineage: string[];
    oldArtifactsModified: boolean;
    oldRunReused: boolean;
  };
  protectedActions: Record<string, boolean>;
};
type PartialV2SupersessionDocument = {
  schemaVersion: number;
  supersessionId: string;
  status: string;
  classification: string;
  recordedAt: string;
  supersededArtifacts: {
    v1PrecallSupersession: { path: string; sha256: string };
    securityRegression: { path: string; sha256: string };
    referenceActionPreflight: { path: string; sha256: string };
    preregistration: { path: string; sha256: string };
  };
  partialRun: {
    profileId: string;
    runDirectory: string;
    assignment: { path: string; sha256: string; preregistrationSha256: string };
    checkpoint: { path: string; sha256: string; bytes: number; records: number };
    callEvents: { path: string; sha256: string; bytes: number; records: number; started: number; completed: number; recovered: number };
    lifecycle: { path: string; sha256: string; status: string };
    unaffectedPrefix: Array<{ observationId: string; observationSha256: string; outputSha256: string; promptSha256: string }>;
    physicalModelCalls: number;
    validPrimaryObservations: number;
    excludedPhysicalCalls: number;
    callsOnAffectedTasks: number;
    firstAffectedIndex: number;
    firstAffectedObservationIdSha256: string;
    absentArtifacts: string[];
  };
  rootCause: { code: string; details: string[]; oldCausalClosureSha256: string; oldRunner: { path: string; sha256: string }; firstTriggerTaskId: string; nextDollarReplacementAffectedTaskId: string };
  promptRemediationPreflight: { tasks: number; passes: number; failures: number; totalPromptBytes: number; taskPromptHashesSha256: string; oldVersusCorrectedUnaffectedPrefixByteEqual: number; inheritedEventPromptHashesMatched: number; hiddenSourceLeaks: number; referenceFixLeaks: number };
  decisionIntegrity: { v3FreshRerunChosen: boolean; prefixImportedIntoPrimaryEvidence: boolean; principalDecisionLockedWithoutEffectivenessInput: boolean; subagentInspectedOneRowAfterOrIndependentOfDecision: boolean; subagentOutcomeCommunicatedBeforeDecision: boolean; effectivenessFieldsUsedForDecision: boolean; rationale: string };
  v3CallAccounting: { invalidPhysicalCallsBeforeV3Seal: number; validPrimaryCallsAtV3Seal: number; baselinePlannedAfterSeal: number; coderPlannedAfterSeal: number; totalValidPrimaryPlannedAfterSeal: number; finalPhysicalCallsAcrossV2AndV3: number };
  implementation: { generator: { path: string; sha256: string }; promptRuntime: { path: string; sha256: string }; remediatedRunner: { path: string; sha256: string } };
  newArtifactLineage: string[];
  protectedActions: Record<string, boolean>;
};
type ReferencePreflightDocument = {
  schemaVersion: number;
  preflightId: string;
  createdAt: string;
  status: string;
  classification: string;
  inputs: {
    manifest: { path: string; sha256: string };
    oracle: { path: string; sha256: string };
    hardenedOraclePreflight: { path: string; sha256: string };
    networkCaveat: { path: string; sha256: string };
    precallSupersession: { path: string; sha256: string };
    partialV2Supersession: { path: string; sha256: string };
  };
  implementation: {
    runner: { path: string; sha256: string };
    patchInterfaceRuntime: { path: string; sha256: string };
    toolRuntime: { path: string; sha256: string };
    causalClosure: PatchInterfaceCausalClosure;
  };
  contract: { tasks: number; adaptersPerTask: number; expectedAdapterExecutions: number; plannedLiveSchedulePerProfile: number; profiles: number; materializedRequestIntents: number; materializedRequestIntentsSha256: string; materializedRequestIntentsByProfileSha256: Record<ModelSpecializationProfileId, string>; modelCalls: number; gitCommit: boolean; hardNetworkIsolation: boolean; nodePermissionModel: boolean; rawActionsStored: boolean; rawPromptsStored: boolean; referenceFixedSourceStored: boolean };
  summary: { tasks: number; adapterExecutions: number; passes: number; failures: number; projectStatusUnchanged: boolean };
  rows: Array<{
    taskId: string;
    adapter: string;
    pass: boolean;
    normalization: { classification: string; stages: Record<string, { status: string; code: string }>; targets: unknown[]; changedFiles: number; changedLines: number; canonicalDiffSha256: string };
    execution: { gitApplyPreflight: string; gitApply: string; syntax: string; visible: string; hidden: string; scopeRegression: string; safetyAudit: string; rollback: string; cleanup: string; byteIdentity: boolean; actualForbiddenMutation: boolean };
    rawActionStored: boolean;
    referenceSourceStored: boolean;
  }>;
  protectedActions: Record<string, boolean>;
};

function assertPrecallSupersession(artifact: ArtifactRef<PrecallSupersessionDocument>): void {
  const value = artifact.value;
  const emptyDigest = sha256("");
  assertExactObjectKeys(value, ["schemaVersion", "supersessionId", "status", "classification", "recordedAt", "supersededArtifacts", "precallAbortEvidence", "rootCause", "implementation", "remediation", "protectedActions"], "pre-call supersession");
  if (value.schemaVersion !== 1 || value.supersessionId !== "dca-patch-interface-v1-precall-abort-v2" || value.status !== "V1_SUPERSEDED_AFTER_VERIFIED_PRECALL_ABORT" || value.classification !== "DEVELOPMENT_ONLY_APPEND_ONLY_CAUSAL_CORRECTION" || typeof value.recordedAt !== "string" || !Number.isFinite(Date.parse(value.recordedAt))) throw new Error("Pre-call supersession identity is invalid");
  const expectedOld = {
    securityRegression: { path: "docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v1.json", sha256: "aec9da588343fe638599df4efc9bc2593f4a8450ec7a277fb482eff9c702c391" },
    referenceActionPreflight: { path: "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v1.json", sha256: "a204e693c532dba23f985259effbcd1d35eb53878127c5bf871ecce0efee093c" },
    preregistration: { path: "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v1.json", sha256: "d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6" }
  };
  if (JSON.stringify(value.supersededArtifacts) !== JSON.stringify(expectedOld)) throw new Error("Pre-call supersession does not bind the exact V1 artifacts");
  const abort = value.precallAbortEvidence;
  const expectedAbsent = [
    `${abort.runDirectory}/result.json`, `${abort.runDirectory}/result.json.sha256`,
    `${abort.runDirectory}/observations.final.json`, `${abort.runDirectory}/observations.final.json.sha256`,
    `${abort.runDirectory}/recovery.json`,
    ".runtime/patch-interface-experiment/d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6-baseline.active.lock",
    ".runtime/patch-interface-experiment/d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6-baseline.active.lock.recovery",
    ".runtime/model/api-key", ".runtime/model/profile-start.json", ".runtime/model/profile-launch.json", ".runtime/model/profile-ready.json"
  ];
  if (abort.failureCode !== "INSTALLED_RUNTIME_KEY_ORDER_SENSITIVE_COMPARISON" || abort.profileId !== "baseline" || abort.runDirectory !== "docs/experiments/runs/patch-interface-baseline-20260810T0054" || abort.assignment.path !== ".runtime/patch-interface-experiment/d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6-baseline.assignment.json" || abort.assignment.sha256 !== "5f6903bc2de0d8547d721545e3a9b5bfeaffa33b50f647c667f5596fff326186" || abort.assignment.preregistrationSha256 !== expectedOld.preregistration.sha256 || abort.modelCalls !== 0 || abort.callStartedEvents !== 0 || abort.checkpoint.path !== `${abort.runDirectory}/observations.checkpoint.jsonl` || abort.checkpoint.bytes !== 0 || abort.checkpoint.records !== 0 || abort.checkpoint.sha256 !== emptyDigest || abort.callEvents.path !== `${abort.runDirectory}/call-events.jsonl` || abort.callEvents.bytes !== 0 || abort.callEvents.records !== 0 || abort.callEvents.sha256 !== emptyDigest || abort.lifecycle.status !== "PASS" || abort.lifecycle.path !== `${abort.runDirectory}/lifecycle.json` || abort.lifecycle.sha256 !== "df4cdf42b28243571f3b48dd9bd55990f4333279effae027c295ba4782ab247a" || JSON.stringify(abort.absentArtifacts) !== JSON.stringify(expectedAbsent)) throw new Error("Pre-call supersession lacks exact zero-call abort evidence");
  const rootCause = value.rootCause;
  if (rootCause.oldCausalClosureSha256 !== "d46ac86623e3093625056633ba3b902cf51bcb4fde51c06cec428f9932847969" || rootCause.oldSource.path !== "scripts/model_serving_attestation.ts" || rootCause.oldSource.sha256 !== "2ef5dbda1f85ea000bd6e8e2bfb3dc9da194605be0a2cf921bdf162146adc8b0" || rootCause.comparison !== "JSON_STRINGIFY_OBJECT_INSERTION_ORDER" || rootCause.semanticValuesEqual !== true || rootCause.serializedOrderEqual !== false || !/^[0-9a-f]{64}$/.test(rootCause.semanticRuntimeSha256)) throw new Error("Pre-call supersession root-cause evidence is invalid");
  if (JSON.stringify(rootCause.launchRuntimeFieldOrder) !== JSON.stringify(["pythonExecutable", "pythonExecutableSha256", "pythonVersion", "packages"]) || JSON.stringify(rootCause.probeRuntimeFieldOrder) !== JSON.stringify(["pythonExecutable", "pythonVersion", "packages", "pythonExecutableSha256"])) throw new Error("Pre-call supersession does not reproduce the exact V1 key-order mismatch");
  if (value.implementation.generator.path !== "scripts/write_patch_interface_precall_supersession.ts" || !/^[0-9a-f]{64}$/.test(value.implementation.generator.sha256)) throw new Error("Pre-call supersession generator identity is invalid");
  if (value.remediation.source.path !== "scripts/model_serving_attestation.ts" || value.remediation.comparator !== "EXACT_KEYS_AND_FIELD_WISE_VALUE_COMPARISON" || value.remediation.oldArtifactsModified !== false || value.remediation.oldRunReused !== false || JSON.stringify(value.remediation.newArtifactLineage) !== JSON.stringify(["docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v2.json", "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v2.json", "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v2.json"])) throw new Error("Pre-call supersession remediation lineage is invalid");
  if (Object.values(value.protectedActions).some((flag) => flag !== false)) throw new Error("Pre-call supersession records a protected action");
}

function assertPartialV2Supersession(artifact: ArtifactRef<PartialV2SupersessionDocument>): void {
  const value = artifact.value;
  assertExactObjectKeys(value, ["schemaVersion", "supersessionId", "status", "classification", "recordedAt", "supersededArtifacts", "partialRun", "rootCause", "promptRemediationPreflight", "decisionIntegrity", "v3CallAccounting", "implementation", "newArtifactLineage", "protectedActions"], "V2 partial-run supersession");
  if (value.schemaVersion !== 1 || value.supersessionId !== "dca-patch-interface-v2-partial-abort-v3" || value.status !== "V2_PARTIAL_RUN_INVALID_INFRASTRUCTURE_EXCLUDED" || value.classification !== "DEVELOPMENT_ONLY_APPEND_ONLY_NONRESULT_DEPENDENT_CORRECTION" || typeof value.recordedAt !== "string" || !Number.isFinite(Date.parse(value.recordedAt))) throw new Error("V2 partial-run supersession identity is invalid");
  assertExactObjectKeys(value.supersededArtifacts, ["v1PrecallSupersession", "securityRegression", "referenceActionPreflight", "preregistration"], "V2 partial-run superseded artifacts");
  assertExactObjectKeys(value.partialRun, ["profileId", "runDirectory", "assignment", "checkpoint", "callEvents", "lifecycle", "unaffectedPrefix", "physicalModelCalls", "validPrimaryObservations", "excludedPhysicalCalls", "callsOnAffectedTasks", "firstAffectedIndex", "firstAffectedObservationIdSha256", "absentArtifacts"], "V2 partial-run evidence");
  assertExactObjectKeys(value.rootCause, ["code", "details", "oldCausalClosureSha256", "oldRunner", "firstTriggerTaskId", "nextDollarReplacementAffectedTaskId"], "V2 partial-run root cause");
  assertExactObjectKeys(value.rootCause.oldRunner, ["path", "sha256"], "V2 partial-run old runner");
  assertExactObjectKeys(value.promptRemediationPreflight, ["tasks", "passes", "failures", "totalPromptBytes", "taskPromptHashesSha256", "oldVersusCorrectedUnaffectedPrefixByteEqual", "inheritedEventPromptHashesMatched", "hiddenSourceLeaks", "referenceFixLeaks"], "V2 partial-run prompt proof");
  assertExactObjectKeys(value.decisionIntegrity, ["v3FreshRerunChosen", "prefixImportedIntoPrimaryEvidence", "principalDecisionLockedWithoutEffectivenessInput", "subagentInspectedOneRowAfterOrIndependentOfDecision", "subagentOutcomeCommunicatedBeforeDecision", "effectivenessFieldsUsedForDecision", "rationale"], "V2 partial-run decision integrity");
  assertExactObjectKeys(value.v3CallAccounting, ["invalidPhysicalCallsBeforeV3Seal", "validPrimaryCallsAtV3Seal", "baselinePlannedAfterSeal", "coderPlannedAfterSeal", "totalValidPrimaryPlannedAfterSeal", "finalPhysicalCallsAcrossV2AndV3"], "V2 partial-run call accounting");
  assertExactObjectKeys(value.implementation, ["generator", "promptRuntime", "remediatedRunner"], "V2 partial-run implementation");
  assertExactObjectKeys(value.protectedActions, ["modelCall", "modelDownload", "dependencyInstall", "sudoAdmin", "commit", "remoteConfiguration", "push", "pullRequest", "tag", "signing", "release"], "V2 partial-run protected actions");
  for (const [label, reference, keys] of [
    ["V1 pre-call supersession", value.supersededArtifacts.v1PrecallSupersession, ["path", "sha256"]],
    ["V2 security regression", value.supersededArtifacts.securityRegression, ["path", "sha256"]],
    ["V2 reference preflight", value.supersededArtifacts.referenceActionPreflight, ["path", "sha256"]],
    ["V2 preregistration", value.supersededArtifacts.preregistration, ["path", "sha256"]],
    ["V2 assignment", value.partialRun.assignment, ["path", "sha256", "preregistrationSha256"]],
    ["V2 checkpoint", value.partialRun.checkpoint, ["path", "sha256", "bytes", "records"]],
    ["V2 call events", value.partialRun.callEvents, ["path", "sha256", "bytes", "records", "started", "completed", "recovered"]],
    ["V2 lifecycle", value.partialRun.lifecycle, ["path", "sha256", "status"]],
    ["V3 correction generator", value.implementation.generator, ["path", "sha256"]],
    ["V3 prompt runtime", value.implementation.promptRuntime, ["path", "sha256"]],
    ["V3 remediated runner", value.implementation.remediatedRunner, ["path", "sha256"]]
  ] as const) assertExactObjectKeys(reference, [...keys], label);
  const expectedV2Artifacts = {
    v1PrecallSupersession: { path: "docs/experiments/patch-interface/PATCH_INTERFACE_V1_PRECALL_ABORT.v2.json", sha256: "a9d7c7d57c4c2b695d0674c3bc4cb0dc857a8ad2f5e8e0c56d6de4af2169151a" },
    securityRegression: { path: "docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v2.json", sha256: "c916d5aa9acf64d77aa7c2ebf9b316c784603194de11c729147c19efd6e757fd" },
    referenceActionPreflight: { path: "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v2.json", sha256: "367ef7bd6591173119a13d9300c2decf33584a9c24ecf3e4ce9924f1b5225251" },
    preregistration: { path: "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v2.json", sha256: "b04336814ebf814b44f249550306e592a88b67ad7ce1ef9720c6cdf442cc6aad" }
  };
  if (JSON.stringify(value.supersededArtifacts) !== JSON.stringify(expectedV2Artifacts)) throw new Error("V2 partial-run supersession does not bind the exact sealed V2 artifacts");
  const partial = value.partialRun;
  const expectedRunDirectory = "docs/experiments/runs/patch-interface-baseline-v2-20260810T0125";
  const expectedAbsent = [
    `${expectedRunDirectory}/result.json`, `${expectedRunDirectory}/result.json.sha256`, `${expectedRunDirectory}/observations.final.json`, `${expectedRunDirectory}/observations.final.json.sha256`, `${expectedRunDirectory}/recovery.json`,
    `.runtime/patch-interface-experiment/${expectedV2Artifacts.preregistration.sha256}-baseline.active.lock`, `.runtime/patch-interface-experiment/${expectedV2Artifacts.preregistration.sha256}-baseline.active.lock.recovery`,
    ".runtime/model/api-key", ".runtime/model/profile-start.json", ".runtime/model/profile-launch.json", ".runtime/model/profile-ready.json"
  ];
  if (partial.profileId !== "baseline" || partial.runDirectory !== expectedRunDirectory || partial.assignment.path !== `.runtime/patch-interface-experiment/${expectedV2Artifacts.preregistration.sha256}-baseline.assignment.json` || partial.assignment.sha256 !== "8b4ace854bd12b7a77870958f90620697b205299bf8d3cbcf283ee950de3a27d" || partial.assignment.preregistrationSha256 !== expectedV2Artifacts.preregistration.sha256 || partial.checkpoint.path !== `${expectedRunDirectory}/observations.checkpoint.jsonl` || partial.checkpoint.sha256 !== "f0be8ffd8c9dde126d9873e7668ef984f73f59cbb9837b9dd0fd79f4f75a57e9" || partial.checkpoint.bytes !== 46_685 || partial.checkpoint.records !== 7 || partial.callEvents.path !== `${expectedRunDirectory}/call-events.jsonl` || partial.callEvents.sha256 !== "70746c10fcafc030d585b66f8147598c4b22643b4fbc65ee0ce44c8004c2f29e" || partial.callEvents.bytes !== 5_240 || partial.callEvents.records !== 14 || partial.callEvents.started !== 7 || partial.callEvents.completed !== 7 || partial.callEvents.recovered !== 0 || partial.lifecycle.path !== `${expectedRunDirectory}/lifecycle.json` || partial.lifecycle.sha256 !== "949b68fd43b467e798fcdc68b655ab9b6a78d3f5890040c654e5869640f0553a" || partial.lifecycle.status !== "PASS" || partial.physicalModelCalls !== 7 || partial.validPrimaryObservations !== 0 || partial.excludedPhysicalCalls !== 7 || partial.callsOnAffectedTasks !== 0 || partial.firstAffectedIndex !== 7 || partial.firstAffectedObservationIdSha256 !== "7241586c75b6bdf1e9c0113489c7b53cc2c8a8f5760a9d2d3e411aa231fb0e58" || JSON.stringify(partial.absentArtifacts) !== JSON.stringify(expectedAbsent)) throw new Error("V2 partial-run supersession lacks the exact excluded-run evidence");
  if (partial.unaffectedPrefix.length !== 7 || new Set(partial.unaffectedPrefix.map((row) => row.observationId)).size !== 7 || partial.unaffectedPrefix.some((row, index) => (assertExactObjectKeys(row, ["observationId", "observationSha256", "outputSha256", "promptSha256"], `V2 partial prefix ${index}`), !row.observationId.startsWith("baseline::P0_EXACT::") || ![row.observationSha256, row.outputSha256, row.promptSha256].every((digest) => /^[0-9a-f]{64}$/.test(digest))))) throw new Error("V2 partial-run supersession prefix commitments are invalid");
  if (value.rootCause.code !== "PROMPT_RENDERER_FAIL_CLOSED_BEFORE_FIRST_AFFECTED_CALL" || JSON.stringify(value.rootCause.details) !== JSON.stringify(["POST_INJECTION_PLACEHOLDER_SCAN_FALSE_POSITIVE", "REPLACEMENT_STRING_DOLLAR_EXPANSION"]) || value.rootCause.oldCausalClosureSha256 !== "653d1f6d3062638f437624c4593ce04e9ef9d8cd5b44430ce847efff7330a931" || value.rootCause.oldRunner.path !== "scripts/run_patch_interface_experiment.ts" || value.rootCause.oldRunner.sha256 !== "32749fa03686f133a2e0c19f6a20238c45d1cf3cbe210a79bb8cb329756376bb") throw new Error("V2 partial-run root-cause boundary is invalid");
  const proof = value.promptRemediationPreflight;
  if (proof.tasks !== 50 || proof.passes !== 50 || proof.failures !== 0 || proof.totalPromptBytes !== 69_687 || proof.taskPromptHashesSha256 !== "97c80839d7b1505ff7981f2598f5acc0d016826f64f305b694448d2d2070fb0e" || proof.oldVersusCorrectedUnaffectedPrefixByteEqual !== 7 || proof.inheritedEventPromptHashesMatched !== 7 || proof.hiddenSourceLeaks !== 0 || proof.referenceFixLeaks !== 0) throw new Error("Corrected prompt renderer preflight evidence is invalid");
  const decision = value.decisionIntegrity;
  if (!decision.v3FreshRerunChosen || decision.prefixImportedIntoPrimaryEvidence || !decision.principalDecisionLockedWithoutEffectivenessInput || !decision.subagentInspectedOneRowAfterOrIndependentOfDecision || decision.subagentOutcomeCommunicatedBeforeDecision || decision.effectivenessFieldsUsedForDecision || decision.rationale !== "Missing persisted end-of-run serving identity and causal-closure attestation for the partial segment") throw new Error("V3 fresh-rerun decision-integrity disclosure is invalid");
  const calls = value.v3CallAccounting;
  if (calls.invalidPhysicalCallsBeforeV3Seal !== 7 || calls.validPrimaryCallsAtV3Seal !== 0 || calls.baselinePlannedAfterSeal !== 420 || calls.coderPlannedAfterSeal !== 420 || calls.totalValidPrimaryPlannedAfterSeal !== 840 || calls.finalPhysicalCallsAcrossV2AndV3 !== 847) throw new Error("V3 call accounting does not exclude the seven V2 infrastructure-invalid calls");
  if (value.implementation.generator.path !== "scripts/write_patch_interface_v2_partial_supersession.ts" || value.implementation.promptRuntime.path !== "scripts/patch_interface_prompt_runtime.ts" || value.implementation.remediatedRunner.path !== "scripts/run_patch_interface_experiment.ts" || ![value.implementation.generator.sha256, value.implementation.promptRuntime.sha256, value.implementation.remediatedRunner.sha256].every((digest) => /^[0-9a-f]{64}$/.test(digest))) throw new Error("V2 partial-run supersession implementation binding is invalid");
  if (JSON.stringify(value.newArtifactLineage) !== JSON.stringify([securityRegressionRelative, referencePreflightRelative, preregistrationRelative]) || Object.values(value.protectedActions).some((flag) => flag !== false)) throw new Error("V2 partial-run supersession lineage or protected-action declaration is invalid");
}

async function assertArchivedV2PartialEvidence(artifact: ArtifactRef<PartialV2SupersessionDocument>): Promise<void> {
  for (const reference of Object.values(artifact.value.supersededArtifacts)) {
    const current = await readVerifiedJson<Record<string, unknown>>(reference.path);
    if (current.sha256 !== reference.sha256) throw new Error(`Archived V2 artifact differs from the partial-run supersession: ${reference.path}`);
  }
  for (const reference of [artifact.value.partialRun.checkpoint, artifact.value.partialRun.callEvents, artifact.value.partialRun.lifecycle]) {
    const target = path.join(root, reference.path);
    const [metadata, sidecarMetadata] = await Promise.all([lstat(target), lstat(`${target}.sha256`)]);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !sidecarMetadata.isFile() || sidecarMetadata.isSymbolicLink()) throw new Error(`Archived V2 evidence or sidecar is not a regular file: ${reference.path}`);
    const bytes = await readFile(target);
    if (sha256(bytes) !== reference.sha256 || await readFile(`${target}.sha256`, "utf8") !== `${reference.sha256}  ${path.basename(target)}\n`) throw new Error(`Archived V2 evidence or sidecar changed: ${reference.path}`);
  }
  const assignment = artifact.value.partialRun.assignment;
  const assignmentTarget = path.join(root, assignment.path);
  const assignmentMetadata = await lstat(assignmentTarget);
  if (!assignmentMetadata.isFile() || assignmentMetadata.isSymbolicLink() || sha256(await readFile(assignmentTarget)) !== assignment.sha256) throw new Error("Archived V2 assignment changed after partial-run supersession");
  const checkpointRows = parseJsonLines(await readFile(path.join(root, artifact.value.partialRun.checkpoint.path), "utf8"), "archived V2 checkpoint");
  const eventRows = parseJsonLines(await readFile(path.join(root, artifact.value.partialRun.callEvents.path), "utf8"), "archived V2 call events");
  if (checkpointRows.length !== 7 || eventRows.length !== 14) throw new Error("Archived V2 partial evidence no longer has the exact seven paired calls");
  for (const [index, prefix] of artifact.value.partialRun.unaffectedPrefix.entries()) {
    const row = checkpointRows[index]; const start = eventRows[index * 2]; const terminal = eventRows[index * 2 + 1];
    const modelCall = row.modelCall as Record<string, unknown> | undefined;
    if (!modelCall || prefix.observationId !== row.observationId || prefix.observationSha256 !== sha256(JSON.stringify(row)) || prefix.outputSha256 !== modelCall.outputSha256 || prefix.promptSha256 !== modelCall.promptSha256 || start.event !== "CALL_STARTED" || start.observationId !== prefix.observationId || start.observationIndex !== index || start.promptSha256 !== prefix.promptSha256 || terminal.event !== "CALL_COMPLETED" || terminal.observationId !== prefix.observationId || terminal.observationIndex !== index || terminal.outputSha256 !== prefix.outputSha256 || terminal.observationSha256 !== prefix.observationSha256) throw new Error(`Archived V2 prefix commitment differs from checkpoint/call events at index ${index}`);
  }
  for (const relative of artifact.value.partialRun.absentArtifacts.filter((entry) => entry.startsWith(artifact.value.partialRun.runDirectory) || entry.includes("-baseline.active.lock"))) {
    try { await lstat(path.join(root, relative)); throw new Error(`Superseded V2 run was mutated after closure: ${relative}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

function assertSecurityCausalClosure(artifact: ArtifactRef<SecurityRegressionDocument>, causalClosure: PatchInterfaceCausalClosure): void {
  if (artifact.value.schemaVersion !== 1 || artifact.value.regressionId !== "dca-patch-action-interface-security-regression-v3" || artifact.value.status !== "PASS" || artifact.value.classification !== "DEVELOPMENT_ONLY_DETERMINISTIC_NO_MODEL_SECURITY_EVIDENCE") throw new Error("Security regression V3 identity is invalid");
  const integrity = artifact.value.projectIntegrity;
  if (!integrity.causalClosureByteIdentical || integrity.causalClosureBefore.sha256 !== causalClosure.sha256 || JSON.stringify(integrity.causalClosureBefore) !== JSON.stringify(causalClosure) || integrity.causalClosureAfterSha256 !== causalClosure.sha256 || integrity.causalClosureAtPublicationSha256 !== causalClosure.sha256) throw new Error("Security regression does not bind the exact current executable causal closure");
}

function assertPartialV2Implementation(artifact: ArtifactRef<PartialV2SupersessionDocument>, causalClosure: PatchInterfaceCausalClosure): void {
  const implementation = artifact.value.implementation;
  for (const reference of [implementation.generator, implementation.promptRuntime, implementation.remediatedRunner]) {
    if (causalClosure.sourceFiles[reference.path] !== reference.sha256) throw new Error(`V2 partial-run supersession implementation differs from the current V3 causal closure: ${reference.path}`);
  }
}

type ReferenceCore = {
  manifest: ArtifactRef<ManifestDocument>;
  oracle: ArtifactRef<OracleDocument>;
  preflight: ArtifactRef<PreflightDocument>;
  preflightCaveat: ArtifactRef<PreflightCaveatDocument>;
  precallSupersession: ArtifactRef<PrecallSupersessionDocument>;
  partialV2Supersession: ArtifactRef<PartialV2SupersessionDocument>;
  v2Preregistration: ArtifactRef<ArchivedV2SchedulePreregistration>;
  taskIds: string[];
  oracleById: Map<string, OracleRow>;
  preflightById: Map<string, PreflightRow>;
};

function materializeReferenceRequestIntents(core: ReferenceCore): { schedules: Array<{ profile: ModelSpecializationProfileId; rows: ScheduledObservation[] }>; rows: string[]; sha256: string; byProfileSha256: Record<ModelSpecializationProfileId, string> } {
  const prereg = core.v2Preregistration.value;
  const schedules = (["baseline", "coder"] as const).map((profile) => ({ profile, rows: buildSchedule(prereg, profile) }));
  const taskById = new Map(core.manifest.value.tasks.map((task) => [task.task_id, task]));
  const rowsByProfile = Object.fromEntries(schedules.map(({ profile, rows: profileSchedule }) => [profile, profileSchedule.map((observation) => {
    const task = taskById.get(observation.taskId); const oracle = core.oracleById.get(observation.taskId); const preflight = core.preflightById.get(observation.taskId);
    if (!task || !oracle || !preflight) throw new Error(`Reference prompt-intent binding missing: ${observation.observationId}`);
    const prompt = renderPrompt(prereg.fixedInformationContract.promptTemplate, task, oracle, preflight);
    return `${observation.observationId}\0${sha256(`patch-interface-${profile}-${observation.conditionId}-${observation.taskId}`)}\0${observation.transport}\0${sha256(JSON.stringify(observation.schema))}\0${sha256(observation.system)}\0${sha256(prompt)}`;
  })])) as Record<ModelSpecializationProfileId, string[]>;
  const rows = [...rowsByProfile.baseline, ...rowsByProfile.coder];
  if (rows.length !== 840 || new Set(rows.map((row) => row.split("\0", 1)[0])).size !== 840) throw new Error("Reference preflight did not materialize 840 unique V3 request intents");
  return { schedules, rows, sha256: sha256(rows.join("\n")), byProfileSha256: { baseline: sha256(rowsByProfile.baseline.join("\n")), coder: sha256(rowsByProfile.coder.join("\n")) } };
}

function assertReferencePreflight(
  artifact: ArtifactRef<ReferencePreflightDocument>,
  core: ReferenceCore,
  causalClosure: PatchInterfaceCausalClosure
): void {
  const value = artifact.value;
  assertExactObjectKeys(value, ["schemaVersion", "preflightId", "createdAt", "status", "classification", "inputs", "implementation", "contract", "summary", "rows", "protectedActions"], "reference-action preflight");
  if (value.schemaVersion !== 1 || value.preflightId !== "dca-patch-interface-reference-action-preflight-v3" || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || value.classification !== "DEVELOPMENT_ONLY_ZERO_MODEL_CALL_REFERENCE_PATH_PROOF") throw new Error("Reference-action preflight identity is invalid");
  assertExactObjectKeys(value.inputs, ["manifest", "oracle", "hardenedOraclePreflight", "networkCaveat", "precallSupersession", "partialV2Supersession"], "reference-action preflight inputs");
  assertExactObjectKeys(value.implementation, ["runner", "patchInterfaceRuntime", "toolRuntime", "causalClosure"], "reference-action preflight implementation");
  assertExactObjectKeys(value.contract, ["tasks", "adaptersPerTask", "expectedAdapterExecutions", "plannedLiveSchedulePerProfile", "profiles", "materializedRequestIntents", "materializedRequestIntentsSha256", "materializedRequestIntentsByProfileSha256", "modelCalls", "gitCommit", "hardNetworkIsolation", "nodePermissionModel", "rawActionsStored", "rawPromptsStored", "referenceFixedSourceStored"], "reference-action preflight contract");
  assertExactObjectKeys(value.contract.materializedRequestIntentsByProfileSha256, ["baseline", "coder"], "reference-action per-profile prompt-intent digests");
  if (value.contract.gitCommit !== false || value.contract.hardNetworkIsolation !== true || value.contract.nodePermissionModel !== true || value.contract.rawActionsStored !== false || value.contract.rawPromptsStored !== false || value.contract.referenceFixedSourceStored !== false) throw new Error("Reference-action preflight safety/privacy contract is invalid");
  assertExactObjectKeys(value.summary, ["tasks", "adapterExecutions", "passes", "failures", "projectStatusUnchanged"], "reference-action preflight summary");
  assertExactObjectKeys(value.protectedActions, ["modelCall", "modelDownload", "dependencyInstall", "sudoAdmin", "commit", "remote", "push", "pullRequest", "tag", "signing", "release"], "reference-action protected actions");
  if (Object.values(value.protectedActions).some((flag) => flag !== false)) throw new Error("Reference-action preflight records a protected side effect");
  if (value.status !== "PASS" || value.summary.tasks !== 50 || value.summary.adapterExecutions !== 500 || value.summary.passes !== 500 || value.summary.failures !== 0 || !value.summary.projectStatusUnchanged) throw new Error("Reference-action preflight must be an exact 500/500 PASS with unchanged project status");
  if (value.contract.tasks !== 50 || value.contract.adaptersPerTask !== 10 || value.contract.expectedAdapterExecutions !== 500 || value.contract.plannedLiveSchedulePerProfile !== expectedCallsPerProfile || value.contract.profiles !== 2 || value.contract.materializedRequestIntents !== 840 || !/^[0-9a-f]{64}$/.test(value.contract.materializedRequestIntentsSha256) || !Object.values(value.contract.materializedRequestIntentsByProfileSha256).every((digest) => /^[0-9a-f]{64}$/.test(digest)) || value.contract.modelCalls !== 0) throw new Error("Reference-action preflight contract is incomplete");
  const expectedIntentProof = materializeReferenceRequestIntents(core);
  if (value.contract.materializedRequestIntentsSha256 !== expectedIntentProof.sha256 || JSON.stringify(value.contract.materializedRequestIntentsByProfileSha256) !== JSON.stringify(expectedIntentProof.byProfileSha256)) throw new Error("Reference-action preflight prompt-intent digest differs from the exact 840 V3 requests");
  for (const [key, expected] of [
    ["manifest", core.manifest], ["oracle", core.oracle], ["hardenedOraclePreflight", core.preflight], ["networkCaveat", core.preflightCaveat], ["precallSupersession", core.precallSupersession], ["partialV2Supersession", core.partialV2Supersession]
  ] as const) {
    const actual = value.inputs[key];
    assertExactObjectKeys(actual, ["path", "sha256"], `reference-action input ${key}`);
    if (!actual || actual.path !== expected.path || actual.sha256 !== expected.sha256) throw new Error(`Reference-action preflight input binding mismatch: ${key}`);
  }
  for (const [key, expectedPath] of [
    ["runner", "scripts/run_patch_interface_experiment.ts"],
    ["patchInterfaceRuntime", "services/patch-interface-runtime/src/index.ts"],
    ["toolRuntime", "services/tool-runtime/src/index.ts"]
  ] as const) {
    const implementation = value.implementation[key];
    assertExactObjectKeys(implementation, ["path", "sha256"], `reference-action implementation ${key}`);
    if (implementation.path !== expectedPath || implementation.sha256 !== causalClosure.sourceFiles[expectedPath]) throw new Error(`Reference-action implementation reference is invalid: ${key}`);
  }
  const adapters = ["P0", "P1", "P2", "P3", "P4", "SCHEMA_S1", "SCHEMA_S2", "REPORT_AVAILABLE", "REPORT_UNAVAILABLE", "WHOLE_FILE"];
  const expectedRows = core.taskIds.flatMap((taskId) => adapters.map((adapter) => `${taskId}\0${adapter}`)).sort();
  const actualRows = value.rows.map((row) => {
    assertExactObjectKeys(row, ["taskId", "adapter", "pass", "normalization", "execution", "rawActionStored", "referenceSourceStored"], "reference-action row");
    assertExactObjectKeys(row.normalization, ["classification", "stages", "targets", "changedFiles", "changedLines", "canonicalDiffSha256"], "reference-action normalization");
    assertExactObjectKeys(row.normalization.stages, ["parse", "schemaValidation", "actionValidation", "patchConstruction"], "reference-action normalization stages");
    for (const [stage, result] of Object.entries(row.normalization.stages)) {
      assertExactObjectKeys(result, ["status", "code"], `reference-action normalization stage ${stage}`);
      if (typeof result.status !== "string" || typeof result.code !== "string" || !result.status || !result.code) throw new Error(`Reference-action normalization stage is invalid: ${stage}`);
    }
    assertExactObjectKeys(row.execution, ["gitApplyPreflight", "gitApply", "syntax", "visible", "hidden", "scopeRegression", "safetyAudit", "rollback", "cleanup", "byteIdentity", "actualForbiddenMutation"], "reference-action execution");
    const executionPass = [row.execution.gitApplyPreflight, row.execution.gitApply, row.execution.syntax, row.execution.visible, row.execution.hidden, row.execution.scopeRegression, row.execution.safetyAudit, row.execution.rollback, row.execution.cleanup].every((status) => status === "PASS") && row.execution.byteIdentity === true && row.execution.actualForbiddenMutation === false;
    if (row.rawActionStored !== false || row.referenceSourceStored !== false || row.normalization.classification !== "VALID_EDIT" || !Array.isArray(row.normalization.targets) || row.normalization.targets.some((target) => typeof target !== "string" || !target || target.length > 256 || /[\r\n\0]/.test(target)) || !Number.isInteger(row.normalization.changedFiles) || row.normalization.changedFiles < 0 || row.normalization.targets.length !== row.normalization.changedFiles || !Number.isInteger(row.normalization.changedLines) || row.normalization.changedLines < 0 || !/^[0-9a-f]{64}$/.test(String(row.normalization.canonicalDiffSha256)) || !executionPass || row.pass !== executionPass) throw new Error(`Reference-action row violates bounded privacy/safety: ${String(row.taskId)}/${String(row.adapter)}`);
    assertBoundedMetadataOnly(row, "reference-action row");
    if (!row.pass) throw new Error(`Reference-action preflight contains a failed row: ${row.taskId}/${row.adapter}`);
    return `${row.taskId}\0${row.adapter}`;
  }).sort();
  if (actualRows.length !== 500 || new Set(actualRows).size !== 500 || actualRows.some((row, index) => row !== expectedRows[index])) throw new Error("Reference-action preflight rows are not the exact 50×10 task/adapter cross-product");
  if (value.implementation.causalClosure.sha256 !== causalClosure.sha256 || JSON.stringify(value.implementation.causalClosure) !== JSON.stringify(causalClosure)) throw new Error("Reference-action preflight causal closure differs from the current executable closure");
}

async function writeImmutableJson(relative: string, value: unknown): Promise<{ path: string; sha256: string }> {
  const target = path.join(root, relative);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const digest = sha256(body);
  const sidecar = `${target}.sha256`;
  const sidecarBody = `${digest}  ${path.basename(target)}\n`;
  await mkdir(path.dirname(target), { recursive: true });
  await persistAtomicExact(target, body, 0o600);
  await persistAtomicExact(sidecar, sidecarBody, 0o600);
  return { path: relative, sha256: digest };
}

async function readCoreArtifacts() {
  const [baselineAttestation, historicalAudit, activeTaskContract, securityRegression, precallSupersession, partialV2Supersession, manifest, oracle, preflight, preflightCaveat, exactModels, acquisition] = await Promise.all([
    readVerifiedJson<Record<string, unknown>>(baselineAttestationRelative),
    readVerifiedJson<Record<string, unknown>>(historicalAuditRelative),
    readDirectArtifact<Record<string, unknown>>(activeTaskContractRelative),
    readVerifiedJson<SecurityRegressionDocument>(securityRegressionRelative),
    readVerifiedJson<PrecallSupersessionDocument>(precallSupersessionRelative),
    readVerifiedJson<PartialV2SupersessionDocument>(partialV2SupersessionRelative),
    readVerifiedJson<ManifestDocument>(manifestRelative),
    readVerifiedJson<OracleDocument>(oracleRelative),
    readVerifiedJson<PreflightDocument>(preflightRelative),
    readVerifiedJson<PreflightCaveatDocument>(preflightCaveatRelative),
    readVerifiedJson<ExactModelsDocument>(exactModelsRelative),
    readVerifiedJson<Record<string, unknown>>(acquisitionRelative)
  ]);
  assertPrecallSupersession(precallSupersession);
  assertPartialV2Supersession(partialV2Supersession);
  await assertArchivedV2PartialEvidence(partialV2Supersession);
  if (manifest.value.corpus.tasks !== 50 || manifest.value.tasks.length !== 50 || oracle.value.rows.length !== 50) throw new Error("Patch-interface corpus must contain exactly 50 task/oracle rows");
  if (oracle.value.manifestSha256 !== manifest.sha256) throw new Error("Sealed oracle does not bind the exact manifest");
  if (preflight.value.status !== "PASS" || preflight.value.summary.tasks !== 50 || preflight.value.summary.valid !== 50 || preflight.value.summary.failures !== 0) throw new Error("Hardened oracle preflight is not 50/50 PASS");
  if (preflight.value.inputs.manifest.sha256 !== manifest.sha256 || preflight.value.inputs.oracle.sha256 !== oracle.sha256) throw new Error("Hardened preflight input binding mismatch");
  if (preflight.value.contract.noNetwork !== "HARD_USER_NETWORK_NAMESPACE" || preflight.value.contract.hardIsolationProbe.status !== "PASS") throw new Error("Hardened preflight lacks hard network-isolation evidence");
  if (preflightCaveat.value.status !== "V1_NETWORK_CLAIM_SUPERSEDED_ONLY" || preflightCaveat.value.supersedingArtifact.sha256 !== preflight.sha256) throw new Error("V1 network caveat does not bind hardened V2 preflight");
  if (securityRegression.value.status !== "PASS" || securityRegression.value.corpus.deterministicMutationInstances !== 1_540 || securityRegression.value.corpus.structuralMutationTemplates !== 77 || securityRegression.value.rejectedActionIsolation.constrainedPatchApplyAttemptsForRejectedActions !== 0 || securityRegression.value.hardIsolation.lingeringProcesses !== 0 || securityRegression.value.positiveControl.cleanupStatus !== "PASS" || !securityRegression.value.positiveControl.treeByteIdentical || !securityRegression.value.positiveControl.indexByteIdentical || !securityRegression.value.positiveControl.gitStatusUnchanged || securityRegression.value.positiveControl.lingeringProcesses !== 0 || !securityRegression.value.projectIntegrity.sourceClosureByteIdentical || !securityRegression.value.projectIntegrity.causalClosureByteIdentical || !securityRegression.value.projectIntegrity.gitStatusUnchangedBeforeArtifactPublication || !securityRegression.value.projectIntegrity.indexByteIdentical) throw new Error("Patch-interface security regression is not the exact all-pass causal-integrity evidence required for live execution");
  for (const file of securityRegression.value.projectIntegrity.sourceClosureBefore.files) if (sha256(await readFile(path.join(root, file.path))) !== file.sha256) throw new Error(`Security regression source closure mismatch: ${file.path}`);
  const taskIds = manifest.value.tasks.map((task) => task.task_id);
  if (new Set(taskIds).size !== 50) throw new Error("Task IDs are not unique");
  const oracleById = new Map(oracle.value.rows.map((row) => [row.task_id, row]));
  const preflightById = new Map(preflight.value.rows.map((row) => [row.taskId, row]));
  if (oracleById.size !== 50 || preflightById.size !== 50) throw new Error("Oracle/preflight IDs are not unique");
  for (const task of manifest.value.tasks) {
    const oracleRow = oracleById.get(task.task_id);
    const preflightRow = preflightById.get(task.task_id);
    if (!oracleRow || !preflightRow) throw new Error(`Missing task-bound oracle/preflight row: ${task.task_id}`);
    assertTaskBindings(task, oracleRow, preflightRow);
  }
  const archivedV2Preregistration = await readVerifiedJson<ArchivedV2SchedulePreregistration>(partialV2Supersession.value.supersededArtifacts.preregistration.path);
  if (archivedV2Preregistration.sha256 !== partialV2Supersession.value.supersededArtifacts.preregistration.sha256) throw new Error("Archived V2 preregistration differs from the partial-run supersession");
  const architectureIds = archivedV2Preregistration.value.taskAssignment.architectureBaseline.taskIds;
  if (architectureIds[7] !== partialV2Supersession.value.rootCause.firstTriggerTaskId || architectureIds[8] !== partialV2Supersession.value.rootCause.nextDollarReplacementAffectedTaskId) throw new Error("V2 partial-run renderer failure boundary differs from the sealed architecture schedule");
  return { baselineAttestation, historicalAudit, activeTaskContract, securityRegression, precallSupersession, partialV2Supersession, v2Preregistration: archivedV2Preregistration, manifest, oracle, preflight, preflightCaveat, exactModels, acquisition, taskIds: [...taskIds].sort(), oracleById, preflightById };
}

function referenceAdapterCases(task: ManifestTask, oracle: OracleRow): Array<{ id: string; adapter: AdapterKind; schema: object | null; rawText: string | null; value: unknown }> {
  const source = sourceFor(task, oracle);
  const range = oracle.exact_relevant_range_1_based;
  const referenceDiff = buildCanonicalUnifiedDiff(source.path, source.content, oracle.reference_fixed_source);
  if (!referenceDiff) throw new Error(`${task.task_id} reference fix has no diff`);
  const replacement = referenceRangeReplacement(source.content, oracle.reference_fixed_source, range);
  const p0Value = { status: "PATCH_PROPOSAL", unified_diff: referenceDiff, summary: "reference preflight", evidence_paths: [], target_paths: [source.path], confidence: 1 };
  const dry = makeDryRunPreregistration([], [], []);
  const s1 = dry.taskAssignment.schemaComplexity.S1;
  const s2 = dry.taskAssignment.schemaComplexity.S2;
  const reportAvailable = dry.taskAssignment.reportOnly.availableSchema;
  const reportUnavailable = dry.taskAssignment.reportOnly.unavailableSchema;
  const wholeFile = dry.interfaces.WHOLE_FILE.schema!;
  return [
    { id: "P0", adapter: "P0", schema: PATCH_INTERFACE_P0_SCHEMA, rawText: null, value: p0Value },
    { id: "P1", adapter: "P1", schema: null, rawText: referenceDiff, value: null },
    { id: "P2", adapter: "P2", schema: PATCH_INTERFACE_P2_SCHEMA, rawText: null, value: { file: source.path, start_line: range.start_line, end_line: range.end_line, replacement } },
    { id: "P3", adapter: "P3", schema: PATCH_INTERFACE_P3_SCHEMA, rawText: null, value: { file: source.path, symbol: oracle.exact_relevant_symbol, replacement_body: symbolBodyFromReplacement(replacement, oracle.exact_relevant_symbol) } },
    { id: "P4", adapter: "P4", schema: PATCH_INTERFACE_P4_SCHEMA, rawText: null, value: { actions: [{ tool: "replace_range", file: source.path, start_line: range.start_line, end_line: range.end_line, text: replacement }] } },
    { id: "SCHEMA_S1", adapter: "SCHEMA_S1", schema: s1, rawText: null, value: { action: "PATCH_PROPOSAL", patch: referenceDiff } },
    { id: "SCHEMA_S2", adapter: "SCHEMA_S2", schema: s2, rawText: null, value: { action: "PATCH_PROPOSAL", patch: referenceDiff, reason: "reference preflight" } },
    { id: "REPORT_AVAILABLE", adapter: "REPORT_AVAILABLE", schema: reportAvailable, rawText: null, value: p0Value },
    { id: "REPORT_UNAVAILABLE", adapter: "REPORT_UNAVAILABLE", schema: reportUnavailable, rawText: null, value: p0Value },
    { id: "WHOLE_FILE", adapter: "WHOLE_FILE", schema: wholeFile, rawText: null, value: { file: source.path, content: oracle.reference_fixed_source } }
  ];
}

async function runReferencePreflight(core: Awaited<ReturnType<typeof readCoreArtifacts>>): Promise<void> {
  const causalClosure = await computePatchInterfaceCausalClosure(root);
  if (core.precallSupersession.value.remediation.source.sha256 !== causalClosure.sourceFiles["scripts/model_serving_attestation.ts"] || core.precallSupersession.value.implementation.generator.sha256 !== causalClosure.sourceFiles["scripts/write_patch_interface_precall_supersession.ts"]) throw new Error("Pre-call supersession does not bind the exact remediated source and generator");
  assertPartialV2Implementation(core.partialV2Supersession, causalClosure);
  assertSecurityCausalClosure(core.securityRegression, causalClosure);
  const existingPath = path.join(root, referencePreflightRelative);
  try {
    const metadata = await lstat(existingPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Existing reference preflight is not a regular file");
    const bytes = await readFile(existingPath);
    const existing: ArtifactRef<ReferencePreflightDocument> = { value: JSON.parse(bytes.toString("utf8")) as ReferencePreflightDocument, path: referencePreflightRelative, sha256: sha256(bytes) };
    assertReferencePreflight(existing, core, causalClosure);
    await persistAtomicExact(existingPath, bytes, 0o600);
    const frozen = await freezeAppendOnlyEvidence(existingPath);
    process.stdout.write(`${JSON.stringify({ output: frozen.path, sha256: frozen.sha256, status: existing.value.status, summary: existing.value.summary, recoveredOrAlreadyComplete: true }, null, 2)}\n`);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const prereg = core.v2Preregistration.value;
  const intentProof = materializeReferenceRequestIntents(core);
  const schedules = intentProof.schedules;
  const schedule = schedules.find((entry) => entry.profile === profileId)!.rows;
  const materializedRequestIntents = intentProof.rows;
  const materializedRequestIntentsSha256 = intentProof.sha256;
  const sandbox = await detectSandboxCapabilities();
  if (sandbox.level !== "HARD_ISOLATION" || sandbox.strategy !== "unshare_user_network_pid") throw new Error("Reference preflight requires hard user+network+PID namespace isolation");
  const projectBefore = await projectStatusHash();
  const rows: Array<Record<string, unknown>> = [];
  for (const [taskIndex, task] of core.manifest.value.tasks.entries()) {
    const oracle = core.oracleById.get(task.task_id)!;
    const source = sourceFor(task, oracle);
    const sources = { [source.path]: source.content };
    const policy = interfacePolicy(task, oracle);
    for (const adapterCase of referenceAdapterCases(task, oracle)) {
      const normalization = normalizeConditionOutput({ adapter: adapterCase.adapter, schema: adapterCase.schema }, adapterCase.rawText, adapterCase.value, sources, policy);
      const execution = normalization.classification === "VALID_EDIT" && normalization.canonicalDiff
        ? await executeCanonicalDiff(task, oracle, normalization.canonicalDiff, sandbox)
        : blankExecution("REFERENCE_NORMALIZATION_FAILED");
      const pass = normalization.classification === "VALID_EDIT"
        && execution.patchApplied
        && execution.syntaxStatus === "PASS"
        && execution.visibleStatus === "PASS"
        && execution.hiddenStatus === "PASS"
        && execution.scopeRegressionStatus === "PASS"
        && execution.safetyAuditStatus === "PASS"
        && execution.rollbackStatus === "PASS"
        && execution.cleanupStatus === "PASS"
        && !execution.actualForbiddenMutation;
      rows.push({
        taskId: task.task_id,
        adapter: adapterCase.id,
        pass,
        normalization: { classification: normalization.classification, stages: normalizationStageMetadata(normalization), targets: normalization.targets, changedFiles: normalization.changedFiles, changedLines: normalization.changedLines, canonicalDiffSha256: normalization.canonicalDiff ? sha256(normalization.canonicalDiff) : null },
        execution: { gitApplyPreflight: execution.gitApplyPreflight, gitApply: execution.gitApply, syntax: execution.syntaxStatus, visible: execution.visibleStatus, hidden: execution.hiddenStatus, scopeRegression: execution.scopeRegressionStatus, safetyAudit: execution.safetyAuditStatus, rollback: execution.rollbackStatus, cleanup: execution.cleanupStatus, byteIdentity: execution.rollbackByteIdentity, actualForbiddenMutation: execution.actualForbiddenMutation },
        rawActionStored: false,
        referenceSourceStored: false
      });
    }
    if ((taskIndex + 1) % 5 === 0) process.stdout.write(`reference-preflight ${taskIndex + 1}/50\n`);
  }
  const projectAfter = await projectStatusHash();
  const causalClosureAtPublication = await computePatchInterfaceCausalClosure(root);
  if (causalClosureAtPublication.sha256 !== causalClosure.sha256 || JSON.stringify(causalClosureAtPublication) !== JSON.stringify(causalClosure)) throw new Error("Executable causal closure changed during the 500-adapter reference preflight");
  const failures = rows.filter((row) => row.pass !== true);
  const runnerBytes = await readFile(path.join(root, "scripts/run_patch_interface_experiment.ts"));
  const runtimeBytes = await readFile(path.join(root, "services/patch-interface-runtime/src/index.ts"));
  const toolRuntimeBytes = await readFile(path.join(root, "services/tool-runtime/src/index.ts"));
  const result = {
    schemaVersion: 1,
    preflightId: "dca-patch-interface-reference-action-preflight-v3",
    createdAt: new Date().toISOString(),
    status: failures.length === 0 && projectBefore === projectAfter ? "PASS" : "FAIL",
    classification: "DEVELOPMENT_ONLY_ZERO_MODEL_CALL_REFERENCE_PATH_PROOF",
    inputs: {
      manifest: { path: core.manifest.path, sha256: core.manifest.sha256 },
      oracle: { path: core.oracle.path, sha256: core.oracle.sha256 },
      hardenedOraclePreflight: { path: core.preflight.path, sha256: core.preflight.sha256 },
      networkCaveat: { path: core.preflightCaveat.path, sha256: core.preflightCaveat.sha256 },
      precallSupersession: { path: core.precallSupersession.path, sha256: core.precallSupersession.sha256 },
      partialV2Supersession: { path: core.partialV2Supersession.path, sha256: core.partialV2Supersession.sha256 }
    },
    implementation: {
      runner: { path: "scripts/run_patch_interface_experiment.ts", sha256: sha256(runnerBytes) },
      patchInterfaceRuntime: { path: "services/patch-interface-runtime/src/index.ts", sha256: sha256(runtimeBytes) },
      toolRuntime: { path: "services/tool-runtime/src/index.ts", sha256: sha256(toolRuntimeBytes) },
      causalClosure
    },
    contract: { tasks: 50, adaptersPerTask: 10, expectedAdapterExecutions: 500, plannedLiveSchedulePerProfile: schedule.length, profiles: schedules.length, materializedRequestIntents: materializedRequestIntents.length, materializedRequestIntentsSha256, materializedRequestIntentsByProfileSha256: intentProof.byProfileSha256, modelCalls: 0, gitCommit: false, hardNetworkIsolation: true, nodePermissionModel: true, rawActionsStored: false, rawPromptsStored: false, referenceFixedSourceStored: false },
    summary: { tasks: 50, adapterExecutions: rows.length, passes: rows.length - failures.length, failures: failures.length, projectStatusUnchanged: projectBefore === projectAfter },
    rows,
    protectedActions: { modelCall: false, modelDownload: false, dependencyInstall: false, sudoAdmin: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
  };
  const written = await writeImmutableJson(referencePreflightRelative, result);
  process.stdout.write(`${JSON.stringify({ output: written.path, sha256: written.sha256, status: result.status, summary: result.summary }, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}

function parseJsonLines(text: string, label: string): Array<Record<string, unknown>> {
  if (!text) return [];
  if (!text.endsWith("\n")) throw new Error(`JSONL evidence has an incomplete trailing record: ${label}`);
  const lines = text.slice(0, -1).split("\n");
  if (lines.some((line) => !line)) throw new Error(`JSONL evidence contains an empty record: ${label}`);
  return lines.map((line, index) => {
    try { return JSON.parse(line) as Record<string, unknown>; }
    catch { throw new Error(`Invalid JSONL record ${index + 1} in ${label}`); }
  });
}

async function readJsonLines(target: string): Promise<Array<Record<string, unknown>>> {
  try {
    const text = await readFile(target, "utf8");
    return parseJsonLines(text, path.basename(target));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pending = `${target}.next.${process.pid}.${randomBytes(12).toString("hex")}`;
  const handle = await open(pending, "wx", mode);
  try { await handle.writeFile(expected); await handle.sync(); } finally { await handle.close(); }
  try {
    const pendingMetadata = await lstat(pending);
    if (!pendingMetadata.isFile() || pendingMetadata.isSymbolicLink() || !(await readFile(pending)).equals(expected)) throw new Error(`Immutable staging collision: ${path.basename(pending)}`);
    try { await link(pending, target); await syncDirectory(path.dirname(target)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !(await readFile(target)).equals(expected)) throw new Error(`Immutable artifact collision: ${path.basename(target)}`);
  } finally {
    try { await unlink(pending); await syncDirectory(path.dirname(target)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

async function recoverAtomicJsonLineAppend(target: string): Promise<void> {
  const pending = `${target}.next`;
  let metadata;
  try { metadata = await lstat(pending); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Atomic JSONL staging path is unsafe: ${path.basename(pending)}`);
  const [current, candidate] = await Promise.all([readFile(target), readFile(pending)]);
  let candidateIsComplete = false;
  try {
    const currentRows = parseJsonLines(current.toString("utf8"), path.basename(target));
    const candidateRows = parseJsonLines(candidate.toString("utf8"), path.basename(pending));
    candidateIsComplete = candidate.length > current.length && candidate.subarray(0, current.length).equals(current) && candidateRows.length === currentRows.length + 1;
  } catch { candidateIsComplete = false; }
  if (candidateIsComplete) {
    await rename(pending, target);
    await syncDirectory(path.dirname(target));
  } else {
    await unlink(pending);
    await syncDirectory(path.dirname(target));
  }
}

async function ensureAppendOnlyFile(target: string): Promise<void> {
  try {
    const handle = await open(target, "wx", 0o600);
    try { await handle.sync(); } finally { await handle.close(); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Append-only evidence path is not a regular file: ${path.basename(target)}`);
  await recoverAtomicJsonLineAppend(target);
  parseJsonLines(await readFile(target, "utf8"), path.basename(target));
}

async function appendDurableJsonLine(target: string, value: unknown): Promise<void> {
  await recoverAtomicJsonLineAppend(target);
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Append-only evidence path changed type: ${path.basename(target)}`);
  const current = await readFile(target);
  parseJsonLines(current.toString("utf8"), path.basename(target));
  const pending = `${target}.next`;
  const handle = await open(pending, "wx", 0o600);
  try {
    await handle.writeFile(Buffer.concat([current, Buffer.from(`${JSON.stringify(value)}\n`)]));
    await handle.sync();
  } finally { await handle.close(); }
  await rename(pending, target);
  await syncDirectory(path.dirname(target));
}

type FreshRunMarker = {
  schemaVersion: number;
  markerId: string;
  createdAt: string;
  preregistration: { path: string; sha256: string };
  partialV2Supersession: { path: string; sha256: string };
  profileId: string;
  runDirectory: string;
  schedule: { observations: number; observationIdsSha256: string; materializedRequestIntentsSha256: string };
  initialEvidence: {
    checkpoint: { path: string; sha256: string; bytes: number; records: number };
    callEvents: { path: string; sha256: string; bytes: number; records: number };
  };
  lineage: { v2RowsImported: boolean; v2EventsImported: boolean; checkpointSeeded: boolean; freshPrimaryRun: boolean };
  protectedActions: Record<string, boolean>;
};

async function ensureFreshRunMarker(input: {
  relativeRunDirectory: string;
  preregistration: ArtifactRef<Preregistration>;
  partialV2Supersession: { path: string; sha256: string };
  checkpointPath: string;
  eventsPath: string;
  observationIdsSha256: string;
  materializedRequestIntentsSha256: string;
}): Promise<{ path: string; sha256: string }> {
  const markerRelative = `${input.relativeRunDirectory}/fresh-run.json`;
  const expectedStable = {
    preregistration: { path: input.preregistration.path, sha256: input.preregistration.sha256 },
    partialV2Supersession: { path: input.partialV2Supersession.path, sha256: input.partialV2Supersession.sha256 },
    profileId,
    runDirectory: input.relativeRunDirectory,
    schedule: { observations: expectedCallsPerProfile, observationIdsSha256: input.observationIdsSha256, materializedRequestIntentsSha256: input.materializedRequestIntentsSha256 },
    initialEvidence: {
      checkpoint: { path: `${input.relativeRunDirectory}/observations.checkpoint.jsonl`, sha256: sha256(""), bytes: 0, records: 0 },
      callEvents: { path: `${input.relativeRunDirectory}/call-events.jsonl`, sha256: sha256(""), bytes: 0, records: 0 }
    },
    lineage: { v2RowsImported: false, v2EventsImported: false, checkpointSeeded: false, freshPrimaryRun: true },
    protectedActions: { modelCallBeforeMarker: false, modelDownload: false, dependencyInstall: false, sudoAdmin: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
  };
  try {
    const existing = await readVerifiedJson<FreshRunMarker>(markerRelative);
    assertExactObjectKeys(existing.value, ["schemaVersion", "markerId", "createdAt", "preregistration", "partialV2Supersession", "profileId", "runDirectory", "schedule", "initialEvidence", "lineage", "protectedActions"], "V3 fresh-run marker");
    if (existing.value.schemaVersion !== 1 || existing.value.markerId !== "dca-patch-interface-v3-fresh-primary-run" || typeof existing.value.createdAt !== "string" || !Number.isFinite(Date.parse(existing.value.createdAt)) || JSON.stringify({ preregistration: existing.value.preregistration, partialV2Supersession: existing.value.partialV2Supersession, profileId: existing.value.profileId, runDirectory: existing.value.runDirectory, schedule: existing.value.schedule, initialEvidence: existing.value.initialEvidence, lineage: existing.value.lineage, protectedActions: existing.value.protectedActions }) !== JSON.stringify(expectedStable)) throw new Error("Existing V3 fresh-run marker differs from the exact no-import contract");
    return { path: existing.path, sha256: existing.sha256 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const [checkpointBytes, eventBytes] = await Promise.all([readFile(input.checkpointPath), readFile(input.eventsPath)]);
  if (checkpointBytes.length !== 0 || eventBytes.length !== 0) throw new Error("V3 refuses to create a fresh-run marker over preexisting checkpoint or call-event records");
  const marker: FreshRunMarker = { schemaVersion: 1, markerId: "dca-patch-interface-v3-fresh-primary-run", createdAt: new Date().toISOString(), ...expectedStable };
  return writeImmutableJson(markerRelative, marker);
}

async function processStartTicks(pid: number): Promise<string | null> {
  try {
    const value = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = value.slice(value.lastIndexOf(")") + 2).trim().split(/\s+/);
    return fields[19] ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function acquireProfileRunBinding(preregistrationSha256: string, relativeRunDirectory: string): Promise<() => Promise<void>> {
  const bindingDirectory = path.join(root, ".runtime/patch-interface-experiment");
  await mkdir(bindingDirectory, { recursive: true, mode: 0o700 });
  const bindingMetadata = await lstat(bindingDirectory);
  const [canonicalRoot, canonicalBindingDirectory] = await Promise.all([realpath(root), realpath(bindingDirectory)]);
  if (!bindingMetadata.isDirectory() || bindingMetadata.isSymbolicLink() || !canonicalBindingDirectory.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error("Profile-run binding directory is unsafe");
  const bindingId = `${preregistrationSha256}-${profileId}`;
  const assignmentPath = path.join(bindingDirectory, `${bindingId}.assignment.json`);
  const assignmentBody = `${JSON.stringify({ schemaVersion: 1, preregistrationSha256, profileId, runDirectory: relativeRunDirectory })}\n`;
  try {
    const assignment = await open(assignmentPath, "wx", 0o600);
    try { await assignment.writeFile(assignmentBody); await assignment.sync(); } finally { await assignment.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const metadata = await lstat(assignmentPath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || await readFile(assignmentPath, "utf8") !== assignmentBody) throw new Error("This preregistration/profile is permanently assigned to a different or unsafe run directory");
  }

  const lockPath = path.join(bindingDirectory, `${bindingId}.active.lock`);
  const startTicks = await processStartTicks(process.pid);
  if (!startTicks) throw new Error("Unable to bind the current process identity for the profile lock");
  const lockBody = `${JSON.stringify({ schemaVersion: 1, preregistrationSha256, profileId, runDirectory: relativeRunDirectory, pid: process.pid, processStartTicks: startTicks, acquiredAt: new Date().toISOString() })}\n`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try { handle = await open(lockPath, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const recoveryPath = `${lockPath}.recovery`;
    let recovery: Awaited<ReturnType<typeof open>>;
    try { recovery = await open(recoveryPath, "wx", 0o600); }
    catch (recoveryError) {
      if ((recoveryError as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Profile lock recovery is already active or requires manual inspection");
      throw recoveryError;
    }
    try {
      const metadata = await lstat(lockPath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Profile lock path is not a regular file");
      let existing: { pid?: number; processStartTicks?: string };
      try { existing = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: number; processStartTicks?: string }; }
      catch { throw new Error("Profile lock is malformed and cannot be recovered automatically"); }
      const activeTicks = typeof existing.pid === "number" ? await processStartTicks(existing.pid) : null;
      if (activeTicks && activeTicks === existing.processStartTicks) throw new Error("Another process already owns this preregistration/profile execution");
      await unlink(lockPath);
      handle = await open(lockPath, "wx", 0o600);
    } finally {
      await recovery.close();
      await unlink(recoveryPath);
    }
  }
  if (!handle) throw new Error("Unable to acquire the preregistration/profile execution lock");
  await handle.writeFile(lockBody);
  await handle.sync();
  return async () => {
    await handle!.close();
    const metadata = await lstat(lockPath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || await readFile(lockPath, "utf8") !== lockBody) throw new Error("Profile lock changed during execution");
    await unlink(lockPath);
  };
}

async function gpuMemorySample(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { timeout: 5_000 });
    const values = stdout.split("\n").map((value) => Number(value.trim())).filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  } catch { return null; }
}

const mean = (values: number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function percentile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(probability * sorted.length) - 1))];
}

function summarizeRows(rows: Array<Record<string, unknown>>): Record<string, unknown> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const condition = row.condition as Record<string, unknown>;
    const id = String(condition.conditionId);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  return Object.fromEntries([...groups].sort(([left], [right]) => left.localeCompare(right)).map(([conditionId, conditionRows]) => {
    const metric = (row: Record<string, unknown>) => row.metrics as Record<string, unknown>;
    const model = (row: Record<string, unknown>) => row.modelCall as Record<string, unknown>;
    const outcome = (row: Record<string, unknown>) => row.outcome as Record<string, unknown>;
    const accepted = conditionRows.filter((row) => metric(row).gitApplyAcceptedAction === true);
    const successful = conditionRows.filter((row) => metric(row).behavioralSuccess === true);
    const changedTotals = (selected: Array<Record<string, unknown>>) => selected.map((row) => Number((((metric(row).changedLinesAccepted ?? metric(row).changedLinesSuccessful) as Record<string, unknown> | null)?.total))).filter(Number.isFinite);
    const latencies = conditionRows.map((row) => Number(model(row).latencyMs)).filter(Number.isFinite);
    const classifications: Record<string, number> = {};
    const refusalCategories: Record<string, number> = {};
    for (const row of conditionRows) {
      const key = String(outcome(row).decompositionCategory);
      classifications[key] = (classifications[key] ?? 0) + 1;
      const refusal = String(outcome(row).refusalCategory);
      refusalCategories[refusal] = (refusalCategories[refusal] ?? 0) + 1;
    }
    const count = (field: string) => conditionRows.filter((row) => metric(row)[field] === true).length;
    return [conditionId, {
      observations: conditionRows.length,
      normalizationValidActions: count("normalizationValidAction"),
      runtimeAcceptedActions: count("gitApplyAcceptedAction"),
      behavioralSuccesses: count("behavioralSuccess"),
      hiddenTestSuccesses: count("hiddenTestSuccess"),
      unnecessaryRefusals: count("unnecessaryRefusal"),
      malformed: count("malformed"),
      wrongFileOutputAttempts: count("wrongFileOutputAttempt"),
      actualSafetyViolations: count("actualSafetyViolation"),
      rates: {
        normalizationValidAction: count("normalizationValidAction") / conditionRows.length,
        runtimeAcceptedAction: count("gitApplyAcceptedAction") / conditionRows.length,
        behavioralSuccess: count("behavioralSuccess") / conditionRows.length,
        hiddenTestSuccess: count("hiddenTestSuccess") / conditionRows.length,
        unnecessaryRefusal: count("unnecessaryRefusal") / conditionRows.length,
        malformed: count("malformed") / conditionRows.length,
        wrongFileOutputAttempt: count("wrongFileOutputAttempt") / conditionRows.length
      },
      changedLines: { acceptedMean: mean(changedTotals(accepted)), successfulMean: mean(changedTotals(successful)) },
      tokens: { prompt: conditionRows.reduce((sum, row) => sum + Number(model(row).promptTokens), 0), completion: conditionRows.reduce((sum, row) => sum + Number(model(row).completionTokens), 0), total: conditionRows.reduce((sum, row) => sum + Number(model(row).totalTokens), 0) },
      latencyMs: { mean: mean(latencies), p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
      classifications,
      refusalCategories
    }];
  }));
}

function validateRunDirectoryArgument(value: string | undefined): string {
  if (!value || path.isAbsolute(value) || value.includes("\0") || value.includes("\\")) throw new Error("Live execution requires a repository-relative --run-directory");
  const normalized = posix(path.posix.normalize(value));
  if (normalized !== value || normalized.split("/").includes("..") || !normalized.startsWith(`docs/experiments/runs/patch-interface-${profileId}-`)) throw new Error("Run directory must use the exact profile-specific patch-interface run prefix");
  return normalized;
}

function assertExactObjectKeys(value: unknown, expected: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} contains missing or unapproved fields`);
}

function assertBoundedMetadataOnly(value: unknown, label: string): void {
  if (typeof value === "string") {
    if (value.length > 512 || /[\r\n\0]/.test(value)) throw new Error(`${label} contains unbounded or multiline persisted text`);
    return;
  }
  if (Array.isArray(value)) { for (const item of value) assertBoundedMetadataOnly(item, label); return; }
  if (value && typeof value === "object") for (const item of Object.values(value)) assertBoundedMetadataOnly(item, label);
}

function assertTextMetadataShape(value: unknown, label: string): void {
  if (value === null) return;
  assertExactObjectKeys(value, ["sha256", "chars", "lines"], label);
}

function assertModelStringMetadataShape(value: unknown, label: string): void {
  if (value === null) return;
  assertExactObjectKeys(value, ["sha256", "chars", "allowlisted"], label);
}

function assertModelStringArrayMetadataShape(value: unknown, label: string): void {
  assertExactObjectKeys(value, ["count", "values"], label);
  if (!Array.isArray(value.values)) throw new Error(`${label} values are invalid`);
  value.values.forEach((item, index) => assertModelStringMetadataShape(item, `${label}[${index}]`));
}

function assertParsedActionMetadataShape(adapter: AdapterKind, value: unknown): void {
  if (value === null) return;
  if (adapter === "P1") {
    assertExactObjectKeys(value, ["targetPaths", "canonicalDiffSha256"], "P1 parsed metadata");
    assertModelStringArrayMetadataShape(value.targetPaths, "P1 target metadata");
    return;
  }
  if (adapter === "P0" || adapter === "REPORT_AVAILABLE" || adapter === "REPORT_UNAVAILABLE") {
    assertExactObjectKeys(value, ["status", "unifiedDiff", "summary", "targetPaths", "evidencePathCount", "confidence"], "P0/report parsed metadata");
    assertTextMetadataShape(value.unifiedDiff, "unified-diff metadata");
    assertTextMetadataShape(value.summary, "summary metadata");
    assertModelStringArrayMetadataShape(value.targetPaths, "target-path metadata");
    return;
  }
  if (adapter === "P2") {
    assertExactObjectKeys(value, ["file", "startLine", "endLine", "replacement"], "P2 parsed metadata");
    assertModelStringMetadataShape(value.file, "P2 file metadata"); assertTextMetadataShape(value.replacement, "P2 replacement metadata"); return;
  }
  if (adapter === "P3") {
    assertExactObjectKeys(value, ["file", "symbol", "replacementBody"], "P3 parsed metadata");
    assertModelStringMetadataShape(value.file, "P3 file metadata"); assertModelStringMetadataShape(value.symbol, "P3 symbol metadata"); assertTextMetadataShape(value.replacementBody, "P3 replacement metadata"); return;
  }
  if (adapter === "P4") {
    assertExactObjectKeys(value, ["actionCount", "actions"], "P4 parsed metadata");
    if (!Array.isArray(value.actions)) throw new Error("P4 action metadata is invalid");
    for (const action of value.actions) { assertExactObjectKeys(action, ["tool", "file", "startLine", "endLine", "text"], "P4 action metadata"); assertModelStringMetadataShape(action.file, "P4 file metadata"); assertTextMetadataShape(action.text, "P4 text metadata"); }
    return;
  }
  if (adapter === "SCHEMA_S1" || adapter === "SCHEMA_S2") {
    assertExactObjectKeys(value, ["action", "patch", "reason"], "schema-ablation parsed metadata");
    assertTextMetadataShape(value.patch, "schema patch metadata"); assertTextMetadataShape(value.reason, "schema reason metadata"); return;
  }
  if (adapter === "WHOLE_FILE") {
    assertExactObjectKeys(value, ["file", "content"], "whole-file parsed metadata");
    assertModelStringMetadataShape(value.file, "whole-file target metadata"); assertTextMetadataShape(value.content, "whole-file content metadata");
  }
}

function assertPersistedObservation(
  row: Record<string, unknown>,
  expected: ScheduledObservation,
  task: ManifestTask,
  oracle: OracleRow,
  preflight: PreflightRow,
  promptTemplate: string
): void {
  assertExactObjectKeys(row, ["schemaVersion", "observationId", "observationIndex", "profileId", "taskId", "taskProvenance", "condition", "fixedInput", "modelCall", "normalizedAction", "pipeline", "execution", "metrics", "outcome", "evidence", "privacy"], "checkpoint observation");
  if (row.schemaVersion !== 1 || row.observationId !== expected.observationId || row.observationIndex !== expected.index || row.profileId !== profileId || row.taskId !== expected.taskId) throw new Error("Checkpoint observation identity differs from the sealed schedule");
  assertExactObjectKeys(row.condition, ["conditionId", "family", "adapter", "transport", "modelFacingPolicy", "schemaLevel", "granularity", "reportOnlyAvailable", "oneShot", "retries"], "checkpoint condition");
  const condition = row.condition;
  if (condition.conditionId !== expected.conditionId || condition.family !== expected.family || condition.adapter !== expected.adapter || condition.transport !== expected.transport || condition.modelFacingPolicy !== expected.policy || condition.schemaLevel !== expected.schemaLevel || condition.granularity !== expected.granularity || condition.oneShot !== true || condition.retries !== 0) throw new Error("Checkpoint condition differs from the sealed schedule");
  assertExactObjectKeys(row.fixedInput, ["safeMutationRequired", "exactFileSha256", "exactSymbolSha256", "exactRange", "originalSourceSha256", "behavioralRequirementSha256", "rootCauseSha256", "visibleTestSha256", "visiblePreflightStatus", "hiddenPreflightStatus", "hiddenSourceExposed", "referenceFixExposed"], "checkpoint fixed input");
  const fixedInput = row.fixedInput;
  if (fixedInput.safeMutationRequired !== true || fixedInput.exactFileSha256 !== sha256(oracle.exact_relevant_file) || fixedInput.exactSymbolSha256 !== sha256(oracle.exact_relevant_symbol) || fixedInput.originalSourceSha256 !== oracle.original_source_sha256 || fixedInput.behavioralRequirementSha256 !== sha256(oracle.behavioral_requirement) || fixedInput.rootCauseSha256 !== sha256(oracle.root_cause) || fixedInput.visibleTestSha256 !== sha256(visibleTestFor(task, oracle).content) || fixedInput.visiblePreflightStatus !== preflight.before.visible.status || fixedInput.hiddenPreflightStatus !== preflight.before.hidden.status || fixedInput.hiddenSourceExposed !== false || fixedInput.referenceFixExposed !== false) throw new Error("Checkpoint fixed input binding is invalid");
  assertExactObjectKeys(row.modelCall, ["calls", "requestIdSha256", "systemSha256", "promptSha256", "outputSha256", "rawPromptStored", "rawOutputStored", "promptTokens", "completionTokens", "totalTokens", "latencyMs", "outputChars", "outputTrimmedEmpty", "finishReason", "transportStatus", "transportJsonParsed", "errorSha256"], "checkpoint model call");
  const modelCall = row.modelCall;
  if (modelCall.calls !== 1 || modelCall.requestIdSha256 !== sha256(`patch-interface-${profileId}-${expected.conditionId}-${expected.taskId}`) || modelCall.systemSha256 !== sha256(expected.system) || modelCall.promptSha256 !== sha256(renderPrompt(promptTemplate, task, oracle, preflight)) || modelCall.rawPromptStored !== false || modelCall.rawOutputStored !== false || (modelCall.outputSha256 !== null && !/^[0-9a-f]{64}$/.test(String(modelCall.outputSha256)))) throw new Error("Checkpoint model-call evidence is invalid");
  assertExactObjectKeys(row.normalizedAction, ["classification", "jsonParsed", "localSchemaValidated", "validAction", "canonicalDiffSha256", "canonicalDiffStored", "targetCount", "allowlistedTargets", "targetPathHashes", "declaredTargetCount", "transientDiffHeaderScan", "transientStructuredTargetScan", "attemptedWrongFile", "pathRangeAccepted", "changedFiles", "changedLines", "actionCount", "parsedAction", "stages", "errorSha256"], "checkpoint normalized action");
  if (row.normalizedAction.canonicalDiffStored !== false || !Array.isArray(row.normalizedAction.allowlistedTargets) || row.normalizedAction.allowlistedTargets.some((target) => !task.allowed_files.includes(String(target)))) throw new Error("Checkpoint normalized action persists an unsafe target or diff");
  assertParsedActionMetadataShape(expected.adapter, row.normalizedAction.parsedAction);
  assertExactObjectKeys(row.pipeline, ["transport", "interfaceParse", "localSchemaValidation", "actionValidation", "pathRangeValidation", "canonicalPatchConstruction", "gitApplyPreflight", "gitApply", "syntax", "visibleTest", "hiddenTest", "scopeRegression", "safetyAudit", "rollback", "cleanup"], "checkpoint pipeline");
  assertExactObjectKeys(row.execution, ["gitApplyPreflight", "gitApply", "patchApplied", "appliedFiles", "syntax", "visible", "hidden", "syntaxStatus", "visibleStatus", "hiddenStatus", "scopeRegressionStatus", "safetyAuditStatus", "rollbackStatus", "cleanupStatus", "rollbackByteIdentity", "fixtureTreeBeforeSha256", "fixtureTreeAfterSha256", "fixtureFileCount", "fixtureBytes", "projectStatusBeforeSha256", "projectStatusAfterSha256", "projectStatusUnchanged", "verifierSideEffects", "lingeringFixtureProcesses", "actualForbiddenMutation", "errorCode", "errorSha256"], "checkpoint execution");
  if (!Array.isArray(row.execution.appliedFiles) || row.execution.appliedFiles.some((target) => !task.allowed_files.includes(String(target)))) throw new Error("Checkpoint execution contains a forbidden applied file");
  for (const key of ["syntax", "visible", "hidden"] as const) assertExactObjectKeys(row.execution[key], ["status", "exitCode", "durationMs", "stdoutSha256", "stderrSha256", "sandbox", "reasonSha256"], `checkpoint ${key} verification`);
  assertExactObjectKeys(row.metrics, ["normalizationValidAction", "gitApplyAcceptedAction", "behavioralSuccess", "hiddenTestSuccess", "changedLinesAccepted", "changedLinesSuccessful", "referenceMinimalChangedLines", "unnecessaryChangedLinesAccepted", "outOfRangeChangeAttempt", "wrongFileOutputAttempt", "actualForbiddenMutation", "safetyAuditFailure", "actualSafetyViolation", "unnecessaryRefusal", "malformed", "reportOnly", "blockedMissingOracle", "generationFailure"], "checkpoint metrics");
  assertExactObjectKeys(row.outcome, ["decompositionCategory", "refusalCategory", "firstFailureStage", "behavioralSuccess"], "checkpoint outcome");
  assertExactObjectKeys(row.privacy, ["rawPromptStored", "rawModelOutputStored", "rawDiffStored", "replacementTextStored", "hiddenOracleSourceStored"], "checkpoint privacy");
  if (Object.values(row.privacy).some((value) => value !== false)) throw new Error("Checkpoint privacy declaration is not fail-closed");
  assertExactObjectKeys(row.evidence, ["boundedErrorSha256", "rawFailureTextStored"], "checkpoint evidence");
  if (row.evidence.rawFailureTextStored !== false) throw new Error("Checkpoint contains raw failure text");
  assertBoundedMetadataOnly(row, "checkpoint observation");
}

async function recoverFinalizedResult(
  resultPath: string,
  relativeRunDirectory: string,
  preregistration: ArtifactRef<Preregistration>,
  referencePreflight: ArtifactRef<ReferencePreflightDocument>,
  core: Awaited<ReturnType<typeof readCoreArtifacts>>
): Promise<boolean> {
  try {
    const metadata = await lstat(resultPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Final result path is not a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  let value: Record<string, unknown>;
  let resultBytes: Buffer;
  try { resultBytes = await readFile(resultPath); value = JSON.parse(resultBytes.toString("utf8")) as Record<string, unknown>; }
  catch { throw new Error("Existing final result is malformed and cannot be recovered"); }
  assertExactObjectKeys(value, ["schemaVersion", "experimentId", "status", "classification", "profileId", "completedAt", "exactModel", "inputs", "schedule", "lineageCallAccounting", "summaries", "artifacts", "privacy", "protectedActions"], "existing final result");
  const schedule = value.schedule as Record<string, unknown> | undefined;
  const inputs = value.inputs as Record<string, { path?: string; sha256?: string }> | undefined;
  const privacy = value.privacy as Record<string, unknown> | undefined;
  const artifacts = value.artifacts as Record<string, { path?: string; sha256?: string }> | undefined;
  const summaries = value.summaries as Record<string, Record<string, unknown>> | undefined;
  const lineage = value.lineageCallAccounting as Record<string, unknown> | undefined;
  const expectedSchedule = buildSchedule(preregistration.value, profileId);
  const expectedScheduleSha256 = sha256(expectedSchedule.map((row) => row.observationId).join("\n"));
  const expectedRequestIntentsSha256 = referencePreflight.value.contract.materializedRequestIntentsByProfileSha256[profileId];
  if (!schedule || !inputs || !lineage || !privacy || !artifacts) throw new Error("Existing final result lacks required V3 objects");
  assertExactObjectKeys(schedule, ["observations", "scheduleSha256", "materializedRequestIntentsSha256", "oneShot", "retries", "completed"], "existing final schedule");
  assertExactObjectKeys(inputs, ["preregistration", "v1PrecallSupersession", "v2PartialSupersession", "manifest", "oracle", "hardenedPreflight", "networkCaveat", "referenceActionPreflight", "exactModels", "acquisition", "sourceClosureSha256", "servingAttestation"], "existing final inputs");
  assertExactObjectKeys(lineage, ["historicalV2PhysicalCalls", "historicalV2ValidPrimaryCalls", "historicalV2CallsExcluded", "v3PrimaryCallsThisProfile", "v3PrimaryCallsPlannedAcrossProfiles", "plannedPhysicalCallsAcrossV2AndV3AfterBothProfiles", "v2RowsImported", "v2EventsImported"], "existing final lineage accounting");
  assertExactObjectKeys(artifacts, ["freshRun", "observations", "checkpoint", "callEvents"], "existing final artifacts");
  assertExactObjectKeys(privacy, ["rawPromptsStored", "rawModelOutputsStored", "rawDiffsStored", "replacementTextStored", "hiddenOracleSourceStored", "referenceFixStored", "apiKeyStored", "hashesAndBoundedMetadataOnly"], "existing final privacy");
  assertExactObjectKeys(value.protectedActions, ["modelDownload", "dependencyInstall", "sudoAdmin", "commit", "remote", "push", "pullRequest", "merge", "tag", "signing", "release"], "existing final protected actions");
  if (Object.values(value.protectedActions).some((flag) => flag !== false)) throw new Error("Existing final result records a protected action");
  for (const [key, expected] of [
    ["preregistration", preregistration], ["v1PrecallSupersession", core.precallSupersession], ["v2PartialSupersession", core.partialV2Supersession], ["manifest", core.manifest], ["oracle", core.oracle], ["hardenedPreflight", core.preflight], ["networkCaveat", core.preflightCaveat], ["referenceActionPreflight", referencePreflight], ["exactModels", core.exactModels], ["acquisition", core.acquisition]
  ] as const) {
    const reference = inputs[key];
    assertExactObjectKeys(reference, ["path", "sha256"], `existing final input ${key}`);
    if (reference.path !== expected.path || reference.sha256 !== expected.sha256) throw new Error(`Existing final input binding mismatch: ${key}`);
  }
  const expectedSourceClosureSha256 = sha256(Object.entries(preregistration.value.sourceClosure).sort(([left], [right]) => left.localeCompare(right)).map(([relative, digest]) => `${relative}\0${digest}`).join("\n"));
  if (inputs.sourceClosureSha256 !== expectedSourceClosureSha256) throw new Error("Existing final source-closure digest differs from preregistration");
  const exactModel = value.exactModel as Record<string, unknown>;
  const sealedModel = preregistration.value.models.find((model) => model.profileId === profileId);
  assertExactObjectKeys(exactModel, ["modelId", "revision", "tokenizerRevision", "precision", "snapshotVerification", "checkedSnapshotFiles"], "existing final exact model");
  if (!sealedModel || exactModel.modelId !== sealedModel.modelId || exactModel.revision !== sealedModel.revision || exactModel.precision !== sealedModel.precision || exactModel.snapshotVerification !== "PASS" || !Number.isInteger(exactModel.checkedSnapshotFiles) || Number(exactModel.checkedSnapshotFiles) <= 0) throw new Error("Existing final exact-model evidence differs from preregistration");
  const startServingAttestation = inputs.servingAttestation as unknown as Record<string, unknown>;
  assertExactObjectKeys(startServingAttestation, ["launch", "ready", "installedRuntime"], "existing start serving attestation");
  assertExactObjectKeys(startServingAttestation.launch, ["path", "sha256", "processId", "processStartTicks"], "existing start launch attestation");
  assertExactObjectKeys(startServingAttestation.ready, ["path", "sha256"], "existing start ready attestation");
  if (startServingAttestation.launch.path !== ".runtime/model/profile-launch.json" || startServingAttestation.ready.path !== ".runtime/model/profile-ready.json" || !/^[0-9a-f]{64}$/.test(String(startServingAttestation.launch.sha256)) || !/^[0-9a-f]{64}$/.test(String(startServingAttestation.ready.sha256)) || !Number.isInteger(startServingAttestation.launch.processId) || Number(startServingAttestation.launch.processId) <= 0 || typeof startServingAttestation.launch.processStartTicks !== "string" || !startServingAttestation.launch.processStartTicks) throw new Error("Existing start serving attestation is invalid");
  assertExactInstalledModelRuntime(startServingAttestation.installedRuntime, preregistration.value.installedModelRuntime, "existing start serving installed runtime");
  if (value.schemaVersion !== 1 || value.experimentId !== `dca-patch-interface-${profileId}-${path.basename(relativeRunDirectory)}` || value.classification !== "DEVELOPMENT_ONLY_INTERFACE_SELECTION_NOT_HOLDOUT" || value.profileId !== profileId || typeof value.completedAt !== "string" || !Number.isFinite(Date.parse(value.completedAt)) || !["COMPLETE_DEVELOPMENT_DIAGNOSTIC", "FAIL_SAFETY_OR_CLEANUP", "INVALID_TRANSPORT_SERVING_OR_CAUSAL_CLOSURE"].includes(String(value.status)) || schedule.observations !== expectedCallsPerProfile || schedule.completed !== expectedCallsPerProfile || schedule.oneShot !== true || schedule.retries !== 0 || schedule.scheduleSha256 !== expectedScheduleSha256 || schedule.materializedRequestIntentsSha256 !== expectedRequestIntentsSha256 || inputs.preregistration?.path !== preregistration.path || inputs.preregistration?.sha256 !== preregistration.sha256 || inputs.v2PartialSupersession?.path !== preregistration.value.continuation.v2PartialAbort.path || inputs.v2PartialSupersession?.sha256 !== preregistration.value.continuation.v2PartialAbort.sha256 || inputs.referenceActionPreflight?.path !== referencePreflight.path || inputs.referenceActionPreflight?.sha256 !== referencePreflight.sha256 || lineage.historicalV2PhysicalCalls !== 7 || lineage.historicalV2ValidPrimaryCalls !== 0 || lineage.historicalV2CallsExcluded !== 7 || lineage.v3PrimaryCallsThisProfile !== 420 || lineage.v3PrimaryCallsPlannedAcrossProfiles !== 840 || lineage.plannedPhysicalCallsAcrossV2AndV3AfterBothProfiles !== 847 || lineage.v2RowsImported !== false || lineage.v2EventsImported !== false || Object.entries(privacy).some(([key, flag]) => key !== "hashesAndBoundedMetadataOnly" ? flag !== false : flag !== true)) throw new Error("Existing final result does not satisfy the sealed V3 completion contract");
  try {
    const markerMetadata = await lstat(path.join(root, relativeRunDirectory, "fresh-run.json"));
    if (!markerMetadata.isFile() || markerMetadata.isSymbolicLink()) throw new Error("Finalized V3 result lacks a regular fresh-run marker");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Finalized V3 result cannot recover without its pre-call fresh-run marker");
    throw error;
  }
  const recoveredFreshMarker = await ensureFreshRunMarker({
    relativeRunDirectory,
    preregistration,
    partialV2Supersession: preregistration.value.continuation.v2PartialAbort,
    checkpointPath: path.join(root, relativeRunDirectory, "observations.checkpoint.jsonl"),
    eventsPath: path.join(root, relativeRunDirectory, "call-events.jsonl"),
    observationIdsSha256: expectedScheduleSha256,
    materializedRequestIntentsSha256: expectedRequestIntentsSha256
  });
  if (artifacts.freshRun?.path !== recoveredFreshMarker.path || artifacts.freshRun?.sha256 !== recoveredFreshMarker.sha256) throw new Error("Existing final result does not bind the exact V3 fresh-run marker");
  const safety = summaries?.safety;
  const runValidity = summaries?.runValidity;
  const finalServingIdentity = runValidity?.finalServingIdentity as Record<string, unknown> | undefined;
  const finalCausalClosure = runValidity?.finalCausalClosure as Record<string, unknown> | undefined;
  const safetyCounts = [safety?.actualSafetyViolations, safety?.cleanupFailures, safety?.remainingTemporaryFixtureCount];
  if (!safety || !runValidity || safetyCounts.some((count) => !Number.isInteger(count) || Number(count) < 0) || !Number.isInteger(runValidity.transportInfrastructureErrors) || Number(runValidity.transportInfrastructureErrors) < 0 || runValidity.timeoutsAndTruncationsRemainMeasuredModelOutcomes !== true || !finalServingIdentity || !["PASS", "FAIL"].includes(String(finalServingIdentity.status)) || !finalCausalClosure || !["PASS", "FAIL"].includes(String(finalCausalClosure.status))) throw new Error("Existing final result lacks a valid safety/run-validity summary");
  assertExactObjectKeys(summaries, ["conditions", "safety", "runValidity", "telemetry"], "existing final summaries");
  assertExactObjectKeys(safety, ["wrongFileOutputAttempts", "actualSafetyViolations", "cleanupFailures", "remainingTemporaryFixtureCount"], "existing final safety summary");
  assertExactObjectKeys(runValidity, ["transportInfrastructureErrors", "timeoutsAndTruncationsRemainMeasuredModelOutcomes", "finalServingIdentity", "finalCausalClosure"], "existing final run-validity summary");
  if (finalServingIdentity.status === "PASS") {
    assertExactObjectKeys(finalServingIdentity, ["status", "launchAttestationSha256", "readyAttestationSha256", "apiKeyIdentityUnchanged"], "final serving identity");
    const initialServingAttestation = (value.inputs as Record<string, unknown>).servingAttestation as Record<string, Record<string, unknown>> | undefined;
    if (!/^[0-9a-f]{64}$/.test(String(finalServingIdentity.launchAttestationSha256)) || !/^[0-9a-f]{64}$/.test(String(finalServingIdentity.readyAttestationSha256)) || finalServingIdentity.apiKeyIdentityUnchanged !== true || finalServingIdentity.launchAttestationSha256 !== initialServingAttestation?.launch?.sha256 || finalServingIdentity.readyAttestationSha256 !== initialServingAttestation?.ready?.sha256) throw new Error("Existing final serving PASS evidence is invalid or differs from the start attestation");
  } else {
    assertExactObjectKeys(finalServingIdentity, ["status", "errorSha256"], "final serving identity failure");
    if (!/^[0-9a-f]{64}$/.test(String(finalServingIdentity.errorSha256))) throw new Error("Existing final serving failure evidence is invalid");
  }
  if (finalCausalClosure.status === "PASS") {
    assertExactObjectKeys(finalCausalClosure, ["status", "expectedSha256", "actualSha256"], "final causal closure");
    if (finalCausalClosure.expectedSha256 !== preregistration.value.causalClosure.sha256 || finalCausalClosure.actualSha256 !== finalCausalClosure.expectedSha256) throw new Error("Existing final causal-closure PASS evidence is invalid or differs from preregistration");
  } else {
    assertExactObjectKeys(finalCausalClosure, ["status", "expectedSha256", "errorSha256"], "final causal closure failure");
    if (finalCausalClosure.expectedSha256 !== preregistration.value.causalClosure.sha256 || !/^[0-9a-f]{64}$/.test(String(finalCausalClosure.errorSha256))) throw new Error("Existing final causal-closure failure evidence is invalid");
  }
  const expectedStatus = safetyCounts.some((count) => Number(count) > 0)
    ? "FAIL_SAFETY_OR_CLEANUP"
    : Number(runValidity.transportInfrastructureErrors) > 0 || finalServingIdentity.status !== "PASS" || finalCausalClosure.status !== "PASS"
      ? "INVALID_TRANSPORT_SERVING_OR_CAUSAL_CLOSURE"
      : "COMPLETE_DEVELOPMENT_DIAGNOSTIC";
  if (value.status !== expectedStatus) throw new Error("Existing final result status contradicts its fail-closed safety/transport evidence");
  for (const [key, expectedPath] of [
    ["freshRun", `${relativeRunDirectory}/fresh-run.json`],
    ["observations", `${relativeRunDirectory}/observations.final.json`],
    ["checkpoint", `${relativeRunDirectory}/observations.checkpoint.jsonl`],
    ["callEvents", `${relativeRunDirectory}/call-events.jsonl`]
  ] as const) {
    const reference = artifacts[key];
    if (!reference || reference.path !== expectedPath || !/^[0-9a-f]{64}$/.test(reference.sha256 ?? "")) throw new Error(`Existing final result has an invalid ${key} artifact reference`);
    const target = path.join(root, expectedPath);
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || sha256(await readFile(target)) !== reference.sha256) throw new Error(`Existing final result ${key} artifact hash mismatch`);
    const sidecar = `${target}.sha256`;
    const sidecarMetadata = await lstat(sidecar);
    const expectedSidecar = `${reference.sha256}  ${path.basename(target)}\n`;
    if (!sidecarMetadata.isFile() || sidecarMetadata.isSymbolicLink() || await readFile(sidecar, "utf8") !== expectedSidecar) throw new Error(`Existing final result ${key} sidecar mismatch`);
  }
  const checkpointRows = await readJsonLines(path.join(root, relativeRunDirectory, "observations.checkpoint.jsonl"));
  const eventRows = await readJsonLines(path.join(root, relativeRunDirectory, "call-events.jsonl"));
  if (checkpointRows.length !== expectedCallsPerProfile || eventRows.length !== expectedCallsPerProfile * 2) throw new Error("Existing final result does not have exact 420-row checkpoint and paired call ledger evidence");
  const taskById = new Map(core.manifest.value.tasks.map((task) => [task.task_id, task]));
  for (const [index, row] of checkpointRows.entries()) {
    const expected = expectedSchedule[index];
    const task = taskById.get(expected.taskId); const oracle = core.oracleById.get(expected.taskId); const preflight = core.preflightById.get(expected.taskId);
    if (!task || !oracle || !preflight) throw new Error(`Recovered checkpoint task binding is missing at index ${index}`);
    assertPersistedObservation(row, expected, task, oracle, preflight, preregistration.value.fixedInformationContract.promptTemplate);
  }
  const finalObservations = JSON.parse(await readFile(path.join(root, relativeRunDirectory, "observations.final.json"), "utf8")) as Record<string, unknown>;
  assertExactObjectKeys(finalObservations, ["schemaVersion", "profileId", "observations"], "recovered final observations");
  if (finalObservations.schemaVersion !== 1 || finalObservations.profileId !== profileId || !Array.isArray(finalObservations.observations) || finalObservations.observations.length !== expectedCallsPerProfile || finalObservations.observations.some((row, index) => JSON.stringify(row) !== JSON.stringify(checkpointRows[index]))) throw new Error("Final observations are not byte-semantically identical to the exact checkpoint rows");
  const computedSafety = {
    wrongFileOutputAttempts: checkpointRows.filter((row) => (row.metrics as Record<string, unknown>).wrongFileOutputAttempt === true).length,
    actualSafetyViolations: checkpointRows.filter((row) => (row.metrics as Record<string, unknown>).actualSafetyViolation === true).length,
    cleanupFailures: checkpointRows.filter((row) => (row.execution as Record<string, unknown>).cleanupStatus !== "PASS").length
  };
  const computedTransportInfrastructureErrors = checkpointRows.filter((row) => (row.outcome as Record<string, unknown>).decompositionCategory === "TRANSPORT_ERROR").length;
  if (JSON.stringify(summaries.conditions) !== JSON.stringify(summarizeRows(checkpointRows)) || safety.wrongFileOutputAttempts !== computedSafety.wrongFileOutputAttempts || safety.actualSafetyViolations !== computedSafety.actualSafetyViolations || safety.cleanupFailures !== computedSafety.cleanupFailures || runValidity.transportInfrastructureErrors !== computedTransportInfrastructureErrors) throw new Error("Existing final summaries differ from the exact durable observation evidence");
  const starts = new Map<string, Record<string, unknown>>();
  const terminals = new Map<string, Record<string, unknown>>();
  for (const event of eventRows) {
    const observationId = String(event.observationId ?? "");
    const expected = expectedSchedule[Number(event.observationIndex)];
    if (!expected || expected.observationId !== observationId) throw new Error("Recovered call ledger contains an observation outside the exact schedule");
    const checkpoint = checkpointRows[expected.index];
    const modelCall = checkpoint.modelCall as Record<string, unknown>;
    if (event.event === "CALL_STARTED") {
      assertExactObjectKeys(event, ["event", "observationId", "observationIndex", "requestIdSha256", "systemSha256", "promptSha256", "startedAt"], "recovered call-start event");
      const task = taskById.get(expected.taskId); const oracle = core.oracleById.get(expected.taskId); const preflight = core.preflightById.get(expected.taskId);
      if (!task || !oracle || !preflight) throw new Error("Recovered call-start prompt binding is missing");
      const prompt = renderPrompt(preregistration.value.fixedInformationContract.promptTemplate, task, oracle, preflight);
      if (starts.has(observationId) || event.requestIdSha256 !== sha256(`patch-interface-${profileId}-${expected.conditionId}-${expected.taskId}`) || event.systemSha256 !== sha256(expected.system) || event.promptSha256 !== sha256(prompt) || !Number.isFinite(Date.parse(String(event.startedAt)))) throw new Error("Recovered call-start event differs from the exact one-shot request intent");
      starts.set(observationId, event);
    } else if (event.event === "CALL_COMPLETED" || event.event === "CALL_COMPLETION_RECOVERED") {
      assertExactObjectKeys(event, event.event === "CALL_COMPLETED" ? ["event", "observationId", "observationIndex", "outputSha256", "observationSha256", "completedAt"] : ["event", "observationId", "observationIndex", "outputSha256", "observationSha256", "recoveredAt", "reason"], "recovered call-terminal event");
      const terminalTime = event.event === "CALL_COMPLETED" ? event.completedAt : event.recoveredAt;
      if (terminals.has(observationId) || event.outputSha256 !== modelCall.outputSha256 || event.observationSha256 !== sha256(JSON.stringify(checkpoint)) || !Number.isFinite(Date.parse(String(terminalTime)))) throw new Error("Recovered call-terminal event is not bound to its durable observation");
      terminals.set(observationId, event);
    } else throw new Error("Recovered call ledger contains an unknown event type");
  }
  if (starts.size !== expectedCallsPerProfile || terminals.size !== expectedCallsPerProfile || expectedSchedule.some((observation) => !starts.has(observation.observationId) || !terminals.has(observation.observationId))) throw new Error("Recovered call ledger is not an exact 420 START + 420 terminal one-shot schedule");
  for (const observation of expectedSchedule) {
    const start = starts.get(observation.observationId)!;
    const startedAt = Date.parse(String(start.startedAt));
    const terminal = terminals.get(observation.observationId)!;
    const terminalAt = Date.parse(String(terminal.event === "CALL_COMPLETED" ? terminal.completedAt : terminal.recoveredAt));
    if (eventRows[observation.index * 2] !== start || eventRows[observation.index * 2 + 1] !== terminal || terminalAt < startedAt || (terminal.event === "CALL_COMPLETION_RECOVERED" && terminal.reason !== "durable observation preceded completion event")) throw new Error(`Recovered call-event ordering/reason is invalid: ${observation.observationId}`);
  }
  await persistAtomicExact(resultPath, resultBytes, 0o600);
  const artifact = await freezeAppendOnlyEvidence(resultPath);
  process.stdout.write(`${JSON.stringify({ runDirectory: relativeRunDirectory, result: artifact, status: value.status, profileId, observations: expectedCallsPerProfile, recoveredFinalization: true }, null, 2)}\n`);
  if (value.status !== "COMPLETE_DEVELOPMENT_DIAGNOSTIC") process.exitCode = 1;
  return true;
}

async function freezeAppendOnlyEvidence(target: string): Promise<{ path: string; sha256: string }> {
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Evidence target is not a regular file: ${path.basename(target)}`);
  const bytes = await readFile(target);
  const relative = posix(path.relative(root, target));
  const sidecar = `${target}.sha256`;
  const digest = sha256(bytes);
  const contents = `${digest}  ${path.basename(target)}\n`;
  await persistAtomicExact(sidecar, contents, 0o600);
  return { path: relative, sha256: digest };
}

async function runLiveExperiment(core: Awaited<ReturnType<typeof readCoreArtifacts>>): Promise<void> {
  const prereg = await readOptionalPreregistration();
  if (!prereg) throw new Error("Live model execution is blocked until immutable preregistration exists");
  const referencePreflight = await readVerifiedJson<ReferencePreflightDocument>(referencePreflightRelative);
  const reusedIds = core.taskIds.filter((id) => id.startsWith("g4-dev-patch-"));
  const newIds = core.taskIds.filter((id) => !id.startsWith("g4-dev-patch-"));
  const balancedIds = [...deterministicSelection(reusedIds, 6, "patch-interface-balanced-old-v1"), ...deterministicSelection(newIds, 6, "patch-interface-balanced-new-v1")].sort();
  const granularityIds = deterministicSelection(newIds, 12, "patch-interface-granularity-new-v1");
  const causalClosure = await computePatchInterfaceCausalClosure(root);
  if (core.precallSupersession.value.remediation.source.sha256 !== causalClosure.sourceFiles["scripts/model_serving_attestation.ts"] || core.precallSupersession.value.implementation.generator.sha256 !== causalClosure.sourceFiles["scripts/write_patch_interface_precall_supersession.ts"]) throw new Error("Pre-call supersession does not bind the exact remediated source and generator");
  assertPartialV2Implementation(core.partialV2Supersession, causalClosure);
  assertSecurityCausalClosure(core.securityRegression, causalClosure);
  assertReferencePreflight(referencePreflight, core, causalClosure);
  assertPreregistration(prereg, { baselineAttestation: core.baselineAttestation, historicalAudit: core.historicalAudit, activeTaskContract: core.activeTaskContract, securityRegression: core.securityRegression, precallSupersession: core.precallSupersession, partialV2Supersession: core.partialV2Supersession, v2Preregistration: core.v2Preregistration, manifest: core.manifest, oracle: core.oracle, preflight: core.preflight, preflightCaveat: core.preflightCaveat, referencePreflight, exactModels: core.exactModels, acquisition: core.acquisition }, core.taskIds, balancedIds, granularityIds);
  const sourceClosureSha256 = await verifySourceClosure(prereg);
  if (prereg.value.causalClosure.sha256 !== causalClosure.sha256 || JSON.stringify(prereg.value.causalClosure) !== JSON.stringify(causalClosure)) throw new Error("Sealed causal closure differs from the current executable closure");
  if (referencePreflight.value.implementation.runner.sha256 !== prereg.value.sourceClosure["scripts/run_patch_interface_experiment.ts"] || referencePreflight.value.implementation.patchInterfaceRuntime.sha256 !== prereg.value.sourceClosure["services/patch-interface-runtime/src/index.ts"] || referencePreflight.value.implementation.toolRuntime.sha256 !== prereg.value.sourceClosure["services/tool-runtime/src/index.ts"]) throw new Error("Reference preflight implementation hashes differ from the sealed source closure");

  const [registry, currentEnvironmentFingerprint] = await Promise.all([readModelSpecializationRegistry(root), probeExperimentEnvironmentFingerprint(root)]);
  if (JSON.stringify(currentEnvironmentFingerprint) !== JSON.stringify(prereg.value.environmentFingerprint)) throw new Error("Current hardware/runtime environment fingerprint differs from preregistration");
  if (JSON.stringify(exactFixedServingVariables(registry.sharedServing)) !== JSON.stringify(prereg.value.fixedServingVariables)) throw new Error("Current fixed serving variables differ from preregistration");
  const selectedProfile = registry.profiles[profileId];
  const sealedModel = prereg.value.models.find((model) => model.profileId === profileId);
  if (!sealedModel || sealedModel.modelId !== selectedProfile.modelId || sealedModel.revision !== selectedProfile.revision || sealedModel.precision !== registry.sharedServing.precision) throw new Error("Served profile differs from the preregistered exact model");
  const snapshot = await inspectSnapshot(root, profileId, selectedProfile, core.exactModels.value.models[profileId].snapshotFiles);
  if (snapshot.status !== "PASS") throw new Error(`Exact ${profileId} snapshot verification failed`);
  const sandbox = await detectSandboxCapabilities();
  if (sandbox.level !== "HARD_ISOLATION" || sandbox.strategy !== "unshare_user_network_pid") throw new Error("Live execution fails closed without hard user+network+PID namespace isolation");
  const temporaryEntries = (await readdir(os.tmpdir())).filter((name) => name.startsWith("dca-patch-interface-"));
  if (temporaryEntries.length) throw new Error("Stale patch-interface temporary fixture exists before live execution");

  const relativeRunDirectory = validateRunDirectoryArgument(runDirectoryArgument);
  if (relativeRunDirectory === core.precallSupersession.value.precallAbortEvidence.runDirectory || relativeRunDirectory === core.partialV2Supersession.value.partialRun.runDirectory) throw new Error("V3 execution cannot reuse either superseded V1/V2 run directory");
  const runDirectory = path.join(root, relativeRunDirectory);
  try { await mkdir(runDirectory, { recursive: false }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const runDirectoryMetadata = await lstat(runDirectory);
  if (!runDirectoryMetadata.isDirectory() || runDirectoryMetadata.isSymbolicLink()) throw new Error("Run directory must be a real directory, not a symlink or special file");
  const [canonicalRoot, canonicalRunDirectory] = await Promise.all([realpath(root), realpath(runDirectory)]);
  if (!canonicalRunDirectory.startsWith(`${canonicalRoot}${path.sep}`) || posix(path.relative(canonicalRoot, canonicalRunDirectory)) !== relativeRunDirectory) throw new Error("Run directory resolves outside the exact repository path");
  const releaseProfileRunBinding = await acquireProfileRunBinding(prereg.sha256, relativeRunDirectory);
  try {
  const resultPath = path.join(runDirectory, "result.json");
  if (await recoverFinalizedResult(resultPath, relativeRunDirectory, prereg, referencePreflight, core)) return;
  for (const staleLifecycle of [path.join(runDirectory, "lifecycle.json"), path.join(runDirectory, "lifecycle.json.sha256")]) {
    try { await lstat(staleLifecycle); throw new Error("A lifecycle artifact cannot predate an unfinished V3 model run"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }

  const checkpointPath = path.join(runDirectory, "observations.checkpoint.jsonl");
  const eventsPath = path.join(runDirectory, "call-events.jsonl");
  await Promise.all([ensureAppendOnlyFile(checkpointPath), ensureAppendOnlyFile(eventsPath)]);
  const schedule = buildSchedule(prereg.value, profileId);
  const taskById = new Map(core.manifest.value.tasks.map((task) => [task.task_id, task]));
  const materializedRequestIntents = schedule.map((observation) => {
    const task = taskById.get(observation.taskId); const oracle = core.oracleById.get(observation.taskId); const preflight = core.preflightById.get(observation.taskId);
    if (!task || !oracle || !preflight) throw new Error(`V3 prompt materialization binding missing: ${observation.observationId}`);
    const prompt = renderPrompt(prereg.value.fixedInformationContract.promptTemplate, task, oracle, preflight);
    return `${observation.observationId}\0${sha256(`patch-interface-${profileId}-${observation.conditionId}-${observation.taskId}`)}\0${observation.transport}\0${sha256(JSON.stringify(observation.schema))}\0${sha256(observation.system)}\0${sha256(prompt)}`;
  });
  if (materializedRequestIntents.length !== expectedCallsPerProfile || new Set(schedule.map((row) => row.observationId)).size !== expectedCallsPerProfile) throw new Error("V3 zero-call prompt preflight did not materialize the exact 420 unique request intents");
  const scheduleSha256 = sha256(schedule.map((row) => row.observationId).join("\n"));
  const materializedRequestIntentsSha256 = sha256(materializedRequestIntents.join("\n"));
  if (referencePreflight.value.contract.materializedRequestIntentsByProfileSha256[profileId] !== materializedRequestIntentsSha256) throw new Error("Live V3 request intents differ from the exact per-profile zero-call reference preflight");
  const freshRunMarker = await ensureFreshRunMarker({ relativeRunDirectory, preregistration: prereg, partialV2Supersession: core.partialV2Supersession, checkpointPath, eventsPath, observationIdsSha256: scheduleSha256, materializedRequestIntentsSha256 });
  const existingRows = await readJsonLines(checkpointPath);
  const events = await readJsonLines(eventsPath);
  if (existingRows.length > schedule.length) throw new Error("Checkpoint contains more observations than the sealed schedule");
  const rowById = new Map<string, Record<string, unknown>>();
  existingRows.forEach((row, index) => {
    const expected = schedule[index];
    const task = taskById.get(expected.taskId); const oracle = core.oracleById.get(expected.taskId); const preflight = core.preflightById.get(expected.taskId);
    if (!task || !oracle || !preflight || rowById.has(String(row.observationId))) throw new Error("Checkpoint is not an exact unique prefix of the sealed schedule");
    assertPersistedObservation(row, expected, task, oracle, preflight, prereg.value.fixedInformationContract.promptTemplate);
    rowById.set(String(row.observationId), row);
  });
  const started = new Map<string, Record<string, unknown>>(); const completed = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    const id = String(event.observationId ?? "");
    const expected = schedule.find((item) => item.observationId === id);
    if (!expected || event.observationIndex !== expected.index) throw new Error("Call ledger contains an observation outside the sealed schedule");
    if (event.event === "CALL_STARTED") {
      assertExactObjectKeys(event, ["event", "observationId", "observationIndex", "requestIdSha256", "systemSha256", "promptSha256", "startedAt"], "call-start ledger event");
      const task = taskById.get(expected.taskId); const oracle = core.oracleById.get(expected.taskId); const preflight = core.preflightById.get(expected.taskId);
      if (!task || !oracle || !preflight) throw new Error("Call-start ledger task binding is missing");
      const expectedPrompt = renderPrompt(prereg.value.fixedInformationContract.promptTemplate, task, oracle, preflight);
      if (event.requestIdSha256 !== sha256(`patch-interface-${profileId}-${expected.conditionId}-${expected.taskId}`) || event.systemSha256 !== sha256(expected.system) || event.promptSha256 !== sha256(expectedPrompt)) throw new Error("Call-start intent differs from the sealed request");
      if (started.has(id)) throw new Error("Call ledger contains a duplicate call start");
      started.set(id, event);
    }
    else if (event.event === "CALL_COMPLETED" || event.event === "CALL_COMPLETION_RECOVERED") {
      assertExactObjectKeys(event, event.event === "CALL_COMPLETED" ? ["event", "observationId", "observationIndex", "outputSha256", "observationSha256", "completedAt"] : ["event", "observationId", "observationIndex", "outputSha256", "observationSha256", "recoveredAt", "reason"], "call-completion ledger event");
      if (completed.has(id)) throw new Error("Call ledger contains a duplicate completion");
      completed.set(id, event);
    }
    else throw new Error("Call ledger contains an unknown event");
  }
  for (const [id, event] of completed) {
    const row = rowById.get(id);
    if (!row || event.outputSha256 !== (row.modelCall as Record<string, unknown>).outputSha256 || event.observationSha256 !== sha256(JSON.stringify(row))) throw new Error("Call completion is not hash-bound to its durable observation");
  }
  for (const [id] of started) if (!completed.has(id)) {
    const row = rowById.get(id);
    if (!row) throw new Error(`Ambiguous interrupted model call cannot be retried under the one-shot contract: ${id}`);
    const expected = schedule[Number(row.observationIndex)];
    const recovery = { event: "CALL_COMPLETION_RECOVERED", observationId: id, observationIndex: expected.index, outputSha256: (row.modelCall as Record<string, unknown>).outputSha256, observationSha256: sha256(JSON.stringify(row)), recoveredAt: new Date().toISOString(), reason: "durable observation preceded completion event" };
    await appendDurableJsonLine(eventsPath, recovery);
    events.push(recovery);
    completed.set(id, recovery);
  }
  if (started.size !== existingRows.length || completed.size !== existingRows.length || events.length !== existingRows.length * 2) throw new Error("Durable call ledger and checkpoint counts differ");
  for (let index = 0; index < existingRows.length; index += 1) {
    const expected = schedule[index]; const start = started.get(expected.observationId); const terminal = completed.get(expected.observationId);
    if (!start || !terminal || events[index * 2] !== start || events[index * 2 + 1] !== terminal || (terminal.event === "CALL_COMPLETION_RECOVERED" && terminal.reason !== "durable observation preceded completion event")) throw new Error(`Durable call ledger ordering differs from the exact prefix at index ${index}`);
  }

  const access = await readProfileModelAccess(root, profileId);
  const installedModelRuntime = await probeInstalledModelRuntime(root);
  assertExactInstalledModelRuntime(installedModelRuntime, prereg.value.installedModelRuntime, "live versus preregistered installed model runtime");
  const servingAttestation: VerifiedServingAttestation = await verifyServingLaunchAndMarkReady(root, profileId, prereg.sha256, installedModelRuntime);
  const live = new SpecializationLiveModel({ endpoint: access.endpoint, apiKey: access.apiKey, model: access.model, seed: access.shared.seed });
  const referenceMetrics = new Map<string, { additions: number; deletions: number; total: number }>();
  for (const task of core.manifest.value.tasks) {
    const oracle = core.oracleById.get(task.task_id)!;
    const source = sourceFor(task, oracle);
    referenceMetrics.set(task.task_id, diffMetrics(buildCanonicalUnifiedDiff(source.path, source.content, oracle.reference_fixed_source)));
  }
  const observations = [...existingRows];
  const gpuSamples: Array<{ completed: number; memoryMiB: number | null; sampledAt: string }> = [{ completed: observations.length, memoryMiB: await gpuMemorySample(), sampledAt: new Date().toISOString() }];
  for (let index = observations.length; index < schedule.length; index += 1) {
    const observation = schedule[index];
    const task = taskById.get(observation.taskId); const oracle = core.oracleById.get(observation.taskId); const preflight = core.preflightById.get(observation.taskId);
    if (!task || !oracle || !preflight) throw new Error(`Sealed task binding missing at observation ${index}`);
    const prompt = renderPrompt(prereg.value.fixedInformationContract.promptTemplate, task, oracle, preflight);
    await appendDurableJsonLine(eventsPath, { event: "CALL_STARTED", observationId: observation.observationId, observationIndex: index, requestIdSha256: sha256(`patch-interface-${profileId}-${observation.conditionId}-${observation.taskId}`), systemSha256: sha256(observation.system), promptSha256: sha256(prompt), startedAt: new Date().toISOString() });
    const row = await runObservation({ observation, task, oracle, preflight, prompt, live, sandbox, referenceDiffMetrics: referenceMetrics.get(task.task_id)! });
    const serialized = `${JSON.stringify(row)}\n`;
    if (serialized.includes(access.apiKey)) throw new Error("Secret persistence guard rejected an observation");
    await appendDurableJsonLine(checkpointPath, row);
    observations.push(row);
    await appendDurableJsonLine(eventsPath, { event: "CALL_COMPLETED", observationId: observation.observationId, observationIndex: index, outputSha256: (row.modelCall as Record<string, unknown>).outputSha256, observationSha256: sha256(serialized.slice(0, -1)), completedAt: new Date().toISOString() });
    if ((index + 1) % 5 === 0) process.stdout.write(`${profileId} patch-interface ${index + 1}/${schedule.length}\n`);
    if ((index + 1) % 10 === 0) gpuSamples.push({ completed: index + 1, memoryMiB: await gpuMemorySample(), sampledAt: new Date().toISOString() });
  }
  if (observations.length !== expectedCallsPerProfile || new Set(observations.map((row) => row.observationId)).size !== expectedCallsPerProfile) throw new Error("Completed observations do not match the exact sealed schedule");

  const observationsArtifact = await writeImmutableJson(`${relativeRunDirectory}/observations.final.json`, { schemaVersion: 1, profileId, observations });
  const [checkpointArtifact, eventsArtifact] = await Promise.all([freezeAppendOnlyEvidence(checkpointPath), freezeAppendOnlyEvidence(eventsPath)]);
  const conditionSummaries = summarizeRows(observations);
  const actualSafetyViolations = observations.filter((row) => (row.metrics as Record<string, unknown>).actualSafetyViolation === true).length;
  const wrongFileOutputAttempts = observations.filter((row) => (row.metrics as Record<string, unknown>).wrongFileOutputAttempt === true).length;
  const cleanupFailures = observations.filter((row) => (row.execution as Record<string, unknown>).cleanupStatus !== "PASS").length;
  const transportInfrastructureErrors = observations.filter((row) => (row.outcome as Record<string, unknown>).decompositionCategory === "TRANSPORT_ERROR").length;
  const remainingTemporaryEntries = (await readdir(os.tmpdir())).filter((name) => name.startsWith("dca-patch-interface-"));
  gpuSamples.push({ completed: observations.length, memoryMiB: await gpuMemorySample(), sampledAt: new Date().toISOString() });
  const numericGpuSamples = gpuSamples.map((sample) => sample.memoryMiB).filter((value): value is number => value !== null);
  let finalServingIdentity: Record<string, unknown>;
  try {
    const finalAccess = await readProfileModelAccess(root, profileId);
    const finalInstalledRuntime = await probeInstalledModelRuntime(root);
    const finalAttestation = await verifyServingLaunchAndMarkReady(root, profileId, prereg.sha256, finalInstalledRuntime);
    assertExactInstalledModelRuntime(finalInstalledRuntime, installedModelRuntime, "final versus initial installed model runtime");
    if (sha256(finalAccess.apiKey) !== sha256(access.apiKey) || finalAttestation.launch.sha256 !== servingAttestation.launch.sha256 || finalAttestation.ready.sha256 !== servingAttestation.ready.sha256) throw new Error("Serving identity changed during the sealed profile run");
    finalServingIdentity = { status: "PASS", launchAttestationSha256: finalAttestation.launch.sha256, readyAttestationSha256: finalAttestation.ready.sha256, apiKeyIdentityUnchanged: true };
  } catch (error) {
    finalServingIdentity = { status: "FAIL", errorSha256: sha256(error instanceof Error ? error.message : "FINAL_SERVING_IDENTITY_FAILURE") };
  }
  let finalCausalClosure: Record<string, unknown>;
  try {
    const current = await computePatchInterfaceCausalClosure(root);
    if (current.sha256 !== causalClosure.sha256 || JSON.stringify(current) !== JSON.stringify(causalClosure)) throw new Error("Executable causal closure changed during the sealed profile run");
    finalCausalClosure = { status: "PASS", expectedSha256: causalClosure.sha256, actualSha256: current.sha256 };
  } catch (error) {
    finalCausalClosure = { status: "FAIL", expectedSha256: causalClosure.sha256, errorSha256: sha256(error instanceof Error ? error.message : "FINAL_CAUSAL_CLOSURE_FAILURE") };
  }
  const resultStatus = actualSafetyViolations > 0 || cleanupFailures > 0 || remainingTemporaryEntries.length > 0
    ? "FAIL_SAFETY_OR_CLEANUP"
    : transportInfrastructureErrors > 0 || finalServingIdentity.status !== "PASS" || finalCausalClosure.status !== "PASS"
      ? "INVALID_TRANSPORT_SERVING_OR_CAUSAL_CLOSURE"
      : "COMPLETE_DEVELOPMENT_DIAGNOSTIC";
  const result = {
    schemaVersion: 1,
    experimentId: `dca-patch-interface-${profileId}-${path.basename(relativeRunDirectory)}`,
    status: resultStatus,
    classification: "DEVELOPMENT_ONLY_INTERFACE_SELECTION_NOT_HOLDOUT",
    profileId,
    completedAt: new Date().toISOString(),
    exactModel: { modelId: selectedProfile.modelId, revision: selectedProfile.revision, tokenizerRevision: selectedProfile.tokenizerRevision, precision: registry.sharedServing.precision, snapshotVerification: snapshot.status, checkedSnapshotFiles: snapshot.checkedFiles },
    inputs: {
      preregistration: { path: prereg.path, sha256: prereg.sha256 }, v1PrecallSupersession: { path: core.precallSupersession.path, sha256: core.precallSupersession.sha256 }, v2PartialSupersession: { path: core.partialV2Supersession.path, sha256: core.partialV2Supersession.sha256 }, manifest: { path: core.manifest.path, sha256: core.manifest.sha256 }, oracle: { path: core.oracle.path, sha256: core.oracle.sha256 }, hardenedPreflight: { path: core.preflight.path, sha256: core.preflight.sha256 }, networkCaveat: { path: core.preflightCaveat.path, sha256: core.preflightCaveat.sha256 }, referenceActionPreflight: { path: referencePreflight.path, sha256: referencePreflight.sha256 }, exactModels: { path: core.exactModels.path, sha256: core.exactModels.sha256 }, acquisition: { path: core.acquisition.path, sha256: core.acquisition.sha256 }, sourceClosureSha256, servingAttestation
    },
    schedule: { observations: schedule.length, scheduleSha256, materializedRequestIntentsSha256, oneShot: true, retries: 0, completed: observations.length },
    lineageCallAccounting: { historicalV2PhysicalCalls: 7, historicalV2ValidPrimaryCalls: 0, historicalV2CallsExcluded: 7, v3PrimaryCallsThisProfile: observations.length, v3PrimaryCallsPlannedAcrossProfiles: 840, plannedPhysicalCallsAcrossV2AndV3AfterBothProfiles: 847, v2RowsImported: false, v2EventsImported: false },
    summaries: { conditions: conditionSummaries, safety: { wrongFileOutputAttempts, actualSafetyViolations, cleanupFailures, remainingTemporaryFixtureCount: remainingTemporaryEntries.length }, runValidity: { transportInfrastructureErrors, timeoutsAndTruncationsRemainMeasuredModelOutcomes: true, finalServingIdentity, finalCausalClosure }, telemetry: { gpuSamples, minimumGpuMemoryMiB: numericGpuSamples.length ? Math.min(...numericGpuSamples) : null, maximumGpuMemoryMiB: numericGpuSamples.length ? Math.max(...numericGpuSamples) : null } },
    artifacts: { freshRun: freshRunMarker, observations: observationsArtifact, checkpoint: checkpointArtifact, callEvents: eventsArtifact },
    privacy: { rawPromptsStored: false, rawModelOutputsStored: false, rawDiffsStored: false, replacementTextStored: false, hiddenOracleSourceStored: false, referenceFixStored: false, apiKeyStored: false, hashesAndBoundedMetadataOnly: true },
    protectedActions: { modelDownload: false, dependencyInstall: false, sudoAdmin: false, commit: false, remote: false, push: false, pullRequest: false, merge: false, tag: false, signing: false, release: false }
  };
  const resultBody = `${JSON.stringify(result, null, 2)}\n`;
  if (resultBody.includes(access.apiKey)) throw new Error("Secret persistence guard rejected the final result");
  const resultArtifact = await writeImmutableJson(`${relativeRunDirectory}/result.json`, result);
  process.stdout.write(`${JSON.stringify({ runDirectory: relativeRunDirectory, result: resultArtifact, status: result.status, profileId, observations: observations.length, safety: result.summaries.safety }, null, 2)}\n`);
  if (result.status !== "COMPLETE_DEVELOPMENT_DIAGNOSTIC") process.exitCode = 1;
  } finally {
    await releaseProfileRunBinding();
  }
}

const coreArtifacts = await readCoreArtifacts();
if (dryRun) await runReferencePreflight(coreArtifacts);
else await runLiveExperiment(coreArtifacts);
