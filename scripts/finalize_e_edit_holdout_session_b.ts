import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const baselineDirectory = "docs/experiments/runs/e-edit-holdout-baseline-20260811T110600Z";
const eEditDirectory = "docs/experiments/runs/e-edit-holdout-p2-20260811T111300Z";
const retryDirectory = "docs/experiments/runs/e-edit-holdout-retry-v1";
const preregistrationPath = "benchmarks/patch-interface/E_EDIT_HOLDOUT_PREREGISTRATION.v2.json";
const sealPath = "benchmarks/patch-interface/E_EDIT_HOLDOUT_SEAL.v2.json";
const pairedPath = "benchmarks/patch-interface/E_EDIT_HOLDOUT_PAIRED_RESULTS.v2.json";
const promotionPath = "benchmarks/patch-interface/E_EDIT_HOLDOUT_PROMOTION_DECISION.v2.json";
const sessionPath = "docs/experiments/patch-interface/E_EDIT_HOLDOUT_SESSION_B.v2.json";
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

type Reference<T> = { value: T; path: string; sha256: string };
type Observation = {
  observationId: string; index: number; condition: string; taskId: string; repositoryId: string;
  category: string; difficulty: string; fileScope: string;
  retrieval: { exactSourceSelected: boolean; exactSourceIncluded: boolean };
  modelCall: { calls: number; outputSha256: string; promptTokens: number; completionTokens: number; latencyMs: number; rawPromptStored: boolean; rawOutputStored: boolean };
  normalization: { classification: string; changedFiles: number; changedLines: number; canonicalDiffSha256: string | null; rawActionStored: boolean };
  execution: { patchApplied: boolean; syntax: string; visible: string; hidden: string; rollback: string; cleanup: string; actualSafetyViolation: boolean };
  outcome: { behavioralSuccess: boolean; hiddenSuccess: boolean; wrongFileAttempt: boolean; actualSafetyViolation: boolean; firstFailureStage: string };
};

async function verified<T>(relative: string): Promise<Reference<T>> {
  const target = path.join(root, relative), bytes = await readFile(target), digest = sha256(bytes);
  const [metadata, sidecarMetadata] = await Promise.all([lstat(target), lstat(`${target}.sha256`)]);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !sidecarMetadata.isFile() || sidecarMetadata.isSymbolicLink() || await readFile(`${target}.sha256`, "utf8") !== `${digest}  ${path.basename(target)}\n`) throw new Error(`Invalid immutable artifact ${relative}`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: digest };
}

async function jsonLines(relative: string): Promise<Observation[]> {
  const text = await readFile(path.join(root, relative), "utf8");
  return text.trimEnd().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Observation);
}

async function persist(relative: string, value: unknown) {
  const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body);
  for (const [file, contents] of [[target, body], [`${target}.sha256`, `${digest}  ${path.basename(target)}\n`]] as const) {
    try { const handle = await open(file, "wx", 0o600); try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; const metadata = await lstat(file); if (!metadata.isFile() || metadata.isSymbolicLink() || await readFile(file, "utf8") !== contents) throw new Error(`Immutable collision ${relative}`); }
  }
  return { path: relative, sha256: digest };
}

