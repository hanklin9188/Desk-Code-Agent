import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(process.cwd());
const runtime = path.join(root, ".runtime/model");
const candidateId = process.argv.find((value) => value.startsWith("--candidate="))?.slice(12);
if (!candidateId || !["M1", "M2", "M3"].includes(candidateId)) throw new Error("Use --candidate=M1|M2|M3");
const telemetrySupplement = process.argv.includes("--telemetry-supplement");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function publish(target: string, contents: string) {
  await mkdir(path.dirname(target), { recursive: true });
  const pending = `${target}.next.${process.pid}.${randomUUID()}`;
  const handle = await open(pending, "wx", 0o600);
  try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
  try { await link(pending, target); } finally { await unlink(pending).catch(() => undefined); }
}

async function artifact(relative: string) {
  const target = path.join(root, relative);
  const [bytes, stat, sidecarStat] = await Promise.all([readFile(target), lstat(target), lstat(`${target}.sha256`)]);
  const digest = sha256(bytes);
  if (!stat.isFile() || stat.isSymbolicLink() || !sidecarStat.isFile() || sidecarStat.isSymbolicLink()) throw new Error(`Unsafe artifact ${relative}`);
  if (await readFile(`${target}.sha256`, "utf8") !== `${digest}  ${path.basename(target)}\n`) throw new Error(`Invalid sidecar ${relative}`);
  return { path: relative, sha256: digest, value: JSON.parse(bytes.toString("utf8")) as any };
}

const acquisition = await artifact(`docs/experiments/model-specialization/tournament-session-b/${candidateId}_ACQUISITION.v1.json`);
const smoke = await artifact(`docs/experiments/model-specialization/tournament-session-b/${candidateId}_SMOKE.v1.json`);
const supplement = telemetrySupplement ? await artifact(`docs/experiments/model-specialization/tournament-session-b/${candidateId}_IDLE_VRAM_SUPPLEMENT.v1.json`) : undefined;
if (acquisition.value.authorizationScope.modelId !== smoke.value.candidate.modelId || smoke.value.candidate.candidateId !== candidateId) throw new Error("Candidate evidence mismatch");
const stateNames = ["tournament-start.json", "tournament-launch.json", "tournament-ready.json"] as const;
const stateEvidence: Record<string, { bytes: number; sha256: string }> = {};
for (const name of stateNames) {
  const target = path.join(runtime, name);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe state ${name}`);
  const bytes = await readFile(target);
  stateEvidence[name] = { bytes: bytes.byteLength, sha256: sha256(bytes) };
}
const { stdout: processes } = await exec("ps", ["-eo", "args="]);
const modelProcesses = processes.split("\n").filter((line) => /launch_model_tournament_candidate|vllm\.entrypoints/.test(line) && !line.includes("record_model_tournament_cleanup"));
const { stdout: sockets } = await exec("ss", ["-ltn"]);
const port8000Clear = !sockets.split("\n").some((line) => /(?:^|:)8000\s/.test(line));
const { stdout: gpu } = await exec("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]);
const gpuMemoryMiB = Number(gpu.trim());
let keyAbsent = false;
try { await lstat(path.join(runtime, "tournament-api-key")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") keyAbsent = true; else throw error; }
if (modelProcesses.length || !port8000Clear || gpuMemoryMiB !== 0 || !keyAbsent) throw new Error("Candidate cleanup incomplete");
for (const name of stateNames) await unlink(path.join(runtime, name));
const postRemoval = await Promise.all(stateNames.map(async (name) => { try { await lstat(path.join(runtime, name)); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; } }));
if (!postRemoval.every(Boolean)) throw new Error("State removal incomplete");
const value = {
  schemaVersion: 1,
  cleanupId: `dca-practical-local-model-tournament-${candidateId.toLowerCase()}-cleanup-v1`,
  status: "PASS_FULLY_CLEANED",
  classification: "SESSION_B_SEQUENTIAL_RESIDENCY_BOUNDARY",
  completedAt: new Date().toISOString(),
  candidateId,
  inputs: { acquisition: { path: acquisition.path, sha256: acquisition.sha256 }, smoke: { path: smoke.path, sha256: smoke.sha256 }, ...(supplement ? { supplement: { path: supplement.path, sha256: supplement.sha256 } } : {}) },
  stateEvidence,
  checks: { modelProcessCount: modelProcesses.length, port8000Clear, gpuMemoryMiB, ephemeralApiKeyAbsent: keyAbsent, stateFilesRemoved: true },
  protectedActions: { primaryHoldoutCalls: false, otherModelDownload: false, sudo: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, release: false, signing: false }
};
const body = `${JSON.stringify(value, null, 2)}\n`;
const relative = `docs/experiments/model-specialization/tournament-session-b/${candidateId}_${telemetrySupplement ? "TELEMETRY_CLEANUP" : "CLEANUP"}.v1.json`;
const target = path.join(root, relative);
await publish(target, body);
await publish(`${target}.sha256`, `${sha256(body)}  ${path.basename(target)}\n`);
process.stdout.write(`${JSON.stringify({ status: value.status, artifact: { path: relative, sha256: sha256(body) }, checks: value.checks }, null, 2)}\n`);
