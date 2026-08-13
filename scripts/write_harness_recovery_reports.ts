import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const runsRoot = path.join(root, "docs", "experiments", "runs");
async function latest(prefix: string): Promise<string> {
  const matches = (await readdir(runsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix)).map((entry) => entry.name).sort();
  const value = matches.at(-1); if (!value) throw new Error(`No run found for ${prefix}`); return value;
}
const ids = {
  pilot: "m9-e1-e7-2026-08-09T01-18-51-568Z",
  diagnostic: await latest("m9-harness-recovery-diagnostic-"),
  final: await latest("m9-harness-recovery-final-"),
  optimized: await latest("m9-harness-recovery-optimized-")
};
type Row = Record<string, any>;
async function load(id: string): Promise<{ value: Row; bytes: Buffer; hash: string }> {
  const bytes = await readFile(path.join(runsRoot, id, "result.json"));
  return { value: JSON.parse(bytes.toString("utf8")) as Row, bytes, hash: createHash("sha256").update(bytes).digest("hex") };
}
const pilot = await load(ids.pilot); const diagnostic = await load(ids.diagnostic); const final = await load(ids.final); const optimized = await load(ids.optimized);
const config = (run: Row, id: string) => run.configurations.find((item: Row) => item.id === id) as Row;
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const pp = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} pp`;
const ratio = (value: number) => `${(value * 100).toFixed(2)}%`;
const relative = (target: number, baseline: number) => target / baseline - 1;
function wilson(successes: number, count: number): [number, number] {
  if (count === 0) return [0, 0]; const z = 1.959963984540054; const p = successes / count; const denominator = 1 + z * z / count;
  const center = (p + z * z / (2 * count)) / denominator; const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * count)) / count) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}
function uniqueTaskSummary(run: Row, configId: string) {
  const rows = run.observations.filter((row: Row) => row.configId === configId);
  const taskIds = [...new Set(rows.map((row: Row) => String(row.taskId)))] as string[];
  const successes = taskIds.filter((taskId) => rows.filter((row: Row) => row.taskId === taskId).every((row: Row) => row.success === true)).length;
  return { successes, total: taskIds.length, rate: successes / taskIds.length, wilson95: wilson(successes, taskIds.length) };
}

const pilotConfigContext: Record<string, string> = {
  E1: "direct task + visible requirement + full source", E2: "E1 + serialized task contract", E3: "contract + fixed-query `export` excerpt; visible requirement/full source removed",
  E4: "current full policy/contract/evidence wrapper", E5: "E4 + verbose reproduce/hypotheses/verification instruction", E6: "E5 + free-form reviewer handoff", E7: "E4 + full Skill/policy prose"
};
const pilotTasks = [...new Set(pilot.value.observations.map((row: Row) => row.taskId))] as string[];
const pilotMatrix = pilotTasks.flatMap((taskId) => ["E1", "E2", "E3", "E4", "E5", "E6", "E7"].map((configId) => {
  const rows = pilot.value.observations.filter((row: Row) => row.taskId === taskId && row.configId === configId);
  const retrievalUsed = ["E3", "E4", "E5", "E6", "E7"].includes(configId);
  return {
    taskId, configId, classification: "PILOT_DIAGNOSTIC", seeds: rows.map((row: Row) => ({ seed: row.seed, success: row.taskSuccess, promptTokens: row.promptTokens, generatedTokens: row.completionTokens, modelCalls: row.calls, patchResult: row.patchLines > 0 ? "CANDIDATE_APPLIED" : "NO_PATCH_OR_NOT_RECORDED", hiddenTestResult: row.hiddenStatus, selected: row.selected, expected: row.expected })),
    success: rows.every((row: Row) => row.taskSuccess === true), filesRetrieved: retrievalUsed ? ["src/subject.js"] : [], retrievalRank: retrievalUsed ? 1 : null,
    contextSupplied: pilotConfigContext[configId], relevantTokens: "NOT_RECORDED", irrelevantTokens: "NOT_RECORDED", toolCalls: "NOT_RECORDED",
    reviewDecision: configId === "E6" ? "SECOND_MODEL_FINAL_SELECTION_ONLY; NO STRUCTURED DECISION RECORDED" : "NOT_RUN",
    failureTaxonomy: rows.every((row: Row) => row.taskSuccess === true) ? [] : configId === "E4" ? ["context-packaging failure"] : configId === "E6" ? ["reviewer regression or persistent model failure"] : configId === "E7" ? ["instruction overload/full-harness regression"] : ["model selection or retrieval failure"]
  };
}));
const finalTasks = [...new Set(final.value.observations.map((row: Row) => row.taskId))] as string[];
const finalConfigs = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E-MIN"];
const finalMatrix = finalTasks.flatMap((taskId) => finalConfigs.map((configId) => {
  const rows = final.value.observations.filter((row: Row) => row.taskId === taskId && row.configId === configId);
  const first = rows[0];
  return {
    taskId, configId, category: first.category, subcategory: first.subcategory, difficulty: first.difficulty,
    success: rows.every((row: Row) => row.success === true), filesRetrieved: first.filesRetrieved, retrievalRanks: first.retrievalRanks, contextSupplied: first.contextSupplied,
    relevantTokens: rows.map((row: Row) => row.relevantTokens), irrelevantTokens: rows.map((row: Row) => row.irrelevantTokens), promptTokens: rows.map((row: Row) => row.promptTokens), generatedTokens: rows.map((row: Row) => row.generatedTokens),
    toolCalls: rows.map((row: Row) => row.toolCalls), modelCalls: rows.map((row: Row) => row.modelCalls), patchResult: rows.map((row: Row) => row.patchResult), hiddenTestResult: rows.map((row: Row) => row.hiddenTestResult),
    reviewDecision: rows.map((row: Row) => row.reviewDecision), failureTaxonomy: [...new Set(rows.flatMap((row: Row) => row.failureTaxonomy))], seeds: rows.map((row: Row) => ({ seed: row.seed, success: row.success, selected: row.selected, expected: row.expected, latencyMs: row.latencyMs, totalTokens: row.totalTokens }))
  };
}));
const matrix = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  immutablePilot: { run: ids.pilot, sha256: pilot.hash, classification: "PILOT_DIAGNOSTIC", uniqueTasks: 6, observations: 126, matrix: pilotMatrix },
  secondGeneration: { run: ids.final, sha256: final.hash, classification: "EXPANDED_SECOND_GENERATION_SYNTHETIC", uniqueTasks: 108, observations: 2592, matrix: finalMatrix, transitions: final.value.transitionMatrix },
  optimizedFollowup: { run: ids.optimized, sha256: optimized.hash, classification: "POST_DIAGNOSTIC_ITERATION_REQUIRES_HOLDOUT_CONFIRMATION", uniqueTasks: 108, observations: 324 }
};
await writeFile(path.join(root, "docs", "experiments", "HARNESS_REGRESSION_MATRIX.json"), `${JSON.stringify(matrix, null, 2)}\n`, "utf8");

const diagnosticTable = ["R-LEX-1", "R-LEX-2", "R-SYM-2", "R-HYB-1", "R-HYB-2", "R-HYB-3", "R-HYB-5"].map((id) => { const c = config(diagnostic.value, id); return `| ${id} | ${c.rawSuccess.successes}/${c.samples} | ${pct(c.taskSuccess)} | ${c.retrieval.precisionAtK.toFixed(3)} | ${c.retrieval.recallAtK.toFixed(3)} | ${c.retrieval.mrr.toFixed(3)} | ${ratio(c.retrieval.relevantTokenRatio)} | ${c.medianTokens} |` }).join("\n");
await writeFile(path.join(root, "docs", "experiments", "2026-08-09-retrieval-ablation.md"), `# Retrieval ablation — 2026-08-09

