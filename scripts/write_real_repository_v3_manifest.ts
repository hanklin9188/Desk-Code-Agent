import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const corpusRoot = path.join(root, ".runtime/retrieval-v3-repositories");
const output = path.join(root, "benchmarks/retrieval-v3/real_repository_development_manifest.json");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const configs = [
  { id: "cobra", source: "https://github.com/spf13/cobra", license: "Apache-2.0", licensePath: "LICENSE.txt", language: "Go", kind: "CLI library", buildSystem: "Go modules + Make", testFramework: "go test", readme: "README.md", build: "go.mod", entry: "cobra.go", test: "cobra_test.go" },
  { id: "express-cors", source: "https://github.com/expressjs/cors", license: "MIT", licensePath: "LICENSE", language: "JavaScript", kind: "web middleware library", buildSystem: "npm", testFramework: "Mocha", readme: "README.md", build: "package.json", entry: "lib/index.js", test: "test/test.js" },
  { id: "httpx", source: "https://github.com/encode/httpx", license: "BSD-3-Clause", licensePath: "LICENSE.md", language: "Python", kind: "HTTP client library", buildSystem: "Hatch/pyproject", testFramework: "pytest", readme: "README.md", build: "pyproject.toml", entry: "httpx/__init__.py", test: "tests/client/test_client.py" },
  { id: "itsdangerous", source: "https://github.com/pallets/itsdangerous", license: "BSD-3-Clause", licensePath: "LICENSE.txt", language: "Python", kind: "security utility library", buildSystem: "flit/pyproject", testFramework: "pytest", readme: "README.md", build: "pyproject.toml", entry: "src/itsdangerous/__init__.py", test: "tests/test_itsdangerous/test_serializer.py" },
  { id: "markupsafe", source: "https://github.com/pallets/markupsafe", license: "BSD-3-Clause", licensePath: "LICENSE.txt", language: "Python/C", kind: "text safety library", buildSystem: "setuptools/pyproject", testFramework: "pytest", readme: "README.md", build: "pyproject.toml", entry: "src/markupsafe/__init__.py", test: "tests/test_markupsafe.py" },
  { id: "p-map", source: "https://github.com/sindresorhus/p-map", license: "MIT", licensePath: "license", language: "JavaScript", kind: "async library", buildSystem: "npm", testFramework: "AVA + tsd", readme: "readme.md", build: "package.json", entry: "index.js", test: "test.js" },
  { id: "pocketbase", source: "https://github.com/pocketbase/pocketbase", license: "MIT", licensePath: "LICENSE.md", language: "Go + JavaScript", kind: "web backend application", buildSystem: "Go modules + Make + npm UI", testFramework: "go test", readme: "README.md", build: "go.mod", entry: "pocketbase.go", test: "apis/base_test.go" },
  { id: "pypa-build", source: "https://github.com/pypa/build", license: "MIT", licensePath: "LICENSE", language: "Python", kind: "packaging CLI", buildSystem: "Flit/pyproject", testFramework: "pytest", readme: "README.md", build: "pyproject.toml", entry: "src/build/__main__.py", test: "tests/test_projectbuilder.py" },
  { id: "react-redux-realworld", source: "https://github.com/gothinkster/react-redux-realworld-example-app", license: "MIT", licensePath: "LICENSE.md", language: "JavaScript/React", kind: "web application", buildSystem: "npm/react-scripts", testFramework: "react-scripts (no repository test files)", readme: "README.md", build: "package.json", entry: "src/index.js", test: null },
  { id: "ripgrep", source: "https://github.com/BurntSushi/ripgrep", license: "MIT OR Unlicense", licensePath: "COPYING", language: "Rust", kind: "CLI application", buildSystem: "Cargo", testFramework: "cargo test", readme: "README.md", build: "Cargo.toml", entry: "crates/core/main.rs", test: "tests/binary.rs" },
  { id: "typer", source: "https://github.com/fastapi/typer", license: "MIT", licensePath: "LICENSE", language: "Python", kind: "CLI library", buildSystem: "Hatch/uv/pyproject", testFramework: "pytest", readme: "README.md", build: "pyproject.toml", entry: "typer/main.py", test: "tests/test_cli/test_help.py" },
  { id: "yocto-queue", source: "https://github.com/sindresorhus/yocto-queue", license: "MIT", licensePath: "license", language: "JavaScript", kind: "data structure library", buildSystem: "npm", testFramework: "AVA", readme: "readme.md", build: "package.json", entry: "index.js", test: "test.js" }
] as const;

