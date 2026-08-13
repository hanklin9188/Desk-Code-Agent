import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd()); const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const paths = {
  primary: "docs/experiments/runs/m9-fresh-holdout-g1-2026-08-09T06-37-31-981Z/paired-transition-matrix.json",
  patchInvalid: "docs/experiments/runs/m9-fresh-real-patch-g1-2026-08-09T06-43-35-547Z/real-patch-corpus-result.json",
  patch: "docs/experiments/runs/m9-fresh-real-patch-g1-evaluator-correction-2026-08-09T06-45-01-506Z/real-patch-corpus-result.json",
  safety: "docs/experiments/runs/m9-fresh-safety-g1-2026-08-09T06-46-52-884Z/fresh-safety-result.json",
  specialistInvalid: "docs/experiments/runs/m9-fresh-specialists-g1-2026-08-09T06-48-55-240Z/specialist-ablation-result.json",
  specialists: "docs/experiments/runs/m9-fresh-specialists-g1-evaluator-correction-2026-08-09T06-49-53-336Z/specialist-ablation-result.json",
  repositories: "docs/experiments/runs/m9-real-repositories-g1-2026-08-09T06-53-15-910Z/real-repository-result.json",
  m8: "docs/experiments/runs/m8-ui-performance-2026-08-09T06-54-15-004Z/result.json"
};
const loaded = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, relative]) => { const bytes = await readFile(path.join(root, relative)); return [key, { relative, bytes, sha256: sha256(bytes), value: JSON.parse(bytes.toString("utf8")) as Record<string, any> }]; }))) as Record<keyof typeof paths, { relative: string; bytes: Buffer; sha256: string; value: Record<string, any> }>;
const primary = loaded.primary.value; const repositories = loaded.repositories.value; const specialists = loaded.specialists.value; const patch = loaded.patch.value; const safety = loaded.safety.value;
const evidence = Object.fromEntries(Object.entries(loaded).map(([key, item]) => [key, { path: item.relative, sha256: item.sha256 }]));

