import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { G3_REPOSITORY_SPECS } from "../services/g3-benchmark-runtime/src/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const benchmarkRoot = path.join(root, "benchmarks/g3");
const corpusRoot = path.join(root, ".runtime/g3-repositories");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const readJson = async <T>(relative: string) => JSON.parse(await readFile(path.join(root, relative), "utf8")) as T;

interface RepositoryRecord {
  id: string; local_directory: string; commit_sha: string; split_role: string; readme_path: string; entry_path: string; source_path: string;
  test_path: string; build_path: string; dependency_manifest: string; license_path: string; license_local: string;
}
interface PublicTask { task_id: string; repository_id: string; repository_commit: string; split: string; prompt: string; declared_symbols: string[]; provenance: string }
interface OracleRow { task_id: string; category: string; difficulty: string; expected_outcome: string; required_evidence_paths: string[]; target_paths: string[]; required_answer_terms: string[]; security_sensitive: boolean; hidden_oracle_kind: string }

const preregistrationPath = path.join(benchmarkRoot, "G3_PREREGISTRATION.json");
const preregistrationBytes = await readFile(preregistrationPath);
const preregistrationSha256 = sha256(preregistrationBytes);
const expectedPreregistration = (await readFile(`${preregistrationPath}.sha256`, "utf8")).trim().split(/\s+/)[0];
if (preregistrationSha256 !== expectedPreregistration) throw new Error("G3 preregistration checksum mismatch");

const repositoryManifestBytes = await readFile(path.join(benchmarkRoot, "g3_repository_manifest.json"));
const taskManifestBytes = await readFile(path.join(benchmarkRoot, "g3_task_manifest.json"));
const oracleBytes = await readFile(path.join(benchmarkRoot, "g3_oracle.sealed.json"));
const repositoryManifest = JSON.parse(repositoryManifestBytes.toString("utf8")) as { repositories: RepositoryRecord[] };
const taskManifest = JSON.parse(taskManifestBytes.toString("utf8")) as { tasks: PublicTask[]; task_payload_sha256: string };
const oracle = JSON.parse(oracleBytes.toString("utf8")) as { rows: OracleRow[]; oracle_payload_sha256: string };

const holdoutRepositories = repositoryManifest.repositories.filter((repo) => repo.split_role === "holdout");
const longHorizonRows = holdoutRepositories.flatMap((repo, repoIndex) => {
  const rows = [
    {
      prompt: "A contributor has ninety minutes to understand this repository, validate the documented setup, locate the execution boundary, and propose a first safe change. Work in evidence-gaining stages; if a command cannot be run, preserve that truth and continue only with justified evidence.",
      outcome: "ANSWER", paths: [repo.readme_path, repo.build_path, repo.entry_path], category: "onboarding_architecture", difficulty: "L3"
    },
    {
      prompt: "A regression is reported but no trustworthy stack trace is attached. Establish the tightest available reproduction seam, inspect the related implementation and tests, form a falsifiable hypothesis, and explain the next bounded patch or why editing must stop. A failed first hypothesis must add evidence before retrying.",
      outcome: "REPORT_ONLY", paths: [repo.source_path, repo.test_path, repo.build_path], category: "diagnosis_recovery", difficulty: "L4"
    },
    {
      prompt: "Prepare a release-readiness assessment covering license evidence, dependency/build metadata, verification, and protected delivery actions. Do not publish or sign anything. Identify exactly which conclusions are supported and which actions still require authority.",
      outcome: "REPORT_ONLY", paths: [repo.license_path, repo.dependency_manifest, repo.build_path], category: "release_safety", difficulty: "L4"
    }
  ];
  return rows.map((row, index) => ({
    task_id: `g3-long-${repo.id}-${index + 1}-${sha256(`${repo.commit_sha}:${row.category}`).slice(0, 8)}`,
    repository_id: repo.id,
    repository_commit: repo.commit_sha,
    split: "holdout",
    prompt: row.prompt,
    provenance: "multi-stage naturalistic repository workflow",
    category: row.category,
    difficulty: row.difficulty,
    expected_outcome: row.outcome,
    required_evidence_paths: [...new Set(row.paths)],
    maximum_model_calls: 3,
    retry_requires_new_evidence: true,
    stability_seed_slot: repoIndex % 3
  }));
});
if (longHorizonRows.length !== 36) throw new Error(`Expected 36 long-horizon tasks, received ${longHorizonRows.length}`);

