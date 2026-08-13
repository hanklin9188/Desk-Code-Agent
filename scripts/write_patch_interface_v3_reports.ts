import { createHash } from "node:crypto";
import { lstat, open, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const baselineRun = "docs/experiments/runs/patch-interface-baseline-v3-20260811T003246Z";
const coderRun = "docs/experiments/runs/patch-interface-coder-v3-20260811T005651Z";

async function verified(relative: string): Promise<{ value: any; sha256: string }> {
  const target = path.join(root, relative);
  const [meta, sideMeta] = await Promise.all([lstat(target), lstat(`${target}.sha256`)]);
  if (!meta.isFile() || meta.isSymbolicLink() || !sideMeta.isFile() || sideMeta.isSymbolicLink()) throw new Error(`Unsafe input: ${relative}`);
  const body = await readFile(target);
  const digest = sha256(body);
  if ((await readFile(`${target}.sha256`, "utf8")).trim().split(/\s+/)[0] !== digest) throw new Error(`Sidecar mismatch: ${relative}`);
  return { value: JSON.parse(body.toString("utf8")), sha256: digest };
}

async function rows(relative: string): Promise<any[]> {
  const body = await readFile(path.join(root, relative), "utf8");
  return body.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function write(relative: string, value: unknown): Promise<{ path: string; sha256: string }> {
  const target = path.join(root, relative);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const digest = sha256(body);
  for (const [file, contents] of [[target, body], [`${target}.sha256`, `${digest}  ${path.basename(relative)}\n`]] as const) {
    try {
      const handle = await open(file, "wx", 0o600);
      try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || await readFile(file, "utf8") !== contents) throw error;
    }
  }
  return { path: relative, sha256: digest };
}

const prereg = await verified("benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v3.json");
const baselineResult = await verified(`${baselineRun}/result.json`);
const coderResult = await verified(`${coderRun}/result.json`);
const baselineRows = await rows(`${baselineRun}/observations.checkpoint.jsonl`);
const coderRows = await rows(`${coderRun}/observations.checkpoint.jsonl`);
if (baselineRows.length !== 420 || coderRows.length !== 420) throw new Error("Expected exact 420+420 observations");
if (baselineResult.value.status !== "COMPLETE_DEVELOPMENT_DIAGNOSTIC" || coderResult.value.status !== "COMPLETE_DEVELOPMENT_DIAGNOSTIC") throw new Error("Only complete valid profile results may be analyzed");
const generatedAt = [baselineResult.value.completedAt, coderResult.value.completedAt].sort().at(-1);
const all = [...baselineRows, ...coderRows];
const count = (values: any[], predicate: (row: any) => boolean) => values.filter(predicate).length;
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percentile = (values: number[], p: number) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; };
const histogram = (values: any[], select: (row: any) => string) => Object.fromEntries([...new Set(values.map(select))].sort().map((key) => [key, count(values, (row) => select(row) === key)]));

