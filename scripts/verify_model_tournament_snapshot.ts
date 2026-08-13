import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readdir, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const candidateId = process.argv.find((value) => value.startsWith("--candidate="))?.slice("--candidate=".length);
if (!candidateId || !["M1", "M2", "M3"].includes(candidateId)) throw new Error("Use --candidate=M1|M2|M3");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sessionAPath = "benchmarks/model-specialization/MODEL_TOURNAMENT_CANDIDATE_MANIFEST.v1.json";

async function readVerified(relative: string): Promise<{ value: any; path: string; sha256: string }> {
  const target = path.join(root, relative); const bytes = await readFile(target); const digest = sha256(bytes);
  const [a, b] = await Promise.all([lstat(target), lstat(`${target}.sha256`)]);
  if (!a.isFile() || a.isSymbolicLink() || !b.isFile() || b.isSymbolicLink() || await readFile(`${target}.sha256`, "utf8") !== `${digest}  ${path.basename(target)}\n`) throw new Error(`Invalid immutable input ${relative}`);
  return { value: JSON.parse(bytes.toString("utf8")), path: relative, sha256: digest };
}
async function fileSha256(target: string): Promise<string> {
  const digest = createHash("sha256"); const handle = await open(target, "r");
  try { for await (const chunk of handle.readableWebStream() as any) digest.update(Buffer.from(chunk)); } finally { await handle.close(); }
  return digest.digest("hex");
}
async function publish(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  try { const stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink() || await readFile(target, "utf8") !== contents) throw new Error(`Immutable collision ${target}`); return; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const pending = `${target}.next.${process.pid}.${randomUUID()}`; const handle = await open(pending, "wx", 0o600);
  try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
  try { await link(pending, target); } finally { await unlink(pending).catch(() => undefined); }
}
async function persist(relative: string, value: unknown) {
  const body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body), target = path.join(root, relative);
  await publish(target, body); await publish(`${target}.sha256`, `${digest}  ${path.basename(target)}\n`); return { path: relative, sha256: digest };
}

const manifest = await readVerified(sessionAPath);
if (manifest.sha256 !== "0ff04ada4842631ca3973b380667daa9b58f592c1b090e18b6903beb553066e1" || manifest.value.status !== "PASS_METADATA_ONLY_ACQUISITION_BLOCKED_APPROVAL") throw new Error("Session-A candidate manifest drift");
const selected = manifest.value.candidates.find((candidate: any) => candidate.candidateId === candidateId);
if (!selected) throw new Error("Candidate absent from Session-A manifest");
const cacheRoot = path.join(root, ".runtime/model/huggingface/hub", `models--${selected.modelId.replace("/", "--")}`);
const snapshot = path.join(cacheRoot, "snapshots", selected.revision);
const snapshotStat = await lstat(snapshot);
if (!snapshotStat.isDirectory() || snapshotStat.isSymbolicLink() || await realpath(snapshot) !== snapshot) throw new Error("Snapshot directory is not the exact real revision directory");