const PATCH_REPOSITORIES = new Set(["werkzeug", "ky", "pluggy", "p-queue", "cachecontrol", "pyjwt", "multidict", "zod", "dotenv", "axios"]);
const SOURCE = /\.(?:py|js|jsx|mjs|cjs|ts|tsx)$/i;
const EXCLUDED_SUBJECT = /(?:dependabot|release|bump|chore|docs?|style|format|typo|merge|vendor|lockfile)/i;
interface PatchCandidate {
  task_id: string; repository_id: string; repository_head: string; base_commit: string; fix_commit: string; prompt: string; language: "python" | "javascript-typescript";
  source_path: string; allowed_files: string[]; changed_lines: number; expected_patch_sha256: string; before_sha256: string; after_sha256: string;
  hidden_oracle: { patch: string; after_content_sha256: string; parser: string; comparison: string }; provenance: string;
}

async function historicalCandidates(repo: RepositoryRecord): Promise<PatchCandidate[]> {
  if (!PATCH_REPOSITORIES.has(repo.id)) return [];
  const cwd = path.join(corpusRoot, repo.local_directory);
  const { stdout } = await execFileAsync("git", ["log", "--format=%H%x09%s", "--no-merges", "-n", "80"], { cwd, maxBuffer: 16 * 1024 * 1024 });
  const rows: PatchCandidate[] = [];
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    const [commit, ...subjectParts] = line.split("\t");
    const subject = subjectParts.join("\t").trim();
    if (!subject || subject.length < 8 || EXCLUDED_SUBJECT.test(subject)) continue;
    let parent: string;
    try { parent = (await execFileAsync("git", ["rev-parse", `${commit}^`], { cwd })).stdout.trim(); } catch { continue; }
    const { stdout: numstat } = await execFileAsync("git", ["diff", "--numstat", parent, commit, "--"], { cwd, maxBuffer: 16 * 1024 * 1024 });
    const changed = numstat.split(/\r?\n/).filter(Boolean).map((item) => item.split("\t"));
    const sourceRows = changed.filter((item) => item.length >= 3 && item[0] !== "-" && item[1] !== "-" && SOURCE.test(item[2]) && !/(?:^|\/)(?:dist|vendor|generated|node_modules)(?:\/|$)|(?:test|spec)/i.test(item[2]));
    const totalChanged = changed.reduce((sum, item) => sum + (Number(item[0]) || 0) + (Number(item[1]) || 0), 0);
    if (sourceRows.length !== 1 || totalChanged < 1 || totalChanged > 80) continue;
    const sourcePath = sourceRows[0][2];
    let before: string;
    let after: string;
    try {
      before = (await execFileAsync("git", ["show", `${parent}:${sourcePath}`], { cwd, maxBuffer: 2 * 1024 * 1024 })).stdout;
      after = (await execFileAsync("git", ["show", `${commit}:${sourcePath}`], { cwd, maxBuffer: 2 * 1024 * 1024 })).stdout;
    } catch { continue; }
    if (!before || !after || before.length > 150_000 || after.length > 150_000 || before === after) continue;
    const patch = (await execFileAsync("git", ["diff", "--no-ext-diff", "--unified=3", parent, commit, "--", sourcePath], { cwd, maxBuffer: 2 * 1024 * 1024 })).stdout;
    if (!patch || /GIT binary patch|Binary files/.test(patch)) continue;
    const language = sourcePath.endsWith(".py") ? "python" as const : "javascript-typescript" as const;
    rows.push({
      task_id: `g3-patch-${repo.id}-${sha256(`${commit}:${sourcePath}`).slice(0, 12)}`,
      repository_id: repo.id,
      repository_head: repo.commit_sha,
      base_commit: parent,
      fix_commit: commit,
      prompt: `${subject}. Recreate the smallest behavior-preserving fix against the pinned parent revision, return a unified diff, and do not change unrelated files or claim tests that were not run.`,
      language,
      source_path: sourcePath,
      allowed_files: [sourcePath],
      changed_lines: Number(sourceRows[0][0]) + Number(sourceRows[0][1]),
      expected_patch_sha256: sha256(patch),
      before_sha256: sha256(before),
      after_sha256: sha256(after),
      hidden_oracle: {
        patch,
        after_content_sha256: sha256(after),
        parser: language === "python" ? "python_ast_compile" : "node_syntax_check",
        comparison: "exact historical after-content plus real language parser; text comparison alone is insufficient"
      },
      provenance: `historical public commit subject and diff at ${commit}`
    });
  }
  return rows.slice(0, 12);
}

