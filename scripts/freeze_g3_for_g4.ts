import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const g3Root = path.join(root, "benchmarks/g3");
const g4Root = path.join(root, "benchmarks/g4-development");
const runtimeRoot = path.join(root, ".runtime/g3-repositories");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const readJson = async <T>(relative: string) => JSON.parse(await readFile(path.join(root, relative), "utf8")) as T;

async function verifySidecar(relative: string) {
  const bytes = await readFile(path.join(root, relative));
  const sidecar = await readFile(path.join(root, `${relative}.sha256`), "utf8");
  const expected = sidecar.trim().split(/\s+/)[0];
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${relative}: expected ${expected}, got ${actual}`);
  return { path: relative, sha256: actual };
}

const sidecars = (await readdir(g3Root)).filter((name) => name.endsWith(".sha256")).sort();
const sealedArtifacts = [];
for (const sidecar of sidecars) sealedArtifacts.push(await verifySidecar(`benchmarks/g3/${sidecar.slice(0, -7)}`));

type ResultIndex = { selected: Record<string, { directory: string; files: Record<string, string> }> };
const resultIndex = await readJson<ResultIndex>("benchmarks/g3/G3_RESULTS_INDEX.json");
let selectedResultFiles = 0;
for (const [family, selection] of Object.entries(resultIndex.selected)) {
  for (const [name, expected] of Object.entries(selection.files)) {
    const relative = `${selection.directory}/${name}`;
    const actual = sha256(await readFile(path.join(root, relative)));
    if (actual !== expected) throw new Error(`${family}/${name}: selected result checksum mismatch`);
    selectedResultFiles += 1;
  }
}

type RepoManifest = { repositories: Array<{ id: string; local_directory: string; commit_sha: string }> };
const repositoryManifest = await readJson<RepoManifest>("benchmarks/g3/g3_repository_manifest.json");
const repositories = [];
for (const repository of repositoryManifest.repositories) {
  const cwd = path.join(runtimeRoot, repository.local_directory);
  const [{ stdout: head }, { stdout: status }, { stdout: worktrees }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd }),
    execFileAsync("git", ["status", "--porcelain"], { cwd }),
    execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd })
  ]);
  const worktreeCount = worktrees.split("\n").filter((line) => line.startsWith("worktree ")).length;
  if (head.trim() !== repository.commit_sha) throw new Error(`${repository.id}: HEAD drifted`);
  if (status.trim()) throw new Error(`${repository.id}: repository is dirty`);
  if (worktreeCount !== 1) throw new Error(`${repository.id}: expected one worktree, got ${worktreeCount}`);
  repositories.push({ id: repository.id, commit: head.trim(), clean: true, worktreeCount });
}

const candidateArtifacts = [];
for (const relative of ["config/production/emin-v2-frozen-2026-08-09.json", "config/production/emin-v3-frozen-2026-08-09.json"]) {
  const artifact = await readJson<{ candidate_id: string; repository_state: { candidate_source_closure: Array<{ path: string; sha256: string }> } }>(relative);
  const artifactHash = sha256(await readFile(path.join(root, relative)));
  for (const entry of artifact.repository_state.candidate_source_closure) {
    const actual = sha256(await readFile(path.join(root, entry.path)));
    if (actual !== entry.sha256) throw new Error(`${artifact.candidate_id}: source closure drift at ${entry.path}`);
  }
  candidateArtifacts.push({ candidateId: artifact.candidate_id, path: relative, sha256: artifactHash, sourceClosureVerified: true });
}

const resultIndexArtifact = await verifySidecar("benchmarks/g3/G3_RESULTS_INDEX.json");
const frozenRuntimeFiles = [
  { path: "services/agent-runtime/src/index.ts", sha256: "1111f03e4e6f9c6a71b4066bc0c8b4e1a00f11075ea12ea566d3b0835d363948" },
  { path: "services/tool-runtime/src/index.ts", sha256: "bd3e6dd7c43d5d1ec3d7397d9c0ddc7c7b253c1beaf4c3ccb8f2935a40309e00" }
];
for (const frozen of frozenRuntimeFiles) {
  const actual = sha256(await readFile(path.join(root, frozen.path)));
  if (actual !== frozen.sha256) throw new Error(`Frozen runtime drift at ${frozen.path}`);
}

const attestation = {
  schemaVersion: 1,
  attestationId: "dca-g3-immutable-before-g4-development-2026-08-09",
  state: "PASS_G3_IMMUTABLE_READ_ONLY",
  verifiedAt: new Date().toISOString(),
  taskContract: {
    path: "implementation/CURRENT_TASK_CONTRACT.json",
    sha256: sha256(await readFile(path.join(root, "implementation/CURRENT_TASK_CONTRACT.json"))),
    requestAttachmentSha256: "4788bbae7b186b2e03925ecb97dee48319d4d697817f2228043a093fa7491673"
  },
  g3: {
    sealedArtifacts,
    resultIndex: resultIndexArtifact,
    selectedResultFamilies: Object.keys(resultIndex.selected).length,
    selectedResultFiles,
    repositories,
    candidates: candidateArtifacts,
    frozenRuntimeFiles,
    policy: "All G3 manifests, oracles, results, scorers, repository states, E-MIN-V2, and E-MIN-V3 are read-only evidence. G3 outcomes may be diagnosed but cannot tune a candidate."
  },
  privacy: {
    historicalModelResponses: "HASH_ONLY_WHERE_ORIGINALLY_REDACTED",
    reconstruction: "PROHIBITED",
    retroactiveUnavailableFields: "NOT_AVAILABLE_NOT_INFERRED"
  },
  protectedActions: { commit: false, push: false, pullRequest: false, tag: false, signing: false, release: false, modelDownload: false }
};
const body = `${JSON.stringify(attestation, null, 2)}\n`;
const target = path.join(g4Root, "G3_IMMUTABLE_HOLDOUT_ATTESTATION.json");
await writeFile(target, body, { flag: "wx" });
await writeFile(`${target}.sha256`, `${sha256(body)}  G3_IMMUTABLE_HOLDOUT_ATTESTATION.json\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: attestation.state, target: path.relative(root, target), sha256: sha256(body), sealedArtifacts: sealedArtifacts.length, selectedResultFiles, repositories: repositories.length, candidates: candidateArtifacts.length }, null, 2)}\n`);
