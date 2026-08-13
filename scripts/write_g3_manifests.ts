import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildG3Artifacts, buildG3Corpus } from "../services/g3-benchmark-runtime/src/index";

const root = path.resolve(process.cwd());
const corpusRoot = path.join(root, ".runtime/g3-repositories");
const outputRoot = path.join(root, "benchmarks/g3");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const preregistrationPath = path.join(outputRoot, "G3_PREREGISTRATION.json");
const authoringRevision = process.argv.includes("--authoring-revision=2") ? 2 : 1;
const preregistrationBytes = await readFile(preregistrationPath);
const preregistrationSha256 = sha256(preregistrationBytes);
const expectedPreregistrationSha256 = (await readFile(`${preregistrationPath}.sha256`, "utf8")).trim().split(/\s+/)[0];
if (preregistrationSha256 !== expectedPreregistrationSha256) throw new Error("G3 preregistration checksum mismatch");

const corpus = await buildG3Corpus(corpusRoot);
const artifacts = buildG3Artifacts(corpus.repositories, corpus.tasks, preregistrationSha256);
if (artifacts.taskManifest.integrity.status !== "PASS") throw new Error(`G3 artifact validation failed: ${artifacts.taskManifest.integrity.errors.join("; ")}`);
const outputs: Array<readonly [string, object]> = authoringRevision === 1 ? [
  ["g3_repository_manifest.json", artifacts.repositoryManifest],
  ["g3_task_manifest.json", artifacts.taskManifest],
  ["g3_oracle.sealed.json", artifacts.oracle]
] : [
  ["g3_task_manifest.v2.json", { ...artifacts.taskManifest, authoring_revision: 2, supersedes: "g3_task_manifest.json" }],
  ["g3_oracle.v2.sealed.json", { ...artifacts.oracle, authoring_revision: 2, supersedes: "g3_oracle.sealed.json" }]
];
await mkdir(outputRoot, { recursive: true });
const written: Array<{ path: string; sha256: string }> = [];
for (const [name, value] of outputs) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(outputRoot, name), body, { flag: "wx" });
  const hash = sha256(body);
  await writeFile(path.join(outputRoot, `${name}.sha256`), `${hash}  ${name}\n`, { flag: "wx" });
  written.push({ path: path.relative(root, path.join(outputRoot, name)), sha256: hash });
}
process.stdout.write(`${JSON.stringify({ status: "PASS", authoringRevision, preregistrationSha256, integrity: artifacts.taskManifest.integrity, repositories: artifacts.repositoryManifest.integrity, written }, null, 2)}\n`);
