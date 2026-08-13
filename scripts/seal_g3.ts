import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const benchmarkRoot = path.join(root, "benchmarks/g3");
const corpusRoot = path.join(root, ".runtime/g3-repositories");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const artifact = async (name: string) => {
  const relative = `benchmarks/g3/${name}`;
  const bytes = await readFile(path.join(root, relative));
  const expected = (await readFile(path.join(root, `${relative}.sha256`), "utf8")).trim().split(/\s+/)[0];
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${relative} checksum mismatch`);
  return { relative, bytes, sha256: actual, json: JSON.parse(bytes.toString("utf8")) as Record<string, unknown> };
};
async function writeImmutable(name: string, value: object) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(benchmarkRoot, name), body, { flag: "wx" });
  const hash = sha256(body);
  await writeFile(path.join(benchmarkRoot, `${name}.sha256`), `${hash}  ${name}\n`, { flag: "wx" });
  return { path: `benchmarks/g3/${name}`, sha256: hash };
}
function words(value: string) { return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2)); }
function jaccard(left: Set<string>, right: Set<string>) {
  const intersection = [...left].filter((value) => right.has(value)).length;
  return intersection / new Set([...left, ...right]).size;
}

const [preregistration, repositoriesArtifact, tasksV1, oracleV1, tasksV2, oracleV2, longV1, patchManifest, patchOracle] = await Promise.all([
  artifact("G3_PREREGISTRATION.json"), artifact("g3_repository_manifest.json"), artifact("g3_task_manifest.json"), artifact("g3_oracle.sealed.json"),
  artifact("g3_task_manifest.v2.json"), artifact("g3_oracle.v2.sealed.json"), artifact("g3_long_horizon_manifest.json"),
  artifact("g3_real_patch_manifest.json"), artifact("g3_real_patch_oracle.sealed.json")
]);
const repositoryRows = repositoriesArtifact.json.repositories as Array<Record<string, unknown>>;
const publicTasks = tasksV2.json.tasks as Array<Record<string, unknown>>;
const oracleRows = oracleV2.json.rows as Array<Record<string, unknown>>;
if (repositoryRows.length !== 24 || publicTasks.length !== 192 || oracleRows.length !== 192) throw new Error("G3 primary artifact cardinality mismatch");
if ((patchManifest.json.integrity as { tasks?: number }).tasks !== 60 || (patchOracle.json.rows as unknown[]).length !== 60) throw new Error("G3 patch artifact cardinality mismatch");

const oldManifestFiles = ["benchmarks/holdout/real_repository_manifest.json", "benchmarks/retrieval-v3/real_repository_development_manifest.json"];
const priorUrls = new Set<string>();
for (const relative of oldManifestFiles) {
  const value = JSON.parse(await readFile(path.join(root, relative), "utf8")) as { repositories?: Array<{ source?: string }> };
  for (const repo of value.repositories ?? []) if (repo.source) priorUrls.add(repo.source.toLowerCase().replace(/\.git$/, ""));
}
const overlaps = repositoryRows.filter((repo) => priorUrls.has(String(repo.url).toLowerCase().replace(/\.git$/, ""))).map((repo) => repo.id);
if (overlaps.length) throw new Error(`G3 repository contamination: ${overlaps.join(",")}`);
for (const repo of repositoryRows) {
  const cwd = path.join(corpusRoot, String(repo.local_directory));
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd }),
    execFileAsync("git", ["status", "--porcelain"], { cwd })
  ]);
  if (head.trim() !== repo.commit_sha || status.trim()) throw new Error(`G3 repository changed before seal: ${repo.id}`);
}

const longTemplates = [
  [
    "Orient a contributor who has ninety minutes: establish purpose, confirm the documented validation route, locate the execution boundary, and propose a first reversible change.",
    "Build a staged first-day map: understand the project, identify how maintainers validate it, follow the main execution surface, then choose one safe starter change.",
    "Create an evidence-gaining onboarding path that moves from purpose to setup, validation, architecture, and a small reversible contribution without inventing command results.",
    "Walk a new engineer from the repository's stated goal through its build/test contract and entry surface, ending with a low-risk change proposal and truthful unknowns."
  ],
  [
    "A regression lacks a trustworthy stack trace. Establish the tightest reproduction seam, inspect related source/tests, form a falsifiable hypothesis, and stop or revise only after new evidence.",
    "Investigate a reported failure with incomplete logs: find an executable oracle, connect test and implementation evidence, probe one cause, then make at most one evidence-backed revision.",
    "Run a bounded diagnosis sequence for an underspecified defect: reproduce if possible, minimize, rank a hypothesis, verify it, and terminate honestly if the patch oracle remains missing.",
    "Handle a failed-change scenario by retrieving the likely test/source pair, seeking a red signal, testing a falsifiable diagnosis, and allowing a second attempt only after verifier feedback."
  ],
  [
    "Prepare a release-readiness assessment covering license, dependency/build metadata, verification, and protected delivery actions; publish or sign nothing.",
    "Audit whether this project could be released from the available local evidence: inspect licensing, manifests, checks, and authority while keeping every external action blocked.",
    "Produce a local-only release gate review that connects license evidence, dependency metadata, build verification, and approval requirements without creating tags or artifacts.",
    "Assess delivery readiness using authoritative repository metadata and verification status. Separate preparatory work from signing, publication, and other unavailable authority."
  ]
];
const longRows = repositoryRows.filter((repo) => repo.split_role === "holdout").flatMap((repo, repoIndex) => {
  const paths = [
    [repo.readme_path, repo.build_path, repo.entry_path],
    [repo.source_path, repo.test_path, repo.build_path],
    [repo.license_path, repo.dependency_manifest, repo.build_path]
  ];
  const categories = ["onboarding_architecture", "diagnosis_recovery", "release_safety"];
  const outcomes = ["ANSWER", "REPORT_ONLY", "REPORT_ONLY"];
  return categories.map((category, index) => ({
    task_id: `g3-long-v2-${repo.id}-${index + 1}-${sha256(`${repo.commit_sha}:${category}:v2`).slice(0, 8)}`,
    repository_id: repo.id,
    repository_commit: repo.commit_sha,
    split: "holdout",
    prompt: `${longTemplates[index][repoIndex % longTemplates[index].length]} Apply this workflow to ${repo.id}, a ${repo.ecosystem} project described locally as ${repo.selection_provenance}.`,
    provenance: "multi-stage naturalistic repository workflow authoring revision 2",
    category,
    difficulty: index === 0 ? "L3" : "L4",
    expected_outcome: outcomes[index],
    required_evidence_paths: [...new Set(paths[index].map(String))],
    maximum_model_calls: 3,
    retry_requires_new_evidence: true,
    stability_seed_slot: repoIndex % 3
  }));
});
if (longRows.length !== 36) throw new Error("G3 long-horizon v2 cardinality mismatch");
const longV2 = await writeImmutable("g3_long_horizon_manifest.v2.json", {
  schema_version: 1, suite_id: "dca-g3-long-horizon", authoring_revision: 2, supersedes: longV1.relative,
  preregistration_sha256: preregistration.sha256, task_payload_sha256: sha256(JSON.stringify(longRows)), tasks: longRows,
  integrity: { status: "PASS", tasks: longRows.length, repositories: 12, option_count: 0 }
});

let maximumPromptJaccard = 0;
let maximumPromptPair: string[] = [];
for (let left = 0; left < publicTasks.length; left += 1) for (let right = left + 1; right < publicTasks.length; right += 1) {
  const score = jaccard(words(String(publicTasks[left].prompt)), words(String(publicTasks[right].prompt)));
  if (score > maximumPromptJaccard) { maximumPromptJaccard = score; maximumPromptPair = [String(publicTasks[left].task_id), String(publicTasks[right].task_id)]; }
}
const exactLeaks = publicTasks.filter((task) => {
  const row = oracleRows.find((candidate) => candidate.task_id === task.task_id);
  return (row?.required_evidence_paths as string[] | undefined)?.some((required) => String(task.prompt).includes(required));
}).length;
const cueAuditValue = {
  schema_version: 1, suite_id: "dca-naturalistic-open-ended-g3", authoring_revision: 2, tasks: publicTasks.length,
  answer_options: 0, lettered_option_markers: publicTasks.filter((task) => /\bOPTIONS\b|\b[A-C]:\s/i.test(String(task.prompt))).length,
  exact_required_path_leaks: exactLeaks, category_or_difficulty_fields_in_model_input: 0, task_specific_answer_schema: false,
  generic_response_schema_only: true, maximum_pairwise_prompt_token_jaccard: Number(maximumPromptJaccard.toFixed(4)), maximum_pair: maximumPromptPair,
  conclusion: maximumPromptJaccard < 0.9 && exactLeaks === 0 ? "PASS_ANSWER_CHOICE_PATH_AND_TEMPLATE_CUES_REDUCED" : "FAIL"
};
if (cueAuditValue.conclusion === "FAIL") throw new Error(`G3 authoring v2 cue audit failed: ${JSON.stringify(cueAuditValue)}`);
const cueAudit = await writeImmutable("g3_option_cue_audit.v2.json", cueAuditValue);
const naturalisticAudit = await writeImmutable("g3_naturalistic_task_audit.v2.json", {
  schema_version: 1, suite_id: "dca-naturalistic-open-ended-g3", authoring_revision: 2, repositories: 24, primary_tasks: 192,
  long_horizon_tasks: 36, historical_patch_tasks: 60, prompt_families: 8, maximum_pairwise_prompt_token_jaccard: cueAuditValue.maximum_pairwise_prompt_token_jaccard,
  sources: { pinned_repository_artifact_tasks: 144, policy_scenarios: 48, historical_public_commits: 60, multi_stage_workflows: 36 },
  limitations: [
    "Primary coding tasks score bounded target/evidence/plan correctness; executable changes are evaluated in the separate historical-patch corpus.",
    "Historical commit subjects are natural project artifacts but not curated issue bodies.",
    "A parser is mandatory for patch PASS; unavailable full upstream tests remain explicit NOT_RUN."
  ],
  conclusion: "PASS_WITH_DISCLOSED_SOURCE_MIX_AND_TEMPLATE_DIVERSITY"
});
const provenance = await writeImmutable("g3_task_provenance_report.v2.json", {
  schema_version: 1, suite_id: "dca-naturalistic-open-ended-g3", authoring_revision: 2, preregistration_sha256: preregistration.sha256,
  repository_manifest_sha256: repositoriesArtifact.sha256, task_manifest_sha256: tasksV2.sha256, oracle_sha256: oracleV2.sha256,
  long_horizon_manifest_sha256: longV2.sha256, patch_manifest_sha256: patchManifest.sha256, patch_oracle_sha256: patchOracle.sha256,
  repository_disjointness: { prior_manifest_paths: oldManifestFiles, overlap_count: 0, split_unit: "repository" },
  repositories: repositoryRows.map((repo) => ({ id: repo.id, url: repo.url, commit: repo.commit_sha, split: repo.split_role, license: repo.license_local })),
  authoring_sources: { primary: "pinned local repository artifacts plus explicit policy cases", long_horizon: "pinned holdout evidence and bounded workflow", patch: "small historical public commit subjects and diffs" }
});
const authoringDecision = await writeImmutable("g3_authoring_revision_record.json", {
  schema_version: 1, suite_id: "dca-naturalistic-open-ended-g3", decided_before_model_calls: true,
  revision_1: { task_manifest_sha256: tasksV1.sha256, oracle_sha256: oracleV1.sha256, status: "REJECTED_BEFORE_SEAL", reason: "maximum repeated prompt Jaccard was 1.0 across repositories" },
  revision_2: { task_manifest_sha256: tasksV2.sha256, oracle_sha256: oracleV2.sha256, status: "ACCEPTED_FOR_SEAL", maximum_prompt_jaccard: cueAuditValue.maximum_pairwise_prompt_token_jaccard },
  candidate_or_model_outcomes_seen: false, tuning_from_results: false
});

const references = {
  preregistration: { path: preregistration.relative, sha256: preregistration.sha256 },
  repository_manifest: { path: repositoriesArtifact.relative, sha256: repositoriesArtifact.sha256, payload_sha256: repositoriesArtifact.json.repository_payload_sha256 },
  task_manifest: { path: tasksV2.relative, sha256: tasksV2.sha256, payload_sha256: tasksV2.json.task_payload_sha256 },
  oracle: { path: oracleV2.relative, sha256: oracleV2.sha256, payload_sha256: oracleV2.json.oracle_payload_sha256 },
  long_horizon: longV2,
  real_patch_manifest: { path: patchManifest.relative, sha256: patchManifest.sha256, payload_sha256: patchManifest.json.task_payload_sha256 },
  real_patch_oracle: { path: patchOracle.relative, sha256: patchOracle.sha256, payload_sha256: patchOracle.json.oracle_payload_sha256 },
  option_cue_audit: cueAudit,
  naturalistic_task_audit: naturalisticAudit,
  provenance,
  authoring_decision: authoringDecision
};
const sealValue = {
  schema_version: 1,
  seal_id: "dca-g3-seal-2026-08-09",
  state: "SEALED_BEFORE_FIRST_G3_MODEL_CALL",
  sealed_at: new Date().toISOString(),
  authoring_revision: 2,
  references,
  candidates: {
    "E-MIN-V2": { artifact: "config/production/emin-v2-frozen-2026-08-09.json", artifact_sha256: "74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd", source_closure_sha256: "bb8c8b9abc4d863691446f3ff4523a68489a6139425acddd05ead5df6043cdf8" },
    "E-MIN-V3": { artifact: "config/production/emin-v3-frozen-2026-08-09.json", artifact_sha256: "7b8829aded41cc996785ce5197627a4b712991d526b7e9e3045b3bf3f9d91be0", source_closure_sha256: "e307862f7728ac6bc90b231c23b7562cbb5d114aaed3af77200a2c7b77a3a76b" }
  },
  fixed_model: { repository: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", vllm: "0.26.0", precision: "bfloat16", temperature: 0, seed: 20260809, thinking: false, multi_agent: "OFF", semantic_reviewer: "OFF" },
  corpus: { repositories: 24, primary_tasks: 192, holdout_primary_tasks: 96, long_horizon_tasks: 36, real_patch_tasks: 60, repository_overlap_with_prior_public_corpora: 0 },
  immutability: "Any change to a referenced artifact, pinned repository SHA, candidate closure, model variable, prompt, oracle, scorer, retrieval policy, or route invalidates this G3 generation."
};
const seal = await writeImmutable("G3_SEAL.json", sealValue);
process.stdout.write(`${JSON.stringify({ status: "PASS", seal, cueAudit: cueAuditValue, corpus: sealValue.corpus, references }, null, 2)}\n`);
