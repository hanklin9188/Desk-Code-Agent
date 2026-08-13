import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, open, readFile, readdir, realpath, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseProfileId, readModelSpecializationRegistry } from "../services/model-specialization-runtime/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

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

const profileId = parseProfileId(process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length));
const runDirectoryArgument = process.argv.find((value) => value.startsWith("--run-directory="))?.slice("--run-directory=".length);
if (!runDirectoryArgument || path.isAbsolute(runDirectoryArgument)) throw new Error("--run-directory must be a repository-relative path");

const runDirectory = path.resolve(root, runDirectoryArgument);
const relativeRunDirectory = path.relative(root, runDirectory);
if (!relativeRunDirectory || relativeRunDirectory.startsWith(`..${path.sep}`) || path.isAbsolute(relativeRunDirectory)) throw new Error("Run directory must remain inside the repository");
if (!(await stat(runDirectory)).isDirectory()) throw new Error("Run directory does not exist or is not a directory");
const [canonicalRoot, canonicalRunDirectory] = await Promise.all([realpath(root), realpath(runDirectory)]);
if (canonicalRunDirectory !== canonicalRoot && !canonicalRunDirectory.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error("Run directory resolves outside the repository");

const lifecyclePath = path.join(canonicalRunDirectory, "lifecycle.json");
const sidecarPath = `${lifecyclePath}.sha256`;
let existingLifecycle: Buffer | null = null;
try {
  const metadata = await lstat(lifecyclePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Existing lifecycle artifact is unsafe");
  existingLifecycle = await readFile(lifecyclePath);
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
if (!existingLifecycle) {
  try { await lstat(sidecarPath); throw new Error("Lifecycle sidecar exists without its artifact"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
} else {
  const existing = JSON.parse(existingLifecycle.toString("utf8")) as Record<string, any>;
  if (existing.schemaVersion !== 1 || existing.artifactType !== "PATCH_INTERFACE_MODEL_LIFECYCLE" || existing.status !== "PASS" || existing.profileId !== profileId || existing.runDirectory !== relativeRunDirectory.split(path.sep).join("/") || existing.checks?.runtimeServingAttestationFilesAbsent !== true || existing.runtimeStateCleanup?.verifiedAbsent !== true || !Object.values(existing.runtimeStateCleanup?.results ?? {}).every((value) => value === "REMOVED" || value === "ABSENT")) throw new Error("Existing lifecycle artifact does not satisfy the exact cleanup contract");
  for (const relative of [".runtime/model/profile-start.json", ".runtime/model/profile-launch.json", ".runtime/model/profile-ready.json"]) {
    try { await lstat(path.join(root, relative)); throw new Error(`Runtime state still exists after lifecycle publication: ${relative}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  await persistAtomicExact(lifecyclePath, existingLifecycle, 0o600);
  const digest = sha256(existingLifecycle);
  await persistAtomicExact(sidecarPath, `${digest}  lifecycle.json\n`, 0o600);
  await new Promise<void>((resolve) => process.stdout.write(`${JSON.stringify({ output: path.relative(root, lifecyclePath).split(path.sep).join("/"), sha256: digest, status: "PASS", recoveredOrAlreadyComplete: true }, null, 2)}\n`, () => resolve()));
  process.exit(0);
}

interface CommandProbe {
  ok: boolean;
  stdout: string;
  commandSha256: string;
  stdoutSha256: string;
  stderrSha256: string;
  errorSha256: string | null;
}

async function commandProbe(command: string, args: string[]): Promise<CommandProbe> {
  const commandSha256 = sha256([command, ...args].join("\0"));
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd: root, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, stdout, commandSha256, stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr), errorSha256: null };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    const stdout = typeof failure.stdout === "string" ? failure.stdout : "";
    const stderr = typeof failure.stderr === "string" ? failure.stderr : "";
    return { ok: false, stdout, commandSha256, stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr), errorSha256: sha256(failure.message) };
  }
}

async function pathAbsent(target: string): Promise<{ absent: boolean; evidenceSha256: string }> {
  try {
    const metadata = await lstat(target);
    return { absent: false, evidenceSha256: sha256(JSON.stringify({ kind: metadata.isFile() ? "file" : metadata.isDirectory() ? "directory" : "other", size: metadata.size })) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { absent: true, evidenceSha256: sha256("ABSENT") };
    return { absent: false, evidenceSha256: sha256(error instanceof Error ? error.message : "FILESYSTEM_PROBE_FAILED") };
  }
}

const registry = await readModelSpecializationRegistry(root);
const profile = registry.profiles[profileId];
const [processProbe, listenerProbe, gpuProbe, worktreeProbe, apiKeyProbe] = await Promise.all([
  commandProbe("ps", ["-eo", "pid=,args="]),
  commandProbe("ss", ["-ltnp", "sport = :8000"]),
  commandProbe("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]),
  commandProbe("git", ["worktree", "list", "--porcelain"]),
  pathAbsent(path.join(root, ".runtime/model/api-key"))
]);

const processRows = processProbe.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
const exactModelProcessRows = processRows.filter((line) => line.includes(profile.modelId) && /vllm|launch_model_profile|multiprocessing/i.test(line));
const launcherProcessRows = processRows.filter((line) => /scripts\/(?:launch_model_profile\.py|start_model_profile\.sh)/.test(line) && !line.includes("record_patch_interface_lifecycle"));
const exactModelProcessAbsent = processProbe.ok && exactModelProcessRows.length === 0 && launcherProcessRows.length === 0;

const listenerRows = listenerProbe.stdout.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("State "));
const loopbackPort8000Clear = listenerProbe.ok && listenerRows.length === 0;

const gpuMemorySamplesMiB = gpuProbe.stdout.split("\n").map((line) => Number(line.trim())).filter(Number.isFinite);
const maximumGpuMemoryMiB = gpuMemorySamplesMiB.length ? Math.max(...gpuMemorySamplesMiB) : null;
const gpuMemoryReleased = gpuProbe.ok && maximumGpuMemoryMiB !== null && maximumGpuMemoryMiB <= 512;

const temporaryEntryNames = await readdir(os.tmpdir(), { withFileTypes: true });
const temporaryPatchInterfaceEntries = temporaryEntryNames.filter((entry) => entry.name.startsWith("dca-patch-interface-") && (entry.isDirectory() || entry.isSymbolicLink()));
const temporaryPatchInterfaceDirectoriesAbsent = temporaryPatchInterfaceEntries.length === 0;

const declaredWorktrees = worktreeProbe.stdout.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice("worktree ".length).trim());
const extraWorktrees = declaredWorktrees.filter((worktree) => path.resolve(worktree) !== root);
const extraGitWorktreesAbsent = worktreeProbe.ok && declaredWorktrees.length === 1 && extraWorktrees.length === 0;

const runtimeStateCleanup: Record<string, "REMOVED" | "ABSENT"> = {};
const runtimeStateTargets = [".runtime/model/profile-start.json", ".runtime/model/profile-launch.json", ".runtime/model/profile-ready.json"];
for (const relative of runtimeStateTargets) {
  const target = path.join(root, relative);
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) throw new Error(`Runtime serving state is unsafe: ${relative}`);
    await unlink(target);
    runtimeStateCleanup[relative] = "REMOVED";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") runtimeStateCleanup[relative] = "ABSENT";
    else throw error;
  }
}
const runtimeServingAttestationFilesAbsent = (await Promise.all(runtimeStateTargets.map(async (relative) => (await pathAbsent(path.join(root, relative))).absent))).every(Boolean);

const checks = {
  exactModelProcessAbsent,
  profileLauncherProcessAbsent: launcherProcessRows.length === 0,
  loopbackPort8000Clear,
  ephemeralApiKeyAbsent: apiKeyProbe.absent,
  gpuMemoryReleased,
  maximumGpuMemoryMiB,
  temporaryPatchInterfaceDirectoriesAbsent,
  temporaryPatchInterfaceDirectoryCount: temporaryPatchInterfaceEntries.length,
  extraGitWorktreesAbsent,
  declaredGitWorktreeCount: declaredWorktrees.length,
  runtimeServingAttestationFilesAbsent
};
const status = Object.entries(checks).filter(([key]) => !key.endsWith("Count") && key !== "maximumGpuMemoryMiB").every(([, value]) => value === true) ? "PASS" : "FAIL";
const commandEvidence = Object.fromEntries(Object.entries({ process: processProbe, listener: listenerProbe, gpu: gpuProbe, worktree: worktreeProbe }).map(([name, probe]) => [name, {
  commandSha256: probe.commandSha256,
  status: probe.ok ? "PASS" : "FAIL",
  stdoutSha256: probe.stdoutSha256,
  stderrSha256: probe.stderrSha256,
  errorSha256: probe.errorSha256
}]));
const result = {
  schemaVersion: 1,
  artifactType: "PATCH_INTERFACE_MODEL_LIFECYCLE",
  status,
  checkedAt: new Date().toISOString(),
  profileId,
  exactModel: { modelId: profile.modelId, revision: profile.revision, tokenizerRevision: profile.tokenizerRevision },
  runDirectory: relativeRunDirectory.split(path.sep).join("/"),
  checks,
  evidence: {
    commands: commandEvidence,
    statusSha256: sha256(JSON.stringify(checks)),
    apiKeyFilesystemStatusSha256: apiKeyProbe.evidenceSha256,
    matchedProcessRowHashes: [...exactModelProcessRows, ...launcherProcessRows].map((line) => sha256(line)),
    listenerRowHashes: listenerRows.map((line) => sha256(line)),
    temporaryEntryNameHashes: temporaryPatchInterfaceEntries.map((entry) => sha256(entry.name)),
    extraWorktreePathHashes: extraWorktrees.map((worktree) => sha256(worktree))
  },
  privacy: { processCommandLinesStored: false, commandOutputStored: false, apiKeyRead: false, secretsStored: false },
  protectedEffects: { modelStartedOrStopped: false, networkCalls: 0, gitMutations: 0, externalWrites: 0 },
  runtimeStateCleanup: { operation: "UNLINK_EXACT_PRIVATE_RUNTIME_STATE_FILES_BEFORE_ARTIFACT_PUBLICATION", targets: runtimeStateTargets, results: runtimeStateCleanup, verifiedAbsent: runtimeServingAttestationFilesAbsent }
};

const body = `${JSON.stringify(result, null, 2)}\n`;
await persistAtomicExact(lifecyclePath, body, 0o600);
await persistAtomicExact(sidecarPath, `${sha256(body)}  lifecycle.json\n`, 0o600);

process.stdout.write(`${JSON.stringify({ output: path.relative(root, lifecyclePath).split(path.sep).join("/"), sha256: sha256(body), status, checks, runtimeStateCleanup }, null, 2)}\n`);
if (status !== "PASS") process.exitCode = 1;