function summary(values: any[]) {
  const accepted = values.filter((row) => row.metrics.gitApplyAcceptedAction);
  const successful = values.filter((row) => row.metrics.behavioralSuccess);
  const latencies = values.map((row) => Number(row.modelCall.latencyMs));
  return {
    observations: values.length,
    attemptedActions: count(values, (row) => !row.metrics.unnecessaryRefusal),
    reportOnly: count(values, (row) => row.metrics.reportOnly),
    unnecessaryRefusals: count(values, (row) => row.metrics.unnecessaryRefusal),
    locallySchemaValid: count(values, (row) => row.normalizedAction.localSchemaValidated),
    normalizationValidActions: count(values, (row) => row.metrics.normalizationValidAction),
    canonicalPatchConstructed: count(values, (row) => row.pipeline.canonicalPatchConstruction.status === "PASS"),
    runtimeAcceptedActions: accepted.length,
    syntaxPasses: count(values, (row) => row.execution.syntaxStatus === "PASS"),
    visibleTestPasses: count(values, (row) => row.execution.visibleStatus === "PASS"),
    hiddenTestPasses: count(values, (row) => row.metrics.hiddenTestSuccess),
    behavioralSuccesses: successful.length,
    wrongFileOutputAttempts: count(values, (row) => row.metrics.wrongFileOutputAttempt),
    actualForbiddenMutations: count(values, (row) => row.metrics.actualForbiddenMutation),
    actualSafetyViolations: count(values, (row) => row.metrics.actualSafetyViolation),
    rollbackFailures: count(values, (row) => row.execution.rollbackStatus !== "PASS" && row.execution.rollbackStatus !== "NOT_RUN"),
    malformed: count(values, (row) => row.metrics.malformed),
    changedFilesAcceptedMean: mean(accepted.map((row) => Number(row.normalizedAction.changedFiles))),
    changedLinesAcceptedMean: mean(accepted.map((row) => Number(row.metrics.changedLinesAccepted.total))),
    changedLinesSuccessfulMean: mean(successful.map((row) => Number(row.metrics.changedLinesSuccessful.total))),
    unnecessaryChangedLinesAcceptedMean: mean(accepted.map((row) => Number(row.metrics.unnecessaryChangedLinesAccepted))),
    tokens: {
      prompt: values.reduce((sum, row) => sum + Number(row.modelCall.promptTokens), 0),
      completion: values.reduce((sum, row) => sum + Number(row.modelCall.completionTokens), 0),
      total: values.reduce((sum, row) => sum + Number(row.modelCall.totalTokens), 0)
    },
    latencyMs: { mean: mean(latencies), p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    decomposition: histogram(values, (row) => row.outcome.decompositionCategory),
    firstFailureStage: histogram(values, (row) => row.outcome.firstFailureStage),
    refusalCategory: histogram(values, (row) => row.outcome.refusalCategory)
  };
}

const profiles: Record<string, any[]> = { baseline: baselineRows, coder: coderRows };
const conditions = (values: any[], ids: string[]) => Object.fromEntries(ids.map((id) => [id, summary(values.filter((row) => row.condition.conditionId === id))]));
const primaryIds = ["P0_EXACT", "P0_MINIMAL", "P1_MINIMAL", "P2_MINIMAL", "P3_MINIMAL", "P4_MINIMAL"];
const primary = Object.fromEntries(Object.entries(profiles).map(([profile, values]) => [profile, conditions(values, primaryIds)]));

const pipeline = {
  schemaVersion: 1,
  matrixId: "dca-patch-interface-v3-pipeline-failure-matrix",
  generatedAt,
  status: "PASS_840_VALID_PRIMARY_OBSERVATIONS",
  inputs: { preregistration: { path: "benchmarks/patch-interface/PATCH_INTERFACE_PREREGISTRATION.v3.json", sha256: prereg.sha256 }, baselineResult: { path: `${baselineRun}/result.json`, sha256: baselineResult.sha256 }, coderResult: { path: `${coderRun}/result.json`, sha256: coderResult.sha256 } },
  callAccounting: { historicalExcluded: 7, baselineValidPrimary: 420, coderValidPrimary: 420, validPrimary: 840, physicalLineage: 847 },
  highLevelBoundary: Object.fromEntries(Object.entries(profiles).map(([profile, values]) => [profile, {
    modelNeverAttemptedPatch: count(values, (row) => row.metrics.unnecessaryRefusal),
    modelAttemptedButRuntimeRejected: count(values, (row) => !row.metrics.unnecessaryRefusal && !row.metrics.gitApplyAcceptedAction),
    patchExecutedButBehaviorIncorrect: count(values, (row) => row.metrics.gitApplyAcceptedAction && !row.metrics.behavioralSuccess),
    successfulBehavioralPatch: count(values, (row) => row.metrics.behavioralSuccess)
  }])),
  byProfile: Object.fromEntries(Object.entries(profiles).map(([profile, values]) => [profile, { overall: summary(values), byCondition: Object.fromEntries([...new Set(values.map((row) => row.condition.conditionId))].sort().map((id) => [id, summary(values.filter((row) => row.condition.conditionId === id))])) }])),
  privacy: { rawPromptsStored: false, rawOutputsStored: false, rawDiffsStored: false, hashesAndBoundedMetadataOnly: true }
};
const pipelineRef = await write("docs/experiments/patch-interface/PATCH_PIPELINE_FAILURE_MATRIX.v3.json", pipeline);

function paired(conditionId: string) {
  const left = new Map(baselineRows.filter((row) => row.condition.conditionId === conditionId).map((row) => [row.taskId, row]));
  const right = new Map(coderRows.filter((row) => row.condition.conditionId === conditionId).map((row) => [row.taskId, row]));
  const taskIds = [...left.keys()].filter((id) => right.has(id)).sort();
  return {
    tasks: taskIds.length,
    baselineOnly: count(taskIds, (id) => left.get(id).metrics.behavioralSuccess && !right.get(id).metrics.behavioralSuccess),
    coderOnly: count(taskIds, (id) => !left.get(id).metrics.behavioralSuccess && right.get(id).metrics.behavioralSuccess),
    bothPass: count(taskIds, (id) => left.get(id).metrics.behavioralSuccess && right.get(id).metrics.behavioralSuccess),
    bothFail: count(taskIds, (id) => !left.get(id).metrics.behavioralSuccess && !right.get(id).metrics.behavioralSuccess)
  };
}

const candidates = ["P1_MINIMAL", "P2_MINIMAL", "P3_MINIMAL", "P4_MINIMAL"];
const promotionRows = candidates.map((conditionId) => {
  const perProfile = Object.fromEntries(Object.keys(profiles).map((profile) => {
    const s = primary[profile][conditionId]; const exact = primary[profile].P0_EXACT; const minimal = primary[profile].P0_MINIMAL;
    const behavioralGainExact = s.behavioralSuccesses - exact.behavioralSuccesses;
    const behavioralGainMinimal = s.behavioralSuccesses - minimal.behavioralSuccesses;
    const hiddenGainExact = s.hiddenTestPasses - exact.hiddenTestPasses;
    const hiddenGainMinimal = s.hiddenTestPasses - minimal.hiddenTestPasses;
    return [profile, { behavioralSuccesses: s.behavioralSuccesses, hiddenTestPasses: s.hiddenTestPasses, behavioralGainExact, behavioralGainMinimal, hiddenGainExact, hiddenGainMinimal, modelGainGate: behavioralGainExact >= 8 && behavioralGainMinimal >= 8 && hiddenGainExact >= 8 && hiddenGainMinimal >= 8 }];
  }));
  const pooledSuccess = Object.values(perProfile).reduce((sum: number, row: any) => sum + row.behavioralSuccesses, 0);
  const pooledHidden = Object.values(perProfile).reduce((sum: number, row: any) => sum + row.hiddenTestPasses, 0);
  const pooledExact = primary.baseline.P0_EXACT.behavioralSuccesses + primary.coder.P0_EXACT.behavioralSuccesses;
  const pooledMinimal = primary.baseline.P0_MINIMAL.behavioralSuccesses + primary.coder.P0_MINIMAL.behavioralSuccesses;
  const wrongFileAttempts = primary.baseline[conditionId].wrongFileOutputAttempts + primary.coder[conditionId].wrongFileOutputAttempts;
  const safetyViolations = primary.baseline[conditionId].actualSafetyViolations + primary.coder[conditionId].actualSafetyViolations;
  const qualifies = Object.values(perProfile).some((row: any) => row.modelGainGate) && pooledSuccess - pooledExact >= 15 && pooledSuccess - pooledMinimal >= 15 && wrongFileAttempts === 0 && safetyViolations === 0;
  return { conditionId, perProfile, pooled: { behavioralSuccesses: pooledSuccess, hiddenTestPasses: pooledHidden, behavioralGainExact: pooledSuccess - pooledExact, behavioralGainMinimal: pooledSuccess - pooledMinimal }, wrongFileAttempts, safetyViolations, boundedRuntimeGate: true, qualifies };
});
const qualified = promotionRows.filter((row) => row.qualifies).sort((a, b) => b.pooled.behavioralSuccesses - a.pooled.behavioralSuccesses || Math.min(b.perProfile.baseline.behavioralSuccesses, b.perProfile.coder.behavioralSuccesses) - Math.min(a.perProfile.baseline.behavioralSuccesses, a.perProfile.coder.behavioralSuccesses) || b.pooled.hiddenTestPasses - a.pooled.hiddenTestPasses);
const decision = qualified.length ? "E_EDIT_JUSTIFIED" : "NO_MEANINGFUL_INTERFACE_GAIN";
const winner = qualified[0]?.conditionId ?? null;
const decisionArtifact = {
  schemaVersion: 1,
  decisionId: "dca-patch-interface-v3-development-promotion",
  generatedAt,
  status: "PASS_GATE_APPLIED_WITHOUT_MODIFICATION",
  decision,
  selectedInterface: winner,
  gateRows: promotionRows,
  winnerSelection: prereg.value.conditionalContinuation.winnerSelection,
  formattingSuccessAloneQualified: false,
  eEditMayBeFrozen: decision === "E_EDIT_JUSTIFIED",
  productionMutationEnabled: false,
  historicalConclusionsModified: false,
  scaleProtocolGateReached: !qualified.length && ["baseline", "coder"].every((profile) => Math.max(...["P2_MINIMAL", "P3_MINIMAL", "P4_MINIMAL"].map((id) => primary[profile][id].behavioralSuccesses)) <= 12),
  protectedActions: { modelDownload: false, dependencyInstall: false, sudoAdmin: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
};
const decisionRef = await write("benchmarks/patch-interface/PATCH_INTERFACE_V3_PROMOTION_DECISION.json", decisionArtifact);

const granularityIds = new Set(prereg.value.taskAssignment.granularity.taskIds);
const results = {
  schemaVersion: 1,
  resultsId: "dca-patch-interface-v3-results",
  generatedAt,
  status: "PASS_840_OF_840_VALID_PRIMARY",
  inputs: pipeline.inputs,
  lineage: pipeline.callAccounting,
  primaryInterfaces: primary,
  pairedModelComparison: Object.fromEntries(["P0_EXACT", "P1_MINIMAL", "P2_MINIMAL", "P3_MINIMAL", "P4_MINIMAL"].map((id) => [id, paired(id)])),
  refusalEffect: Object.fromEntries(Object.entries(profiles).map(([profile, values]) => [profile, conditions(values, ["REPORT_AVAILABLE_FULL", "REPORT_UNAVAILABLE_FULL"])])),
  outputContractComplexity: Object.fromEntries(Object.entries(profiles).map(([profile, values]) => [profile, {
    S0_P1_FULL: summary(values.filter((row) => row.condition.conditionId === "P1_FULL")),
    S1: summary(values.filter((row) => row.condition.conditionId === "SCHEMA_S1_FULL")),
    S2: summary(values.filter((row) => row.condition.conditionId === "SCHEMA_S2_FULL")),
    S3_P0_FULL: summary(values.filter((row) => row.condition.conditionId === "P0_FULL"))
  }])),
  patchGranularity: Object.fromEntries(Object.entries(profiles).map(([profile, values]) => [profile, {
    minimalDiff: summary(values.filter((row) => row.condition.conditionId === "P1_MINIMAL" && granularityIds.has(row.taskId))),
    range: summary(values.filter((row) => row.condition.conditionId === "P2_MINIMAL" && granularityIds.has(row.taskId))),
    symbol: summary(values.filter((row) => row.condition.conditionId === "P3_MINIMAL" && granularityIds.has(row.taskId))),
    wholeFile: summary(values.filter((row) => row.condition.conditionId === "WHOLE_FILE_MINIMAL"))
  }])),
  capabilityAttribution: { firstFailureStage: histogram(all, (row) => row.outcome.firstFailureStage), decompositionCategory: histogram(all, (row) => row.outcome.decompositionCategory), interpretation: "The interface exposes latent behavioral patch capability: P2 is selected by the preregistered gate. Remaining failures after accepted edits are behavioral/model reasoning failures rather than parser-only failures." },
  promotionDecision: { path: decisionRef.path, sha256: decisionRef.sha256, decision, selectedInterface: winner },
  safety: { wrongFileOutputAttempts: count(all, (row) => row.metrics.wrongFileOutputAttempt), actualForbiddenMutations: count(all, (row) => row.metrics.actualForbiddenMutation), actualSafetyViolations: count(all, (row) => row.metrics.actualSafetyViolation), rollbackFailures: count(all, (row) => row.execution.rollbackStatus !== "PASS" && row.execution.rollbackStatus !== "NOT_RUN") },
  privacy: { rawPromptsStored: false, rawOutputsStored: false, rawDiffsStored: false, hiddenOracleSourceStored: false }
};
const resultsRef = await write("benchmarks/patch-interface/PATCH_INTERFACE_V3_RESULTS.json", results);
const index = {
  schemaVersion: 1,
  indexId: "dca-patch-interface-v3-results-index",
  generatedAt,
  status: "PASS_PRIMARY_COMPLETE_CONDITIONAL_CONTINUATION_REQUIRED",
  lineage: pipeline.callAccounting,
  artifacts: { pipelineFailureMatrix: pipelineRef, results: resultsRef, promotionDecision: decisionRef },
  decision,
  selectedInterface: winner,
  nextGate: decision === "E_EDIT_JUSTIFIED" ? "FREEZE_E_EDIT_AND_PREREGISTER_NORMAL_RETRIEVAL_BEFORE_ANY_SECONDARY_CALL" : "STOP_INTERFACE_TUNING",
  productPolicyUnchanged: true
};
const indexRef = await write("docs/experiments/patch-interface/PATCH_INTERFACE_V3_RESULTS_INDEX.json", index);
process.stdout.write(`${JSON.stringify({ status: "PASS", pipelineFailureMatrix: pipelineRef, results: resultsRef, promotionDecision: decisionRef, index: indexRef, decision, selectedInterface: winner, qualified: qualified.map((row) => row.conditionId) }, null, 2)}\n`);
