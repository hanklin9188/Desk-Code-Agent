import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type PatchObservation = {
  taskId: string;
  success: boolean;
  schemaValid: boolean;
  selectedOutcome: string | null;
  unnecessaryRefusal: boolean;
  outputHash: string | null;
  patchHash: string | null;
  patchApplied: boolean;
  syntax: string;
  visible: string;
  hidden: string;
  rollback: boolean;
  wrongFileEdit: boolean;
  changedLines: number;
  unnecessaryEdits: boolean;
  failureEvidence: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  error: string | null;
};

type CapabilityResult = {
  exactModel: { modelId: string; revision: string; precision: string };
  observations: { patchOnly: PatchObservation[] };
  privacy: {
    rawPromptsStored: boolean;
    rawModelOutputsStored: boolean;
    patchesStored: boolean;
    hashesAndScoredFieldsOnly: boolean;
  };
};

const root = path.resolve(process.cwd());
const outputRoot = path.join(root, "docs/experiments/patch-interface");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function verifiedJson<T>(relative: string): Promise<{ value: T; path: string; sha256: string }> {
  const target = path.join(root, relative);
  const bytes = await readFile(target);
  const sidecar = await readFile(`${target}.sha256`, "utf8");
  const expected = sidecar.trim().split(/\s+/)[0];
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${relative} checksum mismatch`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: actual };
}

function classify(row: PatchObservation) {
  const reportOnly = row.selectedOutcome === "REPORT_ONLY";
  const headerless = row.failureEvidence.includes("Patch has no target file headers");
  const preflightFailed = row.failureEvidence.includes("Patch preflight failed");
  const corruptPatch = row.failureEvidence.includes("corrupt patch");
  const proposed = row.selectedOutcome === "PATCH_PROPOSAL";
  const patchHeadersRecognized = proposed && !headerless;
  const gitApplyCheckReached = patchHeadersRecognized && preflightFailed;

  let failureStage = "UNKNOWN";
  let refusalClass = "other";
  if (reportOnly) {
    failureStage = "ACTION_SELECTION_UNNECESSARY_REFUSAL";
    refusalClass = "REPORT_ONLY";
  } else if (headerless) {
    failureStage = "PATCH_CONSTRUCTION_TARGET_HEADERS";
    refusalClass = "syntactically_invalid_patch_edit";
  } else if (preflightFailed) {
    failureStage = "GIT_APPLY_PREFLIGHT";
    refusalClass = "syntactically_invalid_patch_edit";
  } else if (row.patchApplied && row.syntax !== "PASS") {
    failureStage = "SYNTAX_OR_PARSE";
    refusalClass = "valid_patch_edit";
  } else if (row.patchApplied && row.visible !== "PASS") {
    failureStage = "VISIBLE_TEST";
    refusalClass = "valid_patch_edit";
  } else if (row.patchApplied && row.hidden !== "PASS") {
    failureStage = "HIDDEN_BEHAVIORAL_ORACLE";
    refusalClass = "valid_patch_edit";
  } else if (row.success) {
    failureStage = "PASS";
    refusalClass = "valid_patch_edit";
  }

  return {
    taskId: row.taskId,
    behavioralSuccess: row.success,
    rawOutput: {
      availability: "RAW_OUTPUT_NOT_PERSISTED",
      outputHash: row.outputHash,
      reconstructable: false
    },
    schema: {
      jsonParse: row.schemaValid ? "PASS" : "FAIL",
      serverConstrainedSchemaRequested: true,
      postHocSchemaRevalidation: "NOT_IMPLEMENTED_IN_HISTORICAL_RUN",
      malformedRecorded: !row.schemaValid
    },
    actionValidation: {
      selectedOutcome: row.selectedOutcome,
      mutationRequired: true,
      unnecessaryRefusal: row.unnecessaryRefusal,
      status: reportOnly ? "VALID_SCHEMA_NON_MUTATION_ACTION" : proposed ? "PATCH_PROPOSAL_SELECTED" : "NO_VALID_ACTION"
    },
    patchConstruction: {
      patchTextPersisted: false,
      patchHash: row.patchHash,
      targetHeadersRecognized: patchHeadersRecognized,
      result: reportOnly ? "NOT_REACHED_REPORT_ONLY" : headerless ? "FAIL_NO_TARGET_HEADERS" : proposed ? "DIFF_REACHED_RUNTIME" : "NOT_REACHED"
    },
    gitApplyCheck: {
      reached: gitApplyCheckReached,
      result: gitApplyCheckReached ? "FAIL" : "NOT_RUN",
      errorClass: corruptPatch ? "CORRUPT_PATCH" : preflightFailed ? "PATCH_PREFLIGHT_FAILURE" : null
    },
    gitApply: { reached: row.patchApplied, result: row.patchApplied ? "PASS" : "NOT_RUN" },
    deterministicVerification: {
      syntax: row.syntax,
      visible: row.visible,
      hidden: row.hidden
    },
    safety: {
      wrongFileMutationObserved: row.wrongFileEdit,
      targetCorrectnessEvidence: headerless ? "INDETERMINATE_NO_HEADERS" : reportOnly ? "NOT_APPLICABLE_NO_MUTATION" : "NO_WRONG_TARGET_RECORDED",
      changedLinesRecorded: row.changedLines,
      changedLinesCaveat: row.patchApplied ? null : "ZERO_IS_POST_APPLY_COUNTER_NOT_RAW_PATCH_SIZE"
    },
    cleanup: {
      sourceHashRestoredOrUnchanged: row.rollback,
      rollbackRoutineInvoked: row.patchApplied,
      caveat: row.patchApplied ? null : "NO_MUTATION_WAS_APPLIED"
    },
    failureStage,
    refusalClass,
    failureEvidence: row.failureEvidence,
    telemetry: {
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      latencyMs: row.latencyMs,
      transportError: row.error
    }
  };
}

const [baseline, coder] = await Promise.all([
  verifiedJson<CapabilityResult>("docs/experiments/model-specialization/BASELINE_DEVELOPMENT_CAPABILITY_RESULT.json"),
  verifiedJson<CapabilityResult>("docs/experiments/model-specialization/CODER_DEVELOPMENT_CAPABILITY_RESULT.v3.json")
]);

for (const artifact of [baseline, coder]) {
  if (artifact.value.observations.patchOnly.length !== 25) throw new Error(`${artifact.path} must contain exactly 25 patch-only observations`);
  if (artifact.value.privacy.rawModelOutputsStored || artifact.value.privacy.patchesStored) throw new Error(`${artifact.path} has an unexpected privacy contract`);
}

const profiles = [
  { profileId: "baseline", source: baseline, rows: baseline.value.observations.patchOnly.map(classify) },
  { profileId: "coder", source: coder, rows: coder.value.observations.patchOnly.map(classify) }
];
const rows = profiles.flatMap((profile) => profile.rows.map((row) => ({ profileId: profile.profileId, model: profile.source.value.exactModel, ...row })));
const count = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate).length;
const byProfile = Object.fromEntries(profiles.map((profile) => [profile.profileId, {
  model: profile.source.value.exactModel,
  tasks: profile.rows.length,
  failureStages: Object.fromEntries([...new Set(profile.rows.map((row) => row.failureStage))].sort().map((stage) => [stage, profile.rows.filter((row) => row.failureStage === stage).length])),
  selectedOutcomes: Object.fromEntries([...new Set(profile.rows.map((row) => String(row.actionValidation.selectedOutcome)))].sort().map((outcome) => [outcome, profile.rows.filter((row) => String(row.actionValidation.selectedOutcome) === outcome).length])),
  patchApplied: profile.rows.filter((row) => row.gitApply.reached).length,
  behavioralSuccesses: profile.rows.filter((row) => row.behavioralSuccess).length
}]));

const result = {
  schemaVersion: 1,
  artifactId: "dca-patch-pipeline-failure-matrix-v1",
  generatedAt: new Date().toISOString(),
  classification: "HISTORICAL_APPEND_ONLY_AUDIT_NO_NEW_MODEL_CALLS",
  status: "PASS_WITH_HISTORICAL_RAW_OUTPUT_LIMITATION",
  question: "At which exact recorded stage did every canonical prior patch-only observation stop?",
  inputs: {
    baseline: { path: baseline.path, sha256: baseline.sha256 },
    coder: { path: coder.path, sha256: coder.sha256 },
    canonicalIndex: { path: "docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.v4.json", sha256: "58cd13ab7f92147f625271199854755f96c05832bbd20def7d52bb7fcb332c85" },
    baselineAttestation: { path: "benchmarks/patch-interface/PATCH_INTERFACE_BASELINE_ATTESTATION.json", sha256: "ba754c1ff14f8f67c92ae2656d3b222cd0b9ae9cfb33989a7ac1795cde03cd2f" }
  },
  privacyLimitation: {
    rawPromptTextAvailable: false,
    rawModelOutputTextAvailable: false,
    rawPatchTextAvailable: false,
    reason: "The historical run intentionally persisted hashes and scored fields only.",
    auditRule: "Mark unavailable stages as RAW_OUTPUT_NOT_PERSISTED; never reconstruct or infer raw text from hashes."
  },
  schemaSemanticsCaveat: {
    historicalSchemaValidField: "JSON_PARSE_SUCCESS_AFTER_SERVER_SIDE_STRICT_SCHEMA_REQUEST",
    independentPostHocFullSchemaValidation: false,
    implication: "The audit does not relabel historical schemaValid as an independently revalidated JSON Schema pass."
  },
  aggregate: {
    observations: rows.length,
    rawOutputHashes: count((row) => Boolean(row.rawOutput.outputHash)),
    rawOutputsPersisted: 0,
    jsonParsePasses: count((row) => row.schema.jsonParse === "PASS"),
    reportOnly: count((row) => row.actionValidation.selectedOutcome === "REPORT_ONLY"),
    patchProposals: count((row) => row.actionValidation.selectedOutcome === "PATCH_PROPOSAL"),
    targetHeadersRecognized: count((row) => row.patchConstruction.targetHeadersRecognized),
    gitApplyCheckReached: count((row) => row.gitApplyCheck.reached),
    gitApplyCheckPassed: count((row) => row.gitApplyCheck.result === "PASS"),
    patchApplied: count((row) => row.gitApply.reached),
    syntaxRun: count((row) => row.deterministicVerification.syntax !== "NOT_RUN"),
    visibleRun: count((row) => !row.deterministicVerification.visible.startsWith("NOT_RUN")),
    hiddenRun: count((row) => !row.deterministicVerification.hidden.startsWith("NOT_RUN")),
    wrongFileMutations: count((row) => row.safety.wrongFileMutationObserved),
    behavioralSuccesses: count((row) => row.behavioralSuccess),
    worktreesUnchangedAfterward: count((row) => row.cleanup.sourceHashRestoredOrUnchanged)
  },
  byProfile,
  refusalDecomposition: {
    validPatchEdit: count((row) => row.refusalClass === "valid_patch_edit"),
    syntacticallyInvalidPatchEdit: count((row) => row.refusalClass === "syntactically_invalid_patch_edit"),
    reportOnly: count((row) => row.refusalClass === "REPORT_ONLY"),
    textualExplanationWithoutAction: "NOT_DETERMINABLE_RAW_OUTPUT_NOT_PERSISTED",
    malformedSchema: count((row) => row.schema.malformedRecorded),
    unsafeEdit: count((row) => row.safety.wrongFileMutationObserved),
    emptyResponse: count((row) => row.rawOutput.outputHash === null && row.telemetry.transportError === null),
    other: count((row) => row.refusalClass === "other")
  },
  conclusion: {
    supported: "The historical zero behavioral score was dominated by action refusal and diff construction/preflight rejection, not by executed code failing behavioral tests.",
    unsupported: "No claim about semantic quality of the four unpersisted patch texts beyond their recorded parser/preflight failures.",
    exactBreakdown: {
      actionSelectionUnnecessaryRefusal: count((row) => row.failureStage === "ACTION_SELECTION_UNNECESSARY_REFUSAL"),
      patchConstructionTargetHeaders: count((row) => row.failureStage === "PATCH_CONSTRUCTION_TARGET_HEADERS"),
      gitApplyPreflight: count((row) => row.failureStage === "GIT_APPLY_PREFLIGHT"),
      syntaxOrBehavior: count((row) => ["SYNTAX_OR_PARSE", "VISIBLE_TEST", "HIDDEN_BEHAVIORAL_ORACLE"].includes(row.failureStage))
    }
  },
  rows
};

await mkdir(outputRoot, { recursive: true });
const name = "PATCH_PIPELINE_FAILURE_MATRIX.json";
const body = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(path.join(outputRoot, name), body, { flag: "wx" });
await writeFile(path.join(outputRoot, `${name}.sha256`), `${sha256(body)}  ${name}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output: `docs/experiments/patch-interface/${name}`, sha256: sha256(body), aggregate: result.aggregate, failureStages: result.conclusion.exactBreakdown }, null, 2)}\n`);