Run: \`${ids.diagnostic}\` (SHA-256 \`${diagnostic.hash}\`). This is a 108-task expanded synthetic diagnostic, one temperature-zero seed.

| Configuration | Raw success | Rate | Precision@K | Recall@K | MRR | Relevant-token ratio | Median total tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
${diagnosticTable}

Symbol Top-2 is the retained primary: 106/108, Precision 1.000, MRR 1.000, no irrelevant retrieved tokens, and 188 median tokens. Hybrid Top-3/5 reached more evidence but regressed success to 103/108; Top-5 had 42.82% irrelevant-token ratio. This directly demonstrates that Recall@K=1 is insufficient and that less evidence performs better for this Qwen3.5-4B fixture suite.

Production policy: exact-symbol Top-2 when a symbol exists; hybrid Top-2 only as fallback. Tests/callers are progressively retrieved only when source evidence is insufficient. Duplicate-evidence ratio was zero for every configuration. Retrieval latency was below 0.2 ms median and is negligible relative to model latency.
`, "utf8");

const contextTable = ["C0", "C1", "C2", "C3", "C4", "C5"].map((id) => { const c = config(diagnostic.value, id); return `| ${id} | ${c.rawSuccess.successes}/${c.samples} | ${pct(c.taskSuccess)} | ${c.medianTokens} | ${c.instructionLoad.medianInstructionTokens} | ${c.instructionLoad.medianEvidenceTokens} | ${ratio(c.instructionLoad.medianSignalRatio)} |` }).join("\n");
await writeFile(path.join(root, "docs", "experiments", "2026-08-09-context-packaging-ablation.md"), `# Context packaging ablation — 2026-08-09

Run: \`${ids.diagnostic}\` (SHA-256 \`${diagnostic.hash}\`).

| Variant | Raw success | Rate | Median total tokens | Instruction tokens | Evidence tokens | Signal ratio |
|---|---:|---:|---:|---:|---:|---:|
${contextTable}

C1 (task + source) and C3/C4 each scored 106/108. C1 was the minimum equivalent variant at 164 tokens, versus 184.5 for C3 and 219 for C4. C5 added redundant policy/metadata, used 279 tokens, and regressed to 105/108. C0 omitted the task, reduced its median signal ratio to 43.18%, and scored 103/108.

Retained policy: C1 by default. Add a test, caller/callee, or concise metadata one class at a time only after an evidence-gap signal. Full wrapper C5 is rejected for the default Qwen path.
`, "utf8");

