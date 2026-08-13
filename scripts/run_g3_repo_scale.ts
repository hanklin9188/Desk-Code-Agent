import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { CodebaseIndex } from "../services/repo-intelligence/src/index";
import { buildG3Corpus } from "../services/g3-benchmark-runtime/src/index";

const root = path.resolve(process.cwd());
const experimentId = `m9-g3-repo-scale-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const manifestBytes = await readFile(path.join(root, "benchmarks/g3/g3_repository_manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8")) as { repositories: Array<{ id: string; local_directory: string; commit_sha: string; files: number; loc: number; languages: Record<string, number>; ecosystem: string }> };
const rebuilt = await buildG3Corpus(path.join(root, ".runtime/g3-repositories"));
const runtimeByRepo = new Map<string, typeof rebuilt.tasks[number]>();
for (const task of rebuilt.tasks) {
  const declared = task.declared_symbols[0]; const required = task.required_evidence_paths[0]; const candidate = task.candidates.find((item) => item.path === required);
  if (!runtimeByRepo.has(task.repository_id) && declared && candidate && /\.(?:py|js|jsx|ts|tsx)$/i.test(required) && candidate.content.includes(declared)) runtimeByRepo.set(task.repository_id, task);
}
const sortedLoc = [...manifest.repositories].sort((left, right) => left.loc - right.loc);
const bucket = new Map(sortedLoc.map((repo, index) => [repo.id, index < 8 ? "small" : index < 16 ? "medium" : "large"]));
const temporary = await mkdtemp(path.join(os.tmpdir(), "dca-g3-scale-"));
const rows: Array<Record<string, unknown>> = [];
try {
  for (const repo of manifest.repositories) {
    const repositoryRoot = path.join(root, ".runtime/g3-repositories", repo.local_directory);
    const database = path.join(temporary, `${repo.id}.sqlite`);
    const rssBefore = process.memoryUsage().rss;
    const index = new CodebaseIndex(repositoryRoot, database);
    const coldStarted = performance.now(); const cold = await index.build(repo.commit_sha); const coldMs = performance.now() - coldStarted;
    const warmStarted = performance.now(); const warm = await index.build(repo.commit_sha); const warmMs = performance.now() - warmStarted;
    const task = runtimeByRepo.get(repo.id);
    const declared = task?.declared_symbols[0];
    const definitionHits = declared ? index.findDefinition(declared).filter((definition) => definition.path === task?.required_evidence_paths[0]).length : 0;
    const databaseBytes = (await stat(database)).size;
    index.close();
    rows.push({
      repositoryId: repo.id, commit: repo.commit_sha, sizeBucket: bucket.get(repo.id), manifestFiles: repo.files, manifestLoc: repo.loc, languages: repo.languages,
      indexedFiles: cold.files, symbols: cold.symbols, references: cold.references, dependencies: cold.dependencies, parserLanguages: cold.parserLanguages,
      coldIndexMs: Number(coldMs.toFixed(3)), warmIndexMs: Number(warmMs.toFixed(3)), warmCacheHitRatio: warm.cacheHitRatio,
      databaseBytes, rssDeltaMiB: Number(((process.memoryUsage().rss - rssBefore) / 1024 / 1024).toFixed(3)), definitionProbeAvailable: Boolean(declared), definitionProbeHits: definitionHits,
      supportedByCurrentParser: ["python", "javascript"].includes(repo.ecosystem), cacheIntegrity: warm.cacheIntegrity
    });
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
const percentile = (values: number[], q: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)] ?? 0; };
const summarize = (items: Array<Record<string, unknown>>) => ({
  repositories: items.length, supportedRepositories: items.filter((row) => row.supportedByCurrentParser).length,
  totalManifestFiles: items.reduce((sum, row) => sum + Number(row.manifestFiles), 0), totalLoc: items.reduce((sum, row) => sum + Number(row.manifestLoc), 0),
  totalIndexedFiles: items.reduce((sum, row) => sum + Number(row.indexedFiles), 0), totalSymbols: items.reduce((sum, row) => sum + Number(row.symbols), 0), totalReferences: items.reduce((sum, row) => sum + Number(row.references), 0),
  coldP50Ms: percentile(items.map((row) => Number(row.coldIndexMs)), 0.5), coldP95Ms: percentile(items.map((row) => Number(row.coldIndexMs)), 0.95),
  warmP50Ms: percentile(items.map((row) => Number(row.warmIndexMs)), 0.5), warmP95Ms: percentile(items.map((row) => Number(row.warmIndexMs)), 0.95),
  cacheIntegrityPass: items.filter((row) => row.cacheIntegrity === "PASS").length,
  definitionProbeRecall: items.filter((row) => row.supportedByCurrentParser && row.definitionProbeAvailable).length ? items.filter((row) => row.supportedByCurrentParser && Number(row.definitionProbeHits) > 0).length / items.filter((row) => row.supportedByCurrentParser && row.definitionProbeAvailable).length : null
});
const summary = summarize(rows);
const unsupported = rows.filter((row) => !row.supportedByCurrentParser).map((row) => row.repositoryId);
const result = {
  schemaVersion: 2, experimentId, status: rows.every((row) => row.cacheIntegrity === "PASS") ? "PASS_WITH_SUPPORTED_LANGUAGE_BOUNDARY" : "FAIL",
  supersedesProbeDesignRun: "m9-g3-repo-scale-2026-08-09T09-42-50-849Z",
  authoringCorrection: "Revision 1 selected the last repository task, leaving 23/24 definition probes unavailable and incorrectly called repositories with incidental JS/Python helper files parser-supported. Revision 2 selects a declared symbol whose required source contains that symbol and declares support only for Python and JavaScript/TypeScript ecosystems. The immutable revision-1 artifact is preserved.",
  hypothesis: "Repository Intelligence remains correct and bounded across measured repository sizes; unsupported language adapters are reported rather than implied.",
  fixedVariables: { index: "CodebaseIndex/SQLite", parserSupport: ["Python", "TypeScript", "TSX", "JavaScript"], network: "off", repositories: 24 },
  manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"), summary,
  byBucket: Object.fromEntries(["small", "medium", "large"].map((name) => [name, summarize(rows.filter((row) => row.sizeBucket === name))])),
  unsupportedLanguageRepositories: unsupported, claimBoundary: "Measured parser/index support is Python and JS/TS only; Go, Rust, C/C++, and JVM repository scale is fingerprinted but not symbol-index validated.", rows
};
const directory = path.join(root, "docs/experiments/runs", experimentId); await mkdir(directory, { recursive: false });
await writeFile(path.join(directory, "repo-scale-result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
await writeFile(path.join(directory, "result.json"), `${JSON.stringify({ schemaVersion: 1, experimentId, status: result.status, summary, unsupportedLanguageRepositories: unsupported }, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ directory, status: result.status, summary, unsupportedLanguageRepositories: unsupported }, null, 2)}\n`);
if (result.status === "FAIL") process.exitCode = 1;
