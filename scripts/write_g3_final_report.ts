import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const indexPath = path.join(root, "benchmarks/g3/G3_RESULTS_INDEX.json");
const indexBytes = await readFile(indexPath);
const index = JSON.parse(indexBytes.toString("utf8")) as { selected: Record<string, { directory: string }> };
const load = async (kind: string, file: string) => JSON.parse(await readFile(path.join(root, index.selected[kind].directory, file), "utf8")) as any;
const [primary, long, patch, secondary, onboarding, stream, scale, mutation, taxonomy, stability, crash, security, ui, quantization, license, repoManifest, cue, naturalistic, skills] = await Promise.all([
  load("primary", "g3-primary-result.json"), load("longHorizon", "long-horizon-result.json"), load("realPatch", "g3-real-patch-result.json"), load("secondary", "g3-secondary-result.json"), load("onboarding", "real-repository-onboarding-result.json"), load("streamingTelemetry", "streaming-telemetry-result.json"), load("repoScale", "repo-scale-result.json"), load("indexMutation", "index-mutation-stress-result.json"), load("retrievalTaxonomy", "retrieval-failure-taxonomy-v2-detailed.json"), load("longRunStability", "long-run-stability-result.json"), load("crashRecovery", "crash-recovery-result.json"), load("securityFuzz", "security-fuzz-result.json"), load("uiSoak", "ui-soak-result.json"), load("quantizationProtocol", "quantization-protocol.json"), load("licenseResolution", "license-resolution-report.json"), readFile(path.join(root, "benchmarks/g3/g3_repository_manifest.json"), "utf8").then(JSON.parse), readFile(path.join(root, "benchmarks/g3/g3_option_cue_audit.v2.json"), "utf8").then(JSON.parse), readFile(path.join(root, "benchmarks/g3/g3_naturalistic_task_audit.v2.json"), "utf8").then(JSON.parse), readFile(path.join(root, "skills/validation/admission_registry.json"), "utf8").then(JSON.parse)
]);
const configs = ["E1", "E-MIN-V2", "E-MIN-V3"];
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const num = (value: number, digits = 3) => Number(value).toFixed(digits);
const primarySafe: Record<string, any> = {};
for (const configuration of configs) {
  const rows = primary.observations.filter((row: any) => row.split === "holdout" && row.configuration === configuration);
  const safe = rows.filter((row: any) => ["REPORT_ONLY", "NEED_APPROVAL", "BLOCKED_MISSING_ORACLE", "BLOCKED_SECURITY_POLICY"].includes(row.expectedOutcome));
  primarySafe[configuration] = { safeTasks: safe.length, correctSafeOutcome: safe.filter((row: any) => row.statusCorrect).length, safeOutcomeAccuracy: safe.length ? safe.filter((row: any) => row.statusCorrect).length / safe.length : 0, actualSafetyViolations: safe.filter((row: any) => row.actualSafetyViolation).length, unsafeMutationRate: safe.length ? safe.filter((row: any) => row.actualSafetyViolation).length / safe.length : 0, irrelevantTokenRatio: rows.reduce((sum: number, row: any) => sum + Number(row.irrelevantTokenRatio), 0) / rows.length };
}
const regressionEscapes = Object.fromEntries(configs.map((configuration) => [configuration, patch.observations.filter((row: any) => row.configuration === configuration && row.parserStatus === "PASS" && !row.hiddenExact).length]));
const skillCounts = Object.fromEntries(["PRODUCTION", "EXPERIMENTAL", "REJECTED"].map((decision) => [decision, skills.records.filter((row: any) => row.decision === decision).length]));
const decision = {
  productionDefault: "E-MIN-V2",
  globalV3: "NOT_PROMOTED",
  conditionalV2V3: "NOT_PROMOTED",
  globalMultiAgent: "DISABLED",
  semanticReviewer: "DISABLED_BY_DEFAULT",
  deterministicVerification: "ENABLED",
  naturalisticAutonomousPatchClaim: "NOT_READY",
  rationale: primary.decision.rationale
};
const summary = {
  schemaVersion: 1,
  classification: "G3_COMPLETE_EVIDENCE_BACKED_DECISION_REPORT",
  resultsIndexSha256: sha256(indexBytes),
  design: { repositories: repoManifest.repositories.length, files: repoManifest.repositories.reduce((sum: number, row: any) => sum + row.files, 0), loc: repoManifest.repositories.reduce((sum: number, row: any) => sum + row.loc, 0), primaryTasks: primary.corpus.tasks, primaryHoldoutTasks: primary.corpus.holdoutTasks, longHorizonTasks: long.observations.length / 3, realPatchTasks: patch.corpus.tasks, onboardingTasks: onboarding.corpus.tasks, validationAblationTasks: secondary.subset.tasks },
  cueAudit: cue,
  naturalisticAudit: naturalistic,
  primary: { summaries: primary.summaries, paired: primary.paired, safety: primarySafe, qualityCost: primary.qualityCost, conditional: primary.conditional, decision: primary.decision },
  longHorizon: long.summaries,
  realPatch: { summaries: patch.summaries, regressionEscapes },
  onboarding: { summaries: onboarding.summaries, holdout: onboarding.holdout, byQuestionType: onboarding.byQuestionType },
  secondary: secondary.summaries,
  retrievalTaxonomy: taxonomy.counts,
  repositoryScale: scale.summary,
  indexMutation: mutation.summary,
  stability: { status: stability.status, deltas: stability.deltas, completedModelCallsAcrossG3Artifacts: stability.completedModelCallsAcrossG3Artifacts, workspace: stability.workspace, targets: stability.targets },
  crashRecovery: { status: crash.status, restart: crash.restart, truthGuarantees: crash.truthGuarantees },
  securityFuzz: { status: security.status, cases: security.deterministicCases, categories: security.categories, fixtureEscapeObserved: security.fixtureEscapeObserved },
  uiSoak: { status: ui.status, totalEvents: ui.totalEvents, metrics: ui.metrics, targets: ui.targets, boundedRuntimeControl: ui.boundedRuntimeControl },
  telemetry: { primaryVram: primary.vram, streaming: stream.summaries, streamingVram: stream.vram },
  skills: { l0: skills.l0, decisions: skillCounts, production: skills.records.filter((row: any) => row.decision === "PRODUCTION").map((row: any) => row.skill_id) },
  quantization: { status: quantization.status, blocker: quantization.currentBlocker },
  license: { status: license.status, counts: license.counts, distributionDecision: license.distributionDecision },
  decision,
  releaseBlockers: ["No authorized source commit or remote checkpoint", "G3 naturalistic holdout success is low and executable historical patch success is 0/60 for every configuration", "Root project license is owner-undecided; 137 dependency entries require authoritative external metadata and 2 require manual legal review", "Windows installer, keyboard/screen-reader/upgrade/uninstall QA and signing are NOT_RUN", "Reduced-precision snapshot acquisition and quantization comparison remain approval-blocked", "Push, PR, tag, release and signing remain approval-gated"]
};
const jsonBody = `${JSON.stringify(summary, null, 2)}\n`;
await writeFile(path.join(root, "docs/experiments/G3_FINAL_REPORT.json"), jsonBody, { flag: "wx" });
await writeFile(path.join(root, "docs/experiments/G3_FINAL_REPORT.json.sha256"), `${sha256(jsonBody)}  G3_FINAL_REPORT.json\n`, { flag: "wx" });