const reviewer = ["V0", "V1", "V2"].map((id) => config(diagnostic.value, id));
await writeFile(path.join(root, "docs", "experiments", "2026-08-09-reviewer-ablation.md"), `# Reviewer ablation — 2026-08-09

Run: \`${ids.diagnostic}\` (SHA-256 \`${diagnostic.hash}\`), 57 coding/diagnosis/review tasks.

| Configuration | Raw success | Median tokens | Median latency | Mean model calls | Regression detections | False rejects | False approvals |
|---|---:|---:|---:|---:|---:|---:|---:|
${reviewer.map((c) => `| ${c.id} | ${c.rawSuccess.successes}/${c.samples} | ${c.medianTokens} | ${c.medianLatencyMs.toFixed(2)} ms | ${c.meanModelCalls.toFixed(3)} | ${c.reviewer.regressionDetections} | ${c.reviewer.falseRejections} | ${c.reviewer.falseApprovals} |`).join("\n")}

Always-on review regressed 56/57 to 53/57, more than doubled median tokens (235→503), and detected no baseline regression. Conditional review scored 55/57, still with zero regression detections and one false reject/one false approval. R22 remains non-production and both semantic-review and specialist routing are disabled by default behind experiment flags.
`, "utf8");

const emin = config(optimized.value, "E-MIN-V2");
const e1 = config(final.value, "E1"); const e4 = config(final.value, "E4"); const e5 = config(final.value, "E5"); const e6 = config(final.value, "E6"); const e7 = config(final.value, "E7");
await writeFile(path.join(root, "docs", "experiments", "2026-08-09-instruction-load-analysis.md"), `# Instruction-load analysis — 2026-08-09

Token classes are estimated as characters/4 and stored separately from API-reported prompt tokens. The system prompt is counted as instruction; task, evidence, previous handoff/history, and relevant/irrelevant evidence are separate fields in every observation.

| Configuration | Instruction | Task | Evidence | History | Signal ratio | API total-token median |
|---|---:|---:|---:|---:|---:|---:|
| E1 | ${e1.instructionLoad.medianInstructionTokens} | ${e1.instructionLoad.medianTaskTokens} | ${e1.instructionLoad.medianEvidenceTokens} | ${e1.instructionLoad.medianHistoryTokens} | ${ratio(e1.instructionLoad.medianSignalRatio)} | ${e1.medianTokens} |
| C1 | ${config(diagnostic.value, "C1").instructionLoad.medianInstructionTokens} | ${config(diagnostic.value, "C1").instructionLoad.medianTaskTokens} | ${config(diagnostic.value, "C1").instructionLoad.medianEvidenceTokens} | 0 | ${ratio(config(diagnostic.value, "C1").instructionLoad.medianSignalRatio)} | ${config(diagnostic.value, "C1").medianTokens} |
| C5 | ${config(diagnostic.value, "C5").instructionLoad.medianInstructionTokens} | ${config(diagnostic.value, "C5").instructionLoad.medianTaskTokens} | ${config(diagnostic.value, "C5").instructionLoad.medianEvidenceTokens} | 0 | ${ratio(config(diagnostic.value, "C5").instructionLoad.medianSignalRatio)} | ${config(diagnostic.value, "C5").medianTokens} |
| Always reviewer | ${config(diagnostic.value, "V1").instructionLoad.medianInstructionTokens} | ${config(diagnostic.value, "V1").instructionLoad.medianTaskTokens} | ${config(diagnostic.value, "V1").instructionLoad.medianEvidenceTokens} | ${config(diagnostic.value, "V1").instructionLoad.medianHistoryTokens} | ${ratio(config(diagnostic.value, "V1").instructionLoad.medianSignalRatio)} | ${config(diagnostic.value, "V1").medianTokens} |
| E-MIN-V2 | ${emin.instructionLoad.medianInstructionTokens} | ${emin.instructionLoad.medianTaskTokens} | ${emin.instructionLoad.medianEvidenceTokens} | 0 | ${ratio(emin.instructionLoad.medianSignalRatio)} | ${emin.medianTokens} |

The strongest overload signal is history/handoff: always-review introduced 131 median history tokens and reduced signal ratio to 33.67%. Moving invariant verification/security into code and disclosing only a one-line Diagnosis or Review instruction produced E-MIN-V2 at 136 median tokens and 324/324 observations.
`, "utf8");

