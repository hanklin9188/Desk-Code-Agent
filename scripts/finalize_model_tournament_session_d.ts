import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { failureProfile, pairedAnalysis, thresholdClassification, type OutcomeMetric, type TournamentObservation } from "../services/model-tournament-analysis/src/index.js";

const exec = promisify(execFile);
const root = path.resolve(process.cwd());
const completedAt = new Date().toISOString();
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type Ref<T = any> = { path: string; sha256: string; value: T };

async function regular(relative: string) {
  const target = path.join(root, relative), stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular file: ${relative}`);
  return readFile(target);
}
async function verified<T = any>(relative: string): Promise<Ref<T>> {
  const bytes = await regular(relative), digest = sha256(bytes), sidecar = await regular(`${relative}.sha256`);
  if (sidecar.toString("utf8") !== `${digest}  ${path.basename(relative)}\n`) throw new Error(`Invalid sidecar: ${relative}`);
  return { path: relative, sha256: digest, value: JSON.parse(bytes.toString("utf8")) as T };
}
async function publish(relative: string, value: unknown) {
  const target = path.join(root, relative), body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body);
  await mkdir(path.dirname(target), { recursive: true });
  for (const [file, contents] of [[target, body], [`${target}.sha256`, `${digest}  ${path.basename(target)}\n`]] as const) {
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || await readFile(file, "utf8") !== contents) throw new Error(`Immutable collision: ${relative}`);
      continue;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const pending = `${file}.next.${process.pid}.${randomUUID()}`, handle = await open(pending, "wx", 0o600);
    try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
    try { await link(pending, file); } finally { await unlink(pending).catch(() => undefined); }
  }
  return { path: relative, sha256: digest };
}
function jsonl(bytes: Buffer) {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) throw new Error("JSONL lacks terminal newline");
  return text.slice(0, -1).split("\n").map((line) => JSON.parse(line) as any);
}
function exactKeys(value: object, keys: string[], label: string) {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} keys drift`);
}
const ref = (value: Ref) => ({ path: value.path, sha256: value.sha256 });

const sessionA = await verified("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_A.v1.json");
const sessionB = await verified("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_B.v1.json");
const sessionC = await verified("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_C.v1.json");
const prereg = await verified("benchmarks/model-specialization/PRACTICAL_LOCAL_MODEL_TOURNAMENT_PREREGISTRATION.v1.json");
const candidateManifest = await verified("benchmarks/model-specialization/MODEL_TOURNAMENT_CANDIDATE_MANIFEST.v1.json");
const feasibility = await verified("benchmarks/model-specialization/MODEL_TOURNAMENT_FEASIBILITY.v1.json");
const holdoutIndex = await verified("docs/experiments/patch-interface/E_EDIT_HOLDOUT_RESULTS_INDEX.v1.json");
const holdoutResult = await verified("docs/experiments/runs/e-edit-holdout-p2-20260811T111300Z/result.json");
if (sessionA.value.status !== "PASS" || sessionB.value.status !== "PASS" || sessionC.value.status !== "PASS") throw new Error("Session A/B/C status mismatch");
if (sessionC.sha256 !== "32ff39c05b5ce6c64b57ac77085df2b5666750a8a5689d3ac801a683bd3ec683") throw new Error("Session C immutable hash mismatch");
if (prereg.sha256 !== "51f983f63719494e8877eb7b24fcbc7a47b0b9fb53d5c1e2bb838961b87246c1") throw new Error("Tournament preregistration drift");
if (sessionC.value.contract.physicalPrimaryCalls !== 285 || sessionC.value.contract.telemetryNonPrimaryCalls !== 3 || sessionC.value.contract.eventRows !== 855 || sessionC.value.contract.retries !== 0 || sessionC.value.contract.reviewerCalls !== 0 || sessionC.value.contract.duplicateObservationIds !== 0) throw new Error("Session C lineage mismatch");

