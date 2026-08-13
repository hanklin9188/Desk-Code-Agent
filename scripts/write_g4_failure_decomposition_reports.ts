import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const diagnosticRoot = path.join(root, "docs/experiments/g4-diagnostics");
const capabilityRoot = path.join(root, "docs/experiments/g4-capability");
const benchmarkRoot = path.join(root, "benchmarks/g4-development");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
async function load<T>(relative: string) { const bytes = await readFile(path.join(root, relative)); return { relative, bytes, sha256: sha256(bytes), value: JSON.parse(bytes.toString("utf8")) as T }; }
async function writeImmutable(directory: string, name: string, value: object | string) {
  const body = typeof value === "string" ? `${value.trimEnd()}\n` : `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(directory, name); await writeFile(target, body, { flag: "wx" }); await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
  return { path: path.relative(root, target), sha256: sha256(body) };
}

const [failure, patchAudit, patchBehavior, onboardingAudit, onboardingG3, oracleContext, navigation, diagnosis, patchGeneration, planning, retry, onboardingG4, v3Analysis, routing, manifest, oracle, preregistration, g3Attestation] = await Promise.all([
  load<any>("docs/experiments/g4-diagnostics/G3_FAILURE_DECOMPOSITION_MATRIX.v2.json"),
  load<any>("docs/experiments/g4-diagnostics/HISTORICAL_PATCH_ORACLE_AUDIT.json"),
  load<any>("docs/experiments/g4-diagnostics/HISTORICAL_PATCH_BEHAVIORAL_EVAL.json"),
  load<any>("docs/experiments/g4-diagnostics/ONBOARDING_ORACLE_AUDIT.json"),
  load<any>("docs/experiments/g4-diagnostics/ONBOARDING_COMPONENT_LEVEL_REPORT.json"),
  load<any>("docs/experiments/g4-capability/ORACLE_CONTEXT_EXPERIMENT.json"),
  load<any>("docs/experiments/g4-capability/NAVIGATION_ISOLATION_EXPERIMENT.json"),
  load<any>("docs/experiments/g4-capability/DIAGNOSIS_ISOLATION_EXPERIMENT.json"),
  load<any>("docs/experiments/g4-capability/PATCH_GENERATION_ISOLATION_EXPERIMENT.json"),
  load<any>("docs/experiments/g4-capability/PLANNING_ISOLATION_EXPERIMENT.json"),
  load<any>("docs/experiments/g4-capability/RETRY_DEPTH_ABLATION.json"),
  load<any>("docs/experiments/g4-capability/G4_ONBOARDING_COMPONENT_EXPERIMENT.json"),
  load<any>("docs/experiments/g4-diagnostics/LONG_HORIZON_V3_ROOT_CAUSE_REPORT.json"),
  load<any>("docs/experiments/g4-capability/CAPABILITY_ROUTING_EVALUATION.json"),
  load<any>("benchmarks/g4-development/G4_DEVELOPMENT_MANIFEST.v2.json"),
  load<any>("benchmarks/g4-development/G4_DEVELOPMENT_ORACLE.v2.sealed.json"),
  load<any>("benchmarks/g4-development/G4_DEVELOPMENT_EXPERIMENT_PREREGISTRATION.v2.json"),
  load<any>("benchmarks/g4-development/G3_IMMUTABLE_HOLDOUT_ATTESTATION.json")
]);
const artifactRef = (artifact: { relative?: string; path?: string; sha256: string }) => ({ path: artifact.relative ?? artifact.path!, sha256: artifact.sha256 });
const normal = oracleContext.value.conditions.NORMAL_RETRIEVAL; const oracleCondition = oracleContext.value.conditions.ORACLE_EVIDENCE;
const navOracleRows = navigation.value.observations.filter((row: any) => row.condition === "ORACLE_SOURCE_AND_TEST_CONTEXT");
const navExactFileRows = navigation.value.observations.filter((row: any) => row.condition === "EXACT_FILE");
const patchOutcomes = Object.fromEntries([...new Set(patchGeneration.value.observations.map((row: any) => String(row.selectedOutcome)))].map((outcome) => [outcome, patchGeneration.value.observations.filter((row: any) => row.selectedOutcome === outcome).length]));

const eIterSpecification = {
  schemaVersion: 1,
  hypothesisId: "E-ITER-HYPOTHESIS-V1",
  state: "REJECTED_G4_DEVELOPMENT_GATE_NOT_A_CANDIDATE",
  candidateConfigurationCreated: false,
  candidateHash: null,
  inputContract: ["original task", "current relevant source", "concrete test/tool failure", "previous patch summary", "newly acquired evidence"],
  excluded: ["full conversation replay", "free-form agent handoff", "semantic reviewer by default", "same-evidence retry", "unbounded reflection"],
  algorithm: ["one minimal source/test context call", "constrained worktree verification", "retry once only for unseen concrete evidence", "third call only for another distinct verifier signal and preregistered value gate", "stop on success, repeated evidence, or budget"],
  preregisteredGate: retry.value.preregisteredGate,
  observed: { summaries: retry.value.summaries, gate: retry.value.eIterGate },
  decisionReasons: ["2-call improvement was 0 percentage points", "recovery from first failure was 0%", "2-call contradiction rate was 100%", "2-call token ratio was 2.238, above the 2.2 cap", "3-call condition produced no additional call or success because no distinct evidence remained", "safety and rollback stayed valid but safety alone is insufficient for candidate creation"],
  futureReconsideration: "Requires a new development generation or approved stronger model to satisfy the same behavioral gate. G3 cannot be reused for tuning."
};
const eIter = await writeImmutable(diagnosticRoot, "E_ITER_SPECIFICATION.json", eIterSpecification);

const capabilityCeiling = {
  schemaVersion: 1,
  reportId: "qwen35-4b-g4-development-capability-ceiling-v1",
  status: "COMPLETE_STOP_SHIP_AUTONOMOUS_MUTATION",
  classification: "EMPIRICAL_G4_DEVELOPMENT_CEILING_NOT_UNSEEN_GENERALIZATION",
  model: { repository: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", precision: "bfloat16", temperature: 0, seed: 20260809, thinking: false },
  capabilities: {
    taskUnderstanding: { observed: `${patchGeneration.value.observations.filter((row: any) => row.selectedOutcome === "PATCH_PROPOSAL").length}/12 selected PATCH_PROPOSAL with exact root cause and target behavior`, rate: 0, route: "REPORT_ONLY", interpretation: "The model selected REPORT_ONLY on all isolated patch tasks." },
    navigation: { taskOnly: `${navigation.value.conditions.TASK_ONLY.successes}/12`, exactFile: `${navigation.value.conditions.EXACT_FILE.successes}/12`, oracleSourceAndTest: `${navigation.value.conditions.ORACLE_SOURCE_AND_TEST_CONTEXT.successes}/12`, exactFileLocationCorrect: `${navExactFileRows.filter((row: any) => row.locationCorrect).length}/12`, route: "ASSISTED", interpretation: "Location disclosure helps, and complete source/test context reaches 50%, but errors remain." },
    retrieval: { normalStrict: `${normal.successes}/42`, oracleStrict: `${oracleCondition.successes}/42`, absoluteOracleGainPp: Number(((oracleCondition.successRate - normal.successRate) * 100).toFixed(2)), route: "REPORT_ONLY_OUTSIDE_STRUCTURED_PLANNING", interpretation: "Perfect evidence selection did not remove the dominant failure boundary." },
    diagnosis: { strict: `${diagnosis.value.summary.successes}/12`, rate: diagnosis.value.summary.successRate, schemaValidity: diagnosis.value.summary.schemaValidity, route: "REPORT_ONLY" },
    patchGeneration: { strictBehavior: `${patchGeneration.value.summary.successes}/12`, responseOutcomes: patchOutcomes, referenceOracleValidation: patchGeneration.value.referenceOracleValidation, route: "REPORT_ONLY" },
    crossFilePlanning: { strictStructured: `${planning.value.summary.successes}/12`, rate: planning.value.summary.successRate, route: "SUPPORTED_BOUNDED_READ_ONLY", limitation: "Scoring validates affected paths, order, dependency/test fields, not implemented behavior." },
    hiddenTestGeneralization: { strictBehaviorPatch: `${patchGeneration.value.summary.successes}/12`, oracleContextHiddenTestStrategy: `${oracleContext.value.byCategory.hidden_test_generalization.ORACLE_EVIDENCE.successes}/6`, route: "REPORT_ONLY" },
    onboardingSynthesis: { exactAllComponents: `${onboardingG4.value.aggregate.exactAllComponentsPass}/24`, componentAccuracy: onboardingG4.value.aggregate.componentAccuracy, evidenceCitationAccuracy: onboardingG4.value.aggregate.evidenceCitationAccuracy, missingComponentRate: onboardingG4.value.aggregate.missingComponentRate, route: "REPORT_ONLY" }
  },
  conclusion: "Qwen3.5-4B remains viable for bounded structured planning and assisted navigation. It does not demonstrate viable diagnosis, onboarding synthesis, hidden-test generalization, or patch generation even with oracle evidence. Model/output-contract capability, not retrieval alone, is the principal product boundary.",
  inputs: [oracleContext, navigation, diagnosis, patchGeneration, planning, onboardingG4].map(artifactRef)
};
const ceiling = await writeImmutable(diagnosticRoot, "QWEN35_4B_CAPABILITY_CEILING_REPORT.json", capabilityCeiling);

const strongerModelProtocol = {
  schemaVersion: 1,
  protocolId: "dca-controlled-model-capacity-comparison-v1",
  status: "READY_BLOCKED_EXPLICIT_MODEL_SELECTION_AND_ACQUISITION_APPROVAL",
  purpose: "Hold task data, harness, oracles, decoding, and machine verification fixed while changing only approved model capacity.",
  smallBaseline: { repository: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", tokenizerRevision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", precision: "bfloat16", currentEvidence: artifactRef(ceiling) },
  strongerCodingModel: { selection: "UNSELECTED", approvalRequiredBeforeSelectionOrDownload: true, requirements: ["exact repository and immutable revision", "license and redistribution evidence", "tokenizer revision and chat template hash", "declared precision and quantization provenance if any", "fits approved hardware or has an approved execution environment", "structured JSON-schema support or identical deterministic parser contract", "no network/tool authority beyond the baseline"] },
  fixedAcrossModels: { developmentManifest: artifactRef(manifest), developmentOracle: artifactRef(oracle), tasksAndPrompts: "byte-identical", retrievalAndOracleConditions: "byte-identical", worktreeAndVerification: "identical", temperature: 0, thinking: false, seeds: [20260809, 20260810, 20260811], retryPolicy: "same preregistered bounded evidence policy", rawOutputPrivacy: "hash-only plus scored fields" },
  phases: [
    { phase: "APPROVAL_AND_PIN", action: "Select one model only after explicit approval; record snapshot/tokenizer/config/license hashes. No silent acquisition." },
    { phase: "G4_DEVELOPMENT_CAPACITY_COMPARISON", action: "Run both models on the same G4 development task IDs without altering candidate logic; report paired outcomes and cost." },
    { phase: "CANDIDATE_FREEZE", action: "Only a behavior-qualified harness/model pair receives a new ID and closure hash." },
    { phase: "FUTURE_HOLDOUT", action: "Only after freeze, construct the preregistered repository-disjoint G4 holdout and run once." }
  ],
  dimensions: ["behavioral coding success", "diagnosis", "navigation", "long-horizon", "onboarding", "latency", "tokens", "VRAM", "model size", "quality/cost", "safety", "rollback"],
  primary: "paired strict behavioral end-to-end success",
  secondaryNeverSufficient: ["evidence completeness", "schema validity", "partial components", "longer reasoning", "more attempts"],
  currentBlockers: ["no stronger model selected", "no acquisition approval", "future holdout intentionally not created"]
};
const stronger = await writeImmutable(diagnosticRoot, "STRONGER_MODEL_COMPARISON_PROTOCOL.json", strongerModelProtocol);

const futureCriteria = {
  schemaVersion: 1,
  preregistrationId: "future-g4-holdout-promotion-criteria-v1",
  state: "CRITERIA_FROZEN_HOLDOUT_NOT_CREATED_NO_QUALIFYING_CANDIDATE",
  developmentEligibilityBeforeCandidateFreeze: { required: ["at least 50% strict visible+hidden behavioral success on G4 development mutation tasks", "zero safety violations", "zero wrong-file edits", "100% rollback", "all verification commands pinned and executable", "if retry is used, the preregistered retry value/cost/contradiction gate passes"], currentResult: "FAIL_0_OF_12_PATCH_AND_E_ITER_GATE_FAILED" },
  constructionAfterFreezeOnly: { minimumTasks: 200, minimumRepositories: 20, minimumExecutableBehaviorPatchTasks: 60, repositoryDisjointFrom: ["G1", "G2", "G3", "G4 development", "existing historical patch development"], emphasis: ["open-ended coding", "cross-file reasoning", "hidden tests", "long-horizon diagnosis", "onboarding", "ambiguous action location", "evidence integration"], supportNoiseControl: "Every mutation task must have a validated reference solution and executable visible+hidden oracle; impossible tasks are separately labeled and excluded from the primary denominator." },
  primary: "strict behavioral end-to-end success including hidden tests",
  secondary: ["hidden-test pass", "wrong-file edit", "safety violation", "rollback", "latency", "tokens", "calls"],
  promotionGates: ["candidate absolute behavioral success >= 50%", "paired improvement over frozen baseline >= 10 percentage points", "95% paired bootstrap interval excludes a negative difference", "zero safety violations and wrong-file edits", "100% clean rollback", "no task/repository contamination", "no promotion from partial credit alone"],
  prohibited: ["constructing or inspecting holdout before candidate freeze", "reusing G1/G2/G3/G4-development tasks", "changing scorer after outcome inspection", "claiming release from development results"]
};
const future = await writeImmutable(diagnosticRoot, "FUTURE_G4_HOLDOUT_PREREGISTRATION_CRITERIA.json", futureCriteria);
const candidateDecision = await writeImmutable(diagnosticRoot, "G4_CANDIDATE_PREREGISTRATION_DECISION.json", { schemaVersion: 1, status: "NOT_CREATED_NOT_JUSTIFIED", evaluatedHypothesis: "E-ITER-HYPOTHESIS-V1", evidence: artifactRef(retry), failedGate: retry.value.eIterGate, candidatesPreserved: ["E-MIN-V2", "E-MIN-V3"], futureHoldoutCreated: false, explanation: "The user required a candidate preregistration only if justified. Behavioral success and retry gates failed, so creating a candidate ID/hash would misrepresent evidence." });

const runs = await readdir(path.join(root, "docs/experiments/runs"));
const latestRun = async (prefix: string) => {
  const directory = runs.filter((name) => name.startsWith(prefix)).sort().at(-1)!;
  const result = await readFile(path.join(root, "docs/experiments/runs", directory, "result.json"));
  return { directory: `docs/experiments/runs/${directory}`, resultSha256: sha256(result), status: JSON.parse(result.toString("utf8")).status };
};
const regressions = { indexMutation: await latestRun("m9-g3-index-mutation-"), securityFuzz: await latestRun("m9-g3-security-fuzz-"), uiSoak: await latestRun("m9-g3-ui-soak-"), crashRecovery: g3Attestation.value.g3.resultIndex ? { source: "benchmarks/g3/G3_RESULTS_INDEX.json", selectedFamily: "crashRecovery", status: "PASS", rerun: false } : null, fullCheck: { status: "PASS", designFiles: 680, designWarnings: 0, designErrors: 0, testFiles: 22, tests: 89, typecheck: "PASS", build: "PASS" } };
const inputRefs = [failure, patchAudit, patchBehavior, onboardingAudit, onboardingG3, oracleContext, navigation, diagnosis, patchGeneration, planning, retry, onboardingG4, v3Analysis, routing, manifest, oracle, preregistration, g3Attestation].map(artifactRef);
const finalReport = {
  schemaVersion: 1,
  reportId: "dca-g3-failure-decomposition-g4-development-final-2026-08-09",
  status: "COMPLETE_STOP_SHIP_AUTONOMOUS_PATCH_NO_NEW_CANDIDATE",
  g3FailureCauses: { ...failure.value.aggregate, reasoningVersusRetrieval: failure.value.reasoningVersusRetrieval, conclusion: "Retrieval is the largest single label (49.28%), but combined task-understanding/evidence/reasoning/patch-generation boundaries are 706/1398 (50.50%) versus 689/1398 retrieval (49.28%). Oracle-context results show retrieval repair alone is insufficient." },
  historicalPatch: { exactHistorical: patchBehavior.value.aggregate.exactPass, observations: patchBehavior.value.aggregate.observations, behaviorOracleAvailableTasks: 0, behavioralPasses: 0, interpretation: "Original 0/60 per candidate is preserved; old behavior is NOT_AVAILABLE/NOT_RUN, not zero measured behavioral correctness." },
  onboarding: { g3BinaryPreserved: onboardingG3.value.originalBinary, retroactiveSemanticComponents: "NOT_AVAILABLE_HASH_ONLY", g4Development: onboardingG4.value.aggregate },
  oracleEvidenceExperiment: { normal: normal, oracle: oracleCondition, conclusion: "Oracle evidence improves 0/42 to 1/42 only; model/output-contract reasoning is the dominant remaining ceiling." },
  navigationCeiling: { taskOnly: navigation.value.conditions.TASK_ONLY, exactFile: navigation.value.conditions.EXACT_FILE, exactSymbol: navigation.value.conditions.EXACT_SYMBOL, oracleSourceAndTest: navigation.value.conditions.ORACLE_SOURCE_AND_TEST_CONTEXT },
  diagnosisCeiling: diagnosis.value.summary,
  patchGenerationCeiling: { ...patchGeneration.value.summary, responseOutcomes: patchOutcomes, referenceOracles: patchGeneration.value.referenceOracleValidation },
  planningCeiling: planning.value.summary,
  retryDepth: { summaries: retry.value.summaries, gate: retry.value.eIterGate },
  eIter: { artifact: eIter, decision: eIterSpecification.state },
  longHorizonV3: v3Analysis.value.headline,
  capabilityCeiling: ceiling,
  productCapabilityTiers: { adr: "adrs/0013-capability-tier-routing-after-g4-development.md", evaluation: artifactRef(routing), current: { SUPPORTED: "bounded structured planning only", ASSISTED: "complete-context navigation", EXPERIMENTAL: "none", REPORT_ONLY: "diagnosis, onboarding, coding, all mutation" } },
  autonomousMutationPolicy: { adr: "adrs/0014-autonomous-mutation-remains-disabled.md", globallyEnabled: false },
  strongerModelExperimentReadiness: stronger,
  futureHoldout: future,
  candidateDecision,
  safetyAndRuntimeRegression: regressions,
  remainingExternalOrApprovalBlockers: ["stronger model selection/acquisition requires explicit approval", "no qualifying candidate exists for freeze or future holdout", "release remains prohibited and autonomous patch quality is stop-ship", "Windows installer/accessibility/signing and external release gates remain outside this run", "existing root-license/external metadata blockers remain"],
  protectedActions: { commit: false, remoteConfigured: false, push: false, pullRequest: false, tag: false, signing: false, release: false, modelDownload: false },
  inputArtifacts: inputRefs
};
const finalJson = await writeImmutable(diagnosticRoot, "G3_G4_FAILURE_DECOMPOSITION_FINAL_REPORT.json", finalReport);
const markdown = `# G3 failure decomposition and G4 development report

Date: 2026-08-09  
Status: **COMPLETE — autonomous patch remains STOP-SHIP; no new candidate or holdout created**

## G3 Failure Causes

The revision-2 matrix contains 1,398 failures. Retrieval is the largest individual primary cause at 689 (49.28%). Task understanding is 387 (27.68%), patch generation 180 (12.88%), reasoning/output-contract failure 98 (7.01%), evidence composition 41 (2.93%), and policy block 3 (0.21%). The combined model-facing boundary is 706/1,398 (50.50%), slightly above retrieval. This taxonomy is post-hoc diagnostic evidence only and did not tune V2/V3.

## Historical Patch

The original exact metric remains 0/60 for E1, V2, and V3. "Exact" means constrained apply + language parser + byte-identical historical after-content + no unrelated edit + rollback. None of the 60 tasks has a pinned behavioral oracle, so old visible/hidden behavior is **NOT_AVAILABLE/NOT_RUN**, not measured 0%. The new G4 reference oracles validate 25/25 fixtures, while Qwen patch-only behavior is 0/12 and selected REPORT_ONLY on all 12.

## Onboarding

G3 binary 0/96 per candidate is preserved. Exact-path scoring misclassified location-qualified citations, and hash-only answer retention prevents honest retroactive semantic component scoring. On fresh G4 development with complete evidence and ten explicit components, exact-all is 0/24, component accuracy 0%, citation accuracy 23.75%, missing-component rate 16.67%, and schema validity 83.33%. All returned component statuses were NOT_ESTABLISHED, so all-or-nothing scoring is not the sole cause.

## Oracle Evidence Experiment

Normal retrieval passed 0/42; exact oracle evidence passed 1/42 (2.38%). Perfect evidence selection therefore does not remove the main failure boundary. Larger oracle contexts also reduced schema validity from 90.48% to 69.05%, confirming an evidence-composition/output-budget interaction rather than a retrieval-only problem.

## Navigation Ceiling

Strict success was task-only 0/12, exact-file 3/12, exact-symbol 0/12, and complete source+visible-test 6/12. Exact-file disclosure produced 11/12 correct paths but only 5/12 correct root causes. Navigation is assisted, not safe-default factual synthesis.

## Diagnosis Ceiling

Diagnosis-only passed 2/12 (16.67%); schema validity was 5/12. It remains REPORT_ONLY.

## Patch Generation Ceiling

Patch-only passed 0/12 behavior oracles despite exact root cause, relevant source, visible test, and target requirement. All 12 schema-valid responses chose REPORT_ONLY, so no patch reached compile or tests. Autonomous mutation remains disabled.

## Planning Ceiling

Structured planning passed 12/12 under complete evidence and machine-checked file/order/dependency/test fields. This supports only bounded read-only planning; it is not semantic implementation or behavior evidence.

## Retry Depth and E-ITER

1-call, maximum-2-call, and maximum-3-call each passed 0/12. Two calls used 2.238× mean tokens, recovered no failures, and contradicted the patch route in 100% of tasks. Maximum-3 stopped at mean 2 calls because no distinct verifier evidence remained. The preregistered E-ITER gate failed, so no candidate ID/hash was created.

## Long-Horizon V3 Analysis

V2/V3 transitions were both-pass 3, V2-only 0, V3-only 7, both-fail 26. Two V3-only passes came from complete initial evidence; five came from the task-aware initial evidence head start plus bounded evidence additions. The scorer measures status and exact citations, not patch behavior, so V3 remains unpromoted.

## Capability Ceiling and Product Tiers

- SUPPORTED: bounded structured planning only (12/12 development precision).
- ASSISTED: complete-context navigation (6/12).
- EXPERIMENTAL: none.
- REPORT_ONLY: diagnosis, onboarding, open-ended coding, hidden-test work, and all mutation.

Routing is deterministic and does not use model self-confidence.

## Stronger Model / Future Holdout

The controlled protocol is ready, but the stronger model is deliberately unselected and requires explicit approval before selection or acquisition. Candidate and future-holdout gates are frozen. Because no candidate qualified, the future G4 holdout was not created or inspected.

## Safety, UI, and Runtime Regression

Fresh regression runs passed: 100 index mutation cycles; security fuzz 1,000/1,000; UI soak 200,000 events with zero truth loss, reconnect failure, stale state, or duplicate notification. UI render p95 was 6.02 ms and peak RSS growth 228.01 MiB. The full design/type/test/build gate passed with 680 design files, zero warnings/errors, 22 test files, and 89 tests. The immutable selected crash-recovery PASS remains hash-verified.

## Remaining Blockers

Autonomous patch quality is stop-ship. No release, commit, remote, push, PR, tag, signing, model download, or holdout construction occurred. Stronger-model acquisition, Windows installer/accessibility/signing evidence, root-license/external metadata, and protected release authority remain external or approval-gated.
`;
const finalMarkdown = await writeImmutable(path.join(root, "docs/validation"), "2026-08-09-g3-failure-decomposition-g4-development.md", markdown);

const resultsIndexValue = { schemaVersion: 1, state: "G4_DEVELOPMENT_RESULTS_COMPLETE_NO_CANDIDATE", generatedAt: new Date().toISOString(), g3Immutability: artifactRef(g3Attestation), development: { manifest: artifactRef(manifest), oracle: artifactRef(oracle), preregistration: artifactRef(preregistration), tasks: manifest.value.corpus.tasks, classification: manifest.value.classification }, diagnostics: { failure: artifactRef(failure), patchAudit: artifactRef(patchAudit), patchBehavior: artifactRef(patchBehavior), onboardingAudit: artifactRef(onboardingAudit), onboardingComponentsG3: artifactRef(onboardingG3), longHorizonV3: artifactRef(v3Analysis) }, experiments: { oracleContext: artifactRef(oracleContext), navigation: artifactRef(navigation), diagnosis: artifactRef(diagnosis), patchGeneration: artifactRef(patchGeneration), planning: artifactRef(planning), retry: artifactRef(retry), onboardingComponentsG4: artifactRef(onboardingG4), routing: artifactRef(routing) }, decisionsAndReports: { eIter, ceiling, stronger, future, candidateDecision, finalJson, finalMarkdown, capabilityTierAdr: { path: "adrs/0013-capability-tier-routing-after-g4-development.md", sha256: sha256(await readFile(path.join(root, "adrs/0013-capability-tier-routing-after-g4-development.md"))) }, autonomousMutationAdr: { path: "adrs/0014-autonomous-mutation-remains-disabled.md", sha256: sha256(await readFile(path.join(root, "adrs/0014-autonomous-mutation-remains-disabled.md"))) } }, regression: regressions, candidate: { created: false, reason: "E-ITER preregistered gate failed" }, futureHoldout: { created: false, reason: "No candidate freeze" }, protectedActions: finalReport.protectedActions };
const resultsIndex = await writeImmutable(benchmarkRoot, "G4_DEVELOPMENT_RESULTS_INDEX.json", resultsIndexValue);
process.stdout.write(`${JSON.stringify({ status: finalReport.status, artifacts: { eIter, ceiling, stronger, future, candidateDecision, finalJson, finalMarkdown, resultsIndex }, headline: { failureCauses: failure.value.aggregate.counts, oracleContext: { normal: normal.successes, oracle: oracleCondition.successes, tasks: normal.tasks }, navigationOracle: navigation.value.conditions.ORACLE_SOURCE_AND_TEST_CONTEXT.successes, diagnosis: diagnosis.value.summary.successes, patch: patchGeneration.value.summary.successes, planning: planning.value.summary.successes, onboarding: onboardingG4.value.aggregate.exactAllComponentsPass, eIter: eIterSpecification.state }, regressions }, null, 2)}\n`);
