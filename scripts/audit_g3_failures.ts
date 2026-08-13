import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const outputRoot = path.join(root, "docs/experiments/g4-diagnostics");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const readJson = async <T>(relative: string) => JSON.parse(await readFile(path.join(root, relative), "utf8")) as T;
const inputs = {
  primary: "docs/experiments/runs/m9-g3-primary-2026-08-09T09-20-10-123Z/g3-primary-result.json",
  longHorizon: "docs/experiments/runs/m9-g3-long-horizon-2026-08-09T09-47-25-429Z/long-horizon-result.json",
  historicalPatch: "docs/experiments/runs/m9-g3-real-patch-2026-08-09T09-59-19-019Z/g3-real-patch-result.json",
  onboarding: "docs/experiments/runs/m9-g3-onboarding-2026-08-09T10-49-13-597Z/real-repository-onboarding-result.json",
  onboardingManifest: "benchmarks/g3/g3_onboarding_manifest.json",
  patchManifest: "benchmarks/g3/g3_real_patch_manifest.json",
  patchOracle: "benchmarks/g3/g3_real_patch_oracle.sealed.json",
  resultsIndex: "benchmarks/g3/G3_RESULTS_INDEX.json"
} as const;
const sourceHashes = Object.fromEntries(await Promise.all(Object.entries(inputs).map(async ([key, relative]) => [key, { path: relative, sha256: sha256(await readFile(path.join(root, relative))) }])));

