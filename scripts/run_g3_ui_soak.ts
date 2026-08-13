import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentEvent } from "../packages/contracts/src/index";
import { EventStore } from "../packages/event-protocol/src/index";

const root = path.resolve(process.cwd());
const experimentId = `m9-g3-ui-soak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const store = new EventStore({ maxRuns: 100, maxEventsPerRun: 2_000 });
const rssStart = process.memoryUsage().rss;
let rssPeak = rssStart;
let droppedTruthEvents = 0;
let reconnectFailures = 0;
let staleStates = 0;
let duplicateNotifications = 0;
const renderSamples: number[] = [];
const repositorySwitchSamples: number[] = [];
const runs = 100;
const eventsPerRun = 2_000;
const eventTypes = ["run.created", "run.started", "contract.created", "scope.completed", "repo.index.started", "evidence.retrieved", "agent.started", "patch.planned", "patch.applied", "verification.started", "verification.stage", "review.requested", "report.started"];

for (let runIndex = 0; runIndex < runs; runIndex += 1) {
  const runId = `ui-soak-${runIndex}`;
  const taskId = `task-${runIndex}`;
  let notifications = 0;
  let unsubscribe = store.subscribe(runId, () => { notifications += 1; });
  let disconnectedAt = -1;
  for (let sequence = 0; sequence < eventsPerRun; sequence += 1) {
    if (sequence === 700) { unsubscribe(); disconnectedAt = sequence - 1; }
    if (sequence === 900) {
      const missed = store.list(runId, disconnectedAt);
      if (missed.length !== 200) reconnectFailures += 1;
      unsubscribe = store.subscribe(runId, () => { notifications += 1; });
    }
    const terminal = sequence === eventsPerRun - 1;
    const type = terminal ? (runIndex % 10 === 0 ? "run.cancelled" : "run.completed") : eventTypes[sequence % eventTypes.length];
    const event: AgentEvent = { eventId: `${runId}-${sequence}`, runId, taskId, sequence, timestamp: new Date(1_786_220_000_000 + runIndex * eventsPerRun + sequence).toISOString(), source: "ui-soak", type, severity: type === "run.cancelled" ? "warning" : "info", payload: { message: sequence % 100 === 0 ? `large-log-${"x".repeat(8_192)}` : `event-${sequence}`, repository: `repo-${runIndex % 12}`, stage: sequence % 17 }, privacy: "local_only" };
    const before = store.list(runId).length;
    store.append(event);
    const after = store.list(runId).length;
    if (after !== before + 1) droppedTruthEvents += 1;
    if (sequence % 250 === 0 || terminal) {
      const renderStarted = performance.now();
      const projection = store.replay(runId);
      renderToStaticMarkup(React.createElement("section", { "data-state": projection.state }, React.createElement("h2", null, projection.currentMessage), React.createElement("progress", { value: projection.progress, max: 100 }), React.createElement("ol", null, projection.events.slice(-100).map((item) => React.createElement("li", { key: item.eventId }, `${item.type}:${String(item.payload.message).slice(0, 120)}`)))));
      renderSamples.push(performance.now() - renderStarted);
      rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
    }
  }
  unsubscribe();
  const projection = store.replay(runId);
  const expected = runIndex % 10 === 0 ? "CANCELLED" : "DONE";
  if (projection.state !== expected || projection.totalEvents !== eventsPerRun || projection.events.length !== 2_000) staleStates += 1;
  const expectedNotifications = eventsPerRun - 200;
  if (notifications !== expectedNotifications) duplicateNotifications += Math.abs(notifications - expectedNotifications);
  const switchStarted = performance.now(); store.replay(`ui-soak-${Math.max(0, runIndex - 1)}`); repositorySwitchSamples.push(performance.now() - switchStarted);
}
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * q) - 1)] ?? 0;
const rssGrowthMiB = (process.memoryUsage().rss - rssStart) / 1024 / 1024;
const peakGrowthMiB = (rssPeak - rssStart) / 1024 / 1024;
const targets = { renderP95Under50Ms: percentile(renderSamples, 0.95) < 50, repositorySwitchP95Under100Ms: percentile(repositorySwitchSamples, 0.95) < 100, peakRssGrowthUnder256MiB: peakGrowthMiB < 256, zeroDroppedTruthEvents: droppedTruthEvents === 0, zeroReconnectFailures: reconnectFailures === 0, zeroStaleStates: staleStates === 0, zeroDuplicateNotifications: duplicateNotifications === 0 };
const result = { schemaVersion: 2, experimentId, status: Object.values(targets).every(Boolean) ? "PASS" : "FAIL", classification: "HEADLESS_EVENT_PROJECTION_AND_SERVER_RENDER_UI_SOAK", supersedesImplementationBaseline: "m9-g3-ui-soak-2026-08-09T09-45-09-535Z", boundedRuntimeControl: { maxRunsInMemory: 100, maxEventsPerRunInMemory: 2_000, monotonicTotalAndLastSequencePreservedAcrossTrim: true }, runs, eventsPerRun, totalEvents: runs * eventsPerRun, rapidCancelRestartRuns: runs / 10, repositoryIdentities: 12, largeLogEvents: runs * eventsPerRun / 100, metrics: { renderSamples: renderSamples.length, renderP50Ms: percentile(renderSamples, 0.5), renderP95Ms: percentile(renderSamples, 0.95), renderMaxMs: Math.max(...renderSamples), repositorySwitchP95Ms: percentile(repositorySwitchSamples, 0.95), rssStartMiB: rssStart / 1024 / 1024, rssPeakMiB: rssPeak / 1024 / 1024, rssGrowthMiB, peakGrowthMiB, droppedTruthEvents, reconnectFailures, staleStates, duplicateNotifications }, targets, limitation: "Headless React server rendering and event-projection soak measures truth-state/render preparation, not Windows compositor frame time or screen-reader behavior." };
const directory = path.join(root, "docs/experiments/runs", experimentId); await mkdir(directory, { recursive: false });
await writeFile(path.join(directory, "ui-soak-result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
await writeFile(path.join(directory, "result.json"), `${JSON.stringify({ schemaVersion: 1, experimentId, status: result.status, metrics: result.metrics, targets }, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ directory, status: result.status, metrics: result.metrics, targets }, null, 2)}\n`);
if (result.status === "FAIL") process.exitCode = 1;