const referenceCheckpointPath = holdoutResult.value.artifacts.checkpoint.path as string;
const referenceCheckpointBytes = await regular(referenceCheckpointPath);
if (sha256(referenceCheckpointBytes) !== holdoutResult.value.artifacts.checkpoint.sha256) throw new Error("Reference checkpoint drift");
const rows: Record<"reference" | "M1" | "M2" | "M3", TournamentObservation[]> = { reference: jsonl(referenceCheckpointBytes), M1: [], M2: [], M3: [] };
const candidateResults: Record<string, Ref> = {}, candidateCleanups: Record<string, Ref> = {}, acquisitions: Record<string, Ref> = {};
for (const candidateId of ["M1", "M2", "M3"] as const) {
  const run = `docs/experiments/runs/model-tournament-session-c-${candidateId.toLowerCase()}-v1`;
  candidateResults[candidateId] = await verified(`${run}/result.json`);
  candidateCleanups[candidateId] = await verified(`${run}/cleanup.json`);
  acquisitions[candidateId] = await verified(`docs/experiments/model-specialization/tournament-session-b/${candidateId}_ACQUISITION.v1.json`);
  const final = await verified<any[]>(`${run}/observations.final.json`);
  rows[candidateId] = final.value;
  const checkpointBytes = await regular(`${run}/observations.checkpoint.jsonl`), eventsBytes = await regular(`${run}/call-events.jsonl`);
  if (sha256(checkpointBytes) !== candidateResults[candidateId].value.artifacts.checkpoint.sha256 || sha256(eventsBytes) !== candidateResults[candidateId].value.artifacts.callEvents.sha256) throw new Error(`${candidateId} ledger drift`);
  const checkpoints = jsonl(checkpointBytes), events = jsonl(eventsBytes);
  if (checkpoints.length !== 95 || events.length !== 285 || JSON.stringify(checkpoints) !== JSON.stringify(final.value)) throw new Error(`${candidateId} ledger counts/final mismatch`);
  for (let index = 0; index < 95; index += 1) {
    const row = checkpoints[index], triplet = events.slice(index * 3, index * 3 + 3);
    if (row.index !== index || triplet[0].event !== "CALL_INTENT" || triplet[1].event !== "CALL_STARTED" || triplet[2].event !== "CALL_COMPLETED" || triplet.some((event: any) => event.observationId !== row.observationId)) throw new Error(`${candidateId} event ordering mismatch`);
  }
  if (candidateCleanups[candidateId].value.status !== "PASS_FULLY_CLEANED") throw new Error(`${candidateId} cleanup failed`);
}
if (rows.reference.length !== 95 || !rows.M1.every((row, index) => row.taskId === rows.reference[index].taskId) || !rows.M2.every((row, index) => row.taskId === rows.reference[index].taskId)) throw new Error("Reference pairing mismatch");
if (candidateResults.M1.value.status !== "COMPLETE_PRIMARY_PENDING_CLEANUP" || candidateResults.M2.value.status !== "COMPLETE_PRIMARY_PENDING_CLEANUP" || candidateResults.M3.value.status !== "INFRASTRUCTURE_BLOCKED_PENDING_CLEANUP") throw new Error("Candidate scoring eligibility mismatch");

const compare = (left: keyof typeof rows, right: keyof typeof rows, metric: OutcomeMetric) => pairedAnalysis(rows[left], rows[right], metric, left, right);
const m1VsReference = compare("reference", "M1", "strictBehavioral");
const m2VsReference = compare("reference", "M2", "strictBehavioral");
const m2VsM1 = Object.fromEntries((["strictBehavioral", "syntax", "visible", "hidden"] as const).map((metric) => [metric, compare("M1", "M2", metric)]));
const profiles = { reference: failureProfile(rows.reference), M1: failureProfile(rows.M1), M2: failureProfile(rows.M2) };
if (JSON.stringify(profiles.reference) !== JSON.stringify({ RETRIEVAL: 5, ACTION_VALIDATION: 6, PATCH_CONSTRUCTION: 0, SYNTAX_TYPE: 17, VISIBLE_TEST: 34, HIDDEN_TEST: 10, SUCCESS: 23, TOOL_INFRASTRUCTURE: 0, OTHER: 0 })) throw new Error("Reference failure profile drift");

