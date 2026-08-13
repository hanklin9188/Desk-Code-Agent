import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { acquisitionCommand, inspectSnapshot, readModelSpecializationRegistry, type SnapshotFileExpectation } from "../services/model-specialization-runtime/src/index";

const root = path.resolve(process.cwd());
const outputRoot = path.join(root, "benchmarks/model-specialization");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const artifactRef = async (relative: string) => ({ path: relative, sha256: sha256(await readFile(path.join(root, relative))) });
const idsHash = (ids: string[]) => sha256(`${ids.join("\n")}\n`);

async function verifiedJson<T>(relative: string): Promise<{ value: T; path: string; sha256: string }> {
  const target = path.join(root, relative);
  const bytes = await readFile(target);
  const actual = sha256(bytes);
  const sidecar = `${target}.sha256`;
  try {
    const expected = (await readFile(sidecar, "utf8")).trim().split(/\s+/)[0];
    if (expected !== actual) throw new Error(`${relative} checksum mismatch`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("checksum mismatch")) throw error;
  }
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: actual };
}

async function writeImmutable(name: string, value: object) {
  const target = path.join(outputRoot, name);
  try {
    const existing = await readFile(target);
    const actual = sha256(existing);
    const expected = (await readFile(`${target}.sha256`, "utf8")).trim().split(/\s+/)[0];
    if (actual !== expected) throw new Error(`Existing immutable artifact checksum mismatch: ${name}`);
    JSON.parse(existing.toString("utf8"));
    return { path: `benchmarks/model-specialization/${name}`, sha256: actual };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(target, body, { flag: "wx" });
  await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
  return { path: `benchmarks/model-specialization/${name}`, sha256: sha256(body) };
}

type Task = { task_id: string; category: string; dataset_role: string };
type G4Prereg = { experimentTasks: Record<string, string[]> };
const g4Manifest = await verifiedJson<{ tasks: Task[] }>("benchmarks/g4-development/G4_DEVELOPMENT_MANIFEST.v2.json");
const g4Oracle = await verifiedJson<{ rows: Array<{ task_id: string }> }>("benchmarks/g4-development/G4_DEVELOPMENT_ORACLE.v2.sealed.json");
const g4Prereg = await verifiedJson<G4Prereg>("benchmarks/g4-development/G4_DEVELOPMENT_EXPERIMENT_PREREGISTRATION.v2.json");
const g4Seal = await verifiedJson<Record<string, unknown>>("benchmarks/g4-development/G4_DEVELOPMENT_SEAL.json");
const g3Results = await verifiedJson<Record<string, unknown>>("benchmarks/g3/G3_RESULTS_INDEX.json");
const registry = await readModelSpecializationRegistry(root);
await mkdir(outputRoot, { recursive: true });

const baselineFiles: SnapshotFileExpectation[] = [
  { path: "LICENSE", sha256: "bbedc3fda3305820b977265f01b8619d87570a6739de3a5582c3464840f1e57a", size: 11_544 },
  { path: "README.md", sha256: "1406be1b6b8fd8a6545870da516912804756593628a1d0fb0a7965211e82a7bb", size: 77_661 },
  { path: "config.json", sha256: "ddc63e1c717afa86c865bb5e01313d89d72bb53b97ad4a8a03ba8510c0621670", size: 3_161 },
  { path: "tokenizer_config.json", sha256: "316230d6a809701f4db5ea8f8fc862bc3a6f3229c937c174e674ff3ca0a64ac8", size: 16_710 },
  { path: "chat_template.jinja", sha256: "a4aee8afcf2e0711942cf848899be66016f8d14a889ff9ede07bca099c28f715", size: 7_756 },
  { path: "model.safetensors.index.json", sha256: "cf3f798ee02ba45f9622aa8892a47369ab667d0afbf154ee7c2212de42e6302d", size: 76_196 },
  { path: "tokenizer.json", sha256: "5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42", size: 12_807_982 },
  { path: "model.safetensors-00001-of-00002.safetensors", sha256: "26a93f066e1916adb13453dae5a0c707c0fbc71299ed98779571a907b8e74c61", size: 5_329_398_688 },
  { path: "model.safetensors-00002-of-00002.safetensors", sha256: "cb544bd9bfae93dc59b0f22b292f5933573854a7f9b97835c67060d7d910e188", size: 3_990_429_408 }
];
const candidateFiles: SnapshotFileExpectation[] = [
  { path: "LICENSE", sha256: "ef52482bb785733093dc9a2e8edd8e764c77d12d8e9d8f10a80c9b547d32d0f9", size: 7_388 },
  { path: "README.md", sha256: "eb21b99af3631b35f79edc886755aa3358098ab72b97d018f1978a3f04e4a362", size: 5_271 },
  { path: "config.json", sha256: "8f85440a3222d18772e964b1ef0b4b1574a1c5e6260c99aa23fcddd05c28b8ae", size: 661 },
  { path: "generation_config.json", sha256: "fdaccbcb02f3e1e7914ccb0f69ebe899071ffd27cf825166d823163e156870f2", size: 243 },
  { path: "tokenizer_config.json", sha256: "959e7f1d9a1b7641a6d6ce05ca97b75c7894fcb66cbe5a040406458fb1128ee4", size: 7_305 },
  { path: "model.safetensors.index.json", sha256: "7b85f79fd7612df2e5d7f03d7f92d65c8967f790a331146ca7f45658823060d3", size: 35_581 },
  { path: "model-00001-of-00002.safetensors", sha256: "5b684409377e037e5ed75d680a070126e841dab17e8cb9a818868deadf01ab39", size: 4_957_560_304 },
  { path: "model-00002-of-00002.safetensors", sha256: "8bc5227aae6174eaf0b589fd4fbeb0de046a1fc951a67f2d2538acad811e1068", size: 1_214_366_696 }
];

const [baselineAvailability, coderAvailability] = await Promise.all([
  inspectSnapshot(root, "baseline", registry.profiles.baseline, baselineFiles),
  inspectSnapshot(root, "coder", registry.profiles.coder, candidateFiles)
]);
if (baselineAvailability.status !== "PASS") throw new Error("Pinned baseline snapshot failed exact verification");

const exactManifests = await writeImmutable("EXACT_MODEL_MANIFESTS.json", {
  schemaVersion: 1,
  status: coderAvailability.status === "PASS" ? "BOTH_EXACT_SNAPSHOTS_VERIFIED" : "BASELINE_VERIFIED_CANDIDATE_NOT_LOCAL",
  generatedAt: new Date().toISOString(),
  metadataResolution: {
    candidateOfficialRepository: "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct",
    candidateOfficialApi: "https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-3B-Instruct?blobs=true",
    candidateMainResolvedByGitLsRemote: "488639f1ff808d1d3d0ba301aef8c11461451ec5",
    resolvedAt: "2026-08-09",
    remoteMetadataOnlyNoWeightsDownloaded: true
  },
  servingRuntime: { vllm: "0.26.0", transformers: "5.14.1", torch: "2.11.0+cu130", cudaRuntime: "13.0", driver: "591.86" },
  sharedServing: registry.sharedServing,
  models: {
    baseline: {
      ...registry.profiles.baseline,
      parameterCount: 4_000_000_000,
      snapshotFiles: baselineFiles,
      snapshotPayloadBytes: baselineFiles.reduce((sum, item) => sum + item.size, 0),
      verification: baselineAvailability
    },
    coder: {
      ...registry.profiles.coder,
      parameterCount: 3_085_938_688,
      nonEmbeddingParameterCount: 2_770_000_000,
      tensorType: "BF16",
      chatTemplateSha256: "cd8e9439f0570856fd70470bf8889ebd8b5d1107207f67a5efb46e342330527f",
      chatTemplateBytes: 2_507,
      snapshotFiles: candidateFiles,
      snapshotPayloadBytes: candidateFiles.reduce((sum, item) => sum + item.size, 0),
      verification: coderAvailability,
      license: {
        name: "Qwen Research License Agreement",
        releaseDate: "2024-09-19",
        sha256: "ef52482bb785733093dc9a2e8edd8e764c77d12d8e9d8f10a80c9b547d32d0f9",
        classification: "NON_COMMERCIAL_RESEARCH_OR_EVALUATION_ONLY",
        commercialUse: "REQUIRES_SEPARATE_LICENSE_FROM_ALIBABA_CLOUD",
        ownerDecisionRequired: true
      }
    }
  }
});

const allPatchIds = g4Manifest.value.tasks.filter((task) => task.category === "behavioral_patch").map((task) => task.task_id);
const taskUnderstandingIds = g4Manifest.value.tasks.filter((task) => task.category === "open_ended_coding").map((task) => task.task_id);
const phaseSelections = {
  oracleContext: g4Prereg.value.experimentTasks.oracleContext,
  taskUnderstanding: taskUnderstandingIds,
  navigation: allPatchIds,
  diagnosis: allPatchIds,
  patchOnly: allPatchIds,
  planning: g4Prereg.value.experimentTasks.planningIsolation,
  oneShotEndToEnd: allPatchIds,
  boundedRetry: allPatchIds
};
for (const [phase, ids] of Object.entries(phaseSelections)) {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error(`Invalid task selection for ${phase}`);
  for (const id of ids) if (!g4Manifest.value.tasks.some((task) => task.task_id === id) || !g4Oracle.value.rows.some((row) => row.task_id === id)) throw new Error(`Missing sealed task/oracle ${id}`);
}

const developmentManifest = await writeImmutable("MODEL_COMPARISON_DEVELOPMENT_MANIFEST.json", {
  schemaVersion: 1,
  suiteId: "dca-qwen-model-specialization-development-v1",
  classification: "MODEL_COMPARISON_DEVELOPMENT_DIAGNOSTIC_NOT_HOLDOUT",
  state: "SEALED_BEFORE_CANDIDATE_MODEL_CALLS",
  source: { manifest: { path: g4Manifest.path, sha256: g4Manifest.sha256 }, oracle: { path: g4Oracle.path, sha256: g4Oracle.sha256 }, g4Seal: { path: g4Seal.path, sha256: g4Seal.sha256 } },
  taskReuseRationale: "The sealed 217-task G4 corpus already supplies repository-grounded naturalistic tasks plus 25 executable behavioral-oracle microrepositories. It exceeds 120 observations across the preregistered phases, so no new development task authoring is justified.",
  phases: Object.fromEntries(Object.entries(phaseSelections).map(([phase, ids]) => [phase, { taskCount: ids.length, taskIdsSha256: idsHash(ids), taskIds: ids }])),
  minimumDiagnosticObservationsPerModel: Object.values(phaseSelections).reduce((sum, ids) => sum + ids.length, 0),
  sameTasksForBothModels: true,
  futureHoldout: { created: false, inspectionAllowed: false, reason: "Candidate has not passed the development gate" }
});

const preregistration = await writeImmutable("MODEL_SPECIALIZATION_PREREGISTRATION.json", {
  schemaVersion: 1,
  preregistrationId: "dca-qwen35-vs-qwen25-coder3b-specialization-v1",
  state: "FROZEN_BEFORE_FIRST_CANDIDATE_MODEL_CALL",
  timestamp: new Date().toISOString(),
  primaryHypothesis: "A code-specialized approximately 3B model materially outperforms Qwen3.5-4B on diagnosis, patch generation, and naturalistic repository-level coding under frozen E-MIN-V2.",
  nullHypothesis: "Replacing Qwen3.5-4B with a similarly sized code-specialized model does not materially improve end-to-end engineering success.",
  secondaryHypotheses: [
    "Code specialization improves patch generation more than repository retrieval.",
    "Code specialization improves diagnosis with oracle evidence.",
    "Code specialization may improve naturalistic coding without improving general onboarding/report tasks.",
    "If isolated coding improves but end-to-end does not, the remaining bottleneck is orchestration/navigation rather than pure generation."
  ],
  inputs: { exactModelManifests: exactManifests, developmentManifest, g3ImmutableResults: { path: g3Results.path, sha256: g3Results.sha256 } },
  intendedIndependentVariable: "MODEL_PROFILE_ONLY",
  fixedVariables: {
    harness: await artifactRef("config/production/emin-v2-frozen-2026-08-09.json"),
    agentRuntime: await artifactRef("services/agent-runtime/src/index.ts"),
    toolRuntime: await artifactRef("services/tool-runtime/src/index.ts"),
    repositoryIntelligence: await artifactRef("services/repo-intelligence/src/index.ts"),
    retrieval: "SYMBOL_TOP_2_THEN_HYBRID_TOP_2",
    context: "C1_TASK_PLUS_SOURCE_MAX_8192_MODEL_CONTEXT",
    precision: "BF16",
    temperature: 0,
    seed: 20260809,
    reasoningMode: false,
    semanticReviewer: "OFF",
    multiAgent: "OFF",
    patchAndVerification: "IDENTICAL_CONSTRAINED_WORKTREE_PATH_ALLOWLIST_PATCH_BUDGET_TRUSTED_COMMANDS_TIMEOUT_ROLLBACK",
    residency: "SEQUENTIAL_ONE_MODEL_AT_A_TIME"
  },
  phasePrimaryMetrics: {
    oracleContext: "strict task solution + structured schema + required action + no unsupported path claim",
    taskUnderstanding: "task family/outcome/mutation intent + affected-path recall + success-criteria component recall",
    navigation: "source file Recall@2 + exact symbol + visible-test affinity + wrong-file rate",
    diagnosis: "exact-or-keyword root-cause accuracy with evidence",
    patchOnly: "constrained apply + syntax + visible + hidden behavioral tests + correct file + rollback",
    planning: "required path recall >=75% + order + dependency + test + rollback concern",
    oneShotEndToEnd: "E-MIN-V2 retrieval + one call + strict behavioral verification",
    boundedRetry: "one vs maximum two calls; second call only after failure and only with exact deterministic failure evidence"
  },
  developmentPromotionGate: {
    requiredAll: [
      "patch-only absolute behavioral-success gain >=10 percentage points",
      "diagnosis or one-shot end-to-end absolute success gain >=10 percentage points",
      "zero coder safety violations and no increase versus baseline",
      "coder measured peak VRAM leaves at least 512 MiB on the 16376 MiB device"
    ],
    exclusions: "Schema validity, willingness to patch, token count, or evidence completeness alone cannot promote the candidate."
  },
  freshHoldoutGateIfDevelopmentPasses: {
    minimumTasks: 100,
    repositoryDisjointFrom: ["G1", "G2", "G3", "G4 development", "model-comparison development", "historical patch development"],
    productionConsiderationRequires: [
      "one-shot end-to-end absolute gain >=10 percentage points OR patch behavioral-success absolute gain >=10 percentage points with at least 5 net coder-only paired wins",
      "paired repository-cluster bootstrap lower bound greater than -5 percentage points on primary end-to-end success",
      "zero actual safety violations, wrong-file rate <= baseline and <=1%",
      "all deterministic rollback and verification controls pass",
      "measured deployment fits RTX 4080 SUPER with at least 512 MiB headroom"
    ]
  },
  refusalScoring: {
    appropriate: "REPORT_ONLY or policy block when expected outcome is non-mutation/unsafe/missing oracle",
    unnecessary: "REPORT_ONLY on executable behavioral patch tasks with source, root cause, behavioral requirement, visible test and hidden oracle",
    unsafe: "mutation outcome on a REPORT_ONLY/policy-block task or wrong-file target"
  },
  holdoutPolicy: "Do not create, inspect, or run a fresh holdout until developmentPromotionGate passes.",
  routingPolicy: "No product routing change until fresh behavioral evidence supports it.",
  strongerModelPolicy: "Prepare but do not acquire a separate 3B-vs-7B scale protocol only if Coder-3B passes the development gate.",
  protectedActions: { modelDownload: false, dependencyInstall: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
});

const acquisitionStatus = await writeImmutable("MODEL_ACQUISITION_STATUS.json", {
  schemaVersion: 1,
  status: coderAvailability.status === "PASS" ? "LOCAL_SNAPSHOT_VERIFIED_NO_ACQUISITION_NEEDED" : "BLOCKED_APPROVAL",
  checkedAt: new Date().toISOString(),
  localChecks: { baseline: baselineAvailability, coder: coderAvailability },
  candidate: {
    modelId: registry.profiles.coder.modelId,
    revision: registry.profiles.coder.revision,
    expectedStorage: coderAvailability.snapshotPath,
    exactCommandPreparedNotExecuted: acquisitionCommand(root, registry.profiles.coder),
    commandRequires: ["explicit model-download approval", "owner acceptance of Qwen Research License for non-commercial research/evaluation"],
    postDownloadVerification: "npx tsx scripts/verify_model_specialization_snapshot.ts --profile=coder",
    expectedFiles: candidateFiles
  },
  observedEffects: { modelWeightsDownloaded: false, candidateProcessStarted: false, apiKeyCreatedForCandidate: false }
});

const preparationIndex = await writeImmutable("MODEL_SPECIALIZATION_PREPARATION_INDEX.json", {
  schemaVersion: 1,
  status: coderAvailability.status === "PASS" ? "READY_FOR_SEQUENTIAL_EXECUTION" : "READY_BASELINE_CANDIDATE_BLOCKED_APPROVAL",
  artifacts: { exactManifests, developmentManifest, preregistration, acquisitionStatus },
  immutableInputs: { g4Manifest: { path: g4Manifest.path, sha256: g4Manifest.sha256 }, g4Oracle: { path: g4Oracle.path, sha256: g4Oracle.sha256 }, g4Preregistration: { path: g4Prereg.path, sha256: g4Prereg.sha256 }, g4Seal: { path: g4Seal.path, sha256: g4Seal.sha256 }, g3Results: { path: g3Results.path, sha256: g3Results.sha256 } },
  candidateBenchmarkCallsObserved: 0,
  futureHoldoutCreated: false
});

process.stdout.write(`${JSON.stringify({ status: "PASS", candidateAvailability: coderAvailability.status, preparationIndex }, null, 2)}\n`);
