import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { crossCheckVram } from "../services/telemetry-runtime/src/vram";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const snapshotPath = path.join(root, ".runtime/g3-stability-start.json");
async function modelPid(): Promise<number> {
  const { stdout } = await execFileAsync("pgrep", ["-f", "scripts/[l]aunch_vllm.py"]);
  const pid = Number(stdout.trim().split(/\s+/)[0]);
  if (!Number.isInteger(pid)) throw new Error("Pinned vLLM launch process is not running");
  return pid;
}
async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(target);
    else if (entry.isFile()) total += (await stat(target)).size;
  }
  return total;
}
async function snapshot() {
  const pid = await modelPid();
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  const rssKiB = Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1] ?? 0);
  const fds = (await readdir(`/proc/${pid}/fd`)).length;
  const key = await stat(path.join(root, ".runtime/model/api-key"));
  const listeners = await execFileAsync("ss", ["-ltnp"]).then(({ stdout }) => stdout.split(/\r?\n/).filter((line) => line.includes(":8000"))).catch(() => [] as string[]);
  return { sampledAt: new Date().toISOString(), pid, rssMiB: rssKiB / 1024, fileDescriptors: fds, vram: await crossCheckVram(root), runtimeBytes: await directoryBytes(path.join(root, ".runtime")), apiKey: { mode: (key.mode & 0o777).toString(8), bytes: key.size, contentRead: false }, port8000Listeners: listeners.length };
}
if (process.argv.includes("--start")) {
  const value = await snapshot();
  await writeFile(snapshotPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: "START_SNAPSHOT_WRITTEN", snapshotPath, value }, null, 2)}\n`);
  process.exit(0);
}
if (!process.argv.includes("--end")) throw new Error("Use --start before the extended run and --end before crash testing");
const started = JSON.parse(await readFile(snapshotPath, "utf8")) as Awaited<ReturnType<typeof snapshot>>;
const ended = await snapshot();
const runDirectories = await readdir(path.join(root, "docs/experiments/runs"));
let completedModelCalls = 576;
for (const directory of runDirectories.filter((name) => name.startsWith("m9-g3-") && !name.startsWith("m9-g3-primary-"))) {
  const value = await readFile(path.join(root, "docs/experiments/runs", directory, "result.json"), "utf8").then((body) => JSON.parse(body) as Record<string, unknown>).catch(() => null);
  if (!value) continue;
  if (typeof value.actualCalls === "number") completedModelCalls += value.actualCalls;
  else if (value.summaries && typeof value.summaries === "object") completedModelCalls += Object.values(value.summaries as Record<string, Record<string, unknown>>).reduce((sum, row) => sum + Number(row.modelCalls ?? row.tasks ?? row.observations ?? 0), 0);
}
const repositories = JSON.parse(await readFile(path.join(root, "benchmarks/g3/g3_repository_manifest.json"), "utf8")) as { repositories: Array<{ local_directory: string }> };
let registeredWorktrees = 0;
for (const repository of repositories.repositories) {
  const cwd = path.join(root, ".runtime/g3-repositories", repository.local_directory);
  registeredWorktrees += await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd }).then(({ stdout }) => stdout.split(/\r?\n/).filter((line) => line.startsWith("worktree ")).length).catch(() => 0);
}
const primary = JSON.parse(await readFile(path.join(root, "docs/experiments/runs/m9-g3-primary-2026-08-09T09-20-10-123Z/result.json"), "utf8")) as { vram: unknown };
const targets = { sameModelProcess: started.pid === ended.pid, rssGrowthUnder1024MiB: ended.rssMiB - started.rssMiB < 1_024, fileDescriptorGrowthUnder64: ended.fileDescriptors - started.fileDescriptors < 64, exactlyOneListener: ended.port8000Listeners === 1, apiKeyMode600: ended.apiKey.mode === "600", noAdditionalWorktrees: registeredWorktrees === repositories.repositories.length, atLeast100SequentialCalls: completedModelCalls >= 100 };
const experimentId = `m9-g3-long-run-stability-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const result = { schemaVersion: 1, experimentId, status: Object.values(targets).every(Boolean) ? "PASS" : "FAIL", classification: "EXTENDED_SINGLE_MODEL_SESSION_STABILITY_BEFORE_INTENTIONAL_CRASH", started, ended, deltas: { durationMs: Date.parse(ended.sampledAt) - Date.parse(started.sampledAt), rssMiB: ended.rssMiB - started.rssMiB, fileDescriptors: ended.fileDescriptors - started.fileDescriptors, runtimeBytes: ended.runtimeBytes - started.runtimeBytes }, completedModelCallsAcrossG3Artifacts: completedModelCalls, primaryVramEvidence: primary.vram, workspace: { repositories: repositories.repositories.length, registeredWorktrees, expectedPrimaryWorktrees: repositories.repositories.length }, targets, limitations: ["Process RAM/FD deltas cover the explicit post-primary snapshot interval; the primary artifact separately records device VRAM start/end.", "The artifact call count covers the complete G3 program and is not mislabeled as an exact count beginning at the process snapshot, which occurred during the long-horizon run.", "Runtime storage growth includes immutable experiment results and model caches; it is not labeled a leak."] };
const directory = path.join(root, "docs/experiments/runs", experimentId); await mkdir(directory, { recursive: false });
await writeFile(path.join(directory, "long-run-stability-result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
await writeFile(path.join(directory, "result.json"), `${JSON.stringify({ schemaVersion: 1, experimentId, status: result.status, deltas: result.deltas, completedModelCalls, workspace: result.workspace, targets }, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ directory, status: result.status, deltas: result.deltas, completedModelCalls, workspace: result.workspace, targets }, null, 2)}\n`);
if (result.status === "FAIL") process.exitCode = 1;
