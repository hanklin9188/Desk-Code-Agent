import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { inspectSnapshot, readModelSpecializationRegistry, type SnapshotFileExpectation } from "../services/model-specialization-runtime/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hashFile = async (relative: string) => sha256(await readFile(path.join(root, relative)));
const indexRelative = "docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.v2.json";
const indexBytes = await readFile(path.join(root, indexRelative));
const index = JSON.parse(indexBytes.toString("utf8")) as any;
if (index.status !== "COMPLETE_DEVELOPMENT_GATE_FAILED" || index.decision !== "C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN") throw new Error("Paired continuation result is not final");

const refs = new Map<string, string>();
function collect(value: unknown) {
  if (!value || typeof value !== "object") return;
  if ("path" in value && "sha256" in value && typeof (value as any).path === "string" && typeof (value as any).sha256 === "string") refs.set((value as any).path, (value as any).sha256);
  for (const child of Object.values(value as Record<string, unknown>)) collect(child);
}
collect(index);
refs.set(indexRelative, sha256(indexBytes));
const validationRelative = "docs/validation/2026-08-09-controlled-model-specialization-v2.md";
refs.set(validationRelative, await hashFile(validationRelative));
const reportArtifacts: Array<{ path: string; sha256: string; bytes: number }> = [];
for (const [relative, expected] of [...refs].sort(([a], [b]) => a.localeCompare(b))) {
  const bytes = await readFile(path.join(root, relative)); const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${relative} changed after result indexing`);
  reportArtifacts.push({ path: relative, sha256: actual, bytes: bytes.length });
}

const registry = await readModelSpecializationRegistry(root);
const exactModels = JSON.parse(await readFile(path.join(root, "benchmarks/model-specialization/EXACT_MODEL_MANIFESTS.json"), "utf8")) as any;
const snapshot = await inspectSnapshot(root, "coder", registry.profiles.coder, exactModels.models.coder.snapshotFiles as SnapshotFileExpectation[]);
if (snapshot.status !== "PASS") throw new Error("Candidate snapshot failed final verification");

const [{ stdout: processes }, { stdout: listeners }, { stdout: gpu }] = await Promise.all([
  execFileAsync("ps", ["-eo", "pid,args"]), execFileAsync("ss", ["-ltnp"]), execFileAsync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"])
]);
let keyPresent = true; try { await access(path.join(root, ".runtime/model/api-key")); } catch { keyPresent = false; }
const lifecycle = {
  processAbsent: !processes.split("\n").some((line) => line.includes(registry.profiles.coder.modelId) && !line.includes("seal_model_specialization_continuation")),
  portClear: !listeners.split("\n").some((line) => line.includes(":8000")),
  ephemeralApiKeyAbsent: !keyPresent,
  gpuMemoryMiB: Number(gpu.trim().split(/\s+/)[0])
};
if (!lifecycle.processAbsent || !lifecycle.portClear || !lifecycle.ephemeralApiKeyAbsent || lifecycle.gpuMemoryMiB !== 0) throw new Error("Final model lifecycle cleanup is incomplete");

const sourceFiles = [
  "config/model_specialization_profiles.json",
  "scripts/start_model_profile.sh",
  "scripts/launch_model_profile.py",
  "scripts/run_model_profile_smoke.ts",
  "scripts/verify_model_specialization_fairness.ts",
  "scripts/run_model_specialization_development.ts",
  "scripts/write_model_specialization_paired_reports.ts",
  "scripts/record_model_profile_cleanup.ts",
  "services/model-specialization-runtime/src/index.ts",
  "tests/model-specialization-runtime.test.ts"
];
const sourceClosure: Record<string, string> = {};
for (const relative of sourceFiles) sourceClosure[relative] = await hashFile(relative);

const frozenEvidence = {
  eminV2: { path: "config/production/emin-v2-frozen-2026-08-09.json", expected: "74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd" },
  agentRuntime: { path: "services/agent-runtime/src/index.ts", expected: "1111f03e4e6f9c6a71b4066bc0c8b4e1a00f11075ea12ea566d3b0835d363948" },
  toolRuntime: { path: "services/tool-runtime/src/index.ts", expected: "bd3e6dd7c43d5d1ec3d7397d9c0ddc7c7b253c1beaf4c3ccb8f2935a40309e00" },
  repoIntelligence: { path: "services/repo-intelligence/src/index.ts", expected: "087b12de9275169c447995677744fc342f2a659ff093dc0950cc09437f66119d" },
  preregistration: { path: "benchmarks/model-specialization/MODEL_SPECIALIZATION_PREREGISTRATION.json", expected: "24f7d11f33fa5d2af168335f57c870278d602849f6c52959313adea343c02f75" },
  selection: { path: "benchmarks/model-specialization/MODEL_COMPARISON_DEVELOPMENT_MANIFEST.json", expected: "844bf4e3a16a0895a3d289e0b5eaec231a376ef23d77356cbf862c3344cdb556" },
  oldResultIndex: { path: "docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.json", expected: "7b16d31fe883894484afb6c44a9aee7145d19523869d4104d431009e0f9247e4" }
};
for (const item of Object.values(frozenEvidence)) if (await hashFile(item.path) !== item.expected) throw new Error(`${item.path} immutable hash changed`);

const body = `${JSON.stringify({
  schemaVersion: 1,
  sealId: "dca-controlled-model-specialization-continuation-v2",
  sealedAt: new Date().toISOString(),
  status: "PASS_COMPLETE_DEVELOPMENT_GATE_FAILED",
  decision: "C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN",
  taskContract: { path: "implementation/CURRENT_TASK_CONTRACT.json", sha256: await hashFile("implementation/CURRENT_TASK_CONTRACT.json"), contractHash: "sha256:dca-20260809-controlled-model-specialization-v2" },
  authorization: { path: "benchmarks/model-specialization/MODEL_ACQUISITION_AUTHORIZATION.v2.json", sha256: await hashFile("benchmarks/model-specialization/MODEL_ACQUISITION_AUTHORIZATION.v2.json"), exactModelOnly: true },
  reportArtifacts,
  sourceClosure,
  frozenEvidence,
  candidateSnapshot: { ...snapshot, retainedInIgnoredRuntimeCache: true, commercialUseAuthorized: false },
  execution: {
    frozenPhaseObservationTotal: 203,
    proseObservationLabel: 205,
    taskSelectionChanged: false,
    baselineCallsComplete: true,
    candidateCallsComplete: true,
    candidateCapabilityCalls: 203,
    fairnessGate: "PASS_BEFORE_CANDIDATE_CAPABILITY_CALLS",
    developmentPromotionGate: "FAIL",
    holdoutCreatedOrInspected: false,
    routingChanged: false,
    modelSwitchBenchmarkRun: false,
    otherModelDownloaded: false,
    fullCheck: { status: "PASS", designFiles: 854, designWarnings: 0, designErrors: 0, testFiles: 23, tests: 94, typecheck: "PASS", build: "PASS" },
    deterministicSafety: { status: "PASS", cases: 1000 },
    specReview: "PASS",
    standardsReview: "PASS"
  },
  lifecycle,
  protectedActions: { authorizedCoder3bDownload: true, dependencyInstall: false, sudoAdmin: false, commit: false, remoteConfigured: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
}, null, 2)}\n`;
const target = path.join(root, "benchmarks/model-specialization/MODEL_SPECIALIZATION_SEAL.v2.json");
await writeFile(target, body, { flag: "wx" });
await writeFile(`${target}.sha256`, `${sha256(body)}  MODEL_SPECIALIZATION_SEAL.v2.json\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output: "benchmarks/model-specialization/MODEL_SPECIALIZATION_SEAL.v2.json", sha256: sha256(body), status: "PASS_COMPLETE_DEVELOPMENT_GATE_FAILED", artifacts: reportArtifacts.length, lifecycle }, null, 2)}\n`);
