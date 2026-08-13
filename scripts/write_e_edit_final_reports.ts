import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type Ref<T> = { value: T; path: string; sha256: string };
async function verified<T>(relative: string): Promise<Ref<T>> { const target = path.join(root, relative), bytes = await readFile(target), digest = sha256(bytes); const m = await lstat(target), s = await lstat(`${target}.sha256`); if (!m.isFile() || m.isSymbolicLink() || !s.isFile() || s.isSymbolicLink() || await readFile(`${target}.sha256`, "utf8") !== `${digest}  ${path.basename(target)}\n`) throw new Error(`Invalid artifact ${relative}`); return { value: JSON.parse(bytes.toString("utf8")) as T, path: relative, sha256: digest }; }
async function persist(relative: string, value: unknown) { const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); const body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body); for (const [file, contents] of [[target, body], [`${target}.sha256`, `${digest}  ${path.basename(target)}\n`]] as const) { try { const h = await open(file, "wx", 0o600); try { await h.writeFile(contents); await h.sync(); } finally { await h.close(); } } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (await readFile(file, "utf8") !== contents) throw new Error(`Immutable collision ${relative}`); } } return { path: relative, sha256: digest }; }
async function lines(relative: string) { const text = await readFile(path.join(root, relative), "utf8"); return text.trimEnd().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
function ref<T>(artifact: Ref<T>) { return { path: artifact.path, sha256: artifact.sha256 }; }
async function stableGeneratedAt(): Promise<string> {
  try {
    const value = JSON.parse(await readFile(path.join(root, "benchmarks/patch-interface/E_EDIT_NORMAL_RETRIEVAL_RESULTS.v1.json"), "utf8")) as Record<string, unknown>;
    if (typeof value.generatedAt !== "string") throw new Error("Existing E-EDIT results lack generatedAt");
    return value.generatedAt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Date().toISOString();
    throw error;
  }
}

const baselineDir = "docs/experiments/runs/e-edit-normal-baseline-20260811T093200Z";
const coderDir = "docs/experiments/runs/e-edit-normal-coder-20260811T093430Z";
const retryDir = "docs/experiments/runs/e-edit-retry-baseline-20260811T094020Z";
const [candidate, secondaryPrereg, retryPrereg, primaryResults, promotion, baseline, coder, retry, baselineLifecycle, coderLifecycle, retryLifecycle] = await Promise.all([
  verified<any>("docs/experiments/patch-interface/E_EDIT_CANDIDATE.v1.json"), verified<any>("benchmarks/patch-interface/E_EDIT_NORMAL_RETRIEVAL_PREREGISTRATION.v1.json"), verified<any>("benchmarks/patch-interface/E_EDIT_RETRY_PREREGISTRATION.v1.json"), verified<any>("benchmarks/patch-interface/PATCH_INTERFACE_V3_RESULTS.json"), verified<any>("benchmarks/patch-interface/PATCH_INTERFACE_V3_PROMOTION_DECISION.json"), verified<any>(`${baselineDir}/result.json`), verified<any>(`${coderDir}/result.json`), verified<any>(`${retryDir}/result.json`), verified<any>(`${baselineDir}/lifecycle.json`), verified<any>(`${coderDir}/lifecycle.json`), verified<any>(`${retryDir}/lifecycle.json`)
]);
for (const [name, result, expected] of [["baseline", baseline, 50], ["coder", coder, 50], ["retry", retry, 32]] as const) {
  if (result.value.status !== "COMPLETE_DEVELOPMENT_DIAGNOSTIC") throw new Error(`${name} result incomplete`);
  const dir = name === "baseline" ? baselineDir : name === "coder" ? coderDir : retryDir;
  const checkpoint = await lines(`${dir}/observations.checkpoint.jsonl`), events = await lines(`${dir}/call-events.jsonl`);
  if (checkpoint.length !== expected || events.length !== expected * 2 || events.filter((row) => row.event === "CALL_STARTED").length !== expected || events.filter((row) => row.event === "CALL_COMPLETED").length !== expected) throw new Error(`${name} ledger count mismatch`);
  for (let i = 0; i < expected; i += 1) if (events[i * 2].event !== "CALL_STARTED" || events[i * 2 + 1].event !== "CALL_COMPLETED" || events[i * 2].observationId !== checkpoint[i].observationId || events[i * 2 + 1].observationId !== checkpoint[i].observationId || events[i * 2 + 1].observationSha256 !== sha256(JSON.stringify(checkpoint[i]))) throw new Error(`${name} ledger hash/order mismatch ${i}`);
}
if ([baselineLifecycle, coderLifecycle, retryLifecycle].some((artifact) => artifact.value.status !== "PASS" || artifact.value.checks.maximumGpuMemoryMiB !== 0 || artifact.value.checks.loopbackPort8000Clear !== true || artifact.value.checks.ephemeralApiKeyAbsent !== true)) throw new Error("Lifecycle cleanup evidence failed");
if (promotion.value.decision !== "E_EDIT_JUSTIFIED" || candidate.value.selectedInterface !== "P2_MINIMAL") throw new Error("E-EDIT lineage mismatch");
const results = {
  schemaVersion: 1, resultsId: "dca-e-edit-normal-retrieval-and-retry-v1", generatedAt: await stableGeneratedAt(), status: "PASS_AS_MEASURED_DEVELOPMENT_ONLY", classification: "DEVELOPMENT_ONLY_NOT_HOLDOUT_NOT_PRODUCT_PROMOTION",
  inputs: { candidate: ref(candidate), secondaryPreregistration: ref(secondaryPrereg), retryPreregistration: ref(retryPrereg), primaryResults: ref(primaryResults), promotionDecision: ref(promotion) },
  normalRetrieval: {
    baseline: { result: ref(baseline), lifecycle: ref(baselineLifecycle), ...baseline.value.summary, retryEligible: baseline.value.retryGate.eligible },
    coder: { result: ref(coder), lifecycle: ref(coderLifecycle), ...coder.value.summary, retryEligible: coder.value.retryGate.eligible },
    comparison: { behavioralDifferenceCoderMinusBaseline: coder.value.summary.behavioralSuccessRate - baseline.value.summary.behavioralSuccessRate, pairedClaim: "NOT_COMPUTED_FROM_AGGREGATES", interpretation: "Coder-3B does not improve P2 normal-retrieval behavioral success in this development generation." }
  },
  retry: { profile: "baseline", result: ref(retry), lifecycle: ref(retryLifecycle), ...retry.value.summary, coderRetryCalls: 0, reasonCoderNotRetried: "one-shot 9/50 is below frozen 13/50 gate" },
  lineage: { historicalV2ExcludedPhysicalCalls: 7, validV3PrimaryCalls: 840, secondaryOneShotCalls: 100, retryCalls: 32, totalPhysicalCalls: 979, validDevelopmentCalls: 972, duplicates: 0, silentRetries: 0 },
  conclusions: { simplerEditInterfaceRevealsLatentCapability: true, survivesNormalRetrieval: { baseline: "YES_18_OF_50", coder: "LIMITED_9_OF_50" }, evidenceDrivenRetryAddsValue: "YES_BASELINE_PLUS_5_OF_32_FAILED_TASKS", primaryBottleneck: ["MUTATION_INTERFACE", "REASONING", "MODEL_CAPACITY_OR_SPECIALIZATION"], retrievalBottleneckObserved: false, retrievalEvidence: "exact source selected and included 50/50 for both profiles", coderSpecializationGain: "NO_NORMAL_RETRIEVAL_BEHAVIORAL_GAIN", productMutationRecommendation: "REMAIN_DISABLED_PENDING_FRESH_REPOSITORY_DISJOINT_HOLDOUT_AND_PRODUCT_APPROVAL", freshHoldoutCreated: false, scaleGateReached: false, sevenBExperimentRequiredNow: false },
  safety: { wrongFileAttempts: baseline.value.summary.wrongFileAttempts + coder.value.summary.wrongFileAttempts, actualSafetyViolations: baseline.value.summary.actualSafetyViolations + coder.value.summary.actualSafetyViolations + retry.value.summary.actualSafetyViolations, rollbackFailures: baseline.value.summary.rollbackFailures + coder.value.summary.rollbackFailures, lifecycleCleanupPasses: 3 },
  privacy: { rawPromptsStored: false, rawOutputsStored: false, rawPatchesStored: false, boundedHashesAndMetricsOnly: true },
  protectedActions: { modelDownload: false, dependencyInstall: false, sudoAdmin: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
};
const resultsRef = await persist("benchmarks/patch-interface/E_EDIT_NORMAL_RETRIEVAL_RESULTS.v1.json", results);
const ceiling = await persist("docs/experiments/patch-interface/PATCH_CAPABILITY_CEILING.v3.json", { schemaVersion: 1, reportId: "dca-patch-capability-ceiling-after-e-edit-v3", generatedAt: results.generatedAt, status: "DEVELOPMENT_CAPABILITY_MEASURED_PRODUCT_MUTATION_DISABLED", evidence: resultsRef, supported: { boundedP2OracleContext: "development evidence", boundedP2NormalRetrievalBaseline: "18/50 one-shot; 23/50 maximum two-call", boundedP2NormalRetrievalCoder: "9/50 one-shot; retry ineligible" }, unsupported: ["autonomous repository mutation", "fresh unseen-repository patch generalization", "production mutation routing", "Coder-3B superiority", "7B scale claim"], productRecommendation: results.conclusions.productMutationRecommendation, nextScientificGate: "freeze then execute a repository-disjoint untouched E-EDIT holdout only under a separately authorized task" });
const index = await persist("docs/experiments/patch-interface/E_EDIT_RESULTS_INDEX.v1.json", { schemaVersion: 1, indexId: "dca-e-edit-results-index-v1", generatedAt: results.generatedAt, status: "PASS", artifacts: { candidate: ref(candidate), secondaryPreregistration: ref(secondaryPrereg), retryPreregistration: ref(retryPrereg), results: resultsRef, capabilityCeiling: ceiling, baseline: ref(baseline), coder: ref(coder), retry: ref(retry), lifecycles: [ref(baselineLifecycle), ref(coderLifecycle), ref(retryLifecycle)] }, lineage: results.lineage, conclusions: results.conclusions, safety: results.safety });
process.stdout.write(`${JSON.stringify({ status: "PASS", results: resultsRef, capabilityCeiling: ceiling, index }, null, 2)}\n`);
