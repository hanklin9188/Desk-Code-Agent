import { createHash, randomBytes } from "node:crypto";
import { link, lstat, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const emptySha256 = sha256("");

const oldArtifacts = {
  securityRegression: {
    path: "docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v1.json",
    sha256: "aec9da588343fe638599df4efc9bc2593f4a8450ec7a277fb482eff9c702c391"
  },
  referenceActionPreflight: {
    path: "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v1.json",
    sha256: "a204e693c532dba23f985259effbcd1d35eb53878127c5bf871ecce0efee093c"
  },
  preregistration: {
    path: "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v1.json",
    sha256: "d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6"
  }
} as const;
const oldCausalClosureSha256 = "d46ac86623e3093625056633ba3b902cf51bcb4fde51c06cec428f9932847969";
const oldAttestationSourceSha256 = "2ef5dbda1f85ea000bd6e8e2bfb3dc9da194605be0a2cf921bdf162146adc8b0";
const runDirectory = "docs/experiments/runs/patch-interface-baseline-20260810T0054";
const bindingPrefix = ".runtime/patch-interface-experiment/d4994e226e0f4ad20fff96a42c79ae8f7fa38dfc577958e7e9f7eb111bfbccd6-baseline";
const assignmentRelative = `${bindingPrefix}.assignment.json`;
const lifecycleRelative = `${runDirectory}/lifecycle.json`;
const checkpointRelative = `${runDirectory}/observations.checkpoint.jsonl`;
const callEventsRelative = `${runDirectory}/call-events.jsonl`;

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

async function verifiedJson<T>(relative: string, exactSha256?: string): Promise<{ value: T; path: string; sha256: string }> {
  const target = path.join(root, relative);
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Evidence is not a regular file: ${relative}`);
  const bytes = await readFile(target);
  const digest = sha256(bytes);
  const sidecar = await readFile(`${target}.sha256`, "utf8");
  if (sidecar !== `${digest}  ${path.basename(target)}\n` || (exactSha256 && digest !== exactSha256)) throw new Error(`Evidence checksum mismatch: ${relative}`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: digest };
}

async function exactEmptyFile(relative: string): Promise<{ path: string; sha256: string; bytes: 0; records: 0 }> {
  const target = path.join(root, relative);
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Pre-call ledger is not a regular file: ${relative}`);
  const bytes = await readFile(target);
  if (bytes.length !== 0 || sha256(bytes) !== emptySha256) throw new Error(`Pre-call ledger is not empty: ${relative}`);
  return { path: relative, sha256: emptySha256, bytes: 0, records: 0 };
}

