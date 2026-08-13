import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const seal = JSON.parse(await readFile(path.join(root, "benchmarks/g3/G3_SEAL.json"), "utf8")) as { references: Record<string, { path: string; sha256: string }> };
for (const reference of Object.values(seal.references)) if (sha256(await readFile(path.join(root, reference.path))) !== reference.sha256) throw new Error(`G3 sealed artifact changed: ${reference.path}`);
interface Repo { id: string; commit_sha: string; split_role: string; ecosystem: string; provenance: string; readme_path: string; entry_path: string; source_path: string; test_path: string; build_path: string; dependency_manifest: string; license_path: string }
const document = JSON.parse(await readFile(path.join(root, seal.references.repository_manifest.path), "utf8")) as { repositories: Repo[] };
const tasks = document.repositories.flatMap((repo) => [
  { question_type: "purpose", prompt: `A new engineer is deciding whether to adopt ${repo.id}. Explain what the project does, its intended boundary, and the strongest local evidence for that interpretation.`, paths: [repo.readme_path] },
  { question_type: "contributor_run", prompt: `Prepare a reproducible first-day setup note for ${repo.id}. Separate documented commands from assumptions and explain how a contributor should validate the setup.`, paths: [repo.readme_path, repo.build_path] },
  { question_type: "execution_entry", prompt: `Trace where execution or the public library boundary begins in ${repo.id}. Cite the repository artifact that establishes the boundary without guessing from file names alone.`, paths: [repo.entry_path] },
  { question_type: "testing_workflow", prompt: `Describe how changes to ${repo.id} are validated locally and in automation. Distinguish a real test artifact from build or CI orchestration.`, paths: [repo.test_path, repo.build_path] },
  { question_type: "license_constraints", prompt: `An internal commercial-tool review needs the locally supported license and packaging constraints for ${repo.id}. Report only what repository metadata establishes and flag anything requiring legal review.`, paths: [repo.license_path, repo.dependency_manifest] },
  { question_type: "reading_order", prompt: `Recommend the first implementation modules a new maintainer should read in ${repo.id}, and justify the order using execution-boundary and supporting-source evidence.`, paths: [repo.entry_path, repo.source_path] },
  { question_type: "architecture", prompt: `Give a compact architecture map of ${repo.id} with repository citations. Explain how the public boundary relates to one supporting implementation area and avoid unsupported subsystem claims.`, paths: [repo.readme_path, repo.entry_path, repo.source_path] },
  { question_type: "dependencies", prompt: `Identify the major externally declared dependencies or build inputs for ${repo.id}, then explain where their interaction with project code can be inspected.`, paths: [repo.dependency_manifest, repo.source_path] }
].map((task) => ({ task_id: `g3-onboarding-${repo.id}-${task.question_type}-${sha256(`${repo.commit_sha}:${task.question_type}`).slice(0, 8)}`, repository_id: repo.id, repository_commit: repo.commit_sha, split: repo.split_role, ecosystem: repo.ecosystem, repository_role: repo.provenance, provenance: "independently authored open-ended real-repository onboarding question", ...task, required_evidence_paths: [...new Set(task.paths)] })).map(({ paths: _paths, ...task }) => task));
if (tasks.length !== 192) throw new Error(`Expected 192 onboarding rows, received ${tasks.length}`);
const body = `${JSON.stringify({ schema_version: 1, corpus_id: "dca-g3-real-repository-onboarding", classification: "POST_PRIMARY_SEAL_DEDICATED_SECONDARY_CORPUS_NOT_USED_FOR_PRIMARY_PROMOTION", repository_manifest_sha256: seal.references.repository_manifest.sha256, created_before_first_onboarding_model_call: true, repositories: document.repositories.length, tasks: tasks.length, question_types: 8, model_visible_options: 0, tasks_payload_sha256: sha256(JSON.stringify(tasks)), tasks }, null, 2)}\n`;
const target = path.join(root, "benchmarks/g3/g3_onboarding_manifest.json");
await writeFile(target, body, { flag: "wx" });
await writeFile(`${target}.sha256`, `${sha256(body)}  g3_onboarding_manifest.json\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: "PASS", target, sha256: sha256(body), repositories: document.repositories.length, tasks: tasks.length }, null, 2)}\n`);
