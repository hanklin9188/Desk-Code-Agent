import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const artifactVersion = process.argv.find((value) => value.startsWith("--artifact-version="))?.slice("--artifact-version=".length) ?? "v2";
if (!/^v[23]$/.test(artifactVersion)) throw new Error("Artifact version must be v2 or v3");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hashFile = async (relative: string) => sha256(await readFile(path.join(root, relative)));
const failures: string[] = [];

async function requireHash(relative: string, expected: string): Promise<string> {
  const actual = await hashFile(relative);
  if (actual !== expected) failures.push(`${relative}: expected ${expected}, got ${actual}`);
  return actual;
}

const frozenExpected = {
  "config/production/emin-v2-frozen-2026-08-09.json": "74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd",
  "services/agent-runtime/src/index.ts": "1111f03e4e6f9c6a71b4066bc0c8b4e1a00f11075ea12ea566d3b0835d363948",
  "services/tool-runtime/src/index.ts": "bd3e6dd7c43d5d1ec3d7397d9c0ddc7c7b253c1beaf4c3ccb8f2935a40309e00",
  "services/repo-intelligence/src/index.ts": "087b12de9275169c447995677744fc342f2a659ff093dc0950cc09437f66119d",
  "benchmarks/model-specialization/MODEL_SPECIALIZATION_PREREGISTRATION.json": "24f7d11f33fa5d2af168335f57c870278d602849f6c52959313adea343c02f75",
  "benchmarks/model-specialization/MODEL_COMPARISON_DEVELOPMENT_MANIFEST.json": "844bf4e3a16a0895a3d289e0b5eaec231a376ef23d77356cbf862c3344cdb556",
  "benchmarks/model-specialization/EXACT_MODEL_MANIFESTS.json": "f16fa1c3d2a8c266b4c9675f3cc771362ed83b4c66ef76a9c68f18f9a449825b",
  "benchmarks/g4-development/G4_DEVELOPMENT_MANIFEST.v2.json": "d3c3fe47a83230fe641aa392c017bd33f2b620409cc727d0bc35f483bbfdf2b7",
  "benchmarks/g4-development/G4_DEVELOPMENT_ORACLE.v2.sealed.json": "bbdce4f8a3cf3c2b2eb138abf207031560b9d0ceddbebef149e647c2c3509ed6",
  "benchmarks/g4-development/G4_DEVELOPMENT_SEAL.json": "0d5e4e5c473f06b847a60843a0ac60287fe2dad08bf14dad569063fed73ef590",
  "benchmarks/g4-development/G4_DEVELOPMENT_RESULTS_INDEX.json": "79d70211fded745d760c50f6bfe95ac5463cd41b119433156d4ba3d9f7ee253f"
} as const;

const frozenHashes: Record<string, string> = {};
for (const [relative, expected] of Object.entries(frozenExpected)) frozenHashes[relative] = await requireHash(relative, expected);

const registry = JSON.parse(await readFile(path.join(root, "config/model_specialization_profiles.json"), "utf8")) as any;
const expectedShared = {
  backend: "vllm", backendVersion: "0.26.0", generationConfig: "vllm", host: "127.0.0.1", port: 8000,
  precision: "bfloat16", comparisonContextLimit: 8192, gpuMemoryUtilization: 0.82,
  maxNumSequences: 1, prefixCaching: true, temperature: 0, seed: 20260809,
  reasoningMode: false, residency: "SEQUENTIAL_ONLY"
};
if (JSON.stringify(registry.sharedServing) !== JSON.stringify(expectedShared)) failures.push("shared serving profile differs from the preregistered values");
if (registry.profiles.baseline.modelId !== "Qwen/Qwen3.5-4B" || registry.profiles.baseline.revision !== "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a") failures.push("baseline identity changed");
if (registry.profiles.coder.modelId !== "Qwen/Qwen2.5-Coder-3B-Instruct" || registry.profiles.coder.revision !== "488639f1ff808d1d3d0ba301aef8c11461451ec5") failures.push("candidate identity changed");

const selection = JSON.parse(await readFile(path.join(root, "benchmarks/model-specialization/MODEL_COMPARISON_DEVELOPMENT_MANIFEST.json"), "utf8")) as any;
const expectedPhaseCounts: Record<string, number> = { oracleContext: 42, taskUnderstanding: 24, navigation: 25, diagnosis: 25, patchOnly: 25, planning: 12, oneShotEndToEnd: 25, boundedRetry: 25 };
const actualPhaseCounts: Record<string, number> = {};
for (const [phase, count] of Object.entries(expectedPhaseCounts)) {
  actualPhaseCounts[phase] = selection.phases?.[phase]?.taskIds?.length ?? -1;
  if (actualPhaseCounts[phase] !== count) failures.push(`${phase} expected ${count}, got ${actualPhaseCounts[phase]}`);
}
const observationBudget = Object.values(actualPhaseCounts).reduce((sum, count) => sum + count, 0);
if (observationBudget !== 203) failures.push(`expected 203 phase observations, got ${observationBudget}`);

