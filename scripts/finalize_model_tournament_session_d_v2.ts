import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile), root = path.resolve(process.cwd()), finalizedAt = new Date().toISOString();
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
async function regular(relative: string) { const target = path.join(root, relative), stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not regular: ${relative}`); return readFile(target); }
async function verified(relative: string) { const bytes = await regular(relative), digest = sha256(bytes), sidecar = await regular(`${relative}.sha256`); if (sidecar.toString("utf8") !== `${digest}  ${path.basename(relative)}\n`) throw new Error(`Sidecar mismatch: ${relative}`); return { path: relative, sha256: digest, value: JSON.parse(bytes.toString("utf8")) as any }; }
async function publishBytes(relative: string, body: string) {
  const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true });
  try { const stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink() || await readFile(target, "utf8") !== body) throw new Error(`Immutable collision: ${relative}`); return; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const pending = `${target}.next.${process.pid}.${randomUUID()}`, handle = await open(pending, "wx", 0o600);
  try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
  try { await link(pending, target); } finally { await unlink(pending).catch(() => undefined); }
}
async function publish(relative: string, value: unknown) { const body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body); await publishBytes(relative, body); await publishBytes(`${relative}.sha256`, `${digest}  ${path.basename(relative)}\n`); return { path: relative, sha256: digest }; }
async function command(file: string, args: string[]) { const result = await exec(file, args, { cwd: root, timeout: 180_000, maxBuffer: 20 * 1024 * 1024 }); return { command: [file, ...args].join(" "), exitCode: 0, stdoutSha256: sha256(result.stdout), stderrSha256: sha256(result.stderr) }; }

const sessionC = await verified("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_C.v1.json");
const sessionDV1 = await verified("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_D.v1.json");
const indexV1 = await verified("docs/experiments/model-specialization/MODEL_TOURNAMENT_RESULTS_INDEX.v1.json");
if (sessionC.sha256 !== "32ff39c05b5ce6c64b57ac77085df2b5666750a8a5689d3ac801a683bd3ec683" || sessionC.value.contract.physicalPrimaryCalls !== 285) throw new Error("Session C drift");
if (sessionDV1.value.status !== "PASS" || sessionDV1.value.phases.finalRegression !== "PENDING_POST_PUBLICATION_VALIDATION" || indexV1.value.status !== "PASS_COMPLETE") throw new Error("Session D v1 supersession precondition failed");
const artifactRefs = Object.values(sessionDV1.value.artifacts) as Array<{ path: string; sha256: string }>;
for (const artifact of artifactRefs) { const actual = await verified(artifact.path); if (actual.sha256 !== artifact.sha256) throw new Error(`Session-D artifact drift: ${artifact.path}`); }

const checks = [await command("npm", ["run", "check"]), await command("npx", ["tsx", "scripts/run_patch_interface_security_regression.ts"])];
const security = await verified("docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v3.json");
if (security.value.status !== "PASS" || security.value.regressionId !== "dca-patch-action-interface-security-regression-v3") throw new Error("Security regression failed");

const evidenceFiles = [
  ...artifactRefs.map((entry) => entry.path), sessionDV1.path, indexV1.path,
  "docs/experiments/model-specialization/MODEL_TOURNAMENT_FINAL_REPORT.v1.md",
  "docs/validation/2026-08-11-practical-local-model-tournament-session-d.md",
  "adrs/0016-no-model-promoted-after-practical-7b-tournament.md",
];
const secretPattern = /(hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/;
for (const relative of evidenceFiles) if (secretPattern.test((await regular(relative)).toString("utf8"))) throw new Error(`Secret-shaped content: ${relative}`);

const { stdout: ignored } = await exec("git", ["check-ignore", ".runtime/model/huggingface/hub"], { cwd: root });
if (!ignored.trim()) throw new Error("Model cache is not Git-ignored");
const { stdout: worktrees } = await exec("git", ["worktree", "list", "--porcelain"], { cwd: root });
if (worktrees.split("\n").filter((line) => line.startsWith("worktree ")).length !== 1) throw new Error("Orphan worktree detected");
const { stdout: processes } = await exec("ps", ["-eo", "args="], { cwd: root }), { stdout: sockets } = await exec("ss", ["-ltn"], { cwd: root }), { stdout: gpu } = await exec("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { cwd: root });
const modelProcessCount = processes.split("\n").filter((line) => /vllm\.entrypoints|launch_model_tournament_candidate\.py/.test(line) && !line.includes("finalize_model_tournament_session_d_v2")).length;
const port8000Clear = !sockets.split("\n").some((line) => /(?:^|:)8000\s/.test(line)), gpuMemoryMiB = Number(gpu.trim());
const stateNames = ["tournament-api-key", "tournament-start.json", "tournament-launch.json", "tournament-ready.json"], stateAbsent = [];
for (const name of stateNames) { try { await lstat(path.join(root, ".runtime/model", name)); stateAbsent.push(false); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") stateAbsent.push(true); else throw error; } }
const tempEntries = (await readdir("/tmp")).filter((name) => name.startsWith("dca-model-tournament-"));
if (modelProcessCount || !port8000Clear || gpuMemoryMiB !== 0 || !stateAbsent.every(Boolean) || tempEntries.length) throw new Error("Runtime cleanup failed");

for (const markdown of ["docs/experiments/model-specialization/MODEL_TOURNAMENT_FINAL_REPORT.v1.md", "docs/validation/2026-08-11-practical-local-model-tournament-session-d.md"]) {
  const bytes = await regular(markdown), digest = sha256(bytes);
  await publishBytes(`${markdown}.sha256`, `${digest}  ${path.basename(markdown)}\n`);
}
const sourcePaths = [
  "services/model-tournament-analysis/src/index.ts", "scripts/finalize_model_tournament_session_d.ts", "scripts/finalize_model_tournament_session_d_v2.ts", "tests/model-tournament-analysis.test.ts",
  "docs/experiments/model-specialization/MODEL_TOURNAMENT_FINAL_REPORT.v1.md", "docs/validation/2026-08-11-practical-local-model-tournament-session-d.md", "adrs/0016-no-model-promoted-after-practical-7b-tournament.md",
  "docs/exec-plans/active/MASTER_EXECUTION_PLAN.md", "CONTEXT.md", "package.json", "package-lock.json",
];
const entries = await Promise.all(sourcePaths.map(async (relative) => { const bytes = await regular(relative); return { path: relative, sha256: sha256(bytes), bytes: bytes.byteLength }; }));
const sourceClosure = { entries, sha256: sha256(entries.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n")) };
const validation = {
  schemaVersion: 1, validationId: "dca-practical-local-model-tournament-session-d-validation-v1", status: "PASS", validatedAt: finalizedAt,
  inputs: { sessionC: { path: sessionC.path, sha256: sessionC.sha256 }, sessionDV1: { path: sessionDV1.path, sha256: sessionDV1.sha256 }, securityRegression: { path: security.path, sha256: security.sha256 } },
  checks: { commands: checks, designTypeTestBuild: "PASS", securityRegression: "PASS", artifactSidecars: "PASS", sourceClosure: "PASS", experimentLineage: "PASS_285_PRIMARY_3_TELEMETRY_855_EVENTS_ZERO_RETRY", secretScan: "PASS", modelWeightGitExclusion: "PASS", worktreeCleanup: "PASS", runtimeCleanup: "PASS" },
  sourceClosure, cleanup: { modelProcessCount, port8000Clear, gpuMemoryMiB, ephemeralApiKeyAndStateAbsent: stateAbsent.every(Boolean), temporaryDirectories: tempEntries.length, worktrees: 1 },
  sessionDModelCalls: 0,
};
const validationRef = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_D_VALIDATION.v1.json", validation);

const priorRelease = await regular("artifacts/release/release-gate.json"), releaseSupplement = {
  schemaVersion: 1, supplementId: "dca-practical-local-model-tournament-release-gate-supplement-v1", status: "STOP_SHIP_MUTATION_QUALITY", generatedAt: finalizedAt,
  priorReleaseGate: { path: "artifacts/release/release-gate.json", sha256: sha256(priorRelease) },
  evidence: { sessionC: { path: sessionC.path, sha256: sessionC.sha256 }, sessionD: { path: sessionDV1.path, sha256: sessionDV1.sha256 }, modelSelection: sessionDV1.value.artifacts.modelSelection, productDecision: sessionDV1.value.artifacts.productDecision, validation: validationRef },
  gates: { modelPromoted: false, productMutationEnabled: false, strictProductThresholdMet: false, newUntouchedProductValidation: false, M3Scored: false, deterministicSafetyRegression: true },
  stopShip: ["NO_MODEL_PROMOTED", "MUTATION_QUALITY_BELOW_PRODUCT_THRESHOLD", "NEW_REPOSITORY_DISJOINT_UNTOUCHED_PRODUCT_VALIDATION_ABSENT", "M2_LICENSE_PROVENANCE_CAVEAT", "NATIVE_WINDOWS_ACCESSIBILITY_SIGNING_AND_EXTERNAL_RELEASE_GATES_REMAIN"],
};
const releaseRef = await publish("artifacts/release/model-tournament-release-gate-supplement.v1.json", releaseSupplement);

const sessionDV2 = {
  ...sessionDV1.value,
  schemaVersion: 2,
  sessionId: "dca-practical-local-model-tournament-session-d-v2",
  completedAt: finalizedAt,
  classification: "ZERO_CALL_FINAL_ANALYSIS_DECISION_AND_REGRESSION_PASS",
  supersedes: { path: sessionDV1.path, sha256: sessionDV1.sha256, reason: "Append-only completion of the post-publication final regression gate; scientific results and decisions unchanged", modelCallsAdded: 0 },
  phases: { ...sessionDV1.value.phases, finalRegression: "PASS", durableStateUpdate: "PASS", sessionDComplete: true },
  artifacts: { ...sessionDV1.value.artifacts, validation: validationRef, releaseGateSupplement: releaseRef },
  sourceClosure,
  cleanup: { ...sessionDV1.value.cleanup, modelProcessCount, port8000Clear, gpuMemoryMiB, ephemeralApiKeyAndStateAbsent: stateAbsent.every(Boolean), worktrees: 1, temporaryDirectories: tempEntries.length },
};
const sessionDV2Ref = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_D.v2.json", sessionDV2);
const indexV2 = {
  ...indexV1.value,
  schemaVersion: 2,
  indexId: "dca-practical-local-model-tournament-results-index-v2",
  generatedAt: finalizedAt,
  supersedes: { path: indexV1.path, sha256: indexV1.sha256, reason: "Bind final Session-D v2 regression evidence; decisions unchanged", modelCallsAdded: 0 },
  sessions: { ...indexV1.value.sessions, D: sessionDV2Ref },
  artifacts: { ...indexV1.value.artifacts, validation: validationRef, releaseGateSupplement: releaseRef },
};
const indexV2Ref = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_RESULTS_INDEX.v2.json", indexV2);
process.stdout.write(`${JSON.stringify({ status: "PASS_SESSION_D_FINAL", sessionD: sessionDV2Ref, index: indexV2Ref, validation: validationRef, releaseSupplement: releaseRef, decisions: indexV2.decisions, cleanup: sessionDV2.cleanup }, null, 2)}\n`);