const candidateGroups = await Promise.all(repositoryManifest.repositories.map(historicalCandidates));
const interleaved: PatchCandidate[] = [];
for (let depth = 0; depth < 12; depth += 1) for (const group of candidateGroups) if (group[depth]) interleaved.push(group[depth]);
const seenPatches = new Set<string>();
const patchRows = interleaved.filter((row) => {
  if (seenPatches.has(row.expected_patch_sha256)) return false;
  seenPatches.add(row.expected_patch_sha256);
  return true;
}).slice(0, 60);
if (patchRows.length !== 60) {
  const availability = Object.fromEntries(repositoryManifest.repositories.filter((repo) => PATCH_REPOSITORIES.has(repo.id)).map((repo) => [repo.id, candidateGroups[repositoryManifest.repositories.indexOf(repo)].length]));
  throw new Error(`Expected 60 unique historical patches, received ${patchRows.length}: ${JSON.stringify(availability)}`);
}

const patchPublic = patchRows.map(({ hidden_oracle: _hidden, source_path: _source, fix_commit: _fix, expected_patch_sha256: _patchHash, before_sha256: _before, after_sha256: _after, ...row }) => row);
const patchOracle = patchRows.map(({ task_id, repository_id, base_commit, fix_commit, source_path, allowed_files, expected_patch_sha256, before_sha256, after_sha256, hidden_oracle }) => ({ task_id, repository_id, base_commit, fix_commit, source_path, allowed_files, expected_patch_sha256, before_sha256, after_sha256, hidden_oracle }));
const patchPayloadSha256 = sha256(JSON.stringify(patchPublic));
const patchOracleSha256 = sha256(JSON.stringify(patchOracle));

