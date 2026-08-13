import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const outputRelative = "config/production/emin-v3-frozen-2026-08-09.json";
const output = path.join(root, outputRelative);
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hashFile = async (relative: string) => sha256(await readFile(path.join(root, relative)));
const baseline = JSON.parse(await readFile(path.join(root, "config/production/emin-v2-frozen-2026-08-09.json"), "utf8")) as { repository_state: { candidate_source_closure: Array<{ path: string; sha256: string }> }; model: Record<string, unknown>; decoding: Record<string, unknown>; mutation_budgets: Record<string, unknown>; deterministic_policy: Record<string, unknown>; hardware_reference: Record<string, unknown> };
const sourcePaths = [...baseline.repository_state.candidate_source_closure.map((item) => item.path), "services/task-aware-retrieval/src/index.ts", "services/harness-v3-runtime/src/index.ts"].sort();
const sourceClosure = await Promise.all(sourcePaths.map(async (sourcePath) => ({ path: sourcePath, sha256: await hashFile(sourcePath) })));
const closurePayload = sourceClosure.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n");
const evidencePaths = {
  retrievalAblation: "docs/experiments/runs/m9-retrieval-v3-retrieval_development-end-to-end-2026-08-09T07-43-02-401Z/retrieval-v3-ablation.json",
  exactDevelopment: "docs/experiments/runs/m9-retrieval-v3-retrieval_development-end-to-end-2026-08-09T08-01-30-159Z/retrieval-v3-ablation.json",
  exactHard: "docs/experiments/runs/m9-retrieval-v3-hard_development-end-to-end-2026-08-09T08-02-30-933Z/retrieval-v3-ablation.json",
  exactRealRepositories: "docs/experiments/runs/m9-real-repositories-v3-development-2026-08-09T08-03-05-832Z/real-repository-v3-result.json",
  exactExpandedPatch: "docs/experiments/runs/m9-expanded-patch-v3-development-2026-08-09T07-59-49-744Z/expanded-patch-v3-result.json",
  developmentManifest: "benchmarks/retrieval-v3/retrieval_development_manifest.json",
  developmentOracle: "benchmarks/retrieval-v3/retrieval_development_oracle.json",
  hardManifest: "benchmarks/retrieval-v3/hard_development_manifest.json",
  realRepositoryManifest: "benchmarks/retrieval-v3/real_repository_development_manifest.json",
  expandedPatchManifest: "benchmarks/retrieval-v3/expanded_patch_development_manifest.json",
  vramIdle: "docs/experiments/vram/2026-08-09T07-27-10-062Z-idle-pre-server.json",
  vramLoaded: "docs/experiments/vram/2026-08-09T07-28-25-511Z-model-loaded-idle.json",
  vramWorkload: "docs/experiments/vram/2026-08-09T07-38-29-458Z-retrieval-v3-development-workload.json"
};
const evidence = Object.fromEntries(await Promise.all(Object.entries(evidencePaths).map(async ([key, relative]) => [key, { path: relative, sha256: await hashFile(relative) }])));
const config = {
  schema_version: 1,
  candidate_id: "E-MIN-V3",
  candidate_generation: 3,
  status: "FROZEN_FOR_HOLDOUT_G2",
  frozen_at: new Date().toISOString(),
  comparison_baseline: { candidate_id: "E-MIN-V2", artifact_sha256: "74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd", source_closure_sha256: "bb8c8b9abc4d863691446f3ff4523a68489a6139425acddd05ead5df6043cdf8" },
  repository_state: { branch: "main", git_head: null, git_remote: null, reason_git_revision_absent: "Protected commit/remote actions were not authorized.", candidate_source_closure_sha256: sha256(closurePayload), candidate_source_closure: sourceClosure },
  model: baseline.model,
  decoding: baseline.decoding,
  retrieval: {
    policy: "R2_TASK_AWARE_ONE_FALLBACK",
    evidence_need_classifier: "DETERMINISTIC_TASK_PATTERN_V1",
    atomic_classes: ["SYMBOL", "TEST", "DOCUMENTATION", "METADATA", "BUILD", "ARCHITECTURE", "GIT"],
    maximum_requested_classes: 3,
    primary_item_cap: 2,
    maximum_fallback_rounds: 1,
    maximum_total_items: 3,
    family_isolation: "STRICT_ATOMIC_CLASS",
    canonical_path_priority: true,
    symbol_definition_priority: ["indexed definition", "syntactic definition", "exact symbol", "lexical"],
    current_evidence_stale_penalty: true,
    deduplicate_by: "path plus content SHA-256",
    coverage: "deterministic requested class versus selected class; incomplete is explicit"
  },
  context: {
    variants: ["C1", "C1_PLUS"],
    hard_token_cap: 1000,
    format: "TASK; PRIMARY EVIDENCE; SUPPORTING EVIDENCE only when required",
    exact_internal_diagnostics_in_model_context: false,
    oversized_evidence: "deterministic equal-budget re-slice with explicit truncation marker",
    critical_evidence_silent_omission: false
  },
  orchestration: { default_agent_mode: "SINGLE", primary_model_calls: 1, semantic_reviewer: "OFF", multi_agent: "OFF", specialist_routing: "EXPERIMENTAL_DISABLED_BY_DEFAULT", same_prompt_retry_budget: 0 },
  mutation_budgets: baseline.mutation_budgets,
  deterministic_policy: baseline.deterministic_policy,
  skills: { production: ["R09:C1/C1_PLUS"], runtime_capabilities_not_promoted_as_semantic_skills: ["deterministic evidence-need classification", "task-aware retriever families", "coverage", "one bounded fallback"], experimental_unchanged: ["R01", "R04", "R08", "R17", "R18", "R21", "R22", "R26"] },
  hardware_reference: baseline.hardware_reference,
  development_evidence: evidence,
  admission_basis: { development_tasks: 224, development_success: "224/224", hard_tasks: 140, hard_success: "140/140", real_repositories: 12, real_repository_tasks: 48, real_repository_success: "47/48", expanded_patch_tasks: 60, expanded_patch_success: "58/60; equal to E1", actual_safety_violations: 0, wrong_file_edits: 0, rollback: "60/60", exact_candidate_verified_before_freeze: true },
  immutability_rule: "No source/config/retrieval/context/threshold/decoding/budget change after this freeze. Any change creates E-MIN-V4 and a new untouched holdout."
};
const serialized = `${JSON.stringify(config, null, 2)}\n`;
await writeFile(output, serialized);
await writeFile(`${output}.sha256`, `${sha256(serialized)}  ${path.basename(output)}\n`);
process.stdout.write(`${JSON.stringify({ status: "PASS", candidateId: config.candidate_id, artifact: outputRelative, artifactSha256: sha256(serialized), sourceClosureSha256: config.repository_state.candidate_source_closure_sha256, sourceFiles: sourceClosure.length }, null, 2)}\n`);