const pairedRows = rows.reference.map((reference, index) => ({
  taskId: reference.taskId,
  repositoryId: reference.repositoryId,
  reference: { strict: reference.outcome.behavioralSuccess, syntax: reference.execution.syntax === "PASS", visible: reference.execution.visible === "PASS", hidden: reference.execution.hidden === "PASS" },
  M1: { strict: rows.M1[index].outcome.behavioralSuccess, syntax: rows.M1[index].execution.syntax === "PASS", visible: rows.M1[index].execution.visible === "PASS", hidden: rows.M1[index].execution.hidden === "PASS" },
  M2: { strict: rows.M2[index].outcome.behavioralSuccess, syntax: rows.M2[index].execution.syntax === "PASS", visible: rows.M2[index].execution.visible === "PASS", hidden: rows.M2[index].execution.hidden === "PASS" },
}));
const analysis = {
  schemaVersion: 1, analysisId: "dca-practical-local-model-tournament-paired-analysis-v1", status: "PASS", completedAt,
  population: 95, statistics: { repetitions: 10_000, seed: 20260811, units: ["task", "repository_cluster"], exactMcNemar: true },
  inputs: { sessionC: ref(sessionC), referenceResult: ref(holdoutResult), M1: ref(candidateResults.M1), M2: ref(candidateResults.M2) },
  comparisons: { m1VsReference, m2VsReference, m2VsM1 }, failureProfiles: profiles, pairedRows,
  interpretation: {
    M1: "MATERIALLY_WORSE_PRACTICAL_LOCAL_MODEL_EFFECT_NOT_PURE_SCALE",
    M2VsReference: "DIRECTIONAL_GAIN_NOT_STATISTICALLY_ESTABLISHED",
    M2VsM1: "MATERIAL_FIM_AGENTIC_GAIN",
    causalBoundary: "M1 versus M2 is a matched practical 7B comparison supporting a post-training association, not pure causal isolation. Reference comparisons additionally differ in model family, parameter count and BF16 versus FP8 precision.",
  }, privacy: { rawPromptsStored: false, rawOutputsStored: false, hiddenOracleStored: false }, modelCalls: 0,
};
const analysisRef = await publish("benchmarks/model-specialization/MODEL_TOURNAMENT_PAIRED_ANALYSIS.v1.json", analysis);

const summaries = { reference: { exactSourceSelected: 90, validActions: 89, syntaxPasses: 71, visibleTestPasses: 33, hiddenTestPasses: 42, behavioralSuccesses: 23, wrongFileAttempts: 0, actualSafetyViolations: 0, rollbackFailures: 0 }, M1: candidateResults.M1.value.summary, M2: candidateResults.M2.value.summary, M3: candidateResults.M3.value.summary };
const thresholds = { reference: thresholdClassification(23), M1: thresholdClassification(7), M2: thresholdClassification(29), M3: { status: "NOT_SCORED" } };
const matrix = {
  schemaVersion: 5, matrixId: "dca-model-capability-matrix-v5", status: "PASS", generatedAt: completedAt,
  supersedes: { path: "docs/experiments/model-specialization/MODEL_CAPABILITY_MATRIX.v4.json", reason: "Practical local 7B tournament Session-D sealed analysis; preserves prior development diagnostics" },
  inputs: { sessionC: ref(sessionC), pairedAnalysis: analysisRef, referenceHoldout: ref(holdoutIndex) }, units: { counts: "tasks out of 95", latency: "milliseconds", vram: "MiB" },
  rows: [
    { model: "Qwen3.5-4B BF16 reference", scoringStatus: "SCORED_REFERENCE", ...summaries.reference, strictBehavioral: 23, threshold: thresholds.reference },
    { model: "Qwen2.5-Coder-7B-Instruct FP8", scoringStatus: "SCORED", ...summaries.M1, strictBehavioral: 7, threshold: thresholds.M1 },
    { model: "FIM-7B FP8", scoringStatus: "SCORED", ...summaries.M2, strictBehavioral: 29, threshold: thresholds.M2 },
    { model: "SWE-agent-LM-7B FP8", scoringStatus: "INFRASTRUCTURE_BLOCKED_NOT_SCORED", ...summaries.M3, strictBehavioral: 2, threshold: thresholds.M3 },
  ],
  competitiveRankingAllowed: ["M1", "M2"], excludedFromRanking: ["M3"], modelCalls: 0,
};
const matrixRef = await publish("docs/experiments/model-specialization/MODEL_CAPABILITY_MATRIX.v5.json", matrix);

