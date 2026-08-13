import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHardDevelopmentSuite, buildRetrievalDevelopmentSuite } from "../services/retrieval-benchmark-v3-runtime/src/index";

const root = path.resolve(process.cwd());
const outputRoot = path.join(root, "benchmarks/retrieval-v3");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
await mkdir(outputRoot, { recursive: true });

const suites = [
  { name: "retrieval_development", value: buildRetrievalDevelopmentSuite(), purpose: "TUNING E-MIN-V3; NEVER FRESH HOLDOUT EVIDENCE" },
  { name: "hard_development", value: buildHardDevelopmentSuite(), purpose: "L3-HEAVY DEVELOPMENT DIAGNOSIS; NEVER FRESH HOLDOUT EVIDENCE" }
] as const;

const results: Record<string, unknown>[] = [];
for (const suite of suites) {
  const manifest = serialize({ schemaVersion: 1, suiteId: suite.value.tasks[0]?.suiteId, classification: "DEVELOPMENT_TUNING_NOT_HOLDOUT", purpose: suite.purpose, taskCount: suite.value.tasks.length, hiddenRequiredEvidenceStoredIn: `${suite.name}_oracle.json`, tasks: suite.value.tasks });
  const oracle = serialize({ schemaVersion: 1, suiteId: suite.value.tasks[0]?.suiteId, classification: "DEVELOPMENT_TUNING_NOT_HOLDOUT", taskCount: suite.value.oracles.length, oracles: suite.value.oracles });
  const manifestPath = path.join(outputRoot, `${suite.name}_manifest.json`);
  const oraclePath = path.join(outputRoot, `${suite.name}_oracle.json`);
  await writeFile(manifestPath, manifest);
  await writeFile(oraclePath, oracle);
  await writeFile(`${manifestPath}.sha256`, `${sha256(manifest)}  ${path.basename(manifestPath)}\n`);
  await writeFile(`${oraclePath}.sha256`, `${sha256(oracle)}  ${path.basename(oraclePath)}\n`);
  results.push({ suite: suite.name, tasks: suite.value.tasks.length, manifestSha256: sha256(manifest), oracleSha256: sha256(oracle) });
}
process.stdout.write(`${JSON.stringify({ status: "PASS", suites: results }, null, 2)}\n`);
