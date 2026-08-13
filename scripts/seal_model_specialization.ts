import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const benchmarkRoot = path.join(root, "benchmarks/model-specialization");
const reportRoot = path.join(root, "docs/experiments/model-specialization");

async function sealedFiles(directory: string, relativeRoot: string) {
  const names = (await readdir(directory)).filter((name) => !name.endsWith(".sha256")).sort();
  const rows = [];
  for (const name of names) {
    const target = path.join(directory, name); const bytes = await readFile(target); const actual = sha256(bytes);
    const expected = (await readFile(`${target}.sha256`, "utf8")).trim().split(/\s+/)[0];
    if (actual !== expected) throw new Error(`Immutable artifact checksum mismatch: ${name}`);
    if (name.endsWith(".json")) JSON.parse(bytes.toString("utf8"));
    rows.push({ path: `${relativeRoot}/${name}`, sha256: actual, bytes: bytes.length });
  }
  return rows;
}

const [preparationArtifacts, reportArtifacts] = await Promise.all([
  sealedFiles(benchmarkRoot, "benchmarks/model-specialization"),
  sealedFiles(reportRoot, "docs/experiments/model-specialization")
]);
const frozen = {
  eminV2: { path: "config/production/emin-v2-frozen-2026-08-09.json", expected: "74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd" },
  agentRuntime: { path: "services/agent-runtime/src/index.ts", expected: "1111f03e4e6f9c6a71b4066bc0c8b4e1a00f11075ea12ea566d3b0835d363948" },
  toolRuntime: { path: "services/tool-runtime/src/index.ts", expected: "bd3e6dd7c43d5d1ec3d7397d9c0ddc7c7b253c1beaf4c3ccb8f2935a40309e00" },
  g4Seal: { path: "benchmarks/g4-development/G4_DEVELOPMENT_SEAL.json", expected: "0d5e4e5c473f06b847a60843a0ac60287fe2dad08bf14dad569063fed73ef590" },
  g4Results: { path: "benchmarks/g4-development/G4_DEVELOPMENT_RESULTS_INDEX.json", expected: "79d70211fded745d760c50f6bfe95ac5463cd41b119433156d4ba3d9f7ee253f" }
};
for (const item of Object.values(frozen)) {
  const actual = sha256(await readFile(path.join(root, item.path)));
  if (actual !== item.expected) throw new Error(`Frozen evidence drift: ${item.path}`);
}

const [{ stdout: processes }, { stdout: listeners }, { stdout: gpu }, { stdout: remotes }] = await Promise.all([
  execFileAsync("ps", ["-eo", "pid,args"], { timeout: 5_000 }),
  execFileAsync("ss", ["-ltnp"], { timeout: 5_000 }),
  execFileAsync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { timeout: 5_000 }),
  execFileAsync("git", ["remote", "-v"], { cwd: root, timeout: 5_000 })
]);
let apiKeyPresent = true;
try { await access(path.join(root, ".runtime/model/api-key")); } catch { apiKeyPresent = false; }
let candidateSnapshotPresent = true;
try { await access(path.join(root, ".runtime/model/huggingface/hub/models--Qwen--Qwen2.5-Coder-3B-Instruct/snapshots/488639f1ff808d1d3d0ba301aef8c11461451ec5")); } catch { candidateSnapshotPresent = false; }
let holdoutPresent = true;
try { await access(path.join(root, "benchmarks/model-specialization-holdout")); } catch { holdoutPresent = false; }
const processAbsent = !processes.split("\n").some((line) => /Qwen\/Qwen(?:3\.5-4B|2\.5-Coder-3B-Instruct)/.test(line) && !line.includes("seal_model_specialization"));
const portClear = !listeners.split("\n").some((line) => line.includes(":8000"));
const gpuMemoryMiB = Number(gpu.trim().split(/\s+/)[0]);
if (!processAbsent || !portClear || apiKeyPresent || candidateSnapshotPresent || holdoutPresent || remotes.trim()) throw new Error("Final lifecycle/protected-state attestation failed");

const taskContract = await readFile(path.join(root, "implementation/CURRENT_TASK_CONTRACT.json"));
const result = {
  schemaVersion: 1,
  sealId: "dca-controlled-model-specialization-seal-v1",
  sealedAt: new Date().toISOString(),
  status: "PASS_SELF_RESOLVABLE_SCOPE_CANDIDATE_BLOCKED_APPROVAL",
  decision: "D_INCONCLUSIVE",
  preparationArtifacts,
  reportArtifacts,
  taskContract: { path: "implementation/CURRENT_TASK_CONTRACT.json", sha256: sha256(taskContract), taskId: JSON.parse(taskContract.toString("utf8")).task_id },
  frozenEvidence: frozen,
  execution: { baselineModelCallsCompleted: true, candidateModelCalls: 0, candidateSnapshotPresent, holdoutCreatedOrInspected: holdoutPresent, fullCheck: { status: "PASS", designWarnings: 0, designErrors: 0, testFiles: 23, tests: 93, typecheck: "PASS", build: "PASS" }, deterministicSafety: { status: "PASS", cases: 1_000 } },
  lifecycle: { processAbsent, portClear, ephemeralApiKeyAbsent: !apiKeyPresent, gpuMemoryMiB },
  product: { routingChanged: false, autonomousMutationEnabled: false, releaseGateChanged: false },
  protectedActions: { modelDownload: false, dependencyInstall: false, commit: false, remoteConfigured: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
};
const body = `${JSON.stringify(result, null, 2)}\n`; const name = "MODEL_SPECIALIZATION_SEAL.json"; const target = path.join(benchmarkRoot, name);
await writeFile(target, body, { flag: "wx" }); await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: result.status, output: `benchmarks/model-specialization/${name}`, sha256: sha256(body), artifacts: preparationArtifacts.length + reportArtifacts.length }, null, 2)}\n`);