const retrieval = {
  schemaVersion: 1,
  reportId: "m9-fresh-retrieval-generalization-g1",
  status: "HYPOTHESIS_FAILED",
  fixedPolicy: { primary: "SYMBOL_TOP_2", fallback: "HYBRID_TOP_2_ONLY_WHEN_PREDECLARED", kChangedAfterEvaluation: false },
  controlledHoldout: primary.retrievalSummary,
  pinnedPublicRepositories: repositories.summary.emin.retrieval,
  thresholds: { mrrMinimum: 0.9, retrievalFailureRateMaximum: 0.1 },
  conclusion: "MRR and first-hit rank generalized on the controlled holdout, but full required-evidence recall did not. The preregistered retrieval-failure hypothesis failed, and two of twelve pinned public-repository tasks failed after missing evidence.",
  realRepositoryFailures: repositories.observations.filter((row: Record<string, unknown>) => row.configuration === "E-MIN-V2" && row.success !== true).map((row: Record<string, any>) => ({ taskId: row.taskId, repositoryId: row.repositoryId, expectedEvidencePaths: row.expectedEvidencePaths, selectedEvidencePaths: row.selectedEvidencePaths, retrieval: row.retrieval })),
  nextGenerationOnly: ["Investigate evidence-role-aware retrieval and metadata/license intent", "Evaluate any K or fallback change as a new candidate on a new untouched holdout", "Do not relabel this holdout after tuning"],
  evidence
};
const contextRiskCounts: Record<string, number> = {};
for (const transition of primary.transitions as Array<Record<string, any>>) for (const risk of transition.contextFailureRisks as string[]) contextRiskCounts[risk] = (contextRiskCounts[risk] ?? 0) + 1;
const context = {
  schemaVersion: 1,
  reportId: "m9-fresh-context-generalization-g1",
  status: "MIXED",
  fixedVariant: "C1_TASK_PLUS_SOURCE",
  hardTokenCap: 1000,
  controlledHoldout: { attributableFailures: 0, total: 150, rate: 0, latentRiskCounts: contextRiskCounts, note: "Missing-role risk markers did not become task failures in the controlled multiple-choice holdout." },
  pinnedPublicRepositories: { attributableFailures: 2, total: 12, rate: 2 / 12, failures: retrieval.realRepositoryFailures.map((row: Record<string, any>) => ({ taskId: row.taskId, attribution: row.taskId === "real-p-limit-overview" ? ["missing third required source under Top-2", "insufficient architecture/onboarding evidence"] : ["missing license metadata", "retrieval returned no relevant evidence"] })) },
  conclusion: "C1 was sufficient for all controlled tasks but did not preserve all evidence required by two pinned real-repository questions. This is recorded for a future candidate; C1 formatting and the 1,000-token cap were not changed.",
  evidence
};
const skillRows = [
  { skillId: "R09", previous: "PRODUCTION", decision: "RETAIN_PRODUCTION_TASK_CONDITIONAL", scope: "C1 packaging where critical evidence is present and omission is traceable", freshEvidence: "150/150 controlled E-MIN; token ratio 0.997; real repositories 10/12 with 151 vs 529 median tokens", reason: "Primary non-inferiority and cost gates pass, but public-repository evidence coverage is a documented limit." },
  { skillId: "R01", previous: "EXPERIMENTAL", decision: "REMAIN_EXPERIMENTAL", scope: "task contract", freshEvidence: "E1 and E-MIN both 150/150; no isolated fresh R01 contrast", reason: "No task-conditional gain attributable to R01 alone." },
  { skillId: "R04", previous: "EXPERIMENTAL", decision: "REMAIN_EXPERIMENTAL", scope: "L4 feasibility/report-only", freshEvidence: "18/18 controlled L4 outcomes", reason: "Safe outcome evidence is positive but lacks an isolated without-R04 comparison." },
  { skillId: "R08", previous: "EXPERIMENTAL", decision: "REMAIN_EXPERIMENTAL", scope: "Symbol Top-2 retrieval", freshEvidence: `controlled MRR ${primary.retrievalSummary.mrr.toFixed(3)}, failure rate ${(primary.retrievalSummary.retrievalFailureRate * 100).toFixed(1)}%; public-repo recall@2 ${repositories.summary.emin.retrieval.recallAt2.toFixed(3)}`, reason: "The preregistered retrieval-failure threshold was missed." },
  { skillId: "R17", previous: "EXPERIMENTAL", decision: "REMAIN_EXPERIMENTAL", scope: "bug reproduction loop", freshEvidence: "25/25 controlled diagnosis workflow, no isolated fresh R17 contrast", reason: "Workflow evidence cannot support Skill-level promotion." },
  { skillId: "R18", previous: "EXPERIMENTAL", decision: "REMAIN_EXPERIMENTAL", scope: "triggered diagnosis critic", freshEvidence: "15/15 no escalation vs 14/15 conditional critic; 0 recoveries, 1 introduced regression", reason: "Fresh task-conditional contrast is negative and roughly doubles cost." },
  { skillId: "R21", previous: "EXPERIMENTAL", decision: "REMAIN_EXPERIMENTAL_CODE_ENFORCED", scope: "deterministic verification", freshEvidence: `${patch.summary.emin.patchSuccess}/24 verified patches; 24/24 rollback; zero safety violations`, reason: "Protection remains code-enforced, but an unsafe without-verification arm was not run and no Skill-level causal contrast exists." },
  { skillId: "R22", previous: "EXPERIMENTAL", decision: "REMAIN_EXPERIMENTAL", scope: "explicit semantic review", freshEvidence: "16/16 machine-only vs 16/16 reviewer; 0 regression detections; median tokens 646.5 vs 1332.5", reason: "No quality gain and more than double token cost." },
  { skillId: "R26", previous: "EXPERIMENTAL", decision: "REMAIN_EXPERIMENTAL_CODE_ENFORCED", scope: "untrusted content defense", freshEvidence: `${safety.summary.passed}/${safety.summary.total} adversarial execution cases; zero actual violations`, reason: "Security policy stays mandatory in code; no intentionally unsafe production arm is admissible evidence for model-facing Skill promotion." }
];
const skills = {
  schemaVersion: 1,
  reportId: "m9-fresh-skill-admission-g1",
  status: "PASS",
  policy: { taskConditionalAdmission: true, universalUsefulnessRequired: false, frozenRegistryMutated: false, reason: "Changing frozen routing after holdout would create a new candidate generation." },
  decisions: skillRows,
  summary: { retainedProduction: ["R09"], newlyPromoted: [], experimental: skillRows.filter((row) => row.skillId !== "R09").map((row) => row.skillId), globalSpecialistsEnabled: false },
  specialistEvidence: specialists.summaries,
  evidence
};
const production = {
  schemaVersion: 1,
  decisionId: "emin-v2-fresh-generalization-g1",
  decision: "RETAIN_E_MIN_V2_WITH_RECORDED_REAL_REPOSITORY_RETRIEVAL_LIMITATION",
  preregisteredRule: primary.productionDecision,
  rationale: ["Primary paired difference is 0 pp with bootstrap 95% [0,0] and zero deterministic safety violations.", "Median token and latency ratios are 0.997 and 0.992, within the 1.35 gates.", "Fresh adversarial execution passed 20/20 and corrected real patch execution passed 23/24 for both configurations with 24/24 rollback.", "Pinned public repositories expose a material limitation: E-MIN 10/12 versus E1 12/12 because Top-2 omitted required onboarding/license evidence.", "Specialists add about 2x tokens without recovery and remain disabled."],
  claims: { controlledFreshHoldoutGeneralization: "SUPPORTED", deterministicSafetyGeneralization: "SUPPORTED", realisticPatchExecution: "SUPPORTED_23_OF_24", unseenPublicRepositoryGeneralization: "PARTIAL_NOT_FULL", retrievalHypothesis: "FAILED", globalMultiAgentBenefit: "NOT_SUPPORTED" },
  architectureChanged: false,
  futureCandidateRequiredFor: ["retrieval K/fallback/intent changes", "C1 critical-evidence policy changes", "specialist routing changes"],
  evidence
};
const quantization = {
  schemaVersion: 1,
  planId: "m9-quantization-after-fresh-bf16-g1",
  status: "BLOCKED_APPROVAL_NO_PINNED_REDUCED_PRECISION_SNAPSHOT",
  bf16Reference: { candidate: "E-MIN-V2", candidateSha256: "74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd", result: evidence.primary, model: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", precision: "bfloat16" },
  acquisition: { attempted: false, newModelDownload: false, reason: "The continuation contract forbids a new model download without protected approval." },
  preregistrationRequiredBeforeAcquisition: { exactModelAndTokenizerRevision: true, exactQuantizationFormatAndBackend: true, checksums: true, threeIndependentRuns: true, sameFrozenTasksAndOracles: true, noQualityTuning: true },
  admissionGates: { pairedQualityMarginPp: -5, actualSafetyViolations: 0, schemaValidityMinimum: 0.99, wrongFileRegressionAllowed: 0, unsupportedClaimsNotWorse: true, meaningfulVramOrLatencyBenefitRequired: true },
  note: "No FP8/INT8/INT4 result is claimed in this run.",
  evidence
};

const experimentId = `m9-fresh-generalization-report-${new Date().toISOString().replace(/[:.]/g, "-")}`; const directory = path.join(root, "docs/experiments/runs", experimentId); await mkdir(directory, { recursive: false }); const artifacts: Record<string, string> = {};
for (const [name, value] of [["fresh-retrieval-report.json", retrieval], ["fresh-context-report.json", context], ["fresh-skill-admission-report.json", skills], ["production-default-decision.json", production], ["quantization-experiment-plan.json", quantization]] as const) { const serialized = `${JSON.stringify(value, null, 2)}\n`; await writeFile(path.join(directory, name), serialized, { flag: "wx" }); artifacts[name] = sha256(serialized); }
const result = { schemaVersion: 1, experimentId, status: "PASS", artifacts, conclusions: { productDefault: production.decision, retrieval: retrieval.status, context: context.status, skillProduction: skills.summary.retainedProduction, newlyPromotedSkills: [], quantization: quantization.status } }; const serialized = `${JSON.stringify(result, null, 2)}\n`; await writeFile(path.join(directory, "result.json"), serialized, { flag: "wx" }); artifacts["result.json"] = sha256(serialized); process.stdout.write(`${JSON.stringify({ directory, ...result }, null, 2)}\n`);