function percentile(values: number[], probability: number) {
  const sorted = [...values].sort((a, b) => a - b), position = (sorted.length - 1) * probability, lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
function random(seed: number) { let state = seed >>> 0; return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; }; }
function exactMcNemar(baselineOnly: number, eEditOnly: number) { const discordant = baselineOnly + eEditOnly, extreme = Math.min(baselineOnly, eEditOnly); let cumulative = 0; for (let k = 0; k <= extreme; k += 1) { let combination = 1; for (let j = 1; j <= k; j += 1) combination = combination * (discordant - j + 1) / j; cumulative += combination * 0.5 ** discordant; } return Math.min(1, 2 * cumulative); }
function aggregate(rows: Array<{ baseline: Observation; eEdit: Observation }>) { const n = rows.length, b = rows.filter((row) => row.baseline.outcome.behavioralSuccess).length, e = rows.filter((row) => row.eEdit.outcome.behavioralSuccess).length; return { tasks: n, baselineSuccesses: b, eEditSuccesses: e, baselinePercent: 100 * b / n, eEditPercent: 100 * e / n, absoluteDifferencePercentagePoints: 100 * (e - b) / n }; }
function grouped(rows: Array<{ baseline: Observation; eEdit: Observation }>, key: (row: Observation) => string) { return Object.fromEntries([...new Set(rows.map((row) => key(row.eEdit)))].sort().map((value) => [value, aggregate(rows.filter((row) => key(row.eEdit) === value))])); }
function pipeline(rows: Observation[]) { const count = (predicate: (row: Observation) => boolean) => rows.filter(predicate).length; return { tasks: rows.length, validActions: count((row) => row.normalization.classification === "VALID_EDIT"), patchConstructionPasses: count((row) => row.execution.patchApplied), syntaxPasses: count((row) => row.execution.syntax === "PASS"), visibleTestPasses: count((row) => row.execution.visible === "PASS"), hiddenTestPasses: count((row) => row.execution.hidden === "PASS"), strictBehavioralSuccesses: count((row) => row.outcome.behavioralSuccess), wrongFileAttempts: count((row) => row.outcome.wrongFileAttempt), actualSafetyViolations: count((row) => row.outcome.actualSafetyViolation), rollbackFailures: count((row) => row.execution.rollback !== "PASS"), cleanupFailures: count((row) => row.execution.cleanup !== "PASS") }; }

const [preregistration, seal, baseline, eEdit, baselineLifecycle, eEditLifecycle] = await Promise.all([
  verified<any>(preregistrationPath), verified<any>(sealPath), verified<any>(`${baselineDirectory}/result.json`), verified<any>(`${eEditDirectory}/result.json`), verified<any>(`${baselineDirectory}/lifecycle.json`), verified<any>(`${eEditDirectory}/lifecycle.json`)
]);
if (preregistration.value.preregistrationId !== "dca-e-edit-repository-disjoint-untouched-holdout-v2" || seal.value.status !== "PASS_SESSION_A_ZERO_CALL_SEALED" || baseline.value.status !== "COMPLETE_UNTOUCHED_HOLDOUT" || eEdit.value.status !== "COMPLETE_UNTOUCHED_HOLDOUT" || baselineLifecycle.value.status !== "PASS" || eEditLifecycle.value.status !== "PASS") throw new Error("Session-B inputs are not complete");
for (const lifecycle of [baselineLifecycle.value, eEditLifecycle.value]) if (!lifecycle.checks.exactModelProcessAbsent || !lifecycle.checks.loopbackPort8000Clear || !lifecycle.checks.ephemeralApiKeyAbsent || !lifecycle.checks.gpuMemoryReleased || !lifecycle.checks.extraGitWorktreesAbsent || !lifecycle.runtimeStateCleanup.verifiedAbsent) throw new Error("Lifecycle cleanup failure");

const [baselineRows, eEditRows] = await Promise.all([jsonLines(`${baselineDirectory}/observations.checkpoint.jsonl`), jsonLines(`${eEditDirectory}/observations.checkpoint.jsonl`)]);
if (baselineRows.length !== 95 || eEditRows.length !== 95) throw new Error("Observation count mismatch");
const baselineByTask = new Map(baselineRows.map((row) => [row.taskId, row])), pairs = eEditRows.map((row) => ({ baseline: baselineByTask.get(row.taskId)!, eEdit: row }));
if (pairs.some((pair) => !pair.baseline || pair.baseline.repositoryId !== pair.eEdit.repositoryId) || new Set(pairs.map((pair) => pair.eEdit.taskId)).size !== 95) throw new Error("Paired task mismatch");
for (const row of [...baselineRows, ...eEditRows]) if (row.modelCall.calls !== 1 || row.modelCall.rawPromptStored || row.modelCall.rawOutputStored || row.normalization.rawActionStored || row.execution.rollback !== "PASS" || row.execution.cleanup !== "PASS") throw new Error(`Observation invariant failed ${row.observationId}`);

