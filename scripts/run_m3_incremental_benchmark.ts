import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { CodebaseIndex, EvidenceStore, type CodebaseMapManifest } from "../services/repo-intelligence/src/index";

const exec = promisify(execFile);
const projectRoot = path.resolve(process.cwd());
const experimentId = `m3-incremental-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "dca-m3-benchmark-"));
const databasePath = path.join(fixtureRoot, ".index.sqlite");
const stages: Array<{ name: string; durationMs: number; manifest: CodebaseMapManifest }> = [];
const failures: Array<{ stage: string; reason: string }> = [];

async function indexStage(index: CodebaseIndex, name: string): Promise<CodebaseMapManifest> {
  const started = performance.now();
  const manifest = await index.build(`fixture-${name}`);
  stages.push({ name, durationMs: Number((performance.now() - started).toFixed(3)), manifest });
  if (manifest.cacheIntegrity !== "PASS") failures.push({ stage: name, reason: "SQLite integrity check failed" });
  return manifest;
}

async function fileHash(relative: string): Promise<string> {
  return createHash("sha256").update(await readFile(path.join(fixtureRoot, relative))).digest("hex");
}

try {
  await mkdir(path.join(fixtureRoot, "src"));
  await mkdir(path.join(fixtureRoot, "tests"));
  await mkdir(path.join(fixtureRoot, "generated"));
  await writeFile(path.join(fixtureRoot, ".gitignore"), "generated/\n.index.sqlite*\n");
  await writeFile(path.join(fixtureRoot, "src", "math.ts"), "export function add(a: number, b: number) { return a + b; }\n");
  await writeFile(path.join(fixtureRoot, "src", "config.ts"), "export function loadConfig(value: string) { return value.trim(); }\n");
  await writeFile(path.join(fixtureRoot, "src", "index.ts"), "import { add } from './math';\nimport { loadConfig } from './config';\nexport const start = () => loadConfig(String(add(1, 2)));\n");
  await writeFile(path.join(fixtureRoot, "tests", "math.test.ts"), "import { add } from '../src/math';\nexport const mathResult = add(1, 2);\n");
  await writeFile(path.join(fixtureRoot, "tests", "config.test.ts"), "import { loadConfig } from '../src/config';\nexport const configResult = loadConfig(' x ');\n");
  await exec("git", ["init", "-b", "main"], { cwd: fixtureRoot });
  await exec("git", ["add", "."], { cwd: fixtureRoot });

  const index = new CodebaseIndex(fixtureRoot, databasePath);
  const cold = await indexStage(index, "cold");
  await indexStage(index, "unchanged");

  const evidenceStore = new EvidenceStore(path.join(fixtureRoot, ".evidence.sqlite"));
  const originalMathHash = await fileHash("src/math.ts");
  evidenceStore.put({ id: "math-before", repoSha: "fixture", path: "src/math.ts", startLine: 1, endLine: 1, hash: originalMathHash, confidence: 1, excerpt: "add", reason: "benchmark stale evidence" });

  await writeFile(path.join(fixtureRoot, "src", "math.ts"), "export function add(a: number, b: number) { return Number(a) + Number(b); }\n");
  await indexStage(index, "single-file-edit");
  const staleInvalidated = evidenceStore.invalidateStale("fixture", { "src/math.ts": await fileHash("src/math.ts") });

  await writeFile(path.join(fixtureRoot, "src", "config.ts"), "export function loadConfig(value: string) { return value.trim().toLowerCase(); }\n");
  await writeFile(path.join(fixtureRoot, "src", "index.ts"), "import { add } from './math';\nimport { loadConfig } from './config';\nexport const start = () => loadConfig(String(add(2, 3)));\n");
  await indexStage(index, "multi-file-edit");

  await rename(path.join(fixtureRoot, "src", "config.ts"), path.join(fixtureRoot, "src", "settings.ts"));
  await indexStage(index, "rename");

  await unlink(path.join(fixtureRoot, "src", "math.ts"));
  await indexStage(index, "deletion");

  await writeFile(path.join(fixtureRoot, "generated", "ignored.ts"), "export const ignored = true;\n");
  const ignored = await indexStage(index, "generated-ignored-file");
  if (index.findDefinition("ignored").length !== 0) failures.push({ stage: "generated-ignored-file", reason: "Ignored file entered the index" });

  await writeFile(path.join(fixtureRoot, "src", "index.ts"), "import { loadConfig } from './settings';\nexport const start = () => loadConfig('ready');\n");
  await indexStage(index, "dependency-change");

  await rename(path.join(fixtureRoot, "tests", "config.test.ts"), path.join(fixtureRoot, "tests", "settings.test.ts"));
  await writeFile(path.join(fixtureRoot, "tests", "settings.test.ts"), "import { loadConfig } from '../src/settings';\nexport const settingsResult = loadConfig(' x ');\n");
  const final = await indexStage(index, "test-mapping-change");

  const retrievalChecks = [
    index.findDefinition("loadConfig").some((item) => item.path === "src/settings.ts"),
    index.findDefinition("start").some((item) => item.path === "src/index.ts"),
    index.findTests("src/settings.ts").some((item) => item.path === "tests/settings.test.ts"),
    index.findReverseDependencies("src/settings.ts").some((item) => item.sourcePath === "src/index.ts")
  ];
  const unresolved = index.findDependencies("tests/math.test.ts").filter((edge) => edge.kind === "UNRESOLVED").length;
  const taskManifestHash = createHash("sha256").update(JSON.stringify(stages.map((stage) => stage.name))).digest("hex");
  const result = {
    experimentId,
    status: failures.length === 0 && retrievalChecks.every(Boolean) && staleInvalidated === 1 ? "PASS" : "FAIL",
    hypothesis: "Incremental indexing reparses only changed files while preserving graph/retrieval correctness across repository mutations.",
    fixedVariables: { fixture: "dca-m3-typescript-v1", parser: "tree-sitter", index: "sqlite", network: "off" },
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpuCount: os.cpus().length },
    taskManifestHash,
    stages,
    summary: {
      coldIndexLatencyMs: stages.find((stage) => stage.name === "cold")!.durationMs,
      unchangedIndexLatencyMs: stages.find((stage) => stage.name === "unchanged")!.durationMs,
      finalIndexLatencyMs: stages.at(-1)!.durationMs,
      coldFiles: cold.files,
      ignoredStageFiles: ignored.files,
      finalSymbols: final.symbols,
      finalReferences: final.references,
      finalDependencyEdges: final.dependencies,
      staleEvidenceInvalidated: staleInvalidated,
      staleEvidenceRate: staleInvalidated,
      retrievalQueries: retrievalChecks.length,
      retrievalHits: retrievalChecks.filter(Boolean).length,
      retrievalRecallAtK: retrievalChecks.filter(Boolean).length / retrievalChecks.length,
      unresolvedDependenciesAfterDeletion: unresolved,
      peakProcessRssMiB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2))
    },
    failures,
    conclusion: failures.length === 0 && retrievalChecks.every(Boolean) && staleInvalidated === 1
      ? "Incremental cache, dependency relinking, ignore boundary, stale evidence invalidation, and post-mutation retrieval passed."
      : "One or more incremental correctness gates failed."
  };
  index.close(); evidenceStore.close();
  const runDirectory = path.join(projectRoot, "docs", "experiments", "runs", experimentId);
  await mkdir(runDirectory, { recursive: false });
  await writeFile(path.join(runDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