const answerOrder = ["A", "B", "C"] as const;
const repositories: Record<string, unknown>[] = [];
for (const [index, config] of configs.entries()) {
  const repoRoot = path.join(corpusRoot, config.id);
  const requiredPaths = [config.licensePath, config.readme, config.build, config.entry, ...(config.test ? [config.test] : [])];
  for (const relative of requiredPaths) await readFile(path.join(repoRoot, relative));
  const [{ stdout: commit }, { stdout: tree }, { stdout: commitDate }, { stdout: status }, { stdout: files }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }), execFileAsync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repoRoot }), execFileAsync("git", ["log", "-1", "--format=%cI"], { cwd: repoRoot }), execFileAsync("git", ["status", "--porcelain"], { cwd: repoRoot }), execFileAsync("git", ["ls-files"], { cwd: repoRoot, maxBuffer: 4_000_000 })
  ]);
  if (status.trim()) throw new Error(`${config.id} is not clean`);
  const tracked = files.trim().split(/\r?\n/).filter(Boolean);
  let bytes = 0;
  for (const relative of tracked) {
    const entry = await lstat(path.join(repoRoot, relative));
    if (!entry.isDirectory()) bytes += entry.size;
  }
  const options = (correct: string, wrongOne: string, wrongTwo: string, offset: number) => {
    const expected = answerOrder[(index + offset) % 3];
    const values = expected === "A" ? [correct, wrongOne, wrongTwo] : expected === "B" ? [wrongOne, correct, wrongTwo] : [wrongOne, wrongTwo, correct];
    return { expected, options: { A: values[0], B: values[1], C: values[2] } };
  };
  const license = options(config.licensePath, config.readme, config.entry, 0);
  const onboarding = options(`${config.readme} + ${config.build}`, `${config.licensePath} + ${config.entry}`, `${config.entry} + ${config.readme}`, 1);
  const architecture = options(config.entry, config.readme, config.build, 2);
  const verification = config.test ? options(`${config.test} + ${config.build}`, `${config.entry} + ${config.readme}`, `${config.licensePath} + ${config.test}`, 3) : options(`${config.entry} + ${config.build}`, `${config.readme} + ${config.licensePath}`, `${config.build} + ${config.readme}`, 3);
  repositories.push({
    ...config, commit: commit.trim(), tree: tree.trim(), commitDate: commitDate.trim(), fileCount: tracked.length, bytes, mutationAllowed: false,
    tasks: [
      { id: `real-v3-${config.id}-license`, evidenceRequirement: "METADATA", requestedEvidenceClasses: ["METADATA"], taskCategory: "Analysis", difficulty: "L2", question: "Which canonical license metadata file is authoritative for this pinned repository?", requiredEvidenceSet: [config.licensePath], ...license },
      { id: `real-v3-${config.id}-onboarding`, evidenceRequirement: "MIXED", requestedEvidenceClasses: ["DOCUMENTATION", "BUILD"], taskCategory: "Analysis", difficulty: "L3", question: "How do I install and run this repository? Combine the current README documentation with the canonical build manifest.", requiredEvidenceSet: [config.readme, config.build], ...onboarding },
      { id: `real-v3-${config.id}-architecture`, evidenceRequirement: "ARCHITECTURE", requestedEvidenceClasses: ["ARCHITECTURE"], taskCategory: "Navigation", difficulty: "L2", question: "Which high-centrality entry point provides the primary implementation surface for this repository?", requiredEvidenceSet: [config.entry], ...architecture },
      { id: `real-v3-${config.id}-verification`, evidenceRequirement: config.test ? "MIXED" : "ARCHITECTURE", requestedEvidenceClasses: config.test ? ["TEST", "BUILD"] : ["ARCHITECTURE", "BUILD"], taskCategory: "Coding", difficulty: "L3", question: config.test ? "Which representative test file and build manifest provide source-test verification evidence?" : "Which entry point and build manifest define the executable verification surface when no repository test file is present?", requiredEvidenceSet: config.test ? [config.test, config.build] : [config.entry, config.build], ...verification }
    ]
  });
}
const manifest = { schemaVersion: 1, corpusId: "dca-real-repositories-retrieval-v3-development-g1", classification: "PINNED_PUBLIC_READ_ONLY_DEVELOPMENT_CORPUS_NOT_HOLDOUT", acquiredAt: new Date().toISOString(), networkAction: "read-only shallow filtered clone; no external or project-remote write", priorFourRepositoriesExcluded: ["p-limit", "click", "full-stack-fastapi-template", "sampleproject"], repositories, summary: { repositories: repositories.length, tasks: repositories.length * 4, floatingHeadUsed: false, publicRepositoryMutation: false, ecosystems: ["Python", "JavaScript/TypeScript", "Go", "Rust", "React web", "web backend", "CLI", "library"] } };
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(output, serialized);
await writeFile(`${output}.sha256`, `${sha256(serialized)}  ${path.basename(output)}\n`);
process.stdout.write(`${JSON.stringify({ status: "PASS", output: path.relative(root, output), sha256: sha256(serialized), ...manifest.summary }, null, 2)}\n`);
