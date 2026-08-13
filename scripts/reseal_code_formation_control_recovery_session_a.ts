import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile), root = path.resolve(process.cwd()), sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const p = {
  preregV1: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_PREREGISTRATION.v1.json",
  sealV1: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_RUNNER_SEAL.v1.json",
  sessionV1: "docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_SESSION_A.v1.json",
  preregV2: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_PREREGISTRATION.v2.json",
  sealV2: "benchmarks/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_RUNNER_SEAL.v2.json",
  sessionV2: "docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_SESSION_A.v2.json",
  indexV3: "docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_RESULTS_INDEX.v3.json",
  run: "docs/experiments/runs/code-formation-control-recovery-v1"
} as const;
async function regular(relative: string) { const target = path.join(root, relative), stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not regular: ${relative}`); return readFile(target); }
async function verified(relative: string) { const body = await regular(relative), digest = sha256(body), sidecar = await regular(`${relative}.sha256`); if (sidecar.toString() !== `${digest}  ${path.basename(relative)}\n`) throw new Error(`Artifact drift: ${relative}`); return { value: JSON.parse(body.toString()) as any, sha256: digest }; }
async function publish(relative: string, value: unknown) { const body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body), target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); const pending = `${target}.next.${process.pid}.${randomUUID()}`, handle = await open(pending, "wx", 0o600); try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); } try { await link(pending, target); } finally { await rm(pending, { force: true }); } await writeFile(`${target}.sha256`, `${digest}  ${path.basename(relative)}\n`, { flag: "wx", mode: 0o600 }); return { path: relative, sha256: digest }; }

const [preregV1, sealV1, sessionV1] = await Promise.all([verified(p.preregV1), verified(p.sealV1), verified(p.sessionV1)]);
if (preregV1.value.state !== "FROZEN_BEFORE_FIRST_RECOVERY_TARGET_MODEL_CALL" || sealV1.value.targetModelCallsAtSeal !== 0 || sessionV1.value.runtime.targetModelCalls !== 0 || sessionV1.value.sessionBStarted) throw new Error("V1 zero-call supersession gate failed");
for (const name of ["call-events.jsonl", "paired-observations.jsonl", "sanity-events.jsonl"]) if ((await regular(`${p.run}/${name}`)).length) throw new Error("Recovery ledger consumed before reseal");
const preregV2Ref = await publish(p.preregV2, {
  ...preregV1.value, schemaVersion: 2, state: "FROZEN_BEFORE_FIRST_RECOVERY_TARGET_MODEL_CALL",
  supersedes: { path: p.preregV1, sha256: preregV1.sha256, reason: "Strengthen meaningful formation reachability and explicitly freeze strict-success-primary paired decision thresholds before any target-model call." },
  formationReachabilityGate: { treatmentValidBaseP2CandidatesMinimum: 20, treatmentValidBaseP2FractionMinimum: 0.5, constraintInvocationsMustEqualTreatmentValidBaseP2Candidates: true },
  analysisThresholds: {
    primaryMetric: "strict behavioral success",
    pairedMethod: "exact two-sided McNemar on discordant strict-success pairs",
    alpha: 0.05,
    strictSuccessAbsoluteGainMinimum: 0.05,
    syntaxFailureReductionAbsoluteMinimum: 0.15,
    strictSuccessNonInferiorityMargin: 0.03,
    wrongFileEditsMaximum: 0,
    safetyViolationsMaximum: 0,
    materialGain: "formation identifiable AND strict-success absolute gain >= 0.05 AND exact paired p <= 0.05 AND safety/wrong-file gates pass",
    syntaxOnlyGain: "formation identifiable AND syntax-failure reduction >= 0.15 AND strict-success material-gain gate fails AND strict-success difference >= -0.03 AND safety/wrong-file gates pass",
    regression: "strict-success difference < -0.03 OR any safety violation OR any wrong-file edit",
    noMaterialGain: "formation identifiable AND material/syntax-only/regression gates do not apply",
    inconclusive: "CONTROL sanity fails OR treatment valid base P2 candidates < 20 OR formation invocation binding fails OR primary lineage is incomplete"
  }
});
const closurePaths = ["scripts/run_code_formation_control_recovery.ts", "services/code-formation-control-recovery/src/index.ts", "services/code-formation-constraint/src/index.ts", "services/g3-evaluation-runtime/src/index.ts", "services/g3-benchmark-runtime/src/index.ts", "services/repo-intelligence/src/index.ts", "services/task-aware-retrieval/src/index.ts", "services/model-specialization-runtime/src/index.ts", "services/patch-interface-runtime/src/index.ts", "services/tool-runtime/src/index.ts"];
const sourceClosure = { entries: await Promise.all(closurePaths.map(async (entry) => { const body = await regular(entry); return { path: entry, sha256: sha256(body), bytes: body.length }; })) };
const sealV2Ref = await publish(p.sealV2, { ...sealV1.value, schemaVersion: 2, sealId: "dca-code-formation-control-recovery-runner-v2", state: "SEALED_BEFORE_FIRST_RECOVERY_TARGET_MODEL_CALL", targetModelCallsAtSeal: 0, supersedes: { path: p.sealV1, sha256: sealV1.sha256 }, runner: sourceClosure.entries[0], sourceClosure, inputs: { ...sealV1.value.inputs, preregistration: preregV2Ref }, ledgers: { callEventsSha256: sha256(""), pairedObservationsSha256: sha256(""), sanityEventsSha256: sha256("") } });
const { stdout } = await exec("npx", ["tsx", "scripts/run_code_formation_control_recovery.ts", "--validate-only"], { cwd: root, timeout: 120_000, maxBuffer: 10_000_000 }); if (JSON.parse(stdout).status !== "PASS_ZERO_CALL") throw new Error("V2 runner preflight failed");
const sessionV2Ref = await publish(p.sessionV2, { ...sessionV1.value, schemaVersion: 2, status: "PASS_ZERO_CALL_FREEZE", completedAt: new Date().toISOString(), supersedes: { path: p.sessionV1, sha256: sessionV1.sha256, reason: "Zero-call threshold-strengthening reseal; no task exposure or inference occurred." }, design: { ...sessionV1.value.design, treatmentValidBaseP2CandidatesMinimum: 20, primaryMetric: "strict behavioral success", pairedDecisionThresholdsFrozen: true }, artifacts: { ...sessionV1.value.artifacts, preregistration: preregV2Ref, runnerSeal: sealV2Ref }, ledgers: { callEventsBytes: 0, pairedObservationsBytes: 0, sanityEventsBytes: 0 }, runtime: { ...sessionV1.value.runtime, targetModelCalls: 0, vllmProcesses: 0, port8000Listeners: 0, gpuAllocationMiB: 0 }, sessionBStarted: false, nextAuthorizedSession: "B_SEPARATE_INVOCATION", stop: "SESSION_A_BOUNDARY_REACHED" });
const indexV3Ref = await publish(p.indexV3, { schemaVersion: 3, experimentId: "CODE_FORMATION_CONTROL_RECOVERY_GENERATION", state: "SESSION_A_COMPLETE_ZERO_CALL_THRESHOLD_STRENGTHENED_AND_RESEALED", supersedes: { path: "docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_RESULTS_INDEX.v2.json", sha256: "f34806e4564bc89177acece8bccd5c3f0392fe24a9466842e7ead8f2974eca66" }, sessions: { A: sessionV2Ref, B: null, C: null }, artifacts: { preregistration: preregV2Ref, runnerSeal: sealV2Ref }, reachabilityMinimum: { candidates: 20, fraction: 0.5 }, primaryMetric: "strict behavioral success", targetModelCallsSessionA: 0, productStatus: "KEEP_MUTATION_DISABLED", next: "SESSION_B_REQUIRES_SEPARATE_INVOCATION", stop: "SESSION_A_BOUNDARY_REACHED" });
process.stdout.write(`${JSON.stringify({ status: "PASS_ZERO_CALL_RESEALED", preregistration: preregV2Ref, seal: sealV2Ref, session: sessionV2Ref, index: indexV3Ref, targetModelCalls: 0 })}\n`);
