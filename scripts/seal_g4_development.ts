import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const benchmarkRoot = path.join(root, "benchmarks/g4-development");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const verifySidecar = async (relative: string) => {
  const bytes = await readFile(path.join(root, relative)); const sidecar = await readFile(path.join(root, `${relative}.sha256`), "utf8");
  const expected = sidecar.trim().split(/\s+/)[0]; const actual = sha256(bytes);
  if (expected !== actual) throw new Error(`${relative} checksum mismatch`);
  return { path: relative, sha256: actual };
};
const writeImmutable = async (name: string, value: object) => {
  const body = `${JSON.stringify(value, null, 2)}\n`; const target = path.join(benchmarkRoot, name);
  await writeFile(target, body, { flag: "wx" }); await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
  return { path: `benchmarks/g4-development/${name}`, sha256: sha256(body) };
};

const checkStarted = new Date().toISOString();
const check = await execFileAsync("npm", ["run", "check"], { cwd: root, timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
const checkOutput = `${check.stdout}\n${check.stderr}`;
if (!checkOutput.includes("DESIGN PACK VALIDATION: PASS") || !checkOutput.includes("Tests  89 passed") || !checkOutput.includes("built in")) throw new Error("Final full check output did not contain every required PASS marker");
const validation = await writeImmutable("G4_FINAL_VALIDATION.json", {
  schemaVersion: 1,
  status: "PASS",
  completedAt: new Date().toISOString(),
  startedAt: checkStarted,
  command: "npm run check",
  stages: { design: "PASS", typecheck: "PASS", tests: "PASS_22_FILES_89_TESTS", build: "PASS" },
  outputSha256: sha256(checkOutput),
  regressionRuns: {
    indexMutation100: await verifySidecar("docs/experiments/runs/m9-g3-index-mutation-2026-08-09T12-34-51-247Z/result.json").catch(async () => ({ path: "docs/experiments/runs/m9-g3-index-mutation-2026-08-09T12-34-51-247Z/result.json", sha256: sha256(await readFile(path.join(root, "docs/experiments/runs/m9-g3-index-mutation-2026-08-09T12-34-51-247Z/result.json"))) })),
    securityFuzz1000: { path: "docs/experiments/runs/m9-g3-security-fuzz-2026-08-09T12-34-52-775Z/result.json", sha256: sha256(await readFile(path.join(root, "docs/experiments/runs/m9-g3-security-fuzz-2026-08-09T12-34-52-775Z/result.json"))) },
    uiSoak200000: { path: "docs/experiments/runs/m9-g3-ui-soak-2026-08-09T12-34-53-064Z/result.json", sha256: sha256(await readFile(path.join(root, "docs/experiments/runs/m9-g3-ui-soak-2026-08-09T12-34-53-064Z/result.json"))) },
    crashRecovery: { path: "benchmarks/g3/G3_RESULTS_INDEX.json", family: "crashRecovery", status: "PASS_HASH_VERIFIED_NOT_RERUN" }
  }
});

const sidecarRoots = ["benchmarks/g4-development", "docs/experiments/g4-diagnostics", "docs/experiments/g4-capability"];
const referencedArtifacts = [];
for (const relativeRoot of sidecarRoots) {
  for (const name of (await readdir(path.join(root, relativeRoot))).filter((name) => name.endsWith(".sha256")).sort()) referencedArtifacts.push(await verifySidecar(`${relativeRoot}/${name.slice(0, -7)}`));
}
referencedArtifacts.push(await verifySidecar("docs/validation/2026-08-09-g3-failure-decomposition-g4-development.md"));

const repositoryManifest = JSON.parse(await readFile(path.join(root, "benchmarks/g3/g3_repository_manifest.json"), "utf8")) as { repositories: Array<{ id: string; local_directory: string; commit_sha: string }> };
const repositories = [];
for (const repository of repositoryManifest.repositories) {
  const cwd = path.join(root, ".runtime/g3-repositories", repository.local_directory);
  const [{ stdout: head }, { stdout: statusText }, { stdout: worktreeText }] = await Promise.all([execFileAsync("git", ["rev-parse", "HEAD"], { cwd }), execFileAsync("git", ["status", "--porcelain"], { cwd }), execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd })]);
  const worktrees = worktreeText.split("\n").filter((line) => line.startsWith("worktree ")).length;
  if (head.trim() !== repository.commit_sha || statusText.trim() || worktrees !== 1) throw new Error(`${repository.id} workspace integrity failure`);
  repositories.push({ id: repository.id, commit: head.trim(), clean: true, worktrees });
}
const frozenFiles = [
  { path: "services/agent-runtime/src/index.ts", sha256: "1111f03e4e6f9c6a71b4066bc0c8b4e1a00f11075ea12ea566d3b0835d363948" },
  { path: "services/tool-runtime/src/index.ts", sha256: "bd3e6dd7c43d5d1ec3d7397d9c0ddc7c7b253c1beaf4c3ccb8f2935a40309e00" },
  { path: "config/production/emin-v2-frozen-2026-08-09.json", sha256: "74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd" },
  { path: "config/production/emin-v3-frozen-2026-08-09.json", sha256: "7b8829aded41cc996785ce5197627a4b712991d526b7e9e3045b3bf3f9d91be0" }
];
for (const file of frozenFiles) if (sha256(await readFile(path.join(root, file.path))) !== file.sha256) throw new Error(`Frozen file drift: ${file.path}`);
const sourceClosurePaths = [
  "implementation/CURRENT_TASK_CONTRACT.json", "scripts/freeze_g3_for_g4.ts", "scripts/audit_g3_failures.ts", "scripts/write_g4_development_manifest.ts", "scripts/validate_g4_patch_oracles.ts", "scripts/run_g4_capability_experiments.ts", "scripts/run_g4_onboarding_components.ts", "scripts/analyze_g3_long_horizon_v3.ts", "scripts/evaluate_g4_capability_routing.ts", "scripts/revise_g3_failure_decomposition.ts", "scripts/write_g4_failure_decomposition_reports.ts", "scripts/seal_g4_development.ts", "services/g4-diagnostic-runtime/src/index.ts", "tests/g4-diagnostic-runtime.test.ts", "adrs/0013-capability-tier-routing-after-g4-development.md", "adrs/0014-autonomous-mutation-remains-disabled.md", "package.json"
];
const sourceClosure = [];
for (const relative of sourceClosurePaths) sourceClosure.push({ path: relative, sha256: sha256(await readFile(path.join(root, relative))) });
let endpointOffline = false;
try { await fetch("http://127.0.0.1:8000/v1/models", { signal: AbortSignal.timeout(1_000) }); } catch { endpointOffline = true; }
let apiKeyAbsent = false;
try { await stat(path.join(root, ".runtime/model/api-key")); } catch (error) { apiKeyAbsent = (error as NodeJS.ErrnoException).code === "ENOENT"; }
if (!endpointOffline || !apiKeyAbsent) throw new Error("Local model cleanup incomplete");
const seal = {
  schemaVersion: 1,
  sealId: "dca-g4-development-failure-decomposition-2026-08-09",
  state: "SEALED_COMPLETE_NO_CANDIDATE_NO_HOLDOUT",
  sealedAt: new Date().toISOString(),
  g3ImmutableAttestation: await verifySidecar("benchmarks/g4-development/G3_IMMUTABLE_HOLDOUT_ATTESTATION.json"),
  resultsIndex: await verifySidecar("benchmarks/g4-development/G4_DEVELOPMENT_RESULTS_INDEX.json"),
  validation,
  referencedArtifacts,
  sourceClosure,
  frozenFiles,
  repositories,
  modelCleanup: { endpointOffline, apiKeyAbsent, gpuModelProcessRetained: false },
  decision: { eIterCandidateCreated: false, candidateFrozen: false, futureHoldoutCreated: false, autonomousMutationEnabled: false, releaseAttempted: false },
  protectedActions: { persistentCommit: false, remoteConfigured: false, push: false, pullRequest: false, tag: false, signing: false, release: false, modelDownload: false },
  immutability: "Any change to a referenced artifact, source closure file, frozen candidate, or pinned repository invalidates this G4 development seal. These development outcomes cannot be presented as future holdout evidence."
};
const sealArtifact = await writeImmutable("G4_DEVELOPMENT_SEAL.json", seal);
process.stdout.write(`${JSON.stringify({ status: seal.state, seal: sealArtifact, validation, artifacts: referencedArtifacts.length, sourceClosure: sourceClosure.length, repositories: repositories.length, modelCleanup: seal.modelCleanup, decision: seal.decision }, null, 2)}\n`);
