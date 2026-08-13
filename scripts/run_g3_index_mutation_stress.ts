import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CodebaseIndex, EvidenceStore } from "../services/repo-intelligence/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const experimentId = `m9-g3-index-mutation-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const fixture = await mkdtemp(path.join(os.tmpdir(), "dca-g3-mutation-"));
const database = path.join(fixture, ".index.sqlite");
const evidenceDatabase = path.join(fixture, ".evidence.sqlite");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const samples: Array<Record<string, unknown>> = [];
const failures: string[] = [];
let staleInvalidated = 0;
const initialRss = process.memoryUsage().rss;
let peakRss = initialRss;
try {
  await mkdir(path.join(fixture, "src")); await mkdir(path.join(fixture, "tests"));
  await writeFile(path.join(fixture, ".gitignore"), ".index.sqlite*\n.evidence.sqlite*\n");
  await writeFile(path.join(fixture, "src/core.ts"), "export function normalize(value: string) { return value.trim(); }\n");
  await writeFile(path.join(fixture, "src/index.ts"), "import { normalize } from './core';\nexport const start = (value: string) => normalize(value);\n");
  await writeFile(path.join(fixture, "tests/core.test.ts"), "import { normalize } from '../src/core';\nexport const observed = normalize(' x ');\n");
  await execFileAsync("git", ["init", "-b", "main"], { cwd: fixture }); await execFileAsync("git", ["add", "."], { cwd: fixture });
  await execFileAsync("git", ["-c", "user.name=Desk QA", "-c", "user.email=qa@example.invalid", "commit", "-m", "baseline"], { cwd: fixture });
  const index = new CodebaseIndex(fixture, database); const evidence = new EvidenceStore(evidenceDatabase);
  await index.build("cycle-0");
  for (let cycle = 1; cycle <= 100; cycle += 1) {
    const active = cycle % 20 >= 10 ? "src/renamed.ts" : "src/core.ts";
    const other = active === "src/core.ts" ? "src/renamed.ts" : "src/core.ts";
    try { await stat(path.join(fixture, active)); } catch {
      try { await rename(path.join(fixture, other), path.join(fixture, active)); } catch { /* the delete phase recreates below */ }
    }
    const body = `export function normalize(value: string) { return value.trim().toLowerCase() + '${cycle % 7}'; }\n`;
    await writeFile(path.join(fixture, active), body);
    await writeFile(path.join(fixture, "tests/core.test.ts"), `import { normalize } from '../${active.replace(/\.ts$/, "")}';\nexport const observed = normalize(' x ');\n`);
    const currentHash = sha(body);
    evidence.put({ id: `cycle-${cycle}`, repoSha: `cycle-${cycle}`, path: active, startLine: 1, endLine: 1, hash: cycle % 3 === 0 ? "stale" : currentHash, confidence: 1, excerpt: "normalize", reason: "mutation stress" });
    staleInvalidated += evidence.invalidateStale(`cycle-${cycle}`, { [active]: currentHash });
    if (cycle % 15 === 0) {
      await unlink(path.join(fixture, active));
      await index.build(`cycle-${cycle}-delete`);
      await writeFile(path.join(fixture, active), body);
    }
    if (cycle % 25 === 0) {
      await execFileAsync("git", ["switch", "-c", `cycle-${cycle}`], { cwd: fixture });
      await writeFile(path.join(fixture, "src/index.ts"), `import { normalize } from './${path.basename(active, ".ts")}';\nexport const start = (value: string) => normalize(value);\n`);
      await index.build(`cycle-${cycle}-branch`);
      await execFileAsync("git", ["switch", "main"], { cwd: fixture });
      await writeFile(path.join(fixture, "src/index.ts"), "import { normalize } from './core';\nexport const start = (value: string) => normalize(value);\n");
      if (active !== "src/core.ts") { try { await rename(path.join(fixture, active), path.join(fixture, "src/core.ts")); } catch { /* already restored */ } }
      await writeFile(path.join(fixture, "tests/core.test.ts"), "import { normalize } from '../src/core';\nexport const observed = normalize(' x ');\n");
    }
    const manifest = await index.build(`cycle-${cycle}`);
    const definition = index.findDefinition("normalize");
    const tests = index.findTests(definition[0]?.path ?? active);
    if (manifest.cacheIntegrity !== "PASS") failures.push(`cycle ${cycle}: sqlite integrity`);
    if (definition.length !== 1) failures.push(`cycle ${cycle}: stale/duplicate definition count ${definition.length}`);
    if (tests.length === 0) failures.push(`cycle ${cycle}: source-test affinity lost`);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    if (cycle === 1 || cycle % 10 === 0) samples.push({ cycle, manifest, definitionPath: definition[0]?.path, tests: tests.length, rssMiB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)), databaseBytes: (await stat(database)).size });
  }
  const final = await index.build("cycle-final");
  index.close(); evidence.close();
  const rssGrowthMiB = Number(((peakRss - initialRss) / 1024 / 1024).toFixed(2));
  const result = {
    schemaVersion: 2, experimentId, status: failures.length ? "FAIL" : "PASS", cycles: 100,
    supersedesRejectedFixtureRun: "m9-g3-index-mutation-2026-08-09T09-43-02-648Z",
    authoringCorrection: "Revision 1 renamed the source while intentionally leaving the test import stale, then incorrectly expected source-test affinity. Revision 2 updates the test import with each rename; the immutable negative run remains preserved.",
    operations: ["edit", "rename", "delete/recreate", "branch switch", "rollback to main", "incremental index"],
    summary: { failures: failures.length, staleEvidenceInvalidated: staleInvalidated, finalIndex: final, peakRssMiB: Number((peakRss / 1024 / 1024).toFixed(2)), rssGrowthMiB, finalDatabaseBytes: (await stat(database)).size, orphanDefinitionRecords: failures.filter((failure) => failure.includes("definition")).length, sourceTestAffinityFailures: failures.filter((failure) => failure.includes("affinity")).length },
    samples, failures
  };
  const directory = path.join(root, "docs/experiments/runs", experimentId); await mkdir(directory, { recursive: false });
  await writeFile(path.join(directory, "index-mutation-stress-result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(directory, "result.json"), `${JSON.stringify({ schemaVersion: 1, experimentId, status: result.status, summary: result.summary }, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ directory, status: result.status, summary: result.summary }, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
} finally { await rm(fixture, { recursive: true, force: true }); }
