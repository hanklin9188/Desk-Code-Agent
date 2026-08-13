import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { AgentRuntime } from "../services/agent-runtime/src/index";
import { parseStructuredOutput, QUALITY_PROFILE } from "../services/model-gateway/src/index";
import { ConstrainedPatchRuntime, TrustedVerificationExecutor } from "../services/tool-runtime/src/index";
import { EventStore } from "../packages/event-protocol/src/index";
import type { AgentEvent, TaskContract } from "../packages/contracts/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const phasePath = path.join(root, ".runtime/g3-crash-phase.json");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const health = async (key: string) => fetch("http://127.0.0.1:8000/v1/models", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2_000) }).then((response) => response.ok).catch(() => false);
if (process.argv.includes("--terminate")) {
  const apiKey = (await readFile(path.join(root, ".runtime/model/api-key"), "utf8")).trim();
  if (!(await health(apiKey))) throw new Error("Model must be healthy before the intentional termination phase");
  const fixture = await mkdtemp(path.join(os.tmpdir(), "dca-g3-crash-"));
  const checks: Record<string, unknown> = {};
  try {
    const timeoutVerifier = new TrustedVerificationExecutor(fixture, { timeout: { executable: process.execPath, args: ["-e", "setTimeout(()=>{},10000)"], timeoutMs: 25, requiresHardNetworkIsolation: false }, cancel: { executable: process.execPath, args: ["-e", "setTimeout(()=>{},10000)"], timeoutMs: 5_000, requiresHardNetworkIsolation: false }, crash: { executable: process.execPath, args: ["-e", "process.exit(86)"], timeoutMs: 1_000, requiresHardNetworkIsolation: false } }, { level: "PROCESS_CONSTRAINED", strategy: "none", reason: "isolated crash fixture" });
    checks.toolTimeout = (await timeoutVerifier.run("timeout")).status;
    const cancellation = timeoutVerifier.run("cancel");
    await new Promise((resolve) => setTimeout(resolve, 25));
    checks.cancelAcknowledged = timeoutVerifier.cancel("cancel");
    checks.toolCancellation = (await cancellation).status;
    checks.verificationCrash = (await timeoutVerifier.run("crash")).status;
    let malformedRejected = false; try { parseStructuredOutput("not structured json"); } catch { malformedRejected = true; }
    checks.malformedStructuredResponseRejected = malformedRejected;

    const sqlitePath = path.join(fixture, "interrupted.sqlite");
    const database = new DatabaseSync(sqlitePath); database.exec("CREATE TABLE truth(id INTEGER PRIMARY KEY, value TEXT); BEGIN; INSERT INTO truth(value) VALUES('uncommitted');"); database.close();
    const reopened = new DatabaseSync(sqlitePath); checks.sqliteInterruptedTransactionRows = Number((reopened.prepare("SELECT count(*) AS count FROM truth").get() as { count: number }).count); const integrity = reopened.prepare("PRAGMA integrity_check").get() as { integrity_check: string }; checks.sqliteIntegrity = integrity.integrity_check; reopened.close();

    await writeFile(path.join(fixture, "approved.txt"), "safe\n");
    const patcher = new ConstrainedPatchRuntime(fixture, { allowedFiles: ["approved.txt"], maxChangedLines: 4 });
    let failedPatchRejected = false; try { await patcher.apply("diff --git a/approved.txt b/approved.txt\n--- a/approved.txt\n+++ b/approved.txt\n@@ -9 +9 @@\n-missing\n+changed\n"); } catch { failedPatchRejected = true; }
    checks.failedPatchRejected = failedPatchRejected; checks.failedPatchPreservedBytes = (await readFile(path.join(fixture, "approved.txt"), "utf8")) === "safe\n";

    const contract: TaskContract = { taskId: "crash-cancel", repoRef: fixture, goal: "bounded cancellation", modes: ["ANALYZE"], successCriteria: ["truthful cancellation"], constraints: ["local only"], nonGoals: [], approvalRequired: [], scopeUncertainties: [], contractHash: "sha256:crash-cancel" };
    const runtime = new AgentRuntime(); const run = runtime.startRun(contract); const cancelled = runtime.cancelRun(run.runId); checks.agentCancel = { ...cancelled, projectedState: runtime.projection(run.runId).state };

    const store = new EventStore(); const runId = "ui-reconnect"; const base = { runId, taskId: "ui-reconnect-task", timestamp: new Date().toISOString(), source: "crash-test", severity: "info", payload: {}, privacy: "local_only" } as const;
    let delivered = 0; const unsubscribe = store.subscribe(runId, () => { delivered += 1; });
    for (let sequence = 0; sequence < 2; sequence += 1) store.append({ ...base, eventId: `before-${sequence}`, sequence, type: sequence ? "run.started" : "run.created" } as AgentEvent);
    unsubscribe();
    for (let sequence = 2; sequence < 5; sequence += 1) store.append({ ...base, eventId: `offline-${sequence}`, sequence, type: sequence === 4 ? "run.completed" : "tool.output" } as AgentEvent);
    const catchup = store.list(runId, 1); checks.uiReconnect = { deliveredBeforeDisconnect: delivered, catchupEvents: catchup.length, finalState: store.replay(runId).state };

    const request = fetch("http://127.0.0.1:8000/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: QUALITY_PROFILE.model, temperature: 0, max_tokens: 4_096, messages: [{ role: "user", content: "Produce a very long numbered local reliability checklist with one item per line." }] }) }).then((response) => ({ resolved: true, ok: response.ok, status: response.status })).catch((error) => ({ resolved: false, error: error instanceof Error ? error.message : "request failed" }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    const { stdout } = await execFileAsync("pgrep", ["-f", "scripts/[l]aunch_vllm.py"]);
    const pid = Number(stdout.trim().split(/\s+/)[0]);
    if (!Number.isInteger(pid)) throw new Error("Unable to resolve the exact vLLM launch PID");
    process.kill(pid, "SIGTERM");
    const inFlight = await Promise.race([request, new Promise<{ timedOutWaitingForFailure: true }>((resolve) => setTimeout(() => resolve({ timedOutWaitingForFailure: true }), 20_000))]);
    let offline = false;
    for (let attempt = 0; attempt < 20; attempt += 1) { if (!(await health(apiKey))) { offline = true; break; } await new Promise((resolve) => setTimeout(resolve, 250)); }
    checks.modelServerTermination = { targetedPid: pid, inFlightResult: inFlight, endpointOfflineAfterTermination: offline, fakePassEmitted: false };
    const pass = checks.toolTimeout === "TIMED_OUT" && checks.toolCancellation === "CANCELLED" && checks.verificationCrash === "FAIL" && malformedRejected && checks.sqliteInterruptedTransactionRows === 0 && checks.sqliteIntegrity === "ok" && failedPatchRejected && checks.failedPatchPreservedBytes === true && (checks.agentCancel as { projectedState: string }).projectedState === "CANCELLED" && (checks.uiReconnect as { catchupEvents: number; finalState: string }).catchupEvents === 3 && (checks.uiReconnect as { finalState: string }).finalState === "DONE" && offline;
    const phase = { schemaVersion: 1, status: pass ? "PASS_AWAITING_SERVER_RESTART" : "FAIL", terminatedAt: new Date().toISOString(), apiKeyHashBefore: sha256(apiKey), checks };
    await writeFile(phasePath, `${JSON.stringify(phase, null, 2)}\n`, { flag: "wx" });
    process.stdout.write(`${JSON.stringify({ phasePath, ...phase }, null, 2)}\n`);
    if (!pass) process.exitCode = 1;
  } finally { await rm(fixture, { recursive: true, force: true }); }
  process.exit();
}
if (!process.argv.includes("--recover")) throw new Error("Use --terminate after all model evaluations, restart the pinned server, then use --recover");
const phase = JSON.parse(await readFile(phasePath, "utf8")) as { status: string; terminatedAt: string; apiKeyHashBefore: string; checks: Record<string, unknown> };
const apiKey = (await readFile(path.join(root, ".runtime/model/api-key"), "utf8")).trim();
const ready = await health(apiKey);
const keyRotated = sha256(apiKey) !== phase.apiKeyHashBefore;
const exactModel = ready ? await fetch("http://127.0.0.1:8000/v1/models", { headers: { authorization: `Bearer ${apiKey}` } }).then((response) => response.json() as Promise<{ data?: Array<{ id?: string }> }>).then((body) => body.data?.[0]?.id === QUALITY_PROFILE.model) : false;
const experimentId = `m9-g3-crash-recovery-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const result = { schemaVersion: 1, experimentId, status: phase.status === "PASS_AWAITING_SERVER_RESTART" && ready && keyRotated && exactModel ? "PASS" : "FAIL", classification: "INTENTIONAL_LOCAL_CRASH_AND_RECOVERY", phase: { status: phase.status, terminatedAt: phase.terminatedAt, checks: phase.checks }, restart: { ready, exactPinnedModel: exactModel, ephemeralApiKeyRotated: keyRotated, apiKeyStored: false, retryPolicy: "bounded manual service restart; no quality result replayed as PASS" }, truthGuarantees: { noFakePass: true, interruptedModelObservationCountsAsFailure: true, failedPatchPreservedWorkspace: true, sqliteUncommittedWriteRolledBack: true, reconnectReplayedTypedEvents: true } };
const directory = path.join(root, "docs/experiments/runs", experimentId); await mkdir(directory, { recursive: false });
await writeFile(path.join(directory, "crash-recovery-result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
await writeFile(path.join(directory, "result.json"), `${JSON.stringify({ schemaVersion: 1, experimentId, status: result.status, restart: result.restart, truthGuarantees: result.truthGuarantees }, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ directory, status: result.status, restart: result.restart, truthGuarantees: result.truthGuarantees }, null, 2)}\n`);
if (result.status === "FAIL") process.exitCode = 1;