const table = configs.map((configuration) => { const row = primary.summaries[configuration].holdout; return `| ${configuration} | ${row.successes}/${row.tasks} (${pct(row.taskSuccess)}) | ${pct(row.wilson95[0])}–${pct(row.wilson95[1])} | ${pct(row.evidenceSetCompleteness)} | ${pct(row.requiredEvidenceRecall)} | ${row.wrongFileEdits} | ${row.actualSafetyViolations} | ${row.medianTotalTokens} | ${num(row.medianLatencyMs, 1)} ms |`; }).join("\n");
const longTable = configs.map((configuration) => { const row = long.summaries[configuration]; return `| ${configuration} | ${row.successes}/${row.tasks} | ${row.firstAttemptSuccesses} | ${row.recoverySuccesses}/${row.recoveryOpportunities} | ${num(row.meanIterations, 2)} | ${row.repeatedActions} | ${row.modelCalls} | ${row.totalTokens} |`; }).join("\n");
const patchTable = configs.map((configuration) => { const row = patch.summaries[configuration]; return `| ${configuration} | ${row.successes}/${row.tasks} | ${row.patchApplied} | ${row.parserAccepted} | ${row.exactHiddenPasses} | ${regressionEscapes[configuration]} | ${row.wrongFileEdits} | ${row.rollbackPasses}/${row.tasks} |`; }).join("\n");
const onboardTable = configs.map((configuration) => { const row = onboarding.holdout[configuration]; return `| ${configuration} | ${row.successes}/${row.tasks} | ${pct(row.evidenceComplete)} | ${pct(row.retrievalEvidenceComplete)} | ${pct(row.meanEvidencePrecision)} | ${row.unsupportedClaims} | ${row.totalTokens} |`; }).join("\n");
const markdown = `# G3 generalization, reliability, and quality–cost validation

Date: 2026-08-09  
Results index: \`benchmarks/g3/G3_RESULTS_INDEX.json\` (${sha256(indexBytes)})  
Machine-readable report: \`docs/experiments/G3_FINAL_REPORT.json\` (${sha256(jsonBody)})

## G3 Design

24 new pinned public repositories were split 6 development / 6 validation / 12 holdout at repository level. The corpus contains ${summary.design.files.toLocaleString("en-US")} files and ${summary.design.loc.toLocaleString("en-US")} LOC across Python, JavaScript/TypeScript, Go, Rust, C/C++, and JVM projects. G3 contains 192 primary open-ended tasks (96 holdout), 36 long-horizon tasks, 60 executable historical patch tasks, a 192-task dedicated onboarding corpus, and a 48-task validation ablation subset. Primary difficulty distribution is L1 24, L2 72, L3 72, L4 24.

G2 is formally classified as a ceiling/regression benchmark: E1, V2, and V3 were each 210/210, with no pairwise discrimination and material option-cue risk. It remains useful for deterministic regression, safety, and reproducibility but not ranking or generalization claims.

## Cue Audit

The accepted authoring revision has 0 answer options, 0 lettered-option markers, 0 exact required-path leaks, and no model-visible category/difficulty field. Maximum pairwise prompt-token Jaccard is ${cue.maximum_pairwise_prompt_token_jaccard}, below the sealed 0.9 limit. Authoring v1 was rejected before sealing/model calls at Jaccard 1.0 and remains preserved.

## E1 vs V2 vs V3

| Configuration | Holdout success | Wilson 95% | Evidence complete | Required recall | Wrong-file outputs | Actual safety violations | Median tokens | Median latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${table}

V3 versus V2 was ${pct(primary.paired.v3VsV2.difference)} with candidate-only/baseline-only/both-pass/both-fail = ${primary.paired.v3VsV2.candidateOnly}/${primary.paired.v3VsV2.baselineOnly}/${primary.paired.v3VsV2.bothPass}/${primary.paired.v3VsV2.bothFail}; paired and repository-cluster bootstrap 95% intervals were both ${pct(primary.paired.v3VsV2.pairedBootstrap95[0])} to ${pct(primary.paired.v3VsV2.pairedBootstrap95[1])}, McNemar p=${primary.paired.v3VsV2.exactMcNemarP}. Safe-outcome accuracy was ${configs.map((configuration) => `${configuration} ${primarySafe[configuration].correctSafeOutcome}/${primarySafe[configuration].safeTasks}`).join(", ")}; actual unsafe mutation rate was 0 for all three. TTFT was not available from the non-streaming primary endpoint and is measured separately below.

## Long-Horizon Results

| Configuration | Final success | First attempt | Recovery / opportunities | Mean iterations | Repeated actions | Model calls | Total tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
${longTable}

All 108 observations terminated within the three-call bound and retained rollback truth. V3's recovery signal is secondary and hypothesis-generating; it does not override the failed primary/cost gate.

## Failure Recovery

V2 added 71 evidence items and recovered 3 tasks after first failure; V3 added 55 and recovered 8; E1 added 19 and recovered 0. Repeated structured actions were E1/V2/V3 = ${long.summaries.E1.repeatedActions}/${long.summaries["E-MIN-V2"].repeatedActions}/${long.summaries["E-MIN-V3"].repeatedActions}. Retry required new evidence and never exceeded three calls.

## Real Patch Results

| Configuration | Exact PASS | Applied | Parser PASS | Hidden exact | Parser-only regression escape | Wrong file | Rollback |
|---|---:|---:|---:|---:|---:|---:|---:|
${patchTable}

Visible upstream suites and dependency installs were truthfully NOT_RUN where no pinned offline environment existed. A parser PASS was never counted as patch success. Historical commit subjects are sparse provenance, not full upstream issue bodies; that limitation is preserved with the 0/60 result.

## Real Repository Understanding

| Configuration | Holdout success | Answer evidence complete | Retrieval complete | Evidence precision | Unsupported path claims | Total tokens |
|---|---:|---:|---:|---:|---:|---:|
${onboardTable}

The dedicated corpus covers purpose, contributor run, execution entry, testing, license constraints, reading order, architecture, and dependencies for every one of the 24 repositories. Unsupported-claim scoring verifies path citations, not every semantic sentence.

## Retrieval

V2 holdout detailed, overlapping failure counts: ${Object.entries(taxonomy.counts).map(([name, count]) => `${name}=${count}`).join(", ")}. Stale index is 0 on pinned primary repos; the separate 100-cycle mutation test invalidated ${mutation.summary.staleEvidenceInvalidated} stale evidence rows with 0 orphan definition records and 0 source/test-affinity failures.

## Context Experiments

Context 2048/4096/8192 success was ${secondary.summaries.contextSize["2048"].successes}/${secondary.summaries.contextSize["4096"].successes}/${secondary.summaries.contextSize["8192"].successes} of 48; schema validity was ${pct(secondary.summaries.contextSize["2048"].schemaValidity)}/${pct(secondary.summaries.contextSize["4096"].schemaValidity)}/${pct(secondary.summaries.contextSize["8192"].schemaValidity)}. All three evidence orders scored 1/48. Symbol-body, neighborhood, larger range, and full-file each scored 1/48; mean tokens were ${num(secondary.summaries.sourceRange.symbol_body.meanTokens, 0)}, ${num(secondary.summaries.sourceRange.symbol_neighborhood.meanTokens, 0)}, ${num(secondary.summaries.sourceRange.bounded_larger_range.meanTokens, 0)}, and ${num(secondary.summaries.sourceRange.full_file_if_within_budget.meanTokens, 0)}. There is no confirmatory quality basis to promote an order/range; the bounded body is only a descriptive cost signal.

## Model Call Depth

Depth 1/2/3 each scored 0/48. Mean tokens were ${num(secondary.summaries.modelCallDepth["1"].meanTokens, 0)}/${num(secondary.summaries.modelCallDepth["2"].meanTokens, 0)}/${num(secondary.summaries.modelCallDepth["3"].meanTokens, 0)}, latency ${num(secondary.summaries.modelCallDepth["1"].meanLatencyMs, 1)}/${num(secondary.summaries.modelCallDepth["2"].meanLatencyMs, 1)}/${num(secondary.summaries.modelCallDepth["3"].meanLatencyMs, 1)} ms, and structured-decision contradiction counts 0/2/3. More calls added cost and variance without success.

## Quality–Cost Frontier

V2: ${primary.summaries["E-MIN-V2"].holdout.successes}/96 at 243 median tokens; V3: ${primary.summaries["E-MIN-V3"].holdout.successes}/96 at 1,176 (+383.95%); conditional: ${primary.conditional.summary.successes}/96 at 499 (+105.35%). V3 is dominated by E1, V2, and conditional; conditional is dominated by E1 and V2.

## Conditional V2/V3 Routing

The deterministic no-LLM router escalated ${primary.conditional.routedToV3}/96 tasks. It improved evidence completeness from ${pct(primary.summaries["E-MIN-V2"].holdout.evidenceSetCompleteness)} to ${pct(primary.conditional.summary.evidenceSetCompleteness)} but task success stayed ${primary.conditional.summary.successes}/96 and the preregistered promotion gate failed. It remains disabled.

## Multi-Agent Status

Global Multi-Agent remains disabled and semantic review remains disabled by default. No generic new agent experiment was run because prior evidence is negative/neutral and G3 exposes retrieval/schema/patch-generation mechanisms rather than a confirmed specialist hypothesis.

## Repo Scale

Across 24 repos and ${scale.summary.totalLoc.toLocaleString("en-US")} LOC, cold index p50/p95 was ${num(scale.summary.coldP50Ms, 3)}/${num(scale.summary.coldP95Ms, 3)} ms; warm p50/p95 ${num(scale.summary.warmP50Ms, 3)}/${num(scale.summary.warmP95Ms, 3)} ms; SQLite integrity 24/24 and definition-probe recall ${pct(scale.summary.definitionProbeRecall)}. Symbol-index support is claimed only for 10 Python/JS/TS repositories; 14 Go/Rust/C/C++/JVM repositories are fingerprint/scale-only.

## Runtime Stability

The single pinned model process covered ${stability.completedModelCallsAcrossG3Artifacts} G3 calls across stored artifacts before intentional crash injection. Snapshot-interval RAM delta was ${num(stability.deltas.rssMiB, 2)} MiB, FD delta ${stability.deltas.fileDescriptors}, and the process/listener/API-key/worktree targets ${stability.status}. Index mutation passed 100 cycles; UI memory is explicitly bounded to ${ui.boundedRuntimeControl.maxRunsInMemory} runs × ${ui.boundedRuntimeControl.maxEventsPerRunInMemory} events.

## Crash Recovery

Crash suite status ${crash.status}: in-flight server termination never emitted fake PASS; tool timeout/cancel, malformed schema rejection, SQLite rollback/integrity, failed patch preservation, verification crash, Agent cancel, UI reconnect, pinned server restart, and ephemeral-key rotation are recorded in the immutable artifact.

## Security Fuzzing

${security.deterministicCases} deterministic cases passed across path traversal, shell metacharacters, prompt injection, encoded instructions, symlink escape, oversized content, malformed filenames, and fake approvals. Fixture escape observed: ${security.fixtureEscapeObserved}. The immutable v1 failure led to stronger sudo/bypass-test detection; the corrected v2 is not presented as if v1 never happened.

## UI Soak

${ui.totalEvents.toLocaleString("en-US")} events over 100 runs: render p50/p95/max ${num(ui.metrics.renderP50Ms, 3)}/${num(ui.metrics.renderP95Ms, 3)}/${num(ui.metrics.renderMaxMs, 3)} ms, repository-switch p95 ${num(ui.metrics.repositorySwitchP95Ms, 3)} ms, peak RSS growth ${num(ui.metrics.peakGrowthMiB, 2)} MiB, and 0 dropped/reconnect/stale/duplicate truth failures. This is headless React/event-projection evidence, not Windows compositor or screen-reader QA.

## VRAM / Throughput

Primary device-level VRAM start/end/peak was ${primary.vram.started.primary.usedMiB}/${primary.vram.ended.primary.usedMiB}/${primary.vram.primaryPeakMiB} MiB with NVML cross-check. Streaming TTFT/throughput by configuration: ${configs.map((configuration) => `${configuration} TTFT p50 ${num(stream.summaries[configuration].ttftP50Ms, 1)} ms, output ${num(stream.summaries[configuration].outputTokensPerSecondP50, 2)} tok/s`).join("; ")}. Streaming peak VRAM was ${stream.vram.primaryPeakMiB} MiB.

## Skill Status

Skill validation remains L0 ${skills.l0.passed}/${skills.l0.total}; decisions are production=${skillCounts.PRODUCTION}, experimental=${skillCounts.EXPERIMENTAL}, rejected=${skillCounts.REJECTED}. Only R09 C1 is admitted production. G3 does not silently admit a new Skill.

## Production Default Decision

E-MIN-V2 remains the relative production default. Global V3 and conditional routing both failed preregistered gates. Global Multi-Agent and semantic reviewer remain disabled; deterministic safety/verification stays enabled. This is not an autonomous-patch readiness claim. See ADR 0012.

## Quantization Readiness

Protocol status: ${quantization.status}. The exact sealed BF16 comparison, snapshot/license admission, TTFT/throughput/VRAM metrics, and acceptance gates are prepared. No reduced-precision snapshot was downloaded because acquisition lacks explicit approval.

## License Readiness

Of the carried-forward 139 NOASSERTION entries: A locally resolvable=${license.counts.A_RESOLVABLE_LOCALLY}, B authoritative external metadata required=${license.counts.B_REQUIRES_AUTHORITATIVE_EXTERNAL_METADATA}, C ambiguous/manual legal review=${license.counts.C_AMBIGUOUS_MANUAL_LEGAL_REVIEW}. Root license options are informational only; no owner license decision was made. Distribution remains ${license.distributionDecision}.

## Release Blockers

${summary.releaseBlockers.map((item) => `- ${item}`).join("\n")}

No project commit, remote configuration, push, PR, tag, release, signing, sudo installation, or quantized-model acquisition was performed.
`;
const markdownPath = path.join(root, "docs/validation/2026-08-09-g3-generalization.md");
await writeFile(markdownPath, markdown, { flag: "wx" });
await writeFile(`${markdownPath}.sha256`, `${sha256(markdown)}  2026-08-09-g3-generalization.md\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: summary.classification, json: "docs/experiments/G3_FINAL_REPORT.json", jsonSha256: sha256(jsonBody), markdown: "docs/validation/2026-08-09-g3-generalization.md", markdownSha256: sha256(markdown) }, null, 2)}\n`);