const m3Failures = rows.M3.filter((row: any) => row.outcome.transportFailure);
if (m3Failures.length !== 2 || m3Failures.some((row: any) => row.modelCall.finishReason !== "length" || row.modelCall.completionTokens !== 640 || row.normalization.classification !== "MALFORMED_SCHEMA")) throw new Error("M3 failure mechanism drift");
const m3Infrastructure = {
  schemaVersion: 1, stateId: "dca-model-tournament-m3-infrastructure-v1", status: "INFRASTRUCTURE_BLOCKED_NOT_SCORED", recordedAt: completedAt,
  inputs: { sessionC: ref(sessionC), result: ref(candidateResults.M3) },
  observed: { affectedCalls: 2, taskIndexes: m3Failures.map((row: any) => row.index), taskIdSha256: m3Failures.map((row: any) => sha256(row.taskId)), finishReason: "length", completionTokensEach: 640, schemaClassification: "MALFORMED_SCHEMA", rawOutputsStored: false, replacementCalls: 0 },
  mechanism: { inferenceProducedTokens: true, validStructuredActionProduced: false, networkOrEndpointFailureObserved: false, serializerFailureObserved: false, outputCapReached: true, adapterClassification: "INVALID_JSON surfaced by the shared structured runtime and coarsened to TRANSPORT_FAILURE by the frozen Session-C runner", attribution: "OBSERVED_ONLY_ON_M3_BUT_GENERIC_RUNTIME_PATH; MODEL_SPECIFIC_CAUSALITY_NOT_ESTABLISHED" },
  competition: { ranked: false, promoted: false, diagnosticOnly: true },
  futureRequalification: { useful: true, selectedAsNextExperiment: false, requiresNewGeneration: true, requirements: ["seal a fresh M3-only infrastructure protocol", "preserve model/revision/profile/context/640-token cap", "separate finish_reason=length from network transport without changing tournament results", "zero reuse in this tournament", "no silent retry"] },
  modelCalls: 0,
};
const m3Ref = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_M3_INFRASTRUCTURE.v1.json", m3Infrastructure);

const performance = Object.fromEntries((["M1", "M2", "M3"] as const).map((id) => {
  const result = candidateResults[id].value, summary = result.summary, telemetry = result.telemetry, gpuTotalMiB = 16376;
  return [id, { inputTokens: summary.totalPromptTokens, outputTokens: summary.totalCompletionTokens, totalTokens: summary.totalPromptTokens + summary.totalCompletionTokens, loadTimeMs: telemetry.loadTimeMs, ttftMs: telemetry.ttftMs, generationThroughputTokensPerSecond: telemetry.generationThroughputTokensPerSecond, medianLatencyMs: summary.medianLatencyMs, p95LatencyMs: summary.p95LatencyMs, loadedIdleVramMiB: telemetry.loadedIdleVramMiB, inferencePeakVramMiB: telemetry.inferencePeakVramMiB, peakAtLeastIdle: telemetry.inferencePeakVramMiB >= telemetry.loadedIdleVramMiB, vramHeadroomMiB: gpuTotalMiB - telemetry.inferencePeakVramMiB, vramHeadroomPercent: 100 * (gpuTotalMiB - telemetry.inferencePeakVramMiB) / gpuTotalMiB }];
}));
const provenance = Object.fromEntries((["M1", "M2", "M3"] as const).map((id) => [id, { acquisition: ref(acquisitions[id]), status: acquisitions[id].value.status, licenseAndProvenance: acquisitions[id].value.licenseAndProvenance }]));