const apiUrl = `https://huggingface.co/api/models/${selected.modelId}/revision/${selected.revision}`;
const treeUrl = `https://huggingface.co/api/models/${selected.modelId}/tree/${selected.revision}?recursive=true&expand=true`;
const [apiResponse, treeResponse] = await Promise.all([fetch(apiUrl), fetch(treeUrl)]);
if (!apiResponse.ok || !treeResponse.ok) throw new Error(`Authoritative metadata unavailable: ${apiResponse.status}/${treeResponse.status}`);
const api = await apiResponse.json() as any;
const tree = await treeResponse.json() as any[];
if (api.sha !== selected.revision || api.id !== selected.modelId || api.private || api.gated || api.disabled) throw new Error("Official model identity mismatch");
if (!api.tags?.includes("license:apache-2.0") || api.library_name !== "transformers" || api.pipeline_tag !== "text-generation") throw new Error("Official license/runtime metadata mismatch");
const expectedPaths = tree.filter((entry) => entry.type === "file").map((entry) => entry.path).sort();
const localEntries = (await readdir(snapshot, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
if (localEntries.some((entry) => entry.isDirectory()) || JSON.stringify(localEntries.map((entry) => entry.name)) !== JSON.stringify(expectedPaths)) throw new Error("Snapshot file inventory differs from pinned official tree");

const inventory = [];
for (const entry of localEntries) {
  const target = path.join(snapshot, entry.name); const resolved = await realpath(target);
  if (!resolved.startsWith(`${cacheRoot}${path.sep}`)) throw new Error(`Snapshot escape ${entry.name}`);
  const stat = await lstat(resolved); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe snapshot file ${entry.name}`);
  const digest = await fileSha256(resolved);
  const official = tree.find((row) => row.path === entry.name)!;
  const expectedSha256 = official.lfs?.oid ?? null;
  if (expectedSha256 && digest !== expectedSha256) throw new Error(`LFS SHA-256 mismatch ${entry.name}`);
  if (stat.size !== official.size) throw new Error(`File size mismatch ${entry.name}`);
  inventory.push({ path: entry.name, bytes: stat.size, sha256: digest, officialGitOid: official.oid, officialLfsSha256: expectedSha256 });
}
const weights = inventory.filter((file) => file.path.endsWith(".safetensors"));
if (weights.length !== 4 || weights.reduce((sum, file) => sum + file.bytes, 0) !== selected.snapshotWeightBytes) throw new Error("Weight set mismatch");
for (const [name, expected] of [["config.json", selected.metadata.configSha256], ["generation_config.json", selected.metadata.generationConfigSha256], ["tokenizer_config.json", selected.metadata.tokenizerConfigSha256]] as const) {
  if (inventory.find((file) => file.path === name)?.sha256 !== expected) throw new Error(`${name} metadata hash mismatch`);
}
const licenseFile = inventory.find((file) => file.path === "LICENSE");
if (candidateId === "M2") {
  if (licenseFile) throw new Error("FIM pinned-tree license caveat changed; Session-A metadata requires append-only review");
  const readme = inventory.find((file) => file.path === "README.md");
  if (readme?.sha256 !== "6af7dcb90562b6ca6b9ce1025211c336d64ca7ba4c71c91f728b28764919bcb1") throw new Error("FIM provenance/model-card hash mismatch");
} else if (!licenseFile || licenseFile.sha256 !== selected.license.sha256) throw new Error("Pinned Apache-2.0 LICENSE mismatch");

const document = {
  schemaVersion: 1,
  acquisitionId: `dca-practical-local-model-tournament-${candidateId.toLowerCase()}-acquisition-v1`,
  status: candidateId === "M2" ? "PASS_IDENTITY_APACHE_METADATA_WITH_NO_STANDALONE_LICENSE" : "PASS_EXACT_AUTHORIZED_SNAPSHOT",
  classification: "SESSION_B_EXACT_BF16_SNAPSHOT_ACQUISITION",
  verifiedAt: new Date().toISOString(),
  authorizationScope: { exactModelOnly: true, modelId: selected.modelId, revision: selected.revision, sourceTensorType: "BF16", preQuantizedSnapshot: false },
  immutableInputs: { candidateManifest: { path: manifest.path, sha256: manifest.sha256 } },
  officialMetadata: { apiUrl, treeUrl, id: api.id, revision: api.sha, lastModified: api.lastModified, public: !api.private, gated: api.gated, disabled: api.disabled, library: api.library_name, pipeline: api.pipeline_tag, licenseTag: "apache-2.0", parameterCount: selected.parameterCount },
  snapshot: { relativeCache: path.relative(root, snapshot), exactRevisionDirectory: true, files: inventory.length, totalBytes: inventory.reduce((sum, file) => sum + file.bytes, 0), weightFiles: weights.length, weightBytes: weights.reduce((sum, file) => sum + file.bytes, 0), inventorySha256: sha256(inventory.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n")), inventory },
  licenseAndProvenance: candidateId === "M2" ? { declaredLicense: "apache-2.0", evidence: "official pinned HF API/model-card metadata", standaloneLicenseFile: false, caveatRetained: true, provenance: selected.training, primaryScoringAllowed: true, legalApprovalClaimed: false } : { declaredLicense: "apache-2.0", evidence: "pinned LICENSE plus official HF metadata", standaloneLicenseFile: true, licenseSha256: licenseFile!.sha256, provenance: selected.training, primaryScoringAllowed: true, legalApprovalClaimed: false },
  localIntegrity: { everyOfficialFilePresent: true, noExtraFiles: true, everyLfsSha256Matched: true, allSymlinksResolveInsideCandidateCache: true },
  protectedActions: { otherModelDownload: false, quantizedSnapshotDownload: false, dependencyInstall: false, sudo: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, release: false, signing: false }
};
const relativeOutput = `docs/experiments/model-specialization/tournament-session-b/${candidateId}_ACQUISITION.v1.json`;
const ref = await persist(relativeOutput, document);
process.stdout.write(`${JSON.stringify({ status: document.status, candidateId, modelId: selected.modelId, revision: selected.revision, files: inventory.length, weightBytes: document.snapshot.weightBytes, artifact: ref }, null, 2)}\n`);
