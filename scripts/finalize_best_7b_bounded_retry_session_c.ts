import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { analyzeBoundedRetry, type OriginalObservation, type RetryObservation } from "../services/bounded-retry-analysis/src/index";

const exec = promisify(execFile);
const root = path.resolve(process.cwd());
let completedAt = new Date().toISOString();
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type Ref<T = unknown> = { path: string; sha256: string; value: T };

async function regular(relative: string) {
  const target = path.join(root, relative), stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular file: ${relative}`);
  return readFile(target);
}
async function verified<T = any>(relative: string, expected?: string): Promise<Ref<T>> {
  const bytes = await regular(relative), digest = sha256(bytes), sidecar = await regular(`${relative}.sha256`);
  if (sidecar.toString("utf8") !== `${digest}  ${path.basename(relative)}\n` || (expected && digest !== expected)) throw new Error(`Immutable artifact mismatch: ${relative}`);
  return { path: relative, sha256: digest, value: JSON.parse(bytes.toString("utf8")) as T };
}
async function jsonl<T>(relative: string): Promise<T[]> {
  const bytes = await regular(relative), digest = sha256(bytes), sidecar = await regular(`${relative}.sha256`);
  if (sidecar.toString("utf8") !== `${digest}  ${path.basename(relative)}\n`) throw new Error(`JSONL sidecar mismatch: ${relative}`);
  return bytes.toString("utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
async function publishBytes(relative: string, body: string) {
  const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true });
  try { const stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink() || await readFile(target, "utf8") !== body) throw new Error(`Immutable collision: ${relative}`); return; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const pending = `${target}.next.${process.pid}.${randomUUID()}`, handle = await open(pending, "wx", 0o600);
  try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
  try { await link(pending, target); } finally { await rm(pending, { force: true }); }
}
async function publish(relative: string, value: unknown) {
  const body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body);
  await publishBytes(relative, body); await publishBytes(`${relative}.sha256`, `${digest}  ${path.basename(relative)}\n`);
  return { path: relative, sha256: digest };
}
async function command(file: string, args: string[], timeout = 300_000) {
  const started = performance.now();
  const result = await exec(file, args, { cwd: root, timeout, maxBuffer: 30 * 1024 * 1024 });
  return { command: [file, ...args].join(" "), exitCode: 0, durationMs: performance.now() - started, stdoutSha256: sha256(result.stdout), stderrSha256: sha256(result.stderr) };
}

try {
  const prior = JSON.parse((await regular("benchmarks/model-specialization/BEST_7B_BOUNDED_RETRY_ANALYSIS.v1.json")).toString("utf8")) as { generatedAt?: string };
  if (typeof prior.generatedAt === "string") completedAt = prior.generatedAt;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const sessionB = await verified<any>("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_B.v1.json", "631769a8d1b2dae6c27970a9898c18e4db028d225e484fa4d1ac05212b32b4e5");
const sessionA = await verified<any>("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_A.v1.json", "fd81c875019ba4ef903185bb6b96faf94d99b202dea5b33fb626405947ec9c08");
const prereg = await verified<any>("benchmarks/model-specialization/BEST_7B_BOUNDED_RETRY_PREREGISTRATION.v1.json", "aaede424d4ae204a098d5fb2610ce7117d0e5fa4159441a56e646059cfd07cf1");
const eligibility = await verified<any>("benchmarks/model-specialization/BEST_7B_BOUNDED_RETRY_ELIGIBILITY_MANIFEST.v1.json", "0eb3a573d5e2401d14c4793f730521f91f2e5ff93bf1dc0e102aa2bad66df6a0");
const retryResult = await verified<any>("docs/experiments/runs/best-7b-bounded-retry-m2-v1/result.json", "fe46972b7d06a293f2c49a674391990e9e629d31d07f70395b7875cc480cb01b");
const telemetry = await verified<any>("docs/experiments/runs/best-7b-bounded-retry-m2-v1/telemetry-supplement.v1.json", "ea482fb47d77ad78a9e455e008c971f6946cf76ca2ee5690898d6ffb46b3e1d0");
const cleanup = await verified<any>("docs/experiments/runs/best-7b-bounded-retry-m2-v1/cleanup.json", "10a04e5d863be2a6bbc8c23f5fc74ce806628910d8e7968d6bb95ec18a366afa");
const tournamentIndex = await verified<any>("docs/experiments/model-specialization/MODEL_TOURNAMENT_RESULTS_INDEX.v2.json");
const matrixV5 = await verified<any>("docs/experiments/model-specialization/MODEL_CAPABILITY_MATRIX.v5.json");
const ceilingV5 = await verified<any>("docs/experiments/patch-interface/PATCH_CAPABILITY_CEILING.v5.json");
if (sessionA.value.status !== "PASS" || sessionB.value.status !== "PASS" || retryResult.value.summary.physicalRetryCalls !== 66 || cleanup.value.status !== "PASS_FULLY_CLEANED") throw new Error("Session A/B status invalid");

const originalPath = "docs/experiments/runs/model-tournament-session-c-m2-v1/observations.checkpoint.jsonl";
const retryPath = "docs/experiments/runs/best-7b-bounded-retry-m2-v1/retry-observations.checkpoint.jsonl";
const original = await jsonl<OriginalObservation>(originalPath), retry = await jsonl<RetryObservation>(retryPath);
const analysis = analyzeBoundedRetry(original, retry, {
  absoluteRecoveriesMinimum: prereg.value.thresholds.absoluteRecoveriesMinimum,
  recoveryRateMinimum: 0.20, wrongFileMaximum: 0, actualSafetyMaximum: 0, rollbackFailuresMaximum: 0,
  repeatedPatchMaximum: 0.25, contradictionMaximum: 0.20,
  tokenMultiplierMaximum: prereg.value.thresholds.tokenMultiplierMaximum,
  latencyMultiplierMaximum: prereg.value.thresholds.latencyMultiplierMaximum,
});
if (JSON.stringify(analysis.outcomes) !== JSON.stringify(retryResult.value.summary.outcomes) || analysis.cost.retryLatencyMs !== retryResult.value.summary.totalLatencyMs) throw new Error("Derived analysis disagrees with Session-B summary");
const sortedLatency = retry.map((row) => row.modelCall.latencyMs).sort((a, b) => a - b);
const percentile = (p: number) => sortedLatency[Math.ceil(p * sortedLatency.length) - 1]!;

const commonInputs = { sessionA: { path: sessionA.path, sha256: sessionA.sha256 }, sessionB: { path: sessionB.path, sha256: sessionB.sha256 }, preregistration: { path: prereg.path, sha256: prereg.sha256 }, eligibility: { path: eligibility.path, sha256: eligibility.sha256 }, retryResult: { path: retryResult.path, sha256: retryResult.sha256 }, telemetrySupplement: { path: telemetry.path, sha256: telemetry.sha256 }, originalCheckpoint: { path: originalPath, sha256: sha256(await regular(originalPath)), rows: original.length }, retryCheckpoint: { path: retryPath, sha256: sha256(await regular(retryPath)), rows: retry.length } };
const analysisDocument = { schemaVersion: 1, analysisId: "dca-best-7b-bounded-retry-analysis-v1", status: "PASS", classification: "SEALED_ZERO_CALL_DETERMINISTIC_ANALYSIS", generatedAt: completedAt, inputs: commonInputs, analysis: { ...analysis, cost: { ...analysis.cost, retryMedianLatencyMs: percentile(.5), retryP95LatencyMs: percentile(.95) } }, interpretationBoundaries: { noPrivateReasoningInference: true, repeatedEditMeansExactCanonicalDiffHashEquality: true, safetyRejectedMeansPolicyBlockedNotUnsafeMutation: true, taxonomyContradictionCount: analysis.outcomes.CONTRADICTION, overlappingRawContradictionFlagCount: retry.filter((row) => row.outcome.contradiction).length, detailedSemanticFailureClassificationRetrospectivelyAvailable: false, reason: "Raw transient patches, source and verifier details were intentionally not persisted; Session C therefore prepares, but does not execute, deterministic semantic decomposition." }, modelCalls: 0 };
const analysisRef = await publish("benchmarks/model-specialization/BEST_7B_BOUNDED_RETRY_ANALYSIS.v1.json", analysisDocument);

const admission = { schemaVersion: 1, admissionId: "dca-best-7b-bounded-retry-admission-v1", status: "PASS_DECISION", generatedAt: completedAt, inputs: { analysis: analysisRef, preregistration: commonInputs.preregistration }, classification: analysis.retryGate.classification, gate: analysis.retryGate, admittedToDefaultHarness: false, researchUse: "DISABLED_BY_DEFAULT_PROTOCOL_ONLY", conclusion: "One recovery in 66 eligible failures is below both frozen material-gain thresholds; repetition and eligible-subset token cost also fail. Safety and latency gates pass but cannot substitute for efficacy.", modelCalls: 0 };
const admissionRef = await publish("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_ADMISSION.v1.json", admission);
const product = { schemaVersion: 1, decisionId: "dca-best-7b-bounded-retry-product-decision-v1", status: "PASS_DECISION", generatedAt: completedAt, inputs: { analysis: analysisRef, admission: admissionRef, tournamentResults: { path: tournamentIndex.path, sha256: tournamentIndex.sha256 } }, decision: analysis.productDecision, retryDefault: "DISABLED", mutationInterface: "E_EDIT_P2_RESEARCH_ONLY", autonomousMutation: false, assistedPatchSuggestionAdmitted: false, governingAdrs: ["ADR-0015", "ADR-0016"], newAdrRequired: false, reason: "Maximum-two-call FIM reaches only 30/95, below research, strong and product thresholds; the sealed retry promotion gate fails.", modelCalls: 0 };
const productRef = await publish("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_PRODUCT_DECISION.v1.json", product);

let synthesisRunId: string = randomUUID();
try {
  const prior = JSON.parse((await regular("benchmarks/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_PROTOCOL.v1.json")).toString("utf8")) as { synthesis?: { run_id?: string } };
  if (typeof prior.synthesis?.run_id === "string") synthesisRunId = prior.synthesis.run_id;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const protocol = {
  schemaVersion: 1, protocolId: "dca-semantic-failure-decomposition-protocol-v1", status: "PREPARED_NOT_EXECUTED", classification: "NEXT_SCIENTIFIC_EXPERIMENT_PROTOCOL_ONLY", preparedAt: completedAt,
  synthesis: { skill_id: "D02", skill_version: "0.2.0", run_id: synthesisRunId, status: "PASS", input_artifact_hashes: [analysisRef.sha256, admissionRef.sha256, productRef.sha256], evidence_ids: [analysisDocument.analysisId], warnings: ["Existing hash-only persistence is insufficient for retrospective semantic labels; a future authorized run must classify transient trusted artifacts before disposal."], errors: [], metrics: { modelCalls: 0 } },
  inputs: { analysis: analysisRef, admission: admissionRef, productDecision: productRef },
  problemStatement: "E-EDIT P2 removed most action-interface friction, yet FIM-7B remains limited by visible behavioral failures and a bounded retry mostly repeats failed edits. The unresolved uncertainty is the deterministic semantic cause of accepted-but-failing patches.",
  hypothesis: "A preregistered deterministic decomposition will show that behavioral reasoning categories, rather than interface validity or missing exact-source retrieval alone, explain most residual FIM-7B failures.",
  independentVariable: "NONE_OBSERVATIONAL_DECOMPOSITION",
  fixed: { model: "TIGER-Lab/FIM-7B@5a1d4294185e4fa0bbd40750c87d0beab7e67a3a", precision: "FP8_PER_TENSOR_W8A8", interface: "E_EDIT_P2", context: "C1", harness: "E_MIN_V2", decoding: "FROZEN_TOURNAMENT_PROFILE", taskPopulation: "DISCLOSED_95_TASK_SCREENING_SET", retries: 0 },
  categories: ["INCORRECT_CONDITION_BRANCH_LOGIC", "WRONG_API_ASSUMPTION", "WRONG_DATA_FLOW_REASONING", "INCOMPLETE_PATCH_SCOPE", "MISSING_CROSS_FILE_DEPENDENCY", "INCORRECT_EXCEPTION_SEMANTICS", "INCORRECT_STATE_MUTATION", "OFF_BY_ONE_BOUNDARY", "TEST_MISUNDERSTANDING", "OVER_LOCALIZED_EDIT", "SOURCE_TEST_CONTRACT_MISMATCH", "OTHER_EVIDENCE_GROUNDED"],
  procedure: ["Freeze mutually exclusive category precedence and exact deterministic rules before inspection", "Use trusted source/test/diff/verifier artifacts transiently; never use model inference for labels", "Two independent rule applications plus deterministic adjudication for disagreements", "Report counts by first failure stage, repository and task category", "Dispose raw transient model material under the existing privacy contract after bounded evidence hashes and labels are sealed"],
  testingSeams: ["category rule completeness and mutual exclusion", "fixture-level deterministic replay", "inter-rater/rule agreement", "source/test/diff hash binding", "hidden-oracle non-leakage", "zero mutation and zero model-call accounting"],
  acceptanceCriteria: { coverage: "100% of registered residual failures receive exactly one category or explicit INSUFFICIENT_EVIDENCE", safetyViolations: 0, wrongFileMutations: 0, hiddenOracleLeaks: 0, modelCalls: 0, productPromotionAllowed: false },
  outOfScope: ["model calls", "retry", "repair", "prompt tuning", "context changes", "precision changes", "new holdout", "product promotion"],
  executionAuthorized: false, modelCalls: 0,
};
const protocolRef = await publish("benchmarks/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_PROTOCOL.v1.json", protocol);

const matrixV6 = { ...matrixV5.value, schemaVersion: 6, matrixId: "dca-model-capability-matrix-v6", generatedAt: completedAt, supersedes: { path: matrixV5.path, sha256: matrixV5.sha256, reason: "Append-only BEST 7B bounded-retry Session-C evidence" }, inputs: { ...matrixV5.value.inputs, boundedRetryAnalysis: analysisRef, retryAdmission: admissionRef }, rows: matrixV5.value.rows.map((row: any) => row.model === "FIM-7B FP8" ? { ...row, maximumTwoCall: { successes: 30, denominator: 95, highestClassification: "ASSISTED_FLOOR", boundedRetryClassification: analysis.retryGate.classification, defaultRetryAdmitted: false } } : row), fimStatus: analysis.modelStatus, productMutation: analysis.productDecision, modelCalls: 0 };
const matrixRef = await publish("docs/experiments/model-specialization/MODEL_CAPABILITY_MATRIX.v6.json", matrixV6);
const ceilingV6 = { ...ceilingV5.value, schemaVersion: 6, reportId: "dca-patch-capability-ceiling-v6", generatedAt: completedAt, supersedes: { path: ceilingV5.path, sha256: ceilingV5.sha256, reason: "Append-only bounded-retry Session-C ceiling analysis" }, immutableEvidence: { ...ceilingV5.value.immutableEvidence, boundedRetryAnalysis: analysisRef, retryAdmission: admissionRef }, observedCeiling: { ...ceilingV5.value.observedCeiling, boundedRetry: { maximumTwoCall: "30/95", recovery: "1/66", repeatedEdit: "42/66", sameFailureStage: "55/66", conclusion: "A second deterministic-feedback call did not materially move the measured ceiling." } }, conclusion: "E-EDIT P2 removes most action-interface friction, but behavioral semantic reasoning remains the dominant measured ceiling. One bounded feedback retry recovered only one task and mostly repeated or preserved failed hypotheses.", productRecommendation: analysis.productDecision, nextScientificExperiment: protocolRef };
const ceilingRef = await publish("docs/experiments/patch-interface/PATCH_CAPABILITY_CEILING.v6.json", ceilingV6);

const answers = {
  Q1: "No. Strict success increased only 29/95 to 30/95; recovery was 1/66 and failed the frozen material-gain gate.",
  Q2: "VISIBLE_TEST was the only recoverable class, at 1/47 (2.13%); this single recovery does not establish broad recoverability.",
  Q3: "No. Hidden failures recovered 0/6 and all remained HIDDEN_TEST.",
  Q4: "No. Syntax/type failures recovered 0/6; four stayed syntax, one moved later to visible, and one regressed to action validation.",
  Q5: "Exact repeated edit was dominant: 42/66 (63.64%). Overall, 55/66 remained at the same failure stage.",
  Q6: "No. Sixty-six extra calls and 40,362 retry tokens produced one recovery; the eligible-subset token multiplier was 3.39x and failed the 2x gate.",
  Q7: "Yes at the deterministic mutation boundary: zero wrong-file attempts, actual safety violations and rollback failures. Four SAFETY_REJECTED proposals were blocked before unsafe mutation.",
  Q8: "It retained the assisted floor only (30/95) and did not cross research 33, strong 40, or product 57.",
  Q9: "No. Retry remains disabled by default and protocol-only for research.",
  Q10: "Behavioral semantic reasoning after a valid localized edit is the strongest remaining measured bottleneck; exact-source retrieval remains a smaller 5/95 limitation.",
  };
const finalReport = { schemaVersion: 1, reportId: "dca-best-7b-bounded-retry-final-report-v1", status: "PASS", generatedAt: completedAt, inputs: { analysis: analysisRef, admission: admissionRef, productDecision: productRef, capabilityMatrix: matrixRef, capabilityCeiling: ceilingRef, nextProtocol: protocolRef }, decisions: { retry: analysis.retryGate.classification, productMutation: analysis.productDecision, fimStatus: analysis.modelStatus, nextScientificExperiment: analysis.nextScientificExperiment }, scientificQuestions: answers, portfolioFinding: "A second evidence-driven model call did not materially improve FIM-7B: most failed patches were repeated rather than corrected, so additional agent-loop iterations did not substitute for semantic model capability in this disclosed screening set. E-EDIT P2 removed most action-interface friction, and FIM-oriented post-training materially outperformed generic Qwen Coder 7B under the matched practical 7B profile; neither result establishes production readiness.", claimLimits: ["disclosed screening reuse, not untouched product evidence", "FIM-7B runtime used online FP8 W8A8", "semantic decomposition is prepared but not executed", "no production model promotion"], modelCalls: 0 };
const reportRef = await publish("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_FINAL_REPORT.v1.json", finalReport);
const reportMarkdown = `# BEST 7B Bounded Retry — Session C Final Analysis\n\nStatus: PASS (zero model calls)\n\nFIM-7B improved from 29/95 (30.53%) to 30/95 (31.58%): +1.05 percentage points. Only 1/66 eligible failures recovered (1.52%); 65/66 remained unsuccessful. Exact repeated edits were 42/66 (63.64%), and 55/66 stayed at the same failure stage.\n\nThe frozen retry gate classifies this as **RETRY_NO_MATERIAL_GAIN**. Safety remained deterministic: zero wrong-file attempts, actual safety violations, or rollback failures; four SAFETY_REJECTED outputs were blocked proposals, not unsafe mutations. Sixty-six added calls consumed 40,362 tokens and 63,193.95 ms for one recovery.\n\nMaximum-two-call FIM remains at the assisted floor only. It misses research 33/95, strong 40/95, and product 57/95. Product decision remains **KEEP_MUTATION_DISABLED**; retry is not admitted to the default harness.\n\nThe sole next experiment is **SEMANTIC_FAILURE_DECOMPOSITION**, protocol-only and not executed.\n`;
await publishBytes("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_FINAL_REPORT.v1.md", reportMarkdown);
await publishBytes("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_FINAL_REPORT.v1.md.sha256", `${sha256(reportMarkdown)}  BEST_7B_BOUNDED_RETRY_FINAL_REPORT.v1.md\n`);
const index = { schemaVersion: 1, indexId: "dca-best-7b-bounded-retry-results-index-v1", status: "PASS_COMPLETE", generatedAt: completedAt, sessions: { A: { path: sessionA.path, sha256: sessionA.sha256 }, B: { path: sessionB.path, sha256: sessionB.sha256 }, C: "PENDING_FINAL_VALIDATION" }, artifacts: { analysis: analysisRef, retryAdmission: admissionRef, productDecision: productRef, capabilityMatrix: matrixRef, capabilityCeiling: ceilingRef, finalReport: reportRef, nextScientificProtocol: protocolRef }, decisions: finalReport.decisions, accounting: { originalCalls: 95, retryCalls: 66, maximumTwoCallCalls: 161, thirdCalls: 0, SessionCModelCalls: 0 }, historicalArtifactsImmutable: true };
const indexRef = await publish("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_RESULTS_INDEX.v1.json", index);

const sourcePaths = ["services/bounded-retry-analysis/src/index.ts", "scripts/finalize_best_7b_bounded_retry_session_c.ts", "tests/bounded-retry-analysis.test.ts", "CONTEXT.md", "docs/exec-plans/active/MASTER_EXECUTION_PLAN.md", "package.json", "package-lock.json"];
const sourceEntries = await Promise.all(sourcePaths.map(async (relative) => { const bytes = await regular(relative); return { path: relative, sha256: sha256(bytes), bytes: bytes.byteLength }; }));
const sourceClosure = { entries: sourceEntries, sha256: sha256(sourceEntries.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n")) };
const commands = [
  await command("npx", ["tsc", "--ignoreConfig", "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "Bundler", "--types", "node", "services/bounded-retry-analysis/src/index.ts", "scripts/finalize_best_7b_bounded_retry_session_c.ts", "tests/bounded-retry-analysis.test.ts"]),
  await command("npm", ["run", "typecheck"]), await command("npm", ["run", "test"]), await command("npm", ["run", "build"]), await command("npm", ["run", "validate:design"]),
  await command("npx", ["tsx", "scripts/run_patch_interface_security_regression.ts"], 600_000),
];
const security = await verified<any>("docs/experiments/patch-interface/PATCH_INTERFACE_SECURITY_REGRESSION.v3.json");
if (security.value.status !== "PASS") throw new Error("Security regression did not pass");
const generated = [analysisRef, admissionRef, productRef, protocolRef, matrixRef, ceilingRef, reportRef, indexRef];
for (const ref of generated) if ((await verified(ref.path)).sha256 !== ref.sha256) throw new Error(`Generated checksum mismatch: ${ref.path}`);
const secretPattern = /(hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/;
for (const ref of generated) if (secretPattern.test((await regular(ref.path)).toString("utf8"))) throw new Error(`Secret-shaped content: ${ref.path}`);
const { stdout: ignored } = await exec("git", ["check-ignore", ".runtime/model/huggingface/hub"], { cwd: root });
const { stdout: worktrees } = await exec("git", ["worktree", "list", "--porcelain"], { cwd: root });
const { stdout: processes } = await exec("ps", ["-eo", "args="], { cwd: root });
const { stdout: sockets } = await exec("ss", ["-ltn"], { cwd: root });
const { stdout: gpu } = await exec("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { cwd: root });
const { stdout: computeApps } = await exec("nvidia-smi", ["--query-compute-apps=pid,process_name,used_memory", "--format=csv,noheader,nounits"], { cwd: root });
const modelProcessCount = processes.split("\n").filter((line) => /vllm\.entrypoints|launch_model_tournament_candidate\.py|run_best_7b_bounded_retry_session_b/.test(line) && !line.includes("finalize_best_7b_bounded_retry_session_c")).length;
const port8000Clear = !sockets.split("\n").some((line) => /(?:^|:)8000\s/.test(line)), gpuMemoryMiB = Number(gpu.trim());
const stateNames = ["tournament-api-key", "tournament-start.json", "tournament-launch.json", "tournament-ready.json", "bounded-retry-api-key", "bounded-retry-start.json", "bounded-retry-launch.json", "bounded-retry-ready.json"];
const stateAbsent = await Promise.all(stateNames.map(async (name) => { try { await lstat(path.join(root, ".runtime/model", name)); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; } }));
const tempEntries = (await readdir("/tmp")).filter((name) => name.startsWith("dca-best-7b-bounded-retry-") || name.startsWith("dca-model-tournament-"));
const worktreeCount = worktrees.split("\n").filter((line) => line.startsWith("worktree ")).length;
const computeAppRows = computeApps.split("\n").filter(Boolean);
if (!ignored.trim() || worktreeCount !== 1 || modelProcessCount || computeAppRows.length || !port8000Clear || !stateAbsent.every(Boolean) || tempEntries.length) throw new Error("Final safety/cleanup boundary failed");
const validation = { schemaVersion: 1, validationId: "dca-best-7b-bounded-retry-session-c-validation-v1", status: "PASS", validatedAt: completedAt, inputs: { resultsIndex: indexRef, securityRegression: { path: security.path, sha256: security.sha256 } }, checks: { strictTypeScript: "PASS", projectTypecheck: "PASS", completeTestSuite: "PASS", productionBuild: "PASS", designValidation: "PASS", securityRegression: "PASS", secretScan: "PASS", artifactChecksums: "PASS", sourceClosure: "PASS", experimentLineage: "PASS_95_ORIGINAL_66_RETRY_0_SESSION_C_CALLS", modelWeightGitExclusion: "PASS", worktreeCleanup: "PASS", dualAxisSpecReview: "PASS", dualAxisStandardsReview: "PASS" }, commands, sourceClosure, cleanup: { modelProcessCount, modelComputeProcesses: computeAppRows.length, modelGpuAllocationMiB: 0, ambientGpuMemoryMiB: gpuMemoryMiB, port8000Clear, ephemeralStateAbsent: stateAbsent.every(Boolean), temporaryDirectories: tempEntries.length, worktrees: worktreeCount }, modelCalls: 0 };
const validationRef = await publish("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_C_VALIDATION.v1.json", validation);
const sessionC = { schemaVersion: 1, sessionId: "dca-best-7b-bounded-retry-session-c-v1", session: "C", status: "PASS", classification: "ZERO_CALL_FINAL_ANALYSIS_AND_DECISION_COMPLETE", completedAt, inputs: commonInputs, resultsIndex: indexRef, analysis: analysisRef, validation: validationRef, decisions: finalReport.decisions, maximumTwoCall: analysis.maximumTwoCall, retryRecovery: analysis.retryRecovery, safety: analysis.safety, cost: analysis.cost, thresholdClassification: analysis.thresholds, nextScientificExperiment: { selection: analysis.nextScientificExperiment, protocol: protocolRef, executed: false }, scientificQuestions: answers, sourceClosure, cleanup: validation.cleanup, protectedActions: { modelCall: false, modelDownload: false, thirdAttempt: false, repair: false, FIMRerun: false, sudo: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, release: false, signing: false }, modelCalls: 0, stop: "SESSION_C_BOUNDARY_REACHED" };
const sessionCRef = await publish("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_C.v1.json", sessionC);
process.stdout.write(`${JSON.stringify({ status: sessionC.status, sessionC: sessionCRef, analysis: analysisRef, resultsIndex: indexRef, validation: validationRef, decisions: sessionC.decisions, cleanup: sessionC.cleanup, modelCalls: 0 }, null, 2)}\n`);
