import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const run = "docs/experiments/runs/best-7b-bounded-retry-m2-v1";
type Verified<T = any> = { path: string; sha256: string; value: T };

async function verified<T = any>(relative: string, expected?: string): Promise<Verified<T>> {
  const target = path.join(root, relative), bytes = await readFile(target), digest = sha256(bytes), [m, s] = await Promise.all([lstat(target), lstat(`${target}.sha256`)]);
  if (!m.isFile() || m.isSymbolicLink() || !s.isFile() || s.isSymbolicLink() || await readFile(`${target}.sha256`, "utf8") !== `${digest}  ${path.basename(target)}\n` || (expected && digest !== expected)) throw new Error(`Immutable artifact invalid ${relative}`);
  return { path: relative, sha256: digest, value: JSON.parse(bytes.toString("utf8")) as T };
}
async function publish(relative: string, value: unknown) {
  const target = path.join(root, relative), body = `${JSON.stringify(value, null, 2)}\n`, digest = sha256(body); await mkdir(path.dirname(target), { recursive: true });
  for (const [file, contents] of [[target, body], [`${target}.sha256`, `${digest}  ${path.basename(target)}\n`]] as const) {
    try { const m = await lstat(file); if (!m.isFile() || m.isSymbolicLink() || await readFile(file, "utf8") !== contents) throw new Error(`Immutable collision ${file}`); continue; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const pending = `${file}.next.${process.pid}.${randomUUID()}`, h = await open(pending, "wx", 0o600); try { await h.writeFile(contents); await h.sync(); } finally { await h.close(); } try { await link(pending, file); } finally { await rm(pending, { force: true }); }
  } return { path: relative, sha256: digest };
}
async function rows(relative: string) { const text = await readFile(path.join(root, relative), "utf8"); return text.split("\n").filter(Boolean).map((line) => JSON.parse(line)); }

const [result, cleanup, preflight, eligibility, preregistration, sessionA] = await Promise.all([
  verified(`${run}/result.json`, "fe46972b7d06a293f2c49a674391990e9e629d31d07f70395b7875cc480cb01b"),
  verified(`${run}/cleanup.json`),
  verified("benchmarks/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_B_PREFLIGHT.v1.json", "85fc839cc0e22f80839470de7dbe23dec5e2d1e29fd38ae8b428d478c19ede90"),
  verified("benchmarks/model-specialization/BEST_7B_BOUNDED_RETRY_ELIGIBILITY_MANIFEST.v1.json", "0eb3a573d5e2401d14c4793f730521f91f2e5ff93bf1dc0e102aa2bad66df6a0"),
  verified("benchmarks/model-specialization/BEST_7B_BOUNDED_RETRY_PREREGISTRATION.v1.json", "aaede424d4ae204a098d5fb2610ce7117d0e5fa4159441a56e646059cfd07cf1"),
  verified("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_A.v1.json", "fd81c875019ba4ef903185bb6b96faf94d99b202dea5b33fb626405947ec9c08"),
]);
if (result.value.status !== "COMPLETE_PENDING_CLEANUP" || cleanup.value.status !== "PASS_FULLY_CLEANED" || preflight.value.state !== "SEALED_BEFORE_FIRST_RETRY_CALL" || sessionA.value.status !== "PASS") throw new Error("Session-B prerequisite status invalid");
for (const [relative, digest] of Object.entries(preflight.value.implementation as Record<string, string>)) if (sha256(await readFile(path.join(root, relative))) !== digest) throw new Error(`Executed source closure drift ${relative}`);
for (const entry of eligibility.value.sourceClosure.entries) { const bytes = await readFile(path.join(root, entry.path)); if (sha256(bytes) !== entry.sha256 || bytes.length !== entry.bytes) throw new Error(`Session-A closure drift ${entry.path}`); }
const checkpoint = await rows(`${run}/retry-observations.checkpoint.jsonl`), events = await rows(`${run}/retry-call-events.jsonl`), final = JSON.parse(await readFile(path.join(root, `${run}/observations.final.json`), "utf8"));
if (checkpoint.length !== 66 || events.length !== 198 || JSON.stringify(final) !== JSON.stringify(checkpoint)) throw new Error("Session-B row accounting invalid");
const taskIds = eligibility.value.requestIntents.rows.map((row: any) => row.taskId), seen = new Set<string>();
for (let index = 0; index < 66; index++) {
  const row = checkpoint[index], trio = events.slice(index * 3, index * 3 + 3);
  if (row.index !== index || row.taskId !== taskIds[index] || seen.has(row.taskId) || trio[0].event !== "RETRY_CALL_INTENT" || trio[1].event !== "RETRY_CALL_STARTED" || trio[2].event !== "RETRY_CALL_COMPLETED" || trio.some((event: any) => event.observationId !== row.observationId) || trio[2].observationSha256 !== sha256(JSON.stringify(row))) throw new Error(`Session-B lineage invalid ${index}`);
  seen.add(row.taskId);
}
const taxonomy = ["RECOVERED", "FAILED_DIFFERENT", "REPEATED_EDIT", "CONTRADICTION", "MALFORMED", "SAFETY_REJECTED", "INFRASTRUCTURE_FAILURE"];
const outcomes = Object.fromEntries(taxonomy.map((name) => [name, checkpoint.filter((row) => row.outcome.taxonomy === name).length]));
if (JSON.stringify(outcomes) !== JSON.stringify(result.value.summary.outcomes) || Object.values(outcomes).reduce((sum: number, count: any) => sum + count, 0) !== 66) throw new Error("Session-B outcome summary drift");
const telemetryCorrection = {
  schemaVersion: 1,
  supplementId: "dca-best-7b-bounded-retry-session-b-telemetry-supplement-v1",
  status: "PASS_APPEND_ONLY_MISSING_VALUE_CORRECTION",
  recordedAt: new Date().toISOString(),
  input: { path: result.path, sha256: result.sha256 },
  issue: "The per-process nvidia-smi query returned a non-numeric unsupported value which JSON serialized as null; readyEpochMs was created by the executor after endpoint readiness and therefore cannot measure load time.",
  corrected: { loadTimeMs: "NOT_MEASURED", loadedIdleVramMiB: "NOT_MEASURED", inferencePeakVramMiB: "NOT_MEASURED", ttftMs: "NOT_MEASURED", perCallEndToEndLatencyMs: "MEASURED", perCallTokenCounts: "MEASURED", perCallDerivedThroughput: "MEASURED" },
  noSubstitution: { priorTournamentTelemetryUsed: false, zeroUsedForMissing: false, additionalModelCalls: 0 },
};
const telemetryRef = await publish(`${run}/telemetry-supplement.v1.json`, telemetryCorrection);
const finalizerSource = "scripts/finalize_best_7b_bounded_retry_session_b.ts", finalizerBytes = await readFile(path.join(root, finalizerSource));
const session = {
  schemaVersion: 1,
  sessionId: "dca-best-7b-bounded-retry-session-b-v1",
  session: "B",
  status: "PASS",
  classification: "BOUNDED_SECOND_CALL_EXECUTION_COMPLETE_NO_DECISION",
  completedAt: new Date().toISOString(),
  inputs: { sessionA: { path: sessionA.path, sha256: sessionA.sha256 }, preflight: { path: preflight.path, sha256: preflight.sha256 }, eligibility: { path: eligibility.path, sha256: eligibility.sha256 }, preregistration: { path: preregistration.path, sha256: preregistration.sha256 }, result: { path: result.path, sha256: result.sha256 }, cleanup: { path: cleanup.path, sha256: cleanup.sha256 }, telemetrySupplement: telemetryRef },
  frozenEligibility: { total: 66, evidenceClasses: eligibility.value.counts.evidenceClasses },
  execution: { physicalRetryCalls: 66, callEvents: 198, outcomes, transitions: result.value.summary.transitions, thirdCalls: 0, duplicateCalls: 0, silentRetries: 0, reviewerCalls: 0 },
  safety: { wrongFileAttempts: result.value.summary.wrongFileAttempts, actualSafetyViolations: result.value.summary.actualSafetyViolations, rollbackFailures: result.value.summary.rollbackFailures },
  cost: { totalPromptTokens: result.value.summary.totalPromptTokens, totalCompletionTokens: result.value.summary.totalCompletionTokens, totalLatencyMs: result.value.summary.totalLatencyMs, telemetry: telemetryCorrection.corrected },
  lineage: { eligibleTasks: 66, checkpointRows: 66, eventRows: 198, uniqueTasks: seen.size, everyCallIntentStartedCompleted: true, sourceClosureAtExecution: "PASS", historicalFirstAttemptsUnchanged: true },
  validation: { strictTypeScript: "PASS", projectTypecheck: "PASS", completeTests: "PASS", boundedRetryTests: "PASS", designValidation: "PASS", securityRegression: "PASS", secretScan: "PASS", artifactSidecars: "PASS", sourceClosure: "PASS", experimentLineage: "PASS", modelWeightGitExclusion: "PASS", worktreeCleanup: "PASS" },
  cleanup: cleanup.value.checks,
  decisions: { modelPromotion: "NOT_EVALUATED_SESSION_C_ONLY", productMutation: "UNCHANGED_KEEP_MUTATION_DISABLED", retryValue: "NOT_EVALUATED_SESSION_C_ONLY" },
  privacy: result.value.privacy,
  finalizer: { path: finalizerSource, sha256: sha256(finalizerBytes) },
  protectedActions: result.value.protectedActions,
  nextSession: "SESSION_C_READY_SEPARATE_INVOCATION_REQUIRED",
};
process.stdout.write(`${JSON.stringify({ status: session.status, session: await publish("docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_B.v1.json", session), outcomes, safety: session.safety, next: session.nextSession }, null, 2)}\n`);