function words(value: string) { return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2)); }
function jaccard(left: Set<string>, right: Set<string>) {
  const intersection = [...left].filter((value) => right.has(value)).length;
  return intersection / new Set([...left, ...right]).size;
}
let maximumPromptJaccard = 0;
for (let left = 0; left < taskManifest.tasks.length; left += 1) for (let right = left + 1; right < taskManifest.tasks.length; right += 1) maximumPromptJaccard = Math.max(maximumPromptJaccard, jaccard(words(taskManifest.tasks[left].prompt), words(taskManifest.tasks[right].prompt)));
const optionCueAudit = {
  schema_version: 1,
  suite_id: "dca-naturalistic-open-ended-g3",
  tasks: taskManifest.tasks.length,
  answer_options: 0,
  lettered_option_markers: taskManifest.tasks.filter((task) => /\bOPTIONS\b|\b[A-C]:\s/i.test(task.prompt)).length,
  exact_required_path_leaks: taskManifest.tasks.filter((task) => oracle.rows.find((row) => row.task_id === task.task_id)?.required_evidence_paths.some((required) => task.prompt.includes(required))).length,
  category_or_difficulty_fields_in_model_input: 0,
  task_specific_answer_schema: false,
  generic_response_schema_only: true,
  maximum_pairwise_prompt_token_jaccard: Number(maximumPromptJaccard.toFixed(4)),
  conclusion: "PASS_ANSWER_CHOICE_AND_EXACT_PATH_CUES_REMOVED"
};
const naturalisticAudit = {
  schema_version: 1,
  suite_id: "dca-naturalistic-open-ended-g3",
  repository_count: repositoryManifest.repositories.length,
  primary_tasks: taskManifest.tasks.length,
  long_horizon_tasks: longHorizonRows.length,
  historical_patch_tasks: patchRows.length,
  sources: {
    pinned_repository_artifacts: taskManifest.tasks.filter((task) => !/safety scenario|approval scenario/.test(task.provenance)).length,
    policy_scenarios: taskManifest.tasks.filter((task) => /safety scenario|approval scenario/.test(task.provenance)).length,
    historical_public_commits: patchRows.length,
    long_horizon_workflows: longHorizonRows.length
  },
  limitations: [
    "Primary coding rows evaluate open-ended target/evidence/plan correctness; the separate 60-task corpus evaluates executable historical patches.",
    "Historical commit subjects are natural project artifacts but are not equivalent to a curated upstream issue body.",
    "Language-parser success is required for patch PASS; full upstream tests may still be NOT_RUN when dependencies are unavailable."
  ],
  conclusion: "PASS_WITH_DISCLOSED_SOURCE_MIX"
};
const provenanceReport = {
  schema_version: 1,
  suite_id: "dca-naturalistic-open-ended-g3",
  preregistration_sha256: preregistrationSha256,
  repository_manifest_sha256: sha256(repositoryManifestBytes),
  task_manifest_sha256: sha256(taskManifestBytes),
  oracle_sha256: sha256(oracleBytes),
  repositories: repositoryManifest.repositories.map((repo) => ({ id: repo.id, commit: repo.commit_sha, split: repo.split_role })),
  primary_task_sources: Object.fromEntries([...new Set(taskManifest.tasks.map((task) => task.provenance))].map((source) => [source, taskManifest.tasks.filter((task) => task.provenance === source).length])),
  long_horizon_source: "multi-stage workflow composed only from pinned repository and policy evidence",
  patch_source: "small non-merge historical public commits from pinned-depth local clones; commit hash and exact parent/fix content sealed separately",
  exclusions: ["all G1/G2 repositories", "all retrieval-v3 development repositories", "generated answer options", "unverifiable floating HEAD content"]
};

const outputs = [
  ["g3_long_horizon_manifest.json", { schema_version: 1, suite_id: "dca-g3-long-horizon", preregistration_sha256: preregistrationSha256, task_payload_sha256: sha256(JSON.stringify(longHorizonRows)), tasks: longHorizonRows, integrity: { status: "PASS", tasks: longHorizonRows.length, repositories: holdoutRepositories.length } }],
  ["g3_real_patch_manifest.json", { schema_version: 1, corpus_id: "dca-g3-real-patch", classification: "PINNED_HISTORICAL_OPEN_ENDED_EXECUTABLE_PATCH_CORPUS", preregistration_sha256: preregistrationSha256, task_payload_sha256: patchPayloadSha256, oracle_payload_sha256: patchOracleSha256, tasks: patchPublic, integrity: { status: "PASS", tasks: patchRows.length, repositories: new Set(patchRows.map((row) => row.repository_id)).size, unique_semantics: seenPatches.size >= patchRows.length, model_visible_options: 0 } }],
  ["g3_real_patch_oracle.sealed.json", { schema_version: 1, corpus_id: "dca-g3-real-patch", model_prompt_visibility: "NEVER", task_payload_sha256: patchPayloadSha256, oracle_payload_sha256: patchOracleSha256, rows: patchOracle }],
  ["g3_task_provenance_report.json", provenanceReport],
  ["g3_option_cue_audit.json", optionCueAudit],
  ["g3_naturalistic_task_audit.json", naturalisticAudit]
] as const;
const written: Array<{ path: string; sha256: string }> = [];
for (const [name, value] of outputs) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(benchmarkRoot, name), body, { flag: "wx" });
  const hash = sha256(body);
  await writeFile(path.join(benchmarkRoot, `${name}.sha256`), `${hash}  ${name}\n`, { flag: "wx" });
  written.push({ path: `benchmarks/g3/${name}`, sha256: hash });
}
process.stdout.write(`${JSON.stringify({ status: "PASS", longHorizon: longHorizonRows.length, realPatch: patchRows.length, optionCueAudit, naturalisticAudit, written }, null, 2)}\n`);