type FailureCause = "TASK_UNDERSTANDING" | "RETRIEVAL" | "EVIDENCE_COMPOSITION" | "REASONING" | "PATCH_GENERATION" | "TOOL_EXECUTION" | "VERIFICATION" | "ORACLE_MISMATCH" | "POLICY_BLOCK" | "ENVIRONMENT" | "OTHER";
type AnyRow = Record<string, any>;
const normalizeEvidencePath = (value: string) => value.replace(/#L\d+(?:-L?\d+)?$/, "").replace(/:\d+(?:-\d+)?$/, "");
const unique = <T>(values: T[]) => [...new Set(values)];
const missing = (row: AnyRow) => (row.requiredEvidencePaths ?? []).filter((item: string) => !(row.includedEvidencePaths ?? []).includes(item));

function classify(suite: string, row: AnyRow): { primary: FailureCause; secondary: FailureCause[]; basis: string[] } {
  const secondary: FailureCause[] = [];
  const basis: string[] = [];
  const add = (cause: FailureCause, reason: string) => { if (!secondary.includes(cause)) secondary.push(cause); basis.push(reason); };
  if (row.actualSafetyViolation || row.unsafeAttempt) add("POLICY_BLOCK", "unsafe attempt or actual safety violation recorded");
  if (row.error || row.schemaValid === false) add(suite === "historical_patch" ? "PATCH_GENERATION" : "TOOL_EXECUTION", `schema/error=${row.error ?? "INVALID_SCHEMA"}`);
  if (row.retrievalRequiredEvidenceComplete === false || row.evidenceSetComplete === false || row.retrievalEvidenceComplete === false || Number(row.retrievalCoverage ?? 1) < 1) add("RETRIEVAL", "required evidence was not fully retrieved");
  if (row.evidenceCorrect === false || row.evidenceComplete === false || row.unsupportedClaim || (row.unsupportedEvidencePaths?.length ?? 0) > 0) add("EVIDENCE_COMPOSITION", "response omitted required citations or cited unsupported paths");
  if (row.statusCorrect === false || row.targetCorrect === false || row.answerTermsCorrect === false) add(row.statusCorrect === false ? "TASK_UNDERSTANDING" : "REASONING", "response status, target, or answer terms did not satisfy the task contract");
  if (suite === "historical_patch") {
    if (row.selectedOutcome !== "PATCH" || !row.patchApplied || row.parserStatus === "FAIL") add("PATCH_GENERATION", "no valid applicable parser-clean patch was produced");
    if (row.patchApplied && row.parserStatus === "PASS" && !row.hiddenExact) add("PATCH_GENERATION", "applicable patch did not match the sealed historical snapshot");
    if (String(row.visibleTests).startsWith("NOT_RUN") || String(row.regressionTests).startsWith("NOT_RUN")) add("ENVIRONMENT", "pinned executable dependency/test environment was unavailable");
    add("ORACLE_MISMATCH", "the hidden oracle is exact historical after-content, not a behavioral equivalence oracle");
  }
  if (suite === "onboarding") {
    const normalizedUnsupported = (row.unsupportedEvidencePaths ?? []).map(normalizeEvidencePath);
    if (normalizedUnsupported.some((item: string) => (row.includedEvidencePaths ?? []).includes(item))) add("ORACLE_MISMATCH", "location-qualified citation normalizes to a known included path but the scorer required exact path identity");
  }
  if (suite === "long_horizon" && row.iterations > 1 && !row.recoveryAfterFirstFailure) add("REASONING", "bounded retries did not recover after concrete feedback");
  const precedence: FailureCause[] = suite === "historical_patch"
    ? ["POLICY_BLOCK", "PATCH_GENERATION", "TOOL_EXECUTION", "RETRIEVAL", "ENVIRONMENT", "ORACLE_MISMATCH", "REASONING", "TASK_UNDERSTANDING", "OTHER"]
    : ["POLICY_BLOCK", "TOOL_EXECUTION", "RETRIEVAL", "TASK_UNDERSTANDING", "EVIDENCE_COMPOSITION", "REASONING", "VERIFICATION", "ORACLE_MISMATCH", "ENVIRONMENT", "OTHER"];
  const primary = precedence.find((cause) => secondary.includes(cause)) ?? "OTHER";
  return { primary, secondary: secondary.filter((cause) => cause !== primary), basis };
}

const primary = await readJson<{ observations: AnyRow[] }>(inputs.primary);
const longHorizon = await readJson<{ observations: AnyRow[] }>(inputs.longHorizon);
const patch = await readJson<{ observations: AnyRow[]; oraclePolicy: AnyRow }>(inputs.historicalPatch);
const onboarding = await readJson<{ observations: AnyRow[] }>(inputs.onboarding);
const onboardingManifest = await readJson<{ tasks: AnyRow[] }>(inputs.onboardingManifest);
const patchManifest = await readJson<{ tasks: AnyRow[] }>(inputs.patchManifest);
const patchOracle = await readJson<{ rows: AnyRow[] }>(inputs.patchOracle);
const onboardingById = new Map(onboardingManifest.tasks.map((row) => [row.task_id, row]));

const matrix: AnyRow[] = [];
for (const [suite, rows] of [
  ["primary", primary.observations],
  ["long_horizon", longHorizon.observations],
  ["historical_patch", patch.observations],
  ["onboarding", onboarding.observations]
] as const) {
  for (const row of rows.filter((item) => !item.success)) {
    const attempt = suite === "long_horizon" ? row.attempts?.at(-1) ?? {} : {};
    const effective = { ...row, ...attempt };
    const task = suite === "onboarding" ? onboardingById.get(row.taskId) : undefined;
    const causes = classify(suite, effective);
    matrix.push({
      suite,
      taskId: row.taskId,
      repository: row.repositoryId,
      split: row.split ?? "SECONDARY_DIAGNOSTIC",
      category: row.category ?? row.questionType ?? (suite === "historical_patch" ? "historical_patch" : "UNKNOWN"),
      difficulty: row.difficulty ?? "NOT_RECORDED",
      candidate: row.configuration,
      taskInterpretation: { expected: row.expectedOutcome ?? (suite === "onboarding" ? "ANSWER" : suite === "historical_patch" ? "PATCH" : "NOT_RECORDED"), selected: row.selectedOutcome ?? attempt.status ?? "NOT_RECORDED", statusCorrect: effective.statusCorrect ?? "NOT_RECORDED" },
      retrievedEvidence: row.includedEvidencePaths ?? row.initialIncludedPaths ?? [],
      missingEvidence: missing({ ...row, requiredEvidencePaths: row.requiredEvidencePaths ?? task?.required_evidence_paths ?? [] }),
      irrelevantEvidence: Number(row.irrelevantTokenRatio ?? 0),
      modelResponse: { storage: "HASH_ONLY", sha256: row.outputHash ?? attempt.outputHash ?? null, schemaValid: effective.schemaValid ?? "NOT_RECORDED", error: effective.error ?? null },
      toolActions: { count: row.toolCalls ?? 0, details: "NOT_STORED" },
      generatedPatch: suite === "historical_patch" ? { storage: "HASH_ONLY", applied: row.patchApplied, changedFiles: row.changedFiles, changedLines: row.changedLines, error: row.patchError } : { status: "NOT_APPLICABLE_OR_NOT_STORED" },
      visibleVerification: row.visibleTests ?? "NOT_RECORDED",
      hiddenVerification: row.hiddenTests ?? row.hiddenOracleResult ?? "NOT_RECORDED",
      finalOracle: row.hiddenOracleResult ?? (row.success ? "PASS" : "FAIL"),
      failureTaxonomy: causes
    });
  }
}

const counts = Object.fromEntries(unique(matrix.map((row) => row.failureTaxonomy.primary)).sort().map((cause) => [cause, matrix.filter((row) => row.failureTaxonomy.primary === cause).length]));
const bySuite = Object.fromEntries(unique(matrix.map((row) => row.suite)).map((suite) => [suite, Object.fromEntries(unique(matrix.filter((row) => row.suite === suite).map((row) => row.failureTaxonomy.primary)).sort().map((cause) => [cause, matrix.filter((row) => row.suite === suite && row.failureTaxonomy.primary === cause).length]))]));
const decomposition = {
  schemaVersion: 1,
  status: "PASS_DIAGNOSTIC_NOT_CANDIDATE_TUNING",
  classification: "G3_IMMUTABLE_HOLDOUT_POST_HOC_FAILURE_DECOMPOSITION",
  sourceHashes,
  taxonomy: ["TASK_UNDERSTANDING", "RETRIEVAL", "EVIDENCE_COMPOSITION", "REASONING", "PATCH_GENERATION", "TOOL_EXECUTION", "VERIFICATION", "ORACLE_MISMATCH", "POLICY_BLOCK", "ENVIRONMENT", "OTHER"],
  precedenceDisclosure: "Primary cause is the earliest actionable causal boundary observable in stored telemetry; secondary causes remain explicit. Hash-only response retention prevents semantic re-annotation.",
  aggregate: { failures: matrix.length, counts, percentages: Object.fromEntries(Object.entries(counts).map(([cause, count]) => [cause, Number((Number(count) / matrix.length * 100).toFixed(2))])), bySuite },
  reasoningVersusRetrieval: { reasoningBoundary: matrix.filter((row) => ["TASK_UNDERSTANDING", "EVIDENCE_COMPOSITION", "REASONING", "PATCH_GENERATION"].includes(row.failureTaxonomy.primary)).length, retrieval: matrix.filter((row) => row.failureTaxonomy.primary === "RETRIEVAL").length },
  rows: matrix,
  limitations: ["Model prose and patch text are hash-only in the immutable results, so task interpretation and patch content cannot be reconstructed.", "Root-cause labels are deterministic telemetry classifications, not a blinded human semantic annotation.", "This analysis is diagnostic use of G3 and cannot be used to tune E-MIN-V2, E-MIN-V3, or a G4 candidate."]
};

const patchByTask = patchManifest.tasks.map((task) => {
  const oracle = patchOracle.rows.find((row) => row.task_id === task.task_id);
  const observations = patch.observations.filter((row) => row.taskId === task.task_id);
  const diff = String(oracle?.hidden_oracle?.patch ?? "");
  const changedText = diff.split("\n").filter((line) => /^[+-](?![+-])/.test(line)).join("\n");
  const likelyDocumentationOnly = /(?:\.md|\.rst|README|LICENSE|\.txt)$/i.test(String(oracle?.source_path)) || (!/[=(){};]/.test(changedText) && /(?:\"\"\"|\/\*|\*\/|\/\/|#\s)/.test(changedText));
  return {
    taskId: task.task_id,
    repository: task.repository_id,
    baseCommit: task.base_commit,
    fixCommit: oracle?.fix_commit,
    allowedFiles: task.allowed_files,
    historicalPatchSha256: oracle?.expected_patch_sha256,
    historicalAfterContentSha256: oracle?.after_sha256,
    oracleNature: "EXACT_HISTORICAL_AFTER_CONTENT_PLUS_LANGUAGE_PARSER",
    likelyDocumentationOnly,
    behavioralOracleAvailability: "NOT_AVAILABLE",
    configurations: observations.map((row) => ({
      candidate: row.configuration,
      exactPatchMatch: row.hiddenExact,
      patchApplied: row.patchApplied,
      buildResult: row.parserStatus === "PASS" ? "PASS_LANGUAGE_PARSER_ONLY" : row.parserStatus,
      visibleTests: row.visibleTests,
      hiddenTests: "NOT_AVAILABLE_BEHAVIOR_TESTS_NOT_PINNED",
      behavioralOracle: "NOT_RUN_NO_BEHAVIOR_ORACLE",
      wrongFileEdit: row.wrongFileEdit,
      regression: row.regressionTests,
      policyCompliance: !row.wrongFileEdit && !row.unrelatedEdit && row.rollbackCorrect,
      acceptableAlternativePatch: "NOT_EVALUATED_EXACT_ORACLE_CANNOT_RECOGNIZE_EQUIVALENCE",
      patchSize: { files: row.changedFiles, lines: row.changedLines, lineBudget: row.changedLineBudget },
      finalStrictProductPass: false
    }))
  };
});
const patchAudit = {
  schemaVersion: 1,
  status: "AUDIT_COMPLETE_BEHAVIOR_NOT_ESTABLISHED",
  preservedOriginalMetric: Object.fromEntries(unique(patch.observations.map((row) => row.configuration)).map((candidate) => [candidate, { exactPass: patch.observations.filter((row) => row.configuration === candidate && row.hiddenExact).length, tasks: 60 }])),
  definition: { exactPass: "Candidate diff must apply within the allowlist, pass the language parser, yield the exact sealed historical after-content SHA-256, make no unrelated edit, and rollback cleanly.", behavioralCorrectness: "Not measured by the G3 historical patch oracle.", acceptableAlternative: "Not recognizable by exact after-content identity." },
  findings: { tasks: patchByTask.length, tasksWithPinnedBehaviorOracle: 0, likelyDocumentationOnly: patchByTask.filter((row) => row.likelyDocumentationOnly).length, exactIdentityIsSoleHiddenCorrectnessCheck: true },
  rows: patchByTask,
  sourceHashes,
  limitations: ["The immutable run did not retain generated diff text, and temporary worktrees were correctly rolled back.", "Upstream dependencies and visible/hidden behavior tests were not pinned; rerunning them now would not reconstruct the historical observation.", "NOT_RUN and NOT_AVAILABLE remain non-PASS."]
};
const behavioralEval = {
  schemaVersion: 1,
  evaluationId: "HISTORICAL_PATCH_BEHAVIORAL_EVAL",
  status: "COMPLETE_WITH_BEHAVIOR_ORACLE_GAP",
  releaseInterpretation: "FAIL_NO_BEHAVIORAL_EVIDENCE",
  rows: patchByTask,
  aggregate: { tasks: 60, observations: 180, exactPass: patch.observations.filter((row) => row.hiddenExact).length, buildParserPass: patch.observations.filter((row) => row.parserStatus === "PASS").length, visibleTestPass: 0, hiddenBehaviorTestPass: 0, behavioralOraclePass: 0, behaviorOracleUnavailableTasks: 60, wrongFileEdits: patch.observations.filter((row) => row.wrongFileEdit).length, rollbackPass: patch.observations.filter((row) => row.rollbackCorrect).length },
  note: "This artifact preserves the old exact metric and records the absence of a behavioral oracle task-by-task. A separately sealed G4 development patch suite supplies executable behavior oracles; it does not rewrite G3."
};

const componentMap: Record<string, string[]> = {
  purpose: ["project_purpose"],
  contributor_run: ["install_procedure", "run_procedure", "contributor_starting_point"],
  execution_entry: ["run_procedure", "entry_point"],
  testing_workflow: ["test_procedure"],
  license_constraints: ["license"],
  reading_order: ["major_modules", "contributor_starting_point"],
  architecture: ["major_modules", "architecture_flow"],
  dependencies: ["dependency_summary"]
};
const onboardingRows = onboarding.observations.map((row) => {
  const task = onboardingById.get(row.taskId)!;
  const normalizedUnsupported = row.unsupportedEvidencePaths.map(normalizeEvidencePath);
  const rangeCitationToIncludedPath = normalizedUnsupported.filter((item: string) => row.includedEvidencePaths.includes(item));
  const normalizedLowerBoundComplete = row.evidenceComplete || task.required_evidence_paths.every((required: string) => normalizedUnsupported.includes(required));
  return {
    taskId: row.taskId,
    repository: row.repositoryId,
    split: row.split,
    candidate: row.configuration,
    questionType: row.questionType,
    targetComponents: componentMap[row.questionType] ?? [],
    exactAllComponentsPass: row.success,
    semanticComponentAccuracy: "NOT_AVAILABLE_MODEL_ANSWER_RETAINED_AS_HASH_ONLY",
    recoverableSignals: { responseStatusCorrect: row.statusCorrect, retrievalEvidenceComplete: row.retrievalRequiredEvidenceComplete, exactCitationComplete: row.evidenceComplete, normalizedCitationCompleteLowerBound: normalizedLowerBoundComplete, originalEvidencePrecision: row.evidencePrecision, unsupportedClaimOriginal: row.unsupportedClaim, rangeCitationToKnownIncludedPath: rangeCitationToIncludedPath },
    modelResponse: { storage: "HASH_ONLY", sha256: row.outputHash },
    finalStrictProductPass: false
  };
});
const componentNames = unique(Object.values(componentMap).flat());
const componentReport = {
  schemaVersion: 1,
  status: "DIAGNOSTIC_PARTIAL_SIGNALS_ONLY_STRICT_RESULT_PRESERVED",
  originalBinary: { allCandidatesCombined: { pass: onboarding.observations.filter((row) => row.success).length, observations: onboarding.observations.length }, holdout: Object.fromEntries(unique(onboarding.observations.map((row) => row.configuration)).map((candidate) => [candidate, { pass: onboarding.observations.filter((row) => row.split === "holdout" && row.configuration === candidate && row.success).length, tasks: onboarding.observations.filter((row) => row.split === "holdout" && row.configuration === candidate).length }])) },
  aggregateByCandidate: Object.fromEntries(unique(onboarding.observations.map((row) => row.configuration)).map((candidate) => {
    const rows = onboardingRows.filter((row) => row.candidate === candidate);
    return [candidate, { exactAllComponentsPass: rows.filter((row) => row.exactAllComponentsPass).length, observations: rows.length, responseStatusAccuracy: rows.filter((row) => row.recoverableSignals.responseStatusCorrect).length / rows.length, retrievalEvidenceAccuracy: rows.filter((row) => row.recoverableSignals.retrievalEvidenceComplete).length / rows.length, exactCitationAccuracy: rows.filter((row) => row.recoverableSignals.exactCitationComplete).length / rows.length, normalizedCitationCompleteLowerBound: rows.filter((row) => row.recoverableSignals.normalizedCitationCompleteLowerBound).length / rows.length, unsupportedClaimRateOriginal: onboarding.observations.filter((row) => row.configuration === candidate && row.unsupportedClaim).length / rows.length, missingComponentRate: "NOT_AVAILABLE_WITHOUT_ANSWER_TEXT" }];
  })),
  aggregateByComponent: Object.fromEntries(componentNames.map((component) => {
    const rows = onboardingRows.filter((row) => row.targetComponents.includes(component));
    return [component, { observations: rows.length, semanticAccuracy: "NOT_AVAILABLE", retrievalEvidenceAccuracy: rows.filter((row) => row.recoverableSignals.retrievalEvidenceComplete).length / rows.length, normalizedCitationCompleteLowerBound: rows.filter((row) => row.recoverableSignals.normalizedCitationCompleteLowerBound).length / rows.length }];
  })),
  rows: onboardingRows,
  limitations: ["The immutable result stores response hashes but not answer text, so semantic component accuracy and missing-component rate cannot be recovered honestly.", "Normalized citation completeness is a lower bound because supported cited paths were not retained as a list.", "Partial signals are research diagnostics and never change strict end-to-end failures into PASS."]
};
const onboardingAudit = {
  schemaVersion: 1,
  status: "ORACLE_MISMATCH_CONFIRMED_STRICT_RESULT_PRESERVED",
  exactScorer: { requiredStatus: "ANSWER", evidencePathComparison: "EXACT_STRING_IDENTITY", requiredEvidenceAllOf: true, unsupportedKnownPathCheck: "EXACT_STRING_IDENTITY", targetPathsMustBeEmpty: true },
  finding: { allResponsesFailedStatusContract: onboarding.observations.filter((row) => !row.statusCorrect).length, observations: onboarding.observations.length, locationQualifiedCitationsMisclassifiedUnsupported: onboarding.observations.filter((row) => row.unsupportedEvidencePaths.map(normalizeEvidencePath).some((item: string) => row.includedEvidencePaths.includes(item))).length, semanticAnswerScoring: "ABSENT", allOrNothing: true },
  conclusion: "The 0/96 holdout binary result is preserved. It combines genuine status/task-contract failures with exact-path citation strictness and does not measure semantic onboarding completeness.",
  sourceHashes
};

await mkdir(outputRoot, { recursive: true });
async function writeArtifact(name: string, value: object) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(outputRoot, name), body, { flag: "wx" });
  await writeFile(path.join(outputRoot, `${name}.sha256`), `${sha256(body)}  ${name}\n`, { flag: "wx" });
  return { path: `docs/experiments/g4-diagnostics/${name}`, sha256: sha256(body) };
}
const artifacts = [];
artifacts.push(await writeArtifact("G3_FAILURE_DECOMPOSITION_MATRIX.json", decomposition));
artifacts.push(await writeArtifact("HISTORICAL_PATCH_ORACLE_AUDIT.json", patchAudit));
artifacts.push(await writeArtifact("HISTORICAL_PATCH_BEHAVIORAL_EVAL.json", behavioralEval));
artifacts.push(await writeArtifact("ONBOARDING_ORACLE_AUDIT.json", onboardingAudit));
artifacts.push(await writeArtifact("ONBOARDING_COMPONENT_LEVEL_REPORT.json", componentReport));
process.stdout.write(`${JSON.stringify({ status: "PASS", artifacts, failures: matrix.length, primaryCauses: counts, patch: behavioralEval.aggregate, onboarding: componentReport.originalBinary }, null, 2)}\n`);
