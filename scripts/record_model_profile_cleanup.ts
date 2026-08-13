import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseProfileId, readModelSpecializationRegistry } from "../services/model-specialization-runtime/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const profileId = parseProfileId(process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length));
const artifactVersion = process.argv.find((value) => value.startsWith("--artifact-version="))?.slice("--artifact-version=".length) ?? "v2";
if (!/^v[23]$/.test(artifactVersion)) throw new Error("Artifact version must be v2 or v3");
const registry = await readModelSpecializationRegistry(root);
const beforePath = path.join(root, "docs/experiments/model-specialization", `${profileId.toUpperCase()}_MODEL_SMOKE_VALIDATION.${artifactVersion}.json`);
const before = JSON.parse(await readFile(beforePath, "utf8")) as { telemetry: { idleVramMiB: number } };
const keyPath = path.join(root, ".runtime/model/api-key");
const startStatePath = path.join(root, ".runtime/model/profile-start.json");
const readyStatePath = path.join(root, ".runtime/model/profile-ready.json");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
await new Promise((resolve) => setTimeout(resolve, 1_000));
const [{ stdout: processes }, { stdout: listeners }, { stdout: gpu }] = await Promise.all([
  execFileAsync("ps", ["-eo", "pid,args"], { timeout: 5_000 }),
  execFileAsync("ss", ["-ltnp"], { timeout: 5_000 }),
  execFileAsync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { timeout: 5_000 })
]);
let keyPresent = true;
try { await access(keyPath); } catch { keyPresent = false; }
const processAbsent = !processes.split("\n").some((line) => line.includes(registry.profiles[profileId].modelId) && !line.includes("record_model_profile_cleanup"));
const portClear = !listeners.split("\n").some((line) => line.includes(":8000"));
const gpuMemoryMiB = Number(gpu.trim().split(/\s+/)[0]);
const gpuReleased = gpuMemoryMiB <= Math.max(512, before.telemetry.idleVramMiB - 1_024);
const status = processAbsent && portClear && !keyPresent && gpuReleased ? "PASS" : "FAIL";
const result = { schemaVersion: 1, profileId, status, checkedAt: new Date().toISOString(), checks: { processAbsent, portClear, ephemeralApiKeyRemoved: !keyPresent, gpuReleased, gpuMemoryMiB, loadedIdleVramMiB: before.telemetry.idleVramMiB } };
const outputRoot = path.join(root, "docs/experiments/model-specialization");
await mkdir(outputRoot, { recursive: true });
const name = `${profileId.toUpperCase()}_MODEL_SHUTDOWN_CLEANUP.${artifactVersion}.json`;
const body = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(path.join(outputRoot, name), body, { flag: "wx" });
await writeFile(path.join(outputRoot, `${name}.sha256`), `${sha256(body)}  ${name}\n`, { flag: "wx" });
try { await unlink(startStatePath); } catch { /* runtime state may already be absent */ }
try { await unlink(readyStatePath); } catch { /* runtime state may already be absent */ }
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (status !== "PASS") process.exitCode = 1;
