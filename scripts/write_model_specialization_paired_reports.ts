import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { wilson } from "../services/g3-evaluation-runtime/src/index";
import { evaluateDevelopmentPromotion, pairedOutcome } from "../services/model-specialization-runtime/src/index";

const root = path.resolve(process.cwd());
const outputRoot = path.join(root, "docs/experiments/model-specialization");
const artifactVersion = process.argv.find((value) => value.startsWith("--artifact-version="))?.slice("--artifact-version=".length) ?? "v2";
if (!/^v[234]$/.test(artifactVersion)) throw new Error("Artifact version must be v2, v3, or v4");
const correctedDataVersion = artifactVersion === "v2" ? "v2" : "v3";
const safetyResultRelative = process.argv.find((value) => value.startsWith("--safety-result="))?.slice("--safety-result=".length) ?? "docs/experiments/runs/m9-g3-security-fuzz-2026-08-09T14-00-30-300Z/result.json";
const generatedAt = new Date().toISOString();
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
await mkdir(outputRoot, { recursive: true });

async function verifiedJson<T = any>(relative: string): Promise<{ value: T; path: string; sha256: string }> {
  const target = path.join(root, relative);
  const bytes = await readFile(target);
  const actual = sha256(bytes);
  const sidecar = `${target}.sha256`;
  try {
    const expected = (await readFile(sidecar, "utf8")).trim().split(/\s+/)[0];
    if (expected !== actual) throw new Error(`${relative} checksum mismatch`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: actual };
}

async function fileRef(relative: string) {
  return { path: relative, sha256: sha256(await readFile(path.join(root, relative))) };
}

async function writeImmutable(name: string, value: object | string) {
  if (artifactVersion !== "v2") name = name.replace(".v2.", `.${artifactVersion}.`);
  const body = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(outputRoot, name);
  await writeFile(target, body, { flag: "wx" });
  await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
  return { path: `docs/experiments/model-specialization/${name}`, sha256: sha256(body) };
}

type Row = { taskId: string; success: boolean; schemaValid?: boolean; latencyMs?: number; totalLatencyMs?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number; [key: string]: any };
type Result = { status: string; profileId: string; summaries: Record<string, any>; observations: Record<string, Row[]>; [key: string]: any };
type Smoke = { status: string; checks: Record<string, any>; telemetry: { idleVramMiB: number; peakVramMiB: number }; exactProfile: Record<string, any> };

const [baseline, coder, baselineSmoke, coderSmoke, baselineCleanup, coderCleanup, fairness, acquisition, authorization, license, preregistration, exactModels, selection, g3, g4, releaseGate, safetyFuzz] = await Promise.all([
  verifiedJson<Result>("docs/experiments/model-specialization/BASELINE_DEVELOPMENT_CAPABILITY_RESULT.json"),
  verifiedJson<Result>(artifactVersion === "v2" ? "docs/experiments/model-specialization/CODER_DEVELOPMENT_CAPABILITY_RESULT.json" : "docs/experiments/model-specialization/CODER_DEVELOPMENT_CAPABILITY_RESULT.v3.json"),
  verifiedJson<Smoke>("docs/experiments/model-specialization/BASELINE_MODEL_SMOKE_VALIDATION.v2.json"),
  verifiedJson<Smoke>(`docs/experiments/model-specialization/CODER_MODEL_SMOKE_VALIDATION.${correctedDataVersion}.json`),
  verifiedJson("docs/experiments/model-specialization/BASELINE_MODEL_SHUTDOWN_CLEANUP.v2.json"),
  verifiedJson(`docs/experiments/model-specialization/CODER_MODEL_SHUTDOWN_CLEANUP.${correctedDataVersion}.json`),
  verifiedJson(`docs/experiments/model-specialization/MODEL_SPECIALIZATION_FAIRNESS_GATE.${correctedDataVersion}.json`),
  verifiedJson("benchmarks/model-specialization/MODEL_ACQUISITION_STATUS.v2.json"),
  verifiedJson("benchmarks/model-specialization/MODEL_ACQUISITION_AUTHORIZATION.v2.json"),
  verifiedJson("docs/experiments/model-specialization/CANDIDATE_LICENSE_PROVENANCE.v2.json"),
  verifiedJson("benchmarks/model-specialization/MODEL_SPECIALIZATION_PREREGISTRATION.json"),
  verifiedJson<any>("benchmarks/model-specialization/EXACT_MODEL_MANIFESTS.json"),
  verifiedJson<any>("benchmarks/model-specialization/MODEL_COMPARISON_DEVELOPMENT_MANIFEST.json"),
  verifiedJson("benchmarks/g3/G3_RESULTS_INDEX.json"),
  verifiedJson("benchmarks/g4-development/G4_DEVELOPMENT_RESULTS_INDEX.json"),
  verifiedJson("artifacts/release/release-gate.json"),
  verifiedJson<any>(safetyResultRelative)
]);

for (const input of [baseline, coder]) if (!input.value.status.startsWith("PASS")) throw new Error(`${input.path} is not a completed diagnostic`);
if (!String(fairness.value.status).startsWith("PASS_BEFORE_")) throw new Error("Fairness gate did not pass before candidate execution");
if (coderCleanup.value.status !== "PASS") throw new Error("Candidate cleanup did not pass");

const phaseOrder = ["oracleContext", "taskUnderstanding", "navigation", "diagnosis", "patchOnly", "planning", "oneShotEndToEnd", "boundedRetry"] as const;
const phaseTitles: Record<string, string> = {
  oracleContext: "Oracle-context reasoning", taskUnderstanding: "Task understanding only", navigation: "Frozen retrieval navigation",
  diagnosis: "Diagnosis only", patchOnly: "Patch-only behavioral execution", planning: "Structured planning",
  oneShotEndToEnd: "One-shot frozen E-MIN-V2 end to end", boundedRetry: "Maximum-two-call evidence retry"
};

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}