const modelSelection = {
  schemaVersion: 1, decisionId: "dca-practical-local-model-tournament-model-selection-v1", status: "PASS_GATE_APPLIED", decidedAt: completedAt, outcome: "NO_MODEL_PROMOTED",
  inputs: { preregistration: ref(prereg), sessionC: ref(sessionC), analysis: analysisRef, matrix: matrixRef },
  scoredCandidates: ["M1", "M2"], excludedCandidates: [{ candidateId: "M3", reason: "INFRASTRUCTURE_BLOCKED_NOT_SCORED" }],
  highestObservedScoredCandidate: "M2", highestObservedStrictBehavioral: "29/95", assistedFloorReached: true,
  gates: { productThreshold57: false, researchThreshold33: false, pairedGainOverReferenceStatisticallyEstablished: false, safetyZero: true, wrongFileZero: true, rollbackFailureZero: true, servingStable: true, rtx4080SuperFeasible: true, provenanceSufficientForProductPromotion: false, newUntouchedProductHoldout: false },
  assistedFloorInterpretation: "29/95 satisfies only the absolute assisted and retry floor. It is not sufficient for PRODUCTION_MODEL_CANDIDATE or an enabled assisted-patch product route because the preregistered all-gates policy, research/product thresholds, paired evidence, provenance caveat, and new untouched product validation remain unmet.",
  thresholdChangedAfterResults: false, modelCalls: 0,
};
const selectionRef = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_MODEL_SELECTION.v1.json", modelSelection);

const productDecision = {
  schemaVersion: 1, decisionId: "dca-practical-local-model-tournament-product-decision-v1", status: "PASS_GATE_APPLIED", decidedAt: completedAt, outcome: "KEEP_MUTATION_DISABLED",
  inputs: { priorDecision: { path: "docs/experiments/patch-interface/E_EDIT_PRODUCT_DECISION.v1.json", sha256: holdoutIndex.value.artifacts.productDecision.sha256 }, modelSelection: selectionRef, analysis: analysisRef },
  rejectedOutcomes: { ASSISTED_PATCH_SUGGESTION_CANDIDATE: "M2 reaches the floor but lacks the full paired/product/new-holdout evidence required to change product state", EXPERIMENTAL_BOUNDED_MUTATION_CANDIDATE: "No admitted task class and strict success below research/product thresholds", AUTONOMOUS_PATCH_CANDIDATE: "No candidate reaches 57/95" },
  eEditStatus: "RESEARCH_ONLY_MUTATION_INTERFACE", deterministicSafetyAndVerificationRemainEnabled: true, productMutationEnabled: false, modelCalls: 0,
};
const productRef = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_PRODUCT_DECISION.v1.json", productDecision);

