import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  readModelSpecializationRegistry,
  type ModelSpecializationProfileId,
  type ModelSpecializationRegistry
} from "../services/model-specialization-runtime/src/index";

const execFileAsync = promisify(execFile);
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

export type InstalledModelRuntime = {
  pythonExecutable: string;
  pythonExecutableSha256: string;
  pythonVersion: string;
  packages: { vllm: string; transformers: string; torch: string };
};

export type ExperimentEnvironmentFingerprint = {
  gpu: { name: string; driverVersion: string; totalMemoryMiB: number; computeCapability: string };
  cpu: { model: string; logicalCores: number };
  memoryMiB: number;
  operatingSystem: { platform: string; release: string; version: string; architecture: string };
  runtimes: { node: string; python: string; git: string; unshare: string };
  sha256: string;
};

export type VerifiedServingAttestation = {
  launch: { path: string; sha256: string; processId: number; processStartTicks: string };
  ready: { path: string; sha256: string };
  installedRuntime: InstalledModelRuntime;
};

const expectedPackages = { vllm: "0.26.0", transformers: "5.14.1", torch: "2.11.0+cu130" } as const;

function assertExactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unexpected fields`);
}

function assertExactInstalledPackages(actual: unknown, expected: Readonly<InstalledModelRuntime["packages"]>, label: string): asserts actual is InstalledModelRuntime["packages"] {
  assertExactKeys(actual, ["vllm", "transformers", "torch"], `${label} actual`);
  assertExactKeys(expected, ["vllm", "transformers", "torch"], `${label} expected`);
  if (actual.vllm !== expected.vllm || actual.transformers !== expected.transformers || actual.torch !== expected.torch) throw new Error(`${label} differs from the exact package contract`);
}

export function assertExactInstalledModelRuntime(actual: unknown, expected: InstalledModelRuntime, label = "installed model runtime"): asserts actual is InstalledModelRuntime {
  assertExactKeys(actual, ["pythonExecutable", "pythonExecutableSha256", "pythonVersion", "packages"], `${label} actual`);
  assertExactKeys(expected, ["pythonExecutable", "pythonExecutableSha256", "pythonVersion", "packages"], `${label} expected`);
  const packages = actual.packages;
  assertExactInstalledPackages(packages, expected.packages, `${label} packages`);
  if (
    actual.pythonExecutable !== expected.pythonExecutable
    || actual.pythonExecutableSha256 !== expected.pythonExecutableSha256
    || actual.pythonVersion !== expected.pythonVersion
  ) throw new Error(`${label} differs from the exact runtime contract`);
}

async function processStartTicks(pid: number): Promise<string | null> {
  try {
    const value = await readFile(`/proc/${pid}/stat`, "utf8");
    return value.slice(value.lastIndexOf(")") + 2).trim().split(/\s+/)[19] ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function probeInstalledModelRuntime(root: string): Promise<InstalledModelRuntime> {
  const python = path.join(root, "runtime/model/.venv/bin/python");
  const script = [
    "import json, pathlib, sys",
    "import torch, transformers, vllm",
    "executable = str(pathlib.Path(sys.executable).resolve())",
    "print(json.dumps({'pythonExecutable': executable, 'pythonVersion': sys.version.split()[0], 'packages': {'vllm': vllm.__version__, 'transformers': transformers.__version__, 'torch': torch.__version__}}))"
  ].join("; ");
  const { stdout } = await execFileAsync(python, ["-c", script], { cwd: root, timeout: 30_000, maxBuffer: 1_000_000, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" } });
  const parsed = JSON.parse(stdout.trim()) as Omit<InstalledModelRuntime, "pythonExecutableSha256">;
  const executable = await realpath(parsed.pythonExecutable);
  const installed: InstalledModelRuntime = { ...parsed, pythonExecutable: executable, pythonExecutableSha256: sha256(await readFile(executable)) };
  assertExactInstalledPackages(installed.packages, expectedPackages, "installed model runtime packages");
  return installed;
}

export async function probeExperimentEnvironmentFingerprint(root: string): Promise<ExperimentEnvironmentFingerprint> {
  const [{ stdout: gpu }, { stdout: git }, { stdout: unshare }, { stdout: python }] = await Promise.all([
    execFileAsync("nvidia-smi", ["--query-gpu=name,driver_version,memory.total,compute_cap", "--format=csv,noheader,nounits"], { timeout: 5_000 }),
    execFileAsync("git", ["--version"], { timeout: 5_000 }),
    execFileAsync("unshare", ["--version"], { timeout: 5_000 }),
    execFileAsync(path.join(root, "runtime/model/.venv/bin/python"), ["--version"], { timeout: 5_000 })
  ]);
  const fields = gpu.trim().split(",").map((value) => value.trim());
  if (fields.length !== 4 || !fields.every(Boolean)) throw new Error("Unable to capture the exact GPU environment fingerprint");
  const core = {
    gpu: { name: fields[0], driverVersion: fields[1], totalMemoryMiB: Number(fields[2]), computeCapability: fields[3] },
    cpu: { model: os.cpus()[0]?.model ?? "UNKNOWN", logicalCores: os.cpus().length },
    memoryMiB: Math.floor(os.totalmem() / (1024 * 1024)),
    operatingSystem: { platform: os.platform(), release: os.release(), version: os.version(), architecture: os.arch() },
    runtimes: { node: process.version, python: python.trim(), git: git.trim(), unshare: unshare.trim().split("\n")[0] }
  };
  return { ...core, sha256: sha256(JSON.stringify(core)) };
}

export function sanitizedLaunchArgs(registry: ModelSpecializationRegistry, profileId: ModelSpecializationProfileId): string[] {
  const shared = registry.sharedServing;
  const profile = registry.profiles[profileId];
  const args = [
    "vllm", "serve", profile.modelId,
    "--host", shared.host,
    "--port", String(shared.port),
    "--api-key", "[EPHEMERAL_REDACTED]",
    "--revision", profile.revision,
    "--tokenizer-revision", profile.tokenizerRevision,
    "--served-model-name", profile.modelId,
    "--dtype", shared.precision,
    "--max-model-len", String(shared.comparisonContextLimit),
    "--gpu-memory-utilization", String(shared.gpuMemoryUtilization),
    "--max-num-seqs", String(shared.maxNumSequences),
    "--generation-config", shared.generationConfig
  ];
  if (shared.prefixCaching) args.push("--enable-prefix-caching");
  return args;
}

export async function verifyServingLaunchAndMarkReady(
  root: string,
  profileId: ModelSpecializationProfileId,
  preregistrationSha256: string,
  installedRuntime: InstalledModelRuntime
): Promise<VerifiedServingAttestation> {
  const registry = await readModelSpecializationRegistry(root);
  const profile = registry.profiles[profileId];
  const launchRelative = ".runtime/model/profile-launch.json";
  const launchPath = path.join(root, launchRelative);
  const metadata = await lstat(launchPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) throw new Error("Profile launch attestation must be a private regular file");
  const launchBytes = await readFile(launchPath);
  const launchSha256 = sha256(launchBytes);
  const launch = JSON.parse(launchBytes.toString("utf8")) as Record<string, unknown>;
  assertExactKeys(launch, ["schemaVersion", "profileId", "modelId", "revision", "tokenizerRevision", "processId", "processStartTicks", "createdEpochMs", "sanitizedArgs", "sanitizedArgsSha256", "environment", "snapshot", "installedRuntime", "files", "apiKeyStored"], "profile launch attestation");
  const expectedArgs = sanitizedLaunchArgs(registry, profileId);
  assertExactInstalledModelRuntime(launch.installedRuntime, installedRuntime, "profile launch installed runtime");
  if (launch.schemaVersion !== 1 || launch.profileId !== profileId || launch.modelId !== profile.modelId || launch.revision !== profile.revision || launch.tokenizerRevision !== profile.tokenizerRevision || launch.apiKeyStored !== false || JSON.stringify(launch.sanitizedArgs) !== JSON.stringify(expectedArgs) || launch.sanitizedArgsSha256 !== sha256(expectedArgs.join("\0"))) throw new Error("Profile launch attestation differs from the exact registry/runtime contract");
  const runtimeState = path.join(root, ".runtime/model");
  const expectedEnvironment = { HF_HOME: path.join(runtimeState, "huggingface"), DCA_HF_CACHE_DIR: path.join(runtimeState, "huggingface"), FLASHINFER_WORKSPACE_BASE: path.join(runtimeState, "flashinfer"), TORCHINDUCTOR_CACHE_DIR: path.join(runtimeState, "torchinductor"), VLLM_USE_FLASHINFER_SAMPLER: "0", VLLM_USE_V2_MODEL_RUNNER: "0", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", DCA_MODEL_PROFILE_ID: profileId };
  assertExactKeys(launch.environment, Object.keys(expectedEnvironment), "profile launch environment");
  if (JSON.stringify(launch.environment) !== JSON.stringify(expectedEnvironment)) throw new Error("Profile launch environment does not prove the exact cache, sampler, V1, and offline serving contract");
  const snapshotPath = path.join(runtimeState, "huggingface/hub", profile.snapshotDirectoryName, "snapshots", profile.revision);
  const snapshotRealpath = await realpath(snapshotPath);
  assertExactKeys(launch.snapshot, ["path", "realpath"], "profile launch snapshot");
  if (launch.snapshot.path !== snapshotPath || launch.snapshot.realpath !== snapshotRealpath || snapshotRealpath !== snapshotPath) throw new Error("Profile launch snapshot is not the exact canonical project-local revision path");
  assertExactKeys(launch.files, ["startScriptSha256", "launchScriptSha256", "registrySha256", "profileStartStateSha256"], "profile launch source hashes");
  for (const [key, relative] of [["startScriptSha256", "scripts/start_model_profile.sh"], ["launchScriptSha256", "scripts/launch_model_profile.py"], ["registrySha256", "config/model_specialization_profiles.json"]] as const) if (launch.files[key] !== sha256(await readFile(path.join(root, relative)))) throw new Error(`Profile launch source hash mismatch: ${relative}`);
  const startPath = path.join(runtimeState, "profile-start.json");
  const startMetadata = await lstat(startPath);
  if (!startMetadata.isFile() || startMetadata.isSymbolicLink() || (startMetadata.mode & 0o077) !== 0 || launch.files.profileStartStateSha256 !== sha256(await readFile(startPath))) throw new Error("Profile start-state attestation is unsafe or hash-mismatched");
  const start = JSON.parse(await readFile(startPath, "utf8")) as Record<string, unknown>;
  assertExactKeys(start, ["schemaVersion", "profileId", "startedEpochMs", "shellPid", "shellProcessStartTicks"], "profile start attestation");
  const shellPid = Number(start.shellPid);
  if (start.schemaVersion !== 1 || start.profileId !== profileId || typeof start.startedEpochMs !== "number" || !Number.isInteger(shellPid) || shellPid < 1 || typeof start.shellProcessStartTicks !== "string" || await processStartTicks(shellPid) !== start.shellProcessStartTicks) throw new Error("Profile start attestation is not bound to the active launcher process");
  const pid = Number(launch.processId);
  if (!Number.isInteger(pid) || pid < 1 || typeof launch.processStartTicks !== "string" || await processStartTicks(pid) !== launch.processStartTicks) throw new Error("Profile launch process is not the exact active attested process");

  const readyRelative = ".runtime/model/profile-ready.json";
  const readyPath = path.join(root, readyRelative);
  const readyCore = { schemaVersion: 1, profileId, modelId: profile.modelId, revision: profile.revision, preregistrationSha256, launchAttestationSha256: launchSha256, exactSingleModelEndpointVerified: true, apiKeyStored: false };
  let readyBytes: Buffer;
  try {
    const handle = await open(readyPath, "wx", 0o600);
    try {
      readyBytes = Buffer.from(`${JSON.stringify({ ...readyCore, readyEpochMs: Date.now() })}\n`);
      await handle.writeFile(readyBytes); await handle.sync();
    } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const readyMetadata = await lstat(readyPath);
    if (!readyMetadata.isFile() || readyMetadata.isSymbolicLink() || (readyMetadata.mode & 0o077) !== 0) throw new Error("Profile ready attestation is unsafe");
    readyBytes = await readFile(readyPath);
    const existing = JSON.parse(readyBytes.toString("utf8")) as Record<string, unknown>;
    for (const [key, value] of Object.entries(readyCore)) if (existing[key] !== value) throw new Error("Existing profile ready attestation differs from this sealed run");
    if (typeof existing.readyEpochMs !== "number") throw new Error("Existing profile ready attestation lacks its creation time");
  }
  return { launch: { path: launchRelative, sha256: launchSha256, processId: pid, processStartTicks: launch.processStartTicks as string }, ready: { path: readyRelative, sha256: sha256(readyBytes!) }, installedRuntime };
}