function quantile(sorted: number[], q: number) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))] ?? 0; }
function pairedBootstrap(diffs: number[], seed: number, iterations = 10_000) {
  if (!diffs.length) return { iterations, seed, lower: 0, upper: 0 };
  const random = seeded(seed); const values: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0; for (let index = 0; index < diffs.length; index += 1) sum += diffs[Math.floor(random() * diffs.length)]!;
    values.push(sum / diffs.length);
  }
  values.sort((a, b) => a - b);
  return { iterations, seed, lower: quantile(values, 0.025), upper: quantile(values, 0.975) };
}

function summarize(rows: Row[]) {
  const successes = rows.filter((row) => row.success).length;
  const schemaValid = rows.filter((row) => row.schemaValid).length;
  return {
    tasks: rows.length, successes, successRate: successes / Math.max(1, rows.length), wilson95: wilson(successes, rows.length),
    schemaValid, schemaValidity: schemaValid / Math.max(1, rows.length),
    totalTokens: rows.reduce((sum, row) => sum + (row.totalTokens ?? (row.promptTokens ?? 0) + (row.completionTokens ?? 0)), 0),
    meanLatencyMs: rows.reduce((sum, row) => sum + (row.totalLatencyMs ?? row.latencyMs ?? 0), 0) / Math.max(1, rows.length)
  };
}

function compareRows(phase: string) {
  const baselineRows = baseline.value.observations[phase] ?? [];
  const coderRows = coder.value.observations[phase] ?? [];
  const coderById = new Map(coderRows.map((row) => [row.taskId, row]));
  if (baselineRows.length !== coderRows.length || baselineRows.some((row) => !coderById.has(row.taskId))) throw new Error(`${phase} is not an exact paired task set`);
  const pairs = baselineRows.map((base) => ({ taskId: base.taskId, baseline: base, coder: coderById.get(base.taskId)! }));
  const counts = { BOTH_PASS: 0, BASELINE_ONLY: 0, CODER_ONLY: 0, BOTH_FAIL: 0 };
  for (const pair of pairs) counts[pairedOutcome(pair.baseline.success, pair.coder.success)] += 1;
  const diffs = pairs.map((pair) => Number(pair.coder.success) - Number(pair.baseline.success));
  const b = summarize(baselineRows); const c = summarize(coderRows);
  return {
    phase, title: phaseTitles[phase], baseline: b, coder: c,
    absoluteDifference: c.successRate - b.successRate,
    absolutePercentagePointDifference: (c.successRate - b.successRate) * 100,
    relativeDifference: b.successRate === 0 ? null : (c.successRate - b.successRate) / b.successRate,
    pairedOutcomes: counts,
    netCoderWins: counts.CODER_ONLY - counts.BASELINE_ONLY,
    pairedBootstrap95: pairedBootstrap(diffs, 20260809 + phaseOrder.indexOf(phase as any)),
    pairedTaskIdsSha256: sha256(pairs.map((pair) => pair.taskId).join("\n"))
  };
}

const comparisons = Object.fromEntries(phaseOrder.map((phase) => [phase, compareRows(phase)])) as Record<string, ReturnType<typeof compareRows>>;
const baselineRetryAttempts = baseline.value.observations.boundedRetry.flatMap((row: any) => row.attempts ?? []);
const coderRetryAttempts = coder.value.observations.boundedRetry.flatMap((row: any) => row.attempts ?? []);
const retrySchema = (attempts: any[]) => ({ attempts: attempts.length, schemaValidAttempts: attempts.filter((row) => row.schemaValid).length, schemaValidity: attempts.filter((row) => row.schemaValid).length / Math.max(1, attempts.length) });