async function assertAbsent(relative: string): Promise<void> {
  try { await lstat(path.join(root, relative)); throw new Error(`Expected absent path exists: ${relative}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

const [security, reference, preregistration, lifecycle, checkpoint, callEvents] = await Promise.all([
  verifiedJson<Record<string, unknown>>(oldArtifacts.securityRegression.path, oldArtifacts.securityRegression.sha256),
  verifiedJson<Record<string, unknown>>(oldArtifacts.referenceActionPreflight.path, oldArtifacts.referenceActionPreflight.sha256),
  verifiedJson<{
    state: string;
    modelCallsAtSeal: number;
    installedModelRuntime: { pythonExecutable: string; pythonExecutableSha256: string; pythonVersion: string; packages: { vllm: string; transformers: string; torch: string } };
    sourceClosure: Record<string, string>;
    causalClosure: { sha256: string };
  }>(oldArtifacts.preregistration.path, oldArtifacts.preregistration.sha256),
  verifiedJson<{
    status: string;
    checkedAt: string;
    profileId: string;
    runDirectory: string;
    checks: Record<string, unknown>;
    runtimeStateCleanup: { verifiedAbsent: boolean };
    privacy: { secretsStored: boolean; apiKeyRead: boolean };
  }>(lifecycleRelative, "df4cdf42b28243571f3b48dd9bd55990f4333279effae027c295ba4782ab247a"),
  exactEmptyFile(checkpointRelative),
  exactEmptyFile(callEventsRelative)
]);

if (security.value.status !== "PASS" || reference.value.status !== "PASS") throw new Error("Superseded zero-call safety/reference inputs must remain PASS");
if (preregistration.value.state !== "SEALED_BEFORE_FIRST_NEW_MODEL_CALL" || preregistration.value.modelCallsAtSeal !== 0 || preregistration.value.causalClosure.sha256 !== oldCausalClosureSha256 || preregistration.value.sourceClosure["scripts/model_serving_attestation.ts"] !== oldAttestationSourceSha256) throw new Error("Superseded preregistration identity or source closure changed");
if (lifecycle.value.status !== "PASS" || lifecycle.value.profileId !== "baseline" || lifecycle.value.runDirectory !== runDirectory || lifecycle.value.runtimeStateCleanup.verifiedAbsent !== true || lifecycle.value.checks.ephemeralApiKeyAbsent !== true || lifecycle.value.checks.exactModelProcessAbsent !== true || lifecycle.value.checks.loopbackPort8000Clear !== true || lifecycle.value.checks.gpuMemoryReleased !== true || lifecycle.value.checks.temporaryPatchInterfaceDirectoriesAbsent !== true || lifecycle.value.privacy.secretsStored !== false || lifecycle.value.privacy.apiKeyRead !== false) throw new Error("Pre-call lifecycle evidence is incomplete");

const assignmentPath = path.join(root, assignmentRelative);
const assignmentMetadata = await lstat(assignmentPath);
if (!assignmentMetadata.isFile() || assignmentMetadata.isSymbolicLink()) throw new Error("V1 run assignment is not a regular file");
const assignmentBytes = await readFile(assignmentPath);
const assignment = JSON.parse(assignmentBytes.toString("utf8")) as Record<string, unknown>;
const expectedAssignmentBody = `${JSON.stringify({ schemaVersion: 1, preregistrationSha256: oldArtifacts.preregistration.sha256, profileId: "baseline", runDirectory })}\n`;
if (!assignmentBytes.equals(Buffer.from(expectedAssignmentBody)) || sha256(assignmentBytes) !== "5f6903bc2de0d8547d721545e3a9b5bfeaffa33b50f647c667f5596fff326186" || assignment.schemaVersion !== 1 || assignment.preregistrationSha256 !== oldArtifacts.preregistration.sha256 || assignment.profileId !== "baseline" || assignment.runDirectory !== runDirectory) throw new Error("V1 run assignment no longer equals the exact canonical aborted pre-call binding");

const absentArtifacts = [
  `${runDirectory}/result.json`, `${runDirectory}/result.json.sha256`,
  `${runDirectory}/observations.final.json`, `${runDirectory}/observations.final.json.sha256`,
  `${runDirectory}/recovery.json`,
  `${bindingPrefix}.active.lock`, `${bindingPrefix}.active.lock.recovery`,
  ".runtime/model/api-key", ".runtime/model/profile-start.json", ".runtime/model/profile-launch.json", ".runtime/model/profile-ready.json"
];
await Promise.all(absentArtifacts.map(assertAbsent));

const runtime = preregistration.value.installedModelRuntime;
const launchOrdered = { pythonExecutable: runtime.pythonExecutable, pythonExecutableSha256: runtime.pythonExecutableSha256, pythonVersion: runtime.pythonVersion, packages: runtime.packages };
const probeOrdered = { pythonExecutable: runtime.pythonExecutable, pythonVersion: runtime.pythonVersion, packages: runtime.packages, pythonExecutableSha256: runtime.pythonExecutableSha256 };
const semanticValuesEqual = launchOrdered.pythonExecutable === probeOrdered.pythonExecutable
  && launchOrdered.pythonExecutableSha256 === probeOrdered.pythonExecutableSha256
  && launchOrdered.pythonVersion === probeOrdered.pythonVersion
  && launchOrdered.packages.vllm === probeOrdered.packages.vllm
  && launchOrdered.packages.transformers === probeOrdered.packages.transformers
  && launchOrdered.packages.torch === probeOrdered.packages.torch;
const serializedOrderEqual = JSON.stringify(launchOrdered) === JSON.stringify(probeOrdered);
if (!semanticValuesEqual || serializedOrderEqual) throw new Error("Unable to reproduce the V1 order-sensitive comparator failure without changing runtime values");

const remediationSourceRelative = "scripts/model_serving_attestation.ts";
const remediationSourceSha256 = sha256(await readFile(path.join(root, remediationSourceRelative)));
const generatorRelative = "scripts/write_patch_interface_precall_supersession.ts";
const generatorSha256 = sha256(await readFile(path.join(root, generatorRelative)));
if (remediationSourceSha256 === oldAttestationSourceSha256) throw new Error("The order-insensitive runtime comparator remediation is not present");

const artifact = {
  schemaVersion: 1,
  supersessionId: "dca-patch-interface-v1-precall-abort-v2",
  status: "V1_SUPERSEDED_AFTER_VERIFIED_PRECALL_ABORT",
  classification: "DEVELOPMENT_ONLY_APPEND_ONLY_CAUSAL_CORRECTION",
  recordedAt: lifecycle.value.checkedAt,
  supersededArtifacts: {
    securityRegression: { path: security.path, sha256: security.sha256 },
    referenceActionPreflight: { path: reference.path, sha256: reference.sha256 },
    preregistration: { path: preregistration.path, sha256: preregistration.sha256 }
  },
  precallAbortEvidence: {
    failureCode: "INSTALLED_RUNTIME_KEY_ORDER_SENSITIVE_COMPARISON",
    profileId: "baseline",
    runDirectory,
    assignment: { path: assignmentRelative, sha256: sha256(assignmentBytes), preregistrationSha256: oldArtifacts.preregistration.sha256 },
    checkpoint,
    callEvents,
    callStartedEvents: 0,
    modelCalls: 0,
    lifecycle: { path: lifecycle.path, sha256: lifecycle.sha256, status: lifecycle.value.status },
    absentArtifacts
  },
  rootCause: {
    oldCausalClosureSha256,
    oldSource: { path: remediationSourceRelative, sha256: oldAttestationSourceSha256 },
    comparison: "JSON_STRINGIFY_OBJECT_INSERTION_ORDER",
    launchRuntimeFieldOrder: Object.keys(launchOrdered),
    probeRuntimeFieldOrder: Object.keys(probeOrdered),
    semanticValuesEqual,
    serializedOrderEqual,
    semanticRuntimeSha256: sha256(JSON.stringify([runtime.pythonExecutable, runtime.pythonExecutableSha256, runtime.pythonVersion, runtime.packages.vllm, runtime.packages.transformers, runtime.packages.torch]))
  },
  implementation: { generator: { path: generatorRelative, sha256: generatorSha256 } },
  remediation: {
    source: { path: remediationSourceRelative, sha256: remediationSourceSha256 },
    comparator: "EXACT_KEYS_AND_FIELD_WISE_VALUE_COMPARISON",
    newArtifactLineage: [
      "docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v2.json",
      "benchmarks/patch-interface/PATCH_INTERFACE_REFERENCE_PREFLIGHT.v2.json",
      "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v2.json"
    ],
    oldArtifactsModified: false,
    oldRunReused: false
  },
  protectedActions: {
    modelCall: false, modelDownload: false, dependencyInstall: false, sudoAdmin: false,
    commit: false, remoteConfiguration: false, push: false, pullRequest: false,
    tag: false, signing: false, release: false
  }
};

const name = "PATCH_INTERFACE_V1_PRECALL_ABORT.v2.json";
const target = path.join(root, "docs/experiments/patch-interface", name);
const body = `${JSON.stringify(artifact, null, 2)}\n`;
await persistAtomicExact(target, body, 0o644);
await persistAtomicExact(`${target}.sha256`, `${sha256(body)}  ${name}\n`, 0o644);
process.stdout.write(`${JSON.stringify({ output: path.relative(root, target).split(path.sep).join("/"), sha256: sha256(body), status: artifact.status, modelCalls: 0 }, null, 2)}\n`);