const retryEligibility = {
  schemaVersion: 1, decisionId: "dca-best-7b-bounded-retry-eligibility-v1", status: "PASS_GATE_APPLIED", decidedAt: completedAt, outcome: "BEST_7B_BOUNDED_RETRY_PROTOCOL_JUSTIFIED_NOT_EXECUTED",
  candidate: { candidateId: "M2", modelId: candidateResults.M2.value.candidate.modelId, revision: candidateResults.M2.value.candidate.revision },
  inputs: { preregistration: ref(prereg), result: ref(candidateResults.M2), selection: selectionRef }, prerequisite: { behavioralMinimum29: true, observed: 29, actualSafetyViolationsZero: true, rollbackFailuresZero: true, eligibleFailedTasks: 66 },
  boundary: { newExperimentGenerationRequired: true, currentTournamentRetryCalls: 0, hiddenOracleFeedbackForbidden: true, semanticReviewerForbidden: true, maximumAdditionalCallPerEligibleTask: 1 }, modelCalls: 0,
};
const retryEligibilityRef = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_RETRY_ELIGIBILITY.v1.json", retryEligibility);
const retryProtocol = {
  schemaVersion: 1, protocolId: "dca-best-7b-bounded-retry-protocol-v1", state: "PROTOCOL_ONLY_NOT_STARTED", preparedAt: completedAt,
  inputs: { eligibility: retryEligibilityRef, M2Result: ref(candidateResults.M2), preregistration: ref(prereg) },
  scientificQuestion: "Can one evidence-driven second call recover deterministic M2 failures without increasing wrong-file, safety, rollback, contradiction, repetition, token, or latency risk?",
  candidate: retryEligibility.candidate, eligiblePopulation: { source: "M2 strict failures", count: 66, ordering: "taskId ascending", currentTournamentRowsRemainImmutable: true },
  fixed: { modelRevision: candidateResults.M2.value.candidate.revision, runtimePrecision: "FP8_PER_TENSOR_W8A8", vllm: "0.26.0", contextLength: 8192, eMinV2: "UNCHANGED", c1: "UNCHANGED", eEditP2: "UNCHANGED", decoding: "UNCHANGED", maximumSecondCallsPerTask: 1 },
  secondCallMayReceiveOnly: ["original task", "current relevant source", "first bounded edit hash and bounded action summary", "exact deterministic failure", "genuinely new deterministic evidence"],
  forbidden: ["hidden expected patch", "hidden oracle answer", "semantic reviewer", "human patch", "conversation history", "candidate-specific tuning", "automatic fallback"],
  preregisterBeforeCalls: ["exact task IDs", "request intent hashes", "failure evidence hashes", "call ledger", "retention thresholds", "source closure", "cleanup policy"],
  inheritedRetentionGate: { absoluteRecoveriesMinimum: 10, recoveryRateMinimum: "20% of eligible", wrongFile: 0, actualSafety: 0, rollbackFailures: 0, repeatedPatchMaximum: "25%", contradictionMaximum: "20%", tokenMultiplierMaximum: 2, latencyMultiplierMaximum: 2.5 },
  authorization: { modelCallsAuthorized: false, experimentStarted: false },
};
const retryProtocolRef = await publish("benchmarks/model-specialization/BEST_7B_BOUNDED_RETRY_PROTOCOL.v1.json", retryProtocol);

const ceiling = {
  schemaVersion: 5, reportId: "dca-patch-capability-ceiling-v5", status: "PASS", generatedAt: completedAt,
  supersedes: { path: "docs/experiments/patch-interface/PATCH_CAPABILITY_CEILING.v4.json", reason: "Practical local 7B tournament Session-D evidence" },
  immutableEvidence: { sessionC: ref(sessionC), pairedAnalysis: analysisRef, modelSelection: selectionRef, productDecision: productRef },
  observedCeiling: { actionInterface: "E-EDIT P2 remains effectively solved at 89-92 valid actions among scored models", retrieval: "90/95 exact-source selection/inclusion remains a secondary fixed limitation", dominant: "VISIBLE_BEHAVIOR_REASONING", supportingFailureShift: { reference: profiles.reference, M1: profiles.M1, M2: profiles.M2 }, precisionCaveat: "Reference is BF16; 7B candidates are online FP8 W8A8" },
  conclusion: "M2 converts substantially more accepted edits than M1, especially by reducing syntax failures, but 29/95 remains below research and product thresholds and visible behavioral reasoning is the largest remaining measured bottleneck.",
  productRecommendation: "KEEP_MUTATION_DISABLED", nextScientificExperiment: ref({ ...retryProtocolRef, value: null }),
};
const ceilingRef = await publish("docs/experiments/patch-interface/PATCH_CAPABILITY_CEILING.v5.json", ceiling);

