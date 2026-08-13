import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(process.cwd());
const runtime = path.join(root, ".runtime/model");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function publish(target: string, contents: string) {
  await mkdir(path.dirname(target), { recursive: true });
  const pending = `${target}.next.${process.pid}.${randomUUID()}`;
  const handle = await open(pending, "wx", 0o600);
  try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
  try { await link(pending, target); } finally { await unlink(pending).catch(() => undefined); }
}

const stateNames = ["tournament-start.json", "tournament-launch.json"] as const;
const states: Record<string, { bytes: number; sha256: string }> = {};
for (const name of stateNames) {
  const target = path.join(runtime, name);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe state file: ${name}`);
  const bytes = await readFile(target);
  states[name] = { bytes: bytes.byteLength, sha256: sha256(bytes) };
}
const { stdout: processes } = await exec("ps", ["-eo", "args="]);
const servingProcessPresent = processes.split("\n").some((line) =>
  /launch_model_tournament_candidate|vllm\.entrypoints/.test(line) && !line.includes("record_model_tournament_precall_failure"));
const { stdout: sockets } = await exec("ss", ["-ltn"]);
const port8000Clear = !sockets.split("\n").some((line) => /(?:^|:)8000\s/.test(line));
const { stdout: gpu } = await exec("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]);
const gpuMemoryMiB = Number(gpu.trim());
let keyAbsent = false;
try { await lstat(path.join(runtime, "tournament-api-key")); } catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") keyAbsent = true; else throw error;
}
if (servingProcessPresent || !port8000Clear || gpuMemoryMiB !== 0 || !keyAbsent) {
  throw new Error("Pre-call failure cleanup is incomplete");
}
const value = {
  schemaVersion: 1,
  failureId: "dca-model-tournament-m1-precall-launch-failure-v1",
  status: "RECORDED_PRECALL_INFRASTRUCTURE_INTEGRATION_FAILURE",
  classification: "SESSION_B_NON_PRIMARY_PRECALL_DIAGNOSTIC",
  recordedAt: new Date().toISOString(),
  candidateId: "M1",
  reasonCode: "PYTHON_MULTIPROCESSING_REIMPORT_ATTESTATION_O_EXCL",
  modelEndpointCalls: 0,
  modelLoadCompleted: false,
  precisionFallback: false,
  substitutions: false,
  stateEvidence: states,
  cleanup: { servingProcessPresent, port8000Clear, gpuMemoryMiB, ephemeralApiKeyAbsent: keyAbsent },
  protectedActions: { primaryHoldoutCalls: false, otherModelDownload: false, sudo: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, release: false, signing: false }
};
const body = `${JSON.stringify(value, null, 2)}\n`;
const relative = "docs/experiments/model-specialization/tournament-session-b/M1_PRECALL_LAUNCH_FAILURE.v1.json";
const target = path.join(root, relative);
await publish(target, body);
await publish(`${target}.sha256`, `${sha256(body)}  ${path.basename(target)}\n`);
for (const name of stateNames) await unlink(path.join(runtime, name));
process.stdout.write(`${JSON.stringify({ artifact: relative, sha256: sha256(body), cleanup: value.cleanup }, null, 2)}\n`);