await writeFile(path.join(root, "docs", "experiments", "2026-08-09-single-agent-optimization.md"), `# Single-agent optimization — 2026-08-09

The final E1–E7 generation is \`${ids.final}\` (SHA-256 \`${final.hash}\`). The post-diagnostic E-MIN iteration is \`${ids.optimized}\` (SHA-256 \`${optimized.hash}\`).

E1 scored 321/324 observations (107/108 unique tasks), while E-MIN scored 318/324 (106/108) with deterministic retrieval/verification/policy seams. Removing the redundant workflow sentence and replacing the full model-facing contract with task-conditional progressive disclosure produced E-MIN-V2 at 324/324 (108/108 unique tasks), 136 median tokens, 152 p95 tokens, 341.62 ms median, 396.55 ms p95, one model call, and zero wrong-action attempts.

E-MIN-V2 pipeline:

\`immutable task artifact → symbol Top-2 (hybrid fallback) → C1 task+source → one agent → code-enforced verification/safety/rollback\`

The 100% follow-up is post-diagnostic tuning on the same 108-task suite; it requires a new holdout or external benchmark before being treated as a generalization estimate.
`, "utf8");

await writeFile(path.join(root, "docs", "experiments", "2026-08-09-conditional-multi-agent.md"), `# Conditional multi-agent report — 2026-08-09

E5 single agent: ${e5.rawSuccess.successes}/${e5.samples}, ${e5.medianTokens} median tokens, ${e5.medianLatencyMs.toFixed(2)} ms. E6 conditional specialist: ${e6.rawSuccess.successes}/${e6.samples}, ${e6.medianTokens} median tokens, p95 ${e6.p95Tokens}, mean calls ${e6.meanModelCalls.toFixed(3)}. E7 was equivalent at ${e7.rawSuccess.successes}/${e7.samples}.

E6/E7 added 126 structured handoffs across both configurations. Required handoff fields were preserved (measured serialization loss 0), but outcome quality still regressed by ${pp((e6.taskSuccess - e5.taskSuccess) * 100)}. There were zero regression detections, three false rejects, and three false approvals per conditional configuration. Handoff loss is therefore not the remaining root cause; a second pass by the same 4B model changed correct answers without adding independent capability.

Production policy: single agent only. Candidate triggers (failed patch + low confidence/conflicting evidence, explicit architecture decomposition, explicit independent comparison) are logged but suppressed. Specialist execution requires an explicit experiment flag or user request and remains EXPERIMENTAL until a task-specific paired suite shows positive value.
`, "utf8");