const runnerRelative = "scripts/run_model_specialization_development.ts";
const runnerSource = await readFile(path.join(root, runnerRelative), "utf8");
const runnerHash = sha256(runnerSource);
const forbiddenModelBranches = [...runnerSource.matchAll(/(?:if|switch)\s*\([^\n)]*profileId|profileId\s*(?:===|!==|==|!=)/g)].map((match) => match[0]);
if (forbiddenModelBranches.length) failures.push("development runner contains a model-profile behavior branch");
for (const invariant of ["retrieveG3(runtimeTask, \"E-MIN-V2\"", "temperature: 0", "thinking: false", "reviewer: \"OFF\"", "multiAgent: \"OFF\"", "maxRetries: 2", "ConstrainedPatchRuntime", "TrustedVerificationExecutor"]) {
  if (!runnerSource.includes(invariant)) failures.push(`development runner missing invariant: ${invariant}`);
}

const launcherRelative = "scripts/start_model_profile.sh";
const launcherSource = await readFile(path.join(root, launcherRelative), "utf8");
if (!launcherSource.includes("export VLLM_USE_V2_MODEL_RUNNER=0")) failures.push("shared V1 model runner compatibility pin is absent");
const pythonLauncherSource = await readFile(path.join(root, "scripts/launch_model_profile.py"), "utf8");
if (!pythonLauncherSource.includes('"--generation-config", shared["generationConfig"]')) failures.push("shared vLLM generation defaults are not explicitly pinned");
const vllmConfigRelative = "runtime/model/.venv/lib/python3.12/site-packages/vllm/config/vllm.py";
const vllmConfigSource = await readFile(path.join(root, vllmConfigRelative), "utf8");
if (!vllmConfigSource.includes("if getattr(model_config, \"is_hybrid\", False):\n            return False")) failures.push("installed vLLM hybrid-to-V1 selection evidence changed");
const baselineConfig = JSON.parse(await readFile(path.join(root, ".runtime/model/huggingface/hub/models--Qwen--Qwen3.5-4B/snapshots/851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a/config.json"), "utf8")) as any;
const baselineLayerTypes = baselineConfig.text_config?.layer_types ?? [];
if (!(baselineLayerTypes.includes("linear_attention") && baselineLayerTypes.includes("full_attention"))) failures.push("baseline hybrid architecture evidence changed");

const baselineSmokeRelative = "docs/experiments/model-specialization/BASELINE_MODEL_SMOKE_VALIDATION.v2.json";
const coderSmokeRelative = `docs/experiments/model-specialization/CODER_MODEL_SMOKE_VALIDATION.${artifactVersion}.json`;
const baselineSmoke = JSON.parse(await readFile(path.join(root, baselineSmokeRelative), "utf8")) as any;
const coderSmoke = JSON.parse(await readFile(path.join(root, coderSmokeRelative), "utf8")) as any;
for (const field of ["precision", "backend", "contextLimit", "host", "sequentialResidency"] as const) {
  if (baselineSmoke.exactProfile[field] !== coderSmoke.exactProfile[field]) failures.push(`smoke fixed field differs: ${field}`);
}
if (!String(baselineSmoke.status).startsWith("PASS") || !String(coderSmoke.status).startsWith("PASS")) failures.push("one or both model smoke validations did not pass");

const baselineResultRelative = "docs/experiments/model-specialization/BASELINE_DEVELOPMENT_CAPABILITY_RESULT.json";
const baselineResult = JSON.parse(await readFile(path.join(root, baselineResultRelative), "utf8")) as any;
const baselineObservationCounts = Object.fromEntries(Object.keys(expectedPhaseCounts).map((phase) => [phase, baselineResult.observations?.[phase]?.length ?? -1]));
for (const [phase, count] of Object.entries(expectedPhaseCounts)) if (baselineObservationCounts[phase] !== count) failures.push(`baseline ${phase} row count changed or incomplete`);
if (!String(baselineResult.status).startsWith("PASS")) failures.push("baseline development result is not PASS");

const acquisitionRelative = "benchmarks/model-specialization/MODEL_ACQUISITION_STATUS.v2.json";
const acquisition = JSON.parse(await readFile(path.join(root, acquisitionRelative), "utf8")) as any;
if (acquisition.status !== "PASS_EXACT_AUTHORIZED_SNAPSHOT_LOCAL" || acquisition.candidate.fallbackUsed !== false) failures.push("candidate acquisition is not exact and verified");