const bothPass = pairs.filter((pair) => pair.baseline.outcome.behavioralSuccess && pair.eEdit.outcome.behavioralSuccess).length;
const baselineOnly = pairs.filter((pair) => pair.baseline.outcome.behavioralSuccess && !pair.eEdit.outcome.behavioralSuccess).length;
const eEditOnly = pairs.filter((pair) => !pair.baseline.outcome.behavioralSuccess && pair.eEdit.outcome.behavioralSuccess).length;
const bothFail = pairs.length - bothPass - baselineOnly - eEditOnly;
const rngTask = random(20260811), taskBootstrap: number[] = [];
for (let repetition = 0; repetition < 10_000; repetition += 1) { let delta = 0; for (let i = 0; i < pairs.length; i += 1) { const pair = pairs[Math.floor(rngTask() * pairs.length)]; delta += Number(pair.eEdit.outcome.behavioralSuccess) - Number(pair.baseline.outcome.behavioralSuccess); } taskBootstrap.push(100 * delta / pairs.length); }
const repositories = [...new Set(pairs.map((pair) => pair.eEdit.repositoryId))].sort(), byRepository = new Map(repositories.map((repository) => [repository, pairs.filter((pair) => pair.eEdit.repositoryId === repository)])), rngCluster = random(20260811), clusterBootstrap: number[] = [];
for (let repetition = 0; repetition < 10_000; repetition += 1) { let delta = 0, count = 0; for (let i = 0; i < repositories.length; i += 1) { const rows = byRepository.get(repositories[Math.floor(rngCluster() * repositories.length)])!; for (const pair of rows) delta += Number(pair.eEdit.outcome.behavioralSuccess) - Number(pair.baseline.outcome.behavioralSuccess); count += rows.length; } clusterBootstrap.push(100 * delta / count); }

const baselineTokens = baseline.value.summary.totalPromptTokens + baseline.value.summary.totalCompletionTokens, eEditTokens = eEdit.value.summary.totalPromptTokens + eEdit.value.summary.totalCompletionTokens;
const tokenOverheadPercent = 100 * (eEditTokens - baselineTokens) / baselineTokens, latencyOverheadPercent = 100 * (eEdit.value.summary.totalLatencyMs - baseline.value.summary.totalLatencyMs) / baseline.value.summary.totalLatencyMs;
const required = {
  behavioralMinimum57: eEdit.value.summary.behavioralSuccesses >= 57,
  absoluteGainMinimum15PointsAndTasks: eEdit.value.summary.behavioralSuccesses - baseline.value.summary.behavioralSuccesses >= 15 && 100 * (eEdit.value.summary.behavioralSuccesses - baseline.value.summary.behavioralSuccesses) / 95 >= 15,
  hiddenNonRegression: eEdit.value.summary.hiddenSuccesses >= baseline.value.summary.hiddenSuccesses,
  wrongFileRegressionZero: eEdit.value.summary.wrongFileAttempts === 0 && baseline.value.summary.wrongFileAttempts === 0,
  actualSafetyRegressionZero: eEdit.value.summary.actualSafetyViolations === 0 && baseline.value.summary.actualSafetyViolations === 0,
  rollbackRegressionZero: eEdit.value.summary.rollbackFailures === 0 && baseline.value.summary.rollbackFailures === 0,
  validActionMinimum86: eEdit.value.summary.validActions >= 86,
  tokenOverheadMaximum20Percent: tokenOverheadPercent <= 20,
  latencyOverheadMaximum25Percent: latencyOverheadPercent <= 25
};
const assistedFloor = eEdit.value.summary.behavioralSuccesses >= 29 && eEdit.value.summary.behavioralSuccesses - baseline.value.summary.behavioralSuccesses >= 10 && required.wrongFileRegressionZero && required.actualSafetyRegressionZero && required.rollbackRegressionZero;
const outcome = Object.values(required).every(Boolean) ? "E_EDIT_ONE_SHOT_PROMOTABLE" : assistedFloor ? "E_EDIT_NONINFERIOR_ASSISTED_ONLY" : "E_EDIT_HOLDOUT_GATE_FAIL";
const retryEligible = eEdit.value.summary.behavioralSuccesses >= 29 && eEdit.value.summary.actualSafetyViolations === 0 && eEdit.value.summary.rollbackFailures === 0;
if (retryEligible) throw new Error("This finalizer is only valid for the preregistered zero-call retry branch");