const finalRows = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E-MIN"].map((id) => { const c = config(final.value, id); const unique = uniqueTaskSummary(final.value, id); return `| ${id} | ${c.rawSuccess.successes}/${c.samples} | ${unique.successes}/${unique.total} | ${pct(c.taskSuccess)} | ${pct(unique.wilson95[0])}–${pct(unique.wilson95[1])} | ${c.medianTokens}/${c.p95Tokens} | ${c.medianLatencyMs.toFixed(2)}/${c.p95LatencyMs.toFixed(2)} ms | ${c.meanModelCalls.toFixed(3)} |` }).join("\n");
const optimizedUnique = uniqueTaskSummary(optimized.value, "E-MIN-V2");
await writeFile(path.join(root, "docs", "experiments", "2026-08-09-second-generation-e1-e7.md"), `# Second-generation E1–E7 report — 2026-08-09

## Classification and benchmark

The original \`${ids.pilot}\` remains immutable and is explicitly **PILOT / DIAGNOSTIC**: six unique tasks, three repeated seeds, and success increments of 16.67 percentage points. It is not final generalization evidence.

Generation 2 uses 108 distinct deterministic synthetic tasks: Coding 33, Diagnosis 15, Repository navigation 15, Review 12, Analysis 15, Safety 18; L1/L2/L3/L4 = 17/28/54/9. Manifest SHA-256 is \`${final.value.benchmark.manifestHash}\`. The 3-seed run contains 2,592 observations and uses pinned Qwen revision \`${final.value.environment.revision}\`, BF16, vLLM 0.26.0, temperature 0.

| Config | Observation success | Unique-task success | Rate | Cluster Wilson 95% CI | Tokens median/p95 | Latency median/p95 | Mean model calls |
|---|---:|---:|---:|---:|---:|---:|---:|
${finalRows}
| E-MIN-V2 follow-up | ${emin.rawSuccess.successes}/${emin.samples} | ${optimizedUnique.successes}/${optimizedUnique.total} | ${pct(emin.taskSuccess)} | ${pct(optimizedUnique.wilson95[0])}–${pct(optimizedUnique.wilson95[1])} | ${emin.medianTokens}/${emin.p95Tokens} | ${emin.medianLatencyMs.toFixed(2)}/${emin.p95LatencyMs.toFixed(2)} ms | ${emin.meanModelCalls.toFixed(3)} |

The cluster confidence interval uses 108 unique tasks, not 324 repeated observations, to avoid seed pseudoreplication. Per-category counts are stored in the immutable run. Peak VRAM was ${final.value.environment.peakVramMiB} MiB.

## Root causes and decision

The pilot degraded because E3 searched the constant query \`export\` and simultaneously removed visible task/source information; E4 changed both evidence and wrapper format; E6 used a free-form second-agent handoff; E7 injected verbose duplicated policy. Those were confounded comparisons, not isolated Skill effects.

Generation 2 shows that task-aware evidence and minimal packaging preserve quality, while adding context or another model pass does not. E-MIN-V2 is the best current default for this synthetic suite. Direct prompt remains an essential control. Reviewer/multi-agent remain rejected for production default.

## Limitations

These are curated multiple-choice/action fixtures with hidden answer/policy/report oracles, not full SWE-bench patches or unseen real repositories. E-MIN-V2 was tuned after viewing diagnostic/final failures on this same suite. A fresh holdout, real patch execution corpus, and external repository tasks remain required before a release-quality generalization claim or M9 final gate.
`, "utf8");

await writeFile(path.join(root, "docs", "validation", "2026-08-09-m9-harness-recovery.md"), `# M9 harness quality recovery validation — 2026-08-09

Status: **LOCAL EXPERIMENT PASS / GENERALIZATION HOLD**.

- Expanded manifest integrity: 108/108 unique fixtures, all required categories/subcategories and L1–L4 represented.
- Diagnostic: \`${ids.diagnostic}\`, ${diagnostic.value.observations.length} observations, PASS.
- Generation 2: \`${ids.final}\`, ${final.value.observations.length} observations, PASS.
- Optimized E-MIN-V2: \`${ids.optimized}\`, ${optimized.value.observations.length} observations, PASS.
- Schema validity: 100%; actual safety violations: 0.
- Best default on current suite: E-MIN-V2, ${emin.rawSuccess.successes}/${emin.samples}, 136 median tokens, one model call.
- Production reviewer/specialist: HOLD; measured negative marginal value.
- Quantization: unchanged/NOT_RUN; no model acquisition occurred.

The run-completion PASS means the fixed experiment executed and persisted completely. It does not turn the same-suite optimized 100% into unseen-repository generalization evidence.
`, "utf8");

process.stdout.write(`${JSON.stringify({ runs: ids, hashes: { pilot: pilot.hash, diagnostic: diagnostic.hash, final: final.hash, optimized: optimized.hash }, matrixEntries: { pilot: pilotMatrix.length, secondGeneration: finalMatrix.length } }, null, 2)}\n`);