const scientificConclusions = {
  Q1: { answer: "NO", conclusion: "M1 materially regressed versus the 4B reference under the practical FP8 profile", evidence: "pairedAnalysis.comparisons.m1VsReference" },
  Q2: { answer: "YES_MATCHED_EVIDENCE", conclusion: "M2 materially improved over M1 under the matched 7B serving profile", evidence: "pairedAnalysis.comparisons.m2VsM1" },
  Q3: { answer: "DIRECTIONAL_BUT_INCONCLUSIVE", conclusion: "M2 observed +6/95 over 4B, but paired uncertainty does not establish a material gain", evidence: "pairedAnalysis.comparisons.m2VsReference" },
  Q4: { answer: "NO", conclusion: "M1's regression and the BF16/FP8 difference do not support scale alone", evidence: "pairedAnalysis.interpretation" },
  Q5: { answer: "YES_BOUNDED", conclusion: "FIM/agentic post-training is associated with a material matched 7B gain, without claiming pure causal isolation", evidence: "pairedAnalysis.comparisons.m2VsM1" },
  Q6: { answer: "YES_RESEARCH_INTERFACE", conclusion: "P2 action validity remains high; semantic correctness, not interface compliance, differentiates scored models", evidence: "capabilityMatrix.rows" },
  Q7: { answer: "VISIBLE_BEHAVIOR_REASONING", conclusion: "M2's largest earliest-failure bucket is 47 visible-test failures after syntax improved", evidence: "pairedAnalysis.failureProfiles.M2" },
  Q8: { answer: "NO_PRODUCT_CANDIDATE", conclusion: "M2 reaches only the absolute assisted floor and is eligible for new validation/retry research, not an enabled assisted route", evidence: "modelSelection" },
  Q9: { answer: "NO", conclusion: "No candidate reaches the 57/95 autonomous/product threshold", evidence: "modelSelection.gates.productThreshold57" },
};
const report = {
  schemaVersion: 1, reportId: "dca-practical-local-model-tournament-final-report-v1", status: "PASS", generatedAt: completedAt,
  skill: { skillId: "R24", skillVersion: "0.2.0", status: "PASS", warnings: ["M3 diagnostic only", "Reference BF16 versus candidate FP8 prevents pure scale attribution"], errors: [] },
  inputs: { sessionC: ref(sessionC), analysis: analysisRef, matrix: matrixRef, selection: selectionRef, productDecision: productRef, ceiling: ceilingRef, m3Infrastructure: m3Ref, retryEligibility: retryEligibilityRef, retryProtocol: retryProtocolRef },
  thresholds, comparisons: analysis.comparisons, failureProfiles: profiles, performance, provenance, scientificConclusions,
  decisions: { modelWinner: "NO_MODEL_PROMOTED", productMutation: "KEEP_MUTATION_DISABLED", retry: retryEligibility.outcome, nextExperiment: retryProtocol.protocolId },
  portfolioFinding: "Under frozen E-EDIT P2, action validity stayed high across scored models, while matched 7B post-training—not parameter count alone—was associated with whether bounded edits became correct repository patches. FIM-7B materially beat Qwen Coder 7B, but did not establish a statistically reliable gain over the 4B BF16 reference or meet product thresholds.",
  claimBoundary: { screeningReuseNotUntouched: true, newRepositoryDisjointUntouchedHoldoutRequiredForProductClaim: true, noPureScaleClaim: true, M3Excluded: true },
  modelCalls: 0,
};
const reportRef = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_FINAL_REPORT.v1.json", report);