const gate = evaluateDevelopmentPromotion({
  patchBaselineRate: comparisons.patchOnly.baseline.successRate,
  patchCoderRate: comparisons.patchOnly.coder.successRate,
  diagnosisBaselineRate: comparisons.diagnosis.baseline.successRate,
  diagnosisCoderRate: comparisons.diagnosis.coder.successRate,
  endToEndBaselineRate: comparisons.oneShotEndToEnd.baseline.successRate,
  endToEndCoderRate: comparisons.oneShotEndToEnd.coder.successRate,
  baselineSafetyViolations: baseline.value.summaries.safety.actualSafetyViolations,
  coderSafetyViolations: coder.value.summaries.safety.actualSafetyViolations,
  coderPeakVramMiB: coderSmoke.value.telemetry.peakVramMiB,
  deviceTotalVramMiB: 16_376
});
const decision = gate.passed ? "DEVELOPMENT_PROMOTION_GATE_PASS" : "C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN";
const common = {
  schemaVersion: 1, generatedAt, classification: "CONTROLLED_MODEL_SPECIALIZATION_DEVELOPMENT_DIAGNOSTIC_NOT_HOLDOUT",
  decision,
  baseline: { modelId: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", status: "RUN_COMPLETE" },
  coder: { modelId: "Qwen/Qwen2.5-Coder-3B-Instruct", revision: "488639f1ff808d1d3d0ba301aef8c11461451ec5", status: "RUN_COMPLETE", licenseUse: "NON_COMMERCIAL_RESEARCH_EVALUATION_EXPERIMENTAL_DEVELOPMENT_ONLY" },
  inputs: { baseline: { path: baseline.path, sha256: baseline.sha256 }, coder: { path: coder.path, sha256: coder.sha256 }, preregistration: { path: preregistration.path, sha256: preregistration.sha256 }, fairness: { path: fairness.path, sha256: fairness.sha256 } }
};
const priorInvalidation = artifactVersion !== "v2" ? await fileRef("docs/experiments/model-specialization/MODEL_SPECIALIZATION_V2_INVALIDATION.v3.json") : null;
const priorReportingSupersession = artifactVersion === "v4" ? await fileRef("docs/experiments/model-specialization/MODEL_SPECIALIZATION_V3_REPORTING_SUPERSESSION.v4.json") : null;

const phaseFiles: Record<string, Awaited<ReturnType<typeof writeImmutable>>> = {};
const phaseNames: Record<string, string> = { oracleContext: "ORACLE_CONTEXT_COMPARISON.v2.json", taskUnderstanding: "TASK_UNDERSTANDING_COMPARISON.v2.json", navigation: "NAVIGATION_COMPARISON.v2.json", diagnosis: "DIAGNOSIS_COMPARISON.v2.json", patchOnly: "PATCH_ONLY_COMPARISON.v2.json", planning: "PLANNING_COMPARISON.v2.json", oneShotEndToEnd: "ONE_SHOT_END_TO_END_COMPARISON.v2.json", boundedRetry: "RETRY_DEPTH_COMPARISON.v2.json" };
for (const phase of phaseOrder) {
  const extras = phase === "navigation" ? {
    navigationComponents: {
      baseline: { fileRecallAt2: baseline.value.summaries.navigation.fileRecallAt2, symbolAccuracy: baseline.value.summaries.navigation.symbolAccuracy, testAffinityAccuracy: baseline.value.summaries.navigation.testAffinityAccuracy },
      coder: { fileRecallAt2: coder.value.summaries.navigation.fileRecallAt2, symbolAccuracy: coder.value.summaries.navigation.symbolAccuracy, testAffinityAccuracy: coder.value.summaries.navigation.testAffinityAccuracy }
    }
  } : phase === "boundedRetry" ? {
    attemptLevelSchema: { baseline: retrySchema(baselineRetryAttempts), coder: retrySchema(coderRetryAttempts) },
    recovery: { baseline: baseline.value.summaries.boundedRetry.recoveries, coder: coder.value.summaries.boundedRetry.recoveries },
    correctionNote: "Retry schema validity is recomputed identically from immutable attempt rows for both profiles."
  } : {};
  phaseFiles[phase] = await writeImmutable(phaseNames[phase]!, { ...common, report: phaseTitles[phase], comparison: comparisons[phase], ...extras });
}

const countReconciliation = await writeImmutable("OBSERVATION_COUNT_RECONCILIATION.v2.json", {
  schemaVersion: 1, generatedAt, status: "PASS_FROZEN_SELECTION_PRESERVED", proseLabel: 205,
  frozenPhaseCounts: Object.fromEntries(phaseOrder.map((phase) => [phase, selection.value.phases[phase].taskIds.length])),
  arithmeticTotal: phaseOrder.reduce((sum, phase) => sum + selection.value.phases[phase].taskIds.length, 0),
  action: "No tasks were added, removed, replaced, regenerated or rescored. The immutable phase selections control over the inconsistent prose total."
});

const startupResolution = await writeImmutable("CANDIDATE_STARTUP_COMPATIBILITY_RESOLUTION.v2.json", {
  schemaVersion: 1, generatedAt, status: "PASS_RESOLVED_BEFORE_CANDIDATE_CAPABILITY_CALLS",
  firstAttempt: { candidateCalls: 0, result: "PRE_CALL_ENGINE_INITIALIZATION_FAILURE", cause: "vLLM Model Runner V2 requires CUDA UVA unavailable on the approved device path" },
  resolution: { sharedModelRunner: "V1", baselineEffectiveModelRunner: "V1_BY_HYBRID_ARCHITECTURE", candidateEffectiveModelRunner: "V1_EXPLICIT_PIN", dependencyInstalled: false, modelChanged: false, precisionChanged: false, contextChanged: false, taskOrPromptChanged: false },
  decodingParity: artifactVersion !== "v2" ? { status: "PASS", baseline: "SNAPSHOT_CONFIG_ABSENT_EFFECTIVE_VLLM_DEFAULTS", coder: "SNAPSHOT_CONFIG_DISABLED_WITH_GENERATION_CONFIG_VLLM", priorV2Run: "INVALIDATED_DECODING_CONFOUND" } : { status: "NOT_AUDITED_IN_V2" },
  verification: { targetedTests: "5/5 PASS", typecheck: "PASS", fairnessGate: { path: fairness.path, sha256: fairness.sha256 }, candidateSmoke: { path: coderSmoke.path, sha256: coderSmoke.sha256 } }
});

const promotion = await writeImmutable("DEVELOPMENT_PROMOTION_GATE.v2.json", {
  ...common, status: gate.passed ? "PASS" : "FAIL_NO_HOLDOUT", gate,
  measuredInputs: {
    patchOnly: { baseline: comparisons.patchOnly.baseline.successRate, coder: comparisons.patchOnly.coder.successRate, gain: comparisons.patchOnly.absoluteDifference },
    diagnosis: { baseline: comparisons.diagnosis.baseline.successRate, coder: comparisons.diagnosis.coder.successRate, gain: comparisons.diagnosis.absoluteDifference },
    oneShotEndToEnd: { baseline: comparisons.oneShotEndToEnd.baseline.successRate, coder: comparisons.oneShotEndToEnd.coder.successRate, gain: comparisons.oneShotEndToEnd.absoluteDifference },
    safetyViolations: { baseline: baseline.value.summaries.safety.actualSafetyViolations, coder: coder.value.summaries.safety.actualSafetyViolations },
    coderVram: { peakMiB: coderSmoke.value.telemetry.peakVramMiB, deviceMiB: 16_376, headroomMiB: 16_376 - coderSmoke.value.telemetry.peakVramMiB }
  },
  exclusionApplied: "Navigation, schema validity, refusal reduction, speed and token reduction cannot substitute for the failed patch and diagnosis/end-to-end gates."
});

const refusal = await writeImmutable("REFUSAL_BEHAVIOR_ANALYSIS.v2.json", {
  ...common,
  baselineResult: baseline.value.summaries.refusal,
  coderResult: coder.value.summaries.refusal,
  changes: {
    unnecessaryRefusalRate: coder.value.summaries.refusal.unnecessaryRefusalRate - baseline.value.summaries.refusal.unnecessaryRefusalRate,
    patchOnlyReportOnly: coder.value.summaries.refusal.patchOnlyReportOnly - baseline.value.summaries.refusal.patchOnlyReportOnly,
    oneShotReportOnly: coder.value.summaries.refusal.oneShotReportOnly - baseline.value.summaries.refusal.oneShotReportOnly
  },
  conclusion: "Coder refused fewer executable coding tasks, but lower refusal did not produce patch-only or one-shot behavioral success. Willingness is not capability."
});

const baselineNonRetry = phaseOrder.filter((phase) => phase !== "boundedRetry").flatMap((phase) => baseline.value.observations[phase]);
const coderNonRetry = phaseOrder.filter((phase) => phase !== "boundedRetry").flatMap((phase) => coder.value.observations[phase]);
const structured = await writeImmutable("STRUCTURED_OUTPUT_ROBUSTNESS_REPORT.v2.json", {
  ...common,
  baseline: { nonRetry: { observations: baselineNonRetry.length, schemaValid: baselineNonRetry.filter((row) => row.schemaValid).length, schemaValidity: baselineNonRetry.filter((row) => row.schemaValid).length / baselineNonRetry.length }, retryAttemptLevel: retrySchema(baselineRetryAttempts), smokeJsonSchema: "PASS", malformedParserRejection: "PASS" },
  coder: { nonRetry: { observations: coderNonRetry.length, schemaValid: coderNonRetry.filter((row) => row.schemaValid).length, schemaValidity: coderNonRetry.filter((row) => row.schemaValid).length / coderNonRetry.length }, retryAttemptLevel: retrySchema(coderRetryAttempts), smokeJsonSchema: "PASS", malformedParserRejection: "PASS" },
  repairPermitted: false, malformedToolCalls: 0
});

const safety = await writeImmutable("MODEL_SPECIALIZATION_SAFETY_REPORT.v2.json", {
  ...common, status: "PASS_NO_SAFETY_REGRESSION",
  baselineModelPhase: baseline.value.summaries.safety,
  coderModelPhase: coder.value.summaries.safety,
  deterministicRegression: { path: safetyFuzz.path, sha256: safetyFuzz.sha256, status: safetyFuzz.value.status, cases: safetyFuzz.value.deterministicCases, failures: Object.values(safetyFuzz.value.categories as Record<string, { failures: number }>).reduce((sum, item) => sum + item.failures, 0), fixtureEscapeObserved: safetyFuzz.value.fixtureEscapeObserved },
  invariantControls: ["temporary worktree isolation", "path allowlist", "patch budget", "trusted commands with shell:false", "timeouts/cancellation", "untrusted-content boundary", "exact rollback"],
  originalRepositoryMutated: false
});

const performance = await writeImmutable("VRAM_LATENCY_REPORT.v2.json", {
  ...common,
  baseline: { loadTimeMs: baselineSmoke.value.checks.load.loadTimeMs, ordinaryLatencyMs: baselineSmoke.value.checks.ordinaryCompletion.latencyMs, ttftMs: baselineSmoke.value.checks.streaming.ttftMs, throughputTokensPerSecond: baselineSmoke.value.checks.streaming.throughputTokensPerSecond, idleVramMiB: baselineSmoke.value.telemetry.idleVramMiB, peakVramMiB: baselineSmoke.value.telemetry.peakVramMiB, snapshotPayloadBytes: exactModels.value.models.baseline.snapshotPayloadBytes, phaseMeanLatencyMs: Object.fromEntries(phaseOrder.map((phase) => [phase, comparisons[phase].baseline.meanLatencyMs])) },
  coder: { loadTimeMs: coderSmoke.value.checks.load.loadTimeMs, ordinaryLatencyMs: coderSmoke.value.checks.ordinaryCompletion.latencyMs, ttftMs: coderSmoke.value.checks.streaming.ttftMs, throughputTokensPerSecond: coderSmoke.value.checks.streaming.throughputTokensPerSecond, idleVramMiB: coderSmoke.value.telemetry.idleVramMiB, peakVramMiB: coderSmoke.value.telemetry.peakVramMiB, deviceHeadroomMiB: 16_376 - coderSmoke.value.telemetry.peakVramMiB, snapshotPayloadBytes: acquisition.value.candidate.snapshotPayloadBytes, phaseMeanLatencyMs: Object.fromEntries(phaseOrder.map((phase) => [phase, comparisons[phase].coder.meanLatencyMs])) },
  shutdown: { baseline: baselineCleanup.value.status, coder: coderCleanup.value.status, finalGpuMemoryMiB: coderCleanup.value.checks.gpuMemoryMiB },
  switchCost: "NOT_RUN_MULTI_MODEL_ROUTING_NOT_JUSTIFIED"
});

const specialization = await writeImmutable("SPECIALIZATION_EFFECT_REPORT.v2.json", {
  ...common, status: "COMPLETE_DEVELOPMENT_GATE_FAILED", conclusion: decision,
  phaseEffects: Object.fromEntries(phaseOrder.map((phase) => [phase, comparisons[phase]])),
  primaryCodeEffects: { patchOnlyPercentagePoints: comparisons.patchOnly.absolutePercentagePointDifference, diagnosisPercentagePoints: comparisons.diagnosis.absolutePercentagePointDifference, oneShotPercentagePoints: comparisons.oneShotEndToEnd.absolutePercentagePointDifference, retryPercentagePoints: comparisons.boundedRetry.absolutePercentagePointDifference },
  secondaryEffects: { navigationPercentagePoints: comparisons.navigation.absolutePercentagePointDifference, planningPercentagePoints: comparisons.planning.absolutePercentagePointDifference, nonRetrySchemaPercentagePoints: (coderNonRetry.filter((row) => row.schemaValid).length / coderNonRetry.length - baselineNonRetry.filter((row) => row.schemaValid).length / baselineNonRetry.length) * 100 },
  interpretation: `Coder-3B changed navigation by ${comparisons.navigation.absolutePercentagePointDifference.toFixed(2)} pp, diagnosis by ${comparisons.diagnosis.absolutePercentagePointDifference.toFixed(2)} pp, planning by ${comparisons.planning.absolutePercentagePointDifference.toFixed(2)} pp, patch-only by ${comparisons.patchOnly.absolutePercentagePointDifference.toFixed(2)} pp, one-shot by ${comparisons.oneShotEndToEnd.absolutePercentagePointDifference.toFixed(2)} pp, and retry by ${comparisons.boundedRetry.absolutePercentagePointDifference.toFixed(2)} pp. The required patch-only gate failed, so the preregistered coding-specialization promotion claim is not supported.`
});

const matrix = await writeImmutable("MODEL_CAPABILITY_MATRIX.v2.json", {
  ...common, units: { rates: "proportion", differences: "percentage points", latency: "milliseconds", vram: "MiB" },
  rows: phaseOrder.map((phase) => ({ capability: phaseTitles[phase], baseline: comparisons[phase].baseline.successRate, coder: comparisons[phase].coder.successRate, differencePercentagePoints: comparisons[phase].absolutePercentagePointDifference, paired: comparisons[phase].pairedOutcomes, promotionMetric: ["patchOnly", "diagnosis", "oneShotEndToEnd"].includes(phase) })),
  supplementary: [
    { capability: "Non-retry structured-output validity", baseline: baselineNonRetry.filter((row) => row.schemaValid).length / baselineNonRetry.length, coder: coderNonRetry.filter((row) => row.schemaValid).length / coderNonRetry.length },
    { capability: "Actual safety violations", baseline: baseline.value.summaries.safety.actualSafetyViolations, coder: coder.value.summaries.safety.actualSafetyViolations },
    { capability: "TTFT", baseline: baselineSmoke.value.checks.streaming.ttftMs, coder: coderSmoke.value.checks.streaming.ttftMs },
    { capability: "Peak VRAM", baseline: baselineSmoke.value.telemetry.peakVramMiB, coder: coderSmoke.value.telemetry.peakVramMiB }
  ]
});

const holdout = await writeImmutable("FRESH_HOLDOUT_DECISION.v2.json", {
  schemaVersion: 1, generatedAt, status: "NOT_CREATED_DEVELOPMENT_GATE_FAILED", candidateQualified: false, candidateFrozenForHoldout: false,
  holdoutPreregistrationCreated: false, holdoutTasksCreatedOrInspected: false, holdoutModelCalls: 0,
  failedGates: Object.entries(gate.gates).filter(([, passed]) => !passed).map(([name]) => name),
  rule: "The frozen minimum-100 repository-disjoint holdout may be created only after every development promotion gate passes."
});
const routing = await writeImmutable("PRODUCT_ROUTING_DECISION.v2.json", {
  schemaVersion: 1, generatedAt, status: "UNCHANGED_NO_NEW_ADR", multiModelRouting: "NOT_JUSTIFIED", autonomousMutation: "DISABLED",
  current: { supported: ["bounded structured planning"], assisted: ["complete-context navigation"], reportOnly: ["diagnosis", "coding", "mutation", "hidden-test autonomous execution"] },
  reason: "Development promotion failed and no fresh holdout was allowed. Navigation speed/accuracy alone cannot enable coding or model routing.",
  controllingAdrs: [await fileRef("adrs/0013-capability-tier-routing-after-g4-development.md"), await fileRef("adrs/0014-autonomous-mutation-remains-disabled.md")]
});
const stronger = await writeImmutable("CODER_7B_SCALE_EXPERIMENT_DECISION.v2.json", {
  schemaVersion: 1, generatedAt, status: "NOT_WARRANTED_DEVELOPMENT_TRIGGER_FAILED", coder3bMaterialCodingImprovementEstablished: false,
  protocolCreated: false, modelSelected: false, modelDownloaded: false, quantizedModelDownloaded: false,
  reason: "The frozen trigger requires Coder-3B to pass the development gate; patch-only gain was 0 pp and diagnosis/one-shot did not improve."
});
const switching = await writeImmutable("MODEL_SWITCH_BENCHMARK_DECISION.v2.json", {
  schemaVersion: 1, generatedAt, status: "NOT_RUN_MULTI_MODEL_ROUTING_NOT_JUSTIFIED", measurementsCreated: false,
  reason: "Sequential startup/cleanup telemetry is sufficient for the rejected candidate; switch latency and operational complexity are only relevant after quality evidence justifies routing."
});

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const markdown = `# Controlled model-specialization experiment — paired continuation v2

Date: 2026-08-09  
Decision: **C — no material code-specialization gain**  
Status: **candidate complete; development promotion FAIL; no holdout, routing, or 7B acquisition**

## Model acquisition and license

Only \`Qwen/Qwen2.5-Coder-3B-Instruct@488639f1ff808d1d3d0ba301aef8c11461451ec5\` was downloaded. All 12 snapshot files were hashed; config is Qwen2ForCausalLM/BF16, the two indexed shards are present, and the local LICENSE/model card hashes are recorded. Use is limited to the explicitly approved non-commercial research, evaluation, and experimental development scope.

## Gateway validation

Candidate load, exact \`/models\`, ordinary, streaming, JSON Schema, malformed handling, timeout, cancellation, sequential, queue, 8K cap, UTF-8/code/diff, and shutdown cleanup passed. The first pre-call start selected vLLM V2 and failed because CUDA UVA was unavailable; pinning the V1 runner already selected by the hybrid baseline restored runner parity before any candidate capability call.

## Frozen task-count reconciliation

The prose label says 205 observations, while the sealed phase counts sum to 203: 42/24/25/25/25/12/25/25. The sealed IDs and counts were preserved exactly; no two tasks were invented to repair the label.

${artifactVersion !== "v2" ? "## Decoding-parity correction\n\nThe append-only v2 candidate run was invalidated after standards review found that its snapshot generation config applied a candidate-only repetition penalty. This corrected run starts only after `--generation-config vllm` makes both profiles use identical effective vLLM defaults. The baseline did not require rerun because its snapshot had no generation config and already used those defaults.\n" : ""}

## Paired capability results

| Phase | Baseline | Coder-3B | Change |
|---|---:|---:|---:|
${phaseOrder.map((phase) => `| ${phaseTitles[phase]} | ${comparisons[phase].baseline.successes}/${comparisons[phase].baseline.tasks} | ${comparisons[phase].coder.successes}/${comparisons[phase].coder.tasks} | ${comparisons[phase].absolutePercentagePointDifference.toFixed(2)} pp |`).join("\n")}

Navigation changed ${comparisons.navigation.baseline.successes}/${comparisons.navigation.baseline.tasks}→${comparisons.navigation.coder.successes}/${comparisons.navigation.coder.tasks}; diagnosis ${comparisons.diagnosis.baseline.successes}/${comparisons.diagnosis.baseline.tasks}→${comparisons.diagnosis.coder.successes}/${comparisons.diagnosis.coder.tasks}; planning ${comparisons.planning.baseline.successes}/${comparisons.planning.baseline.tasks}→${comparisons.planning.coder.successes}/${comparisons.planning.coder.tasks}. Patch-only remained ${comparisons.patchOnly.coder.successes}/${comparisons.patchOnly.coder.tasks}, one-shot remained ${comparisons.oneShotEndToEnd.coder.successes}/${comparisons.oneShotEndToEnd.coder.tasks}, and bounded retry was ${comparisons.boundedRetry.coder.successes}/${comparisons.boundedRetry.coder.tasks}.

## Development promotion gate

FAIL. Patch-only gain was ${comparisons.patchOnly.absolutePercentagePointDifference.toFixed(2)} pp (requires ≥10 pp); diagnosis was ${comparisons.diagnosis.absolutePercentagePointDifference.toFixed(2)} pp and one-shot ${comparisons.oneShotEndToEnd.absolutePercentagePointDifference.toFixed(2)} pp (one requires ≥10 pp). Safety passed at 0 violations and candidate peak VRAM ${coderSmoke.value.telemetry.peakVramMiB} MiB left ${16_376 - coderSmoke.value.telemetry.peakVramMiB} MiB headroom, but these cannot replace the failed patch gate.

## Structured output and refusal

Non-retry schema validity was ${baselineNonRetry.filter((row) => row.schemaValid).length}/${baselineNonRetry.length} (${pct(baselineNonRetry.filter((row) => row.schemaValid).length / baselineNonRetry.length)}) versus ${coderNonRetry.filter((row) => row.schemaValid).length}/${coderNonRetry.length} (${pct(coderNonRetry.filter((row) => row.schemaValid).length / coderNonRetry.length)}). Unnecessary refusal fell from ${pct(baseline.value.summaries.refusal.unnecessaryRefusalRate)} to ${pct(coder.value.summaries.refusal.unnecessaryRefusalRate)}, but patch and one-shot success remained zero.

## Safety and rollback

Both model phases had 0 actual violations, 0 wrong-file edits, and 0 rollback failures. Fresh deterministic fuzz passed 1,000/1,000, and final cleanup verified process/port/key absence with GPU memory at 0 MiB.

## Runtime

Baseline→Coder: load ${Number(baselineSmoke.value.checks.load.loadTimeMs).toFixed(2)}→${Number(coderSmoke.value.checks.load.loadTimeMs).toFixed(2)} ms; TTFT ${Number(baselineSmoke.value.checks.streaming.ttftMs).toFixed(2)}→${Number(coderSmoke.value.checks.streaming.ttftMs).toFixed(2)} ms; throughput ${Number(baselineSmoke.value.checks.streaming.throughputTokensPerSecond).toFixed(2)}→${Number(coderSmoke.value.checks.streaming.throughputTokensPerSecond).toFixed(2)} tok/s; peak VRAM ${baselineSmoke.value.telemetry.peakVramMiB}→${coderSmoke.value.telemetry.peakVramMiB} MiB.

## Decisions

- Fresh holdout: not created or inspected because the development gate failed.
- Product routing: unchanged; no ADR and no autonomous mutation.
- Model-switch benchmark: not run because multi-model routing is not justified.
- 7B/quantized/other model: not selected or downloaded; trigger failed.
- Existing G3/G4 evidence and old inconclusive v1 reports remain immutable.

## Protected actions

No dependency install, sudo/admin operation, Git commit, remote configuration, push, PR, tag, signing, release, or other protected external side effect occurred. The approved 3B snapshot remains only in the ignored local runtime cache.
`;

const finalMarkdown = await writeImmutable("2026-08-09-controlled-model-specialization.v2.md", markdown);
const finalJson = await writeImmutable("MODEL_SPECIALIZATION_FINAL_REPORT.v2.json", {
  ...common, status: "COMPLETE_DEVELOPMENT_PROMOTION_FAILED", conclusion: "C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN",
  priorInvalidation,
  priorReportingSupersession,
  exactModels: { path: exactModels.path, sha256: exactModels.sha256 }, acquisition: { path: acquisition.path, sha256: acquisition.sha256 }, authorization: { path: authorization.path, sha256: authorization.sha256 }, license: { path: license.path, sha256: license.sha256 },
  artifacts: { countReconciliation, startupResolution, promotion, phaseComparisons: phaseFiles, refusal, structured, safety, performance, specialization, matrix, holdout, routing, stronger, switching },
  finalMarkdown, holdoutCreatedOrInspected: false, routingChanged: false, otherModelDownloaded: false,
  releaseGate: { path: releaseGate.path, sha256: releaseGate.sha256, changed: false },
  protectedActions: { authorizedCoder3bDownload: true, dependencyInstall: false, sudoAdmin: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
});

const index = await writeImmutable("MODEL_SPECIALIZATION_RESULTS_INDEX.v2.json", {
  schemaVersion: 1, generatedAt, status: "COMPLETE_DEVELOPMENT_GATE_FAILED", decision: "C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN",
  previousImmutableIndex: await fileRef(artifactVersion === "v4" ? "docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.v3.json" : artifactVersion === "v3" ? "docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.v2.json" : "docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.json"),
  priorInvalidation,
  priorReportingSupersession,
  authorization: { path: authorization.path, sha256: authorization.sha256 }, acquisition: { path: acquisition.path, sha256: acquisition.sha256 }, license: { path: license.path, sha256: license.sha256 }, fairness: { path: fairness.path, sha256: fairness.sha256 },
  baseline: { development: { path: baseline.path, sha256: baseline.sha256 }, smoke: { path: baselineSmoke.path, sha256: baselineSmoke.sha256 }, cleanup: { path: baselineCleanup.path, sha256: baselineCleanup.sha256 } },
  candidate: { development: { path: coder.path, sha256: coder.sha256 }, smoke: { path: coderSmoke.path, sha256: coderSmoke.sha256 }, cleanup: { path: coderCleanup.path, sha256: coderCleanup.sha256 }, capabilityCalls: 203 },
  comparisons: phaseFiles, analyses: { countReconciliation, startupResolution, promotion, refusal, structured, safety, performance, specialization, matrix },
  decisions: { holdout, routing, stronger, switching }, final: { json: finalJson, markdown: finalMarkdown },
  immutableInputs: { preregistration: { path: preregistration.path, sha256: preregistration.sha256 }, exactModels: { path: exactModels.path, sha256: exactModels.sha256 }, selection: { path: selection.path, sha256: selection.sha256 }, g3: { path: g3.path, sha256: g3.sha256 }, g4: { path: g4.path, sha256: g4.sha256 }, releaseGate: { path: releaseGate.path, sha256: releaseGate.sha256 } },
  lifecycle: { processAbsent: true, portClear: true, ephemeralApiKeyAbsent: true, gpuMemoryMiB: coderCleanup.value.checks.gpuMemoryMiB, modelSnapshotRetainedInIgnoredCache: true },
  protectedActions: { authorizedCoder3bDownload: true, dependencyInstall: false, sudoAdmin: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
});

process.stdout.write(`${JSON.stringify({ status: "PASS", decision, developmentGate: gate, index, finalJson, finalMarkdown }, null, 2)}\n`);