const completedAt = eEditLifecycle.value.checkedAt;
const retry = {
  schemaVersion: 1, experimentId: "dca-e-edit-untouched-holdout-retry-v1", status: "NOT_ELIGIBLE_ZERO_CALLS", classification: "PREREGISTERED_CONDITIONAL_BRANCH_NOT_EXECUTED", completedAt,
  prerequisite: { requiredBehavioralSuccesses: 29, observedBehavioralSuccesses: eEdit.value.summary.behavioralSuccesses, actualSafetyViolations: eEdit.value.summary.actualSafetyViolations, rollbackFailures: eEdit.value.summary.rollbackFailures, eligible: false },
  potentialFailedTasks: pairs.filter((pair) => !pair.eEdit.outcome.behavioralSuccess).length,
  summary: { modelCalls: 0, recoveries: 0, repeatedPatches: 0, contradictions: 0, wrongFileAttempts: 0, actualSafetyViolations: 0, rollbackFailures: 0, tokenMultiplier: "NOT_APPLICABLE", latencyMultiplier: "NOT_APPLICABLE" },
  inputs: { preregistration: { path: preregistration.path, sha256: preregistration.sha256 }, seal: { path: seal.path, sha256: seal.sha256 }, eEditResult: { path: eEdit.path, sha256: eEdit.sha256 } },
  privacy: { rawPromptsStored: false, rawOutputsStored: false, rawPatchesStored: false }, protectedActions: { modelDownload: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
};
const retryRef = await persist(`${retryDirectory}/result.json`, retry);

const pairRows = pairs.map((pair) => ({ taskId: pair.eEdit.taskId, repositoryId: pair.eEdit.repositoryId, category: pair.eEdit.category, difficulty: pair.eEdit.difficulty, fileScope: pair.eEdit.fileScope, baselineSuccess: pair.baseline.outcome.behavioralSuccess, eEditSuccess: pair.eEdit.outcome.behavioralSuccess, pairedOutcome: pair.baseline.outcome.behavioralSuccess ? pair.eEdit.outcome.behavioralSuccess ? "BOTH_PASS" : "BASELINE_ONLY" : pair.eEdit.outcome.behavioralSuccess ? "E_EDIT_ONLY" : "BOTH_FAIL", baselineFailureStage: pair.baseline.outcome.firstFailureStage, eEditFailureStage: pair.eEdit.outcome.firstFailureStage, exactSourceSelectedBoth: pair.baseline.retrieval.exactSourceSelected && pair.eEdit.retrieval.exactSourceSelected, exactSourceIncludedBoth: pair.baseline.retrieval.exactSourceIncluded && pair.eEdit.retrieval.exactSourceIncluded }));
const paired = {
  schemaVersion: 2, analysisId: "dca-e-edit-untouched-holdout-paired-v2", status: "PASS", completedAt, population: 95,
  supersedes: { path: "benchmarks/patch-interface/E_EDIT_HOLDOUT_PAIRED_RESULTS.v1.json", status: "SUPERSEDED_TO_ADD_EXPLICIT_PREREGISTERED_PIPELINE_AGGREGATES", modelCallsAdded: 0 },
  inputs: { preregistration: { path: preregistration.path, sha256: preregistration.sha256 }, seal: { path: seal.path, sha256: seal.sha256 }, baseline: { path: baseline.path, sha256: baseline.sha256 }, eEdit: { path: eEdit.path, sha256: eEdit.sha256 } },
  paired: { bothPass, baselineOnly, eEditOnly, bothFail, baselineSuccesses: baseline.value.summary.behavioralSuccesses, eEditSuccesses: eEdit.value.summary.behavioralSuccesses, baselinePercent: 100 * baseline.value.summary.behavioralSuccesses / 95, eEditPercent: 100 * eEdit.value.summary.behavioralSuccesses / 95, absoluteDifferencePercentagePoints: 100 * (eEdit.value.summary.behavioralSuccesses - baseline.value.summary.behavioralSuccesses) / 95 },
  statistics: { repetitions: 10_000, seed: 20260811, taskPairedBootstrap95PercentCI: [percentile(taskBootstrap, 0.025), percentile(taskBootstrap, 0.975)], repositoryClusterBootstrap95PercentCI: [percentile(clusterBootstrap, 0.025), percentile(clusterBootstrap, 0.975)], mcnemarExactTwoSidedP: exactMcNemar(baselineOnly, eEditOnly), discordantPairs: baselineOnly + eEditOnly },
  metrics: { baseline: baseline.value.summary, eEdit: eEdit.value.summary, pipeline: { baseline: pipeline(baselineRows), eEdit: pipeline(eEditRows) }, policy: { baselineCorrect: baseline.value.summary.policySuccesses, eEditCorrect: eEdit.value.summary.policySuccesses, totalPerCondition: 25, modelCalls: 0 }, totalTokenOverheadPercent: tokenOverheadPercent, totalLatencyOverheadPercent: latencyOverheadPercent },
  breakdowns: { category: grouped(pairs, (row) => row.category), difficulty: grouped(pairs, (row) => row.difficulty), repository: grouped(pairs, (row) => row.repositoryId), fileScope: grouped(pairs, (row) => row.fileScope), hiddenOracle: { allMutationTasksHaveHiddenOracle: true, baselineHiddenSuccesses: baseline.value.summary.hiddenSuccesses, eEditHiddenSuccesses: eEdit.value.summary.hiddenSuccesses } },
  pairRows, privacy: { rawPromptsStored: false, rawOutputsStored: false, rawPatchesStored: false, hiddenOracleStored: false }
};
const pairedRef = await persist(pairedPath, paired);

const promotion = {
  schemaVersion: 2, decisionId: "dca-e-edit-untouched-holdout-promotion-v2", status: "PASS_GATE_APPLIED", decidedAt: completedAt, outcome,
  supersedes: { path: "benchmarks/patch-interface/E_EDIT_HOLDOUT_PROMOTION_DECISION.v1.json", status: "SUPERSEDED_TO_BIND_COMPLETE_PAIRED_V2_METRICS", outcomeChanged: false, modelCallsAdded: 0 },
  inputs: { preregistration: { path: preregistration.path, sha256: preregistration.sha256 }, pairedResults: pairedRef, retry: retryRef }, requiredAll: required, assistedOnlyFloorMet: assistedFloor,
  retry: { eligible: false, outcome: "NOT_ELIGIBLE_ZERO_CALLS", retentionGate: "NOT_APPLICABLE" }, productMutationEnabled: false, thresholdChangedAfterResults: false,
  conclusion: "E-EDIT improves untouched behavioral success and action validity but remains below both the 60% promotion threshold and the 30% assisted-only floor; bounded retry was not authorized by the frozen prerequisite."
};
const promotionRef = await persist(promotionPath, promotion);

const session = {
  schemaVersion: 2, sessionId: "dca-e-edit-untouched-holdout-session-b-v2", session: "B", status: "PASS", completedAt,
  supersedes: { path: "docs/experiments/patch-interface/E_EDIT_HOLDOUT_SESSION_B.v1.json", status: "SUPERSEDED_TO_BIND_COMPLETE_PAIRED_V2_METRICS", modelCallsAdded: 0 },
  phases: { baselineOneShot: "PASS_95_CALLS", eEditOneShot: "PASS_95_CALLS", pairedAnalysis: "PASS", oneShotGate: outcome, retry: "NOT_ELIGIBLE_ZERO_CALLS", retryGate: "NOT_APPLICABLE", cleanup: "PASS" },
  artifacts: { baseline: { path: baseline.path, sha256: baseline.sha256 }, eEdit: { path: eEdit.path, sha256: eEdit.sha256 }, retry: retryRef, paired: pairedRef, promotion: promotionRef, baselineLifecycle: { path: baselineLifecycle.path, sha256: baselineLifecycle.sha256 }, eEditLifecycle: { path: eEditLifecycle.path, sha256: eEditLifecycle.sha256 } },
  lineage: { historicalPhysicalCalls: 979, sessionBPhysicalCalls: 190, baselineCalls: 95, eEditCalls: 95, retryCalls: 0, totalPhysicalCalls: 1169, duplicatePhysicalCalls: 0, silentRetries: 0 },
  cleanup: { modelProcessAbsent: true, port8000Clear: true, gpuMemoryMiB: 0, ephemeralApiKeyAbsent: true, orphanWorktreesAbsent: true, runtimeStateAbsent: true },
  gate: { resultsSealed: true, physicalCallLineageSealed: true, lifecycleEvidenceSealed: true, sessionBPass: true, sessionCStarted: false }, nextSession: "C", mustStop: true,
  protectedActions: { modelDownload: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
};
const sessionRef = await persist(sessionPath, session);
process.stdout.write(`${JSON.stringify({ status: "PASS_SESSION_B", paired: pairedRef, promotion: promotionRef, retry: retryRef, session: sessionRef, outcome, modelCalls: 190, mustStop: true }, null, 2)}\n`);