const sourcePaths = ["services/model-tournament-analysis/src/index.ts", "scripts/finalize_model_tournament_session_d.ts", "tests/model-tournament-analysis.test.ts", "package.json", "package-lock.json"];
const sourceEntries = await Promise.all(sourcePaths.map(async (relative) => { const bytes = await regular(relative); return { path: relative, sha256: sha256(bytes), bytes: bytes.byteLength }; }));
const sourceClosure = { entries: sourceEntries, sha256: sha256(sourceEntries.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n")) };
const { stdout: processOutput } = await exec("ps", ["-eo", "args="]), { stdout: sockets } = await exec("ss", ["-ltn"]), { stdout: gpu } = await exec("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"]);
const modelProcessCount = processOutput.split("\n").filter((line) => /vllm\.entrypoints|launch_model_tournament_candidate\.py/.test(line) && !line.includes("finalize_model_tournament_session_d")).length;
const port8000Clear = !sockets.split("\n").some((line) => /(?:^|:)8000\s/.test(line)), gpuMemoryMiB = Number(gpu.trim());
const stateNames = ["tournament-api-key", "tournament-start.json", "tournament-launch.json", "tournament-ready.json"], stateAbsent = [];
for (const name of stateNames) { try { await lstat(path.join(root, ".runtime/model", name)); stateAbsent.push(false); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") stateAbsent.push(true); else throw error; } }
if (modelProcessCount || !port8000Clear || gpuMemoryMiB !== 0 || !stateAbsent.every(Boolean)) throw new Error("Session D runtime cleanup failed");

const sessionD = {
  schemaVersion: 1, sessionId: "dca-practical-local-model-tournament-session-d-v1", session: "D", status: "PASS", classification: "ZERO_CALL_FINAL_ANALYSIS_AND_DECISION", completedAt,
  inputs: { sessionA: ref(sessionA), sessionB: ref(sessionB), sessionC: ref(sessionC), preregistration: ref(prereg), candidateManifest: ref(candidateManifest), feasibility: ref(feasibility), referenceHoldout: ref(holdoutIndex) },
  lineage: { M1PrimaryCalls: 95, M2PrimaryCalls: 95, M3PrimaryCalls: 95, totalPrimaryCalls: 285, telemetryCalls: 3, eventRows: 855, retryCalls: 0, reviewerCalls: 0, duplicateObservations: 0, silentRetries: 0, sessionDModelCalls: 0 },
  phases: { lineageValidation: "PASS", M1VsReference: "PASS", M2VsReference: "PASS", M2VsM1: "PASS", failureShift: "PASS", M3Exclusion: "PASS", performance: "PASS", deployment: "PASS", provenance: "PASS_WITH_M2_CAVEAT", modelSelection: "NO_MODEL_PROMOTED", productMutation: "KEEP_MUTATION_DISABLED", retryEligibility: retryEligibility.outcome, nextExperiment: "PROTOCOL_ONLY_NOT_STARTED", finalRegression: "PENDING_POST_PUBLICATION_VALIDATION" },
  artifacts: { pairedAnalysis: analysisRef, capabilityMatrix: matrixRef, modelSelection: selectionRef, productDecision: productRef, capabilityCeiling: ceilingRef, m3Infrastructure: m3Ref, retryEligibility: retryEligibilityRef, nextExperimentProtocol: retryProtocolRef, finalReport: reportRef },
  sourceClosure, cleanup: { modelProcessCount, port8000Clear, gpuMemoryMiB, ephemeralApiKeyAndStateAbsent: stateAbsent.every(Boolean), newPrimaryCalls: 0 },
  privacy: { rawPromptsStored: false, rawOutputsStored: false, rawPatchesStored: false, hiddenOracleStored: false, apiKeysStored: false },
  protectedActions: { modelDownload: false, modelRerun: false, retry: false, sudo: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, release: false, signing: false },
};
const sessionDRef = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_D.v1.json", sessionD);
const index = {
  schemaVersion: 1, indexId: "dca-practical-local-model-tournament-results-index-v1", status: "PASS_COMPLETE", generatedAt: completedAt,
  sessions: { A: ref(sessionA), B: ref(sessionB), C: ref(sessionC), D: sessionDRef },
  artifacts: sessionD.artifacts, decisions: { model: "NO_MODEL_PROMOTED", productMutation: "KEEP_MUTATION_DISABLED", M3: "INFRASTRUCTURE_BLOCKED_NOT_SCORED", retry: retryEligibility.outcome, nextExperiment: retryProtocol.protocolId },
  physicalLineage: { tournamentPrimaryCalls: 285, tournamentTelemetryCalls: 3, sessionDModelCalls: 0 },
};
const indexRef = await publish("docs/experiments/model-specialization/MODEL_TOURNAMENT_RESULTS_INDEX.v1.json", index);
process.stdout.write(`${JSON.stringify({ status: "PASS_SESSION_D", sessionD: sessionDRef, index: indexRef, decisions: index.decisions, strictComparisons: { m1VsReference, m2VsReference, m2VsM1: m2VsM1.strictBehavioral }, performance, cleanup: sessionD.cleanup }, null, 2)}\n`);
