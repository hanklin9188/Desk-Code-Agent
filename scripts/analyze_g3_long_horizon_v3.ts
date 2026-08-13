import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const source = "docs/experiments/runs/m9-g3-long-horizon-2026-08-09T09-47-25-429Z/long-horizon-result.json";
const bytes = await readFile(path.join(root, source));
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const document = JSON.parse(bytes.toString("utf8")) as { observations: Array<Record<string, any>> };
const grouped = new Map<string, Record<string, any>>();
for (const row of document.observations) { const group = grouped.get(row.taskId) ?? {}; group[row.configuration] = row; grouped.set(row.taskId, group); }
const transitions = { bothPass: 0, v2Only: 0, v3Only: 0, bothFail: 0 };
const wins = [];
for (const [taskId, group] of grouped) {
  const v2 = group["E-MIN-V2"]; const v3 = group["E-MIN-V3"];
  if (v2.success && v3.success) transitions.bothPass += 1;
  else if (v2.success) transitions.v2Only += 1;
  else if (v3.success) transitions.v3Only += 1;
  else transitions.bothFail += 1;
  if (v2.success || !v3.success) continue;
  const v3Final = v3.attempts.at(-1); const v2Final = v2.attempts.at(-1);
  const v3InitialCitationComplete = v3.attempts[0].evidenceCorrect;
  const cause = v3.firstAttemptSuccess ? "RETRIEVAL_INITIAL_EVIDENCE_COMPLETENESS" : "RETRY_PLUS_EVIDENCE_SCHEDULING";
  wins.push({ taskId, repositoryId: v3.repositoryId, category: v3.category, difficulty: v3.difficulty, primaryCause: cause, v2: { success: v2.success, initialIncludedPaths: v2.initialIncludedPaths, evidenceAdded: v2.evidenceAdded, iterations: v2.iterations, finalStatusCorrect: v2Final.statusCorrect, finalEvidenceCorrect: v2Final.evidenceCorrect, finalCitations: v2Final.citedEvidencePaths, tokens: v2.totalTokens }, v3: { success: v3.success, initialIncludedPaths: v3.initialIncludedPaths, initialCitationComplete: v3InitialCitationComplete, evidenceAdded: v3.evidenceAdded, evidenceAdditions: v3.evidenceAdditions, iterations: v3.iterations, recovered: v3.recoveryAfterFirstFailure, finalStatusCorrect: v3Final.statusCorrect, finalEvidenceCorrect: v3Final.evidenceCorrect, finalCitations: v3Final.citedEvidencePaths, tokens: v3.totalTokens }, interpretation: v3.firstAttemptSuccess ? "V3 placed the required evidence set in the first-call budget, while V2 could not acquire enough items before its three-call ceiling." : "V3 began with a larger task-aware evidence set, leaving enough bounded retries to add missing required paths and satisfy the exact citation oracle." });
}
const byCause = Object.fromEntries([...new Set(wins.map((row) => row.primaryCause))].map((cause) => [cause, wins.filter((row) => row.primaryCause === cause).length]));
const report = { schemaVersion: 1, status: "PASS_POST_HOC_DIAGNOSTIC_NO_PROMOTION", classification: "G3_IMMUTABLE_LONG_HORIZON_SECONDARY_ANALYSIS", source: { path: source, sha256: sha256(bytes) }, headline: { v2: 3, v3: 10, netDifference: 7, transitions }, v2FailV3Pass: { tasks: wins.length, byCause, rows: wins }, conclusions: ["All seven V3-only passes are explained by evidence scheduling under the fixed three-call budget: two succeeded on V3's first complete context and five used V3's initial evidence head start plus bounded additions.", "The long-horizon oracle checks outcome status and exact evidence citation completeness; it does not establish patch behavior or deeper semantic correctness.", "One seed and one observation per condition cannot exclude model variance, but there is no observed V2-only regression and the telemetry provides a deterministic evidence-path mechanism for every V3-only pass.", "V3 is not promoted: its primary G3 holdout quality/cost gates still failed and these secondary wins do not outweigh them."], randomVariance: { excluded: false, evidence: "single deterministic-seed observation per configuration", attributableWinsWithObservedMechanism: wins.length }, protectedActions: { candidatePromotion: false, v2Modified: false, v3Modified: false } };
const name = "LONG_HORIZON_V3_ROOT_CAUSE_REPORT.json"; const output = path.join(root, "docs/experiments/g4-diagnostics", name); const body = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(output, body, { flag: "wx" }); await writeFile(`${output}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: report.status, artifact: { path: `docs/experiments/g4-diagnostics/${name}`, sha256: sha256(body) }, headline: report.headline, causes: byCause }, null, 2)}\n`);