const report = {
  schemaVersion: 1,
  gateId: "dca-model-specialization-automatic-fairness-gate-v2",
  evaluatedAt: new Date().toISOString(),
  status: failures.length === 0 ? (artifactVersion === "v3" ? "PASS_BEFORE_CORRECTED_CANDIDATE_CAPABILITY_CALLS" : "PASS_BEFORE_CANDIDATE_CAPABILITY_CALLS") : "FAIL",
  candidateCapabilityCallsBeforeGate: artifactVersion === "v3" ? 203 : 0,
  correctedCandidateCapabilityCallsBeforeGate: 0,
  intendedIndependentVariable: "MODEL_PROFILE_ONLY",
  observationBudget,
  phaseCounts: actualPhaseCounts,
  immutableInputs: frozenHashes,
  executionClosure: {
    developmentRunner: { path: runnerRelative, sha256: runnerHash, modelSpecificBehaviorBranches: forbiddenModelBranches.length },
    profileRegistry: { path: "config/model_specialization_profiles.json", sha256: await hashFile("config/model_specialization_profiles.json") },
    modelAccessRuntime: { path: "services/model-specialization-runtime/src/index.ts", sha256: await hashFile("services/model-specialization-runtime/src/index.ts") },
    launcher: { path: launcherRelative, sha256: await hashFile(launcherRelative), explicitSharedModelRunner: "V1" }
  },
  baselineEvidence: {
    result: { path: baselineResultRelative, sha256: await hashFile(baselineResultRelative), observationCounts: baselineObservationCounts },
    smoke: { path: baselineSmokeRelative, sha256: await hashFile(baselineSmokeRelative) },
    effectiveModelRunner: "V1",
    effectiveRunnerReason: "Pinned Qwen3.5 config is hybrid; installed vLLM 0.26.0 returns V1 for hybrid architectures.",
    vllmSelectionSourceSha256: sha256(vllmConfigSource)
  },
  candidateEvidence: {
    acquisition: { path: acquisitionRelative, sha256: await hashFile(acquisitionRelative) },
    smoke: { path: coderSmokeRelative, sha256: await hashFile(coderSmokeRelative) },
    effectiveModelRunner: "V1",
    initialPreCallCompatibilityFailure: "V2_REQUIRES_UNAVAILABLE_CUDA_UVA",
    initialFailedStartCandidateCalls: 0,
    resolution: "Pin the shared V1 runner already used effectively by baseline; model, weights, BF16, context, prompts, tasks, scoring, safety and verification are unchanged."
  },
  decodingParity: {
    baselineSnapshotGenerationConfig: "ABSENT_EFFECTIVE_VLLM_DEFAULTS",
    candidateSnapshotGenerationConfig: "PRESENT_BUT_DISABLED_BY_SERVER",
    sharedServerGenerationConfig: "vllm",
    status: "PASS_IDENTICAL_EFFECTIVE_DEFAULTS",
    priorV2CandidateRun: artifactVersion === "v3" ? "INVALIDATED_MODEL_GENERATION_CONFIG_AUTO_WAS_A_CONFOUND" : "NOT_APPLICABLE"
  },
  fixedVariables: expectedShared,
  frozenSemantics: {
    harness: "E-MIN-V2",
    retrieval: "SYMBOL_TOP_2_THEN_HYBRID_TOP_2",
    context: "C1_TASK_PLUS_SOURCE_MAX_8192_MODEL_CONTEXT",
    toolRuntime: "IDENTICAL_CONSTRAINED_PATCH_AND_DETERMINISTIC_VERIFICATION",
    retry: "MAXIMUM_TWO_CALLS_WITH_EXACT_FAILURE_EVIDENCE",
    reviewer: "OFF",
    multiAgent: "OFF",
    rawPromptPersistence: false,
    rawOutputPersistence: false
  },
  permittedDifferences: ["model ID and exact weight revision", "model-native architecture/config", "tokenizer and chat template", "intrinsic model output, tokenization, latency, throughput and VRAM"],
  aggregateCompatibilityNote: "The post-baseline retry structured-output aggregate correction changes only report aggregation. Paired v2 analysis recomputes both profiles from immutable attempt rows; prompts, calls, row scoring and task semantics are unchanged.",
  failures
};

const outputRelative = `docs/experiments/model-specialization/MODEL_SPECIALIZATION_FAIRNESS_GATE.${artifactVersion}.json`;
const body = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(path.join(root, outputRelative), body, { flag: "wx" });
await writeFile(path.join(root, `${outputRelative}.sha256`), `${sha256(body)}  ${path.basename(outputRelative)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output: outputRelative, status: report.status, observationBudget, failures }, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
