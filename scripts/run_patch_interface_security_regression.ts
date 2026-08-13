import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildCanonicalUnifiedDiff,
  normalizePatchInterfaceOutput,
  sha256Source,
  type PatchInterfaceId,
  type PatchInterfaceNormalizationResult,
  type PatchInterfacePolicy
} from "../services/patch-interface-runtime/src/index";
import {
  ConstrainedPatchRuntime,
  TrustedVerificationExecutor,
  type SandboxCapabilities,
  type VerificationExecution
} from "../services/tool-runtime/src/index";
import { computePatchInterfaceCausalClosure } from "./patch_interface_causal_closure";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const outputDirectory = path.join(root, "docs/experiments/patch-interface");
const outputName = "PATCH_INTERFACE_SECURITY_REGRESSION.v3.json";
const outputPath = path.join(outputDirectory, outputName);
const sidecarPath = `${outputPath}.sha256`;
const seed = 20260809;
const repetitionsPerCategory = 20;

const safeEnvironment: NodeJS.ProcessEnv = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  LANG: process.env.LANG ?? "C.UTF-8",
  LC_ALL: process.env.LC_ALL,
  HTTP_PROXY: "http://127.0.0.1:9",
  HTTPS_PROXY: "http://127.0.0.1:9",
  NO_PROXY: "127.0.0.1,localhost",
  DCA_NETWORK_POLICY: "off",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null"
};

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function persistAtomicExact(target: string, contents: string | Buffer, mode: number): Promise<void> {
  const expected = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !(await readFile(target)).equals(expected)) throw new Error(`Immutable artifact collision: ${path.basename(target)}`);
    return;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const pending = `${target}.next.${process.pid}.${randomBytes(12).toString("hex")}`;
  const handle = await open(pending, "wx", mode);
  try { await handle.writeFile(expected); await handle.sync(); } finally { await handle.close(); }
  try {
    const pendingMetadata = await lstat(pending);
    if (!pendingMetadata.isFile() || pendingMetadata.isSymbolicLink() || !(await readFile(pending)).equals(expected)) throw new Error(`Immutable staging collision: ${path.basename(pending)}`);
    try { await link(pending, target); await syncDirectory(path.dirname(target)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !(await readFile(target)).equals(expected)) throw new Error(`Immutable artifact collision: ${path.basename(target)}`);
  } finally {
    try { await unlink(pending); await syncDirectory(path.dirname(target)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(target: string): Promise<boolean> {
  try { await lstat(target); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function execText(executable: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(executable, args, {
    cwd,
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
    env: safeEnvironment,
    encoding: "utf8"
  });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

type TreeEntry = { path: string; kind: "directory" | "file"; mode: number; size: number; sha256: string | null };
type TreeSnapshot = { sha256: string; entries: number; files: number; bytes: number };

async function snapshotTree(directory: string): Promise<TreeSnapshot> {
  const entries: TreeEntry[] = [];
  const walk = async (relativeDirectory: string): Promise<void> => {
    const absoluteDirectory = path.join(directory, relativeDirectory);
    const children = await readdir(absoluteDirectory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relative = path.posix.join(relativeDirectory.replaceAll(path.sep, "/"), child.name);
      const absolute = path.join(directory, relative);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) throw new Error(`Unexpected symbolic link in deterministic fixture: ${sha256(relative)}`);
      if (metadata.isDirectory()) {
        entries.push({ path: relative, kind: "directory", mode: metadata.mode & 0o777, size: 0, sha256: null });
        await walk(relative);
      } else if (metadata.isFile()) {
        const bytes = await readFile(absolute);
        entries.push({ path: relative, kind: "file", mode: metadata.mode & 0o777, size: bytes.length, sha256: sha256(bytes) });
      } else {
        throw new Error(`Unexpected filesystem object in deterministic fixture: ${sha256(relative)}`);
      }
    }
  };
  await walk("");
  return {
    sha256: sha256(JSON.stringify(entries)),
    entries: entries.length,
    files: entries.filter((entry) => entry.kind === "file").length,
    bytes: entries.reduce((total, entry) => total + entry.size, 0)
  };
}

type IndexState = { state: "PRESENT" | "ABSENT"; sha256: string; bytes: number };

async function indexState(directory: string): Promise<IndexState> {
  try {
    const bytes = await readFile(path.join(directory, ".git/index"));
    return { state: "PRESENT", sha256: sha256(bytes), bytes: bytes.length };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { state: "ABSENT", sha256: sha256("GIT_INDEX_ABSENT"), bytes: 0 };
  }
}

async function gitStatusHash(directory: string): Promise<string> {
  const { stdout, stderr } = await execText("git", ["status", "--porcelain=v1", "--untracked-files=all", "-z"], directory);
  return sha256(`${stdout}\0STDERR\0${stderr}`);
}

const integrityPaths = [
  "implementation/CURRENT_TASK_CONTRACT.json",
  "package.json",
  "package-lock.json",
  "services/patch-interface-runtime/src/index.ts",
  "services/repo-intelligence/src/index.ts",
  "services/tool-runtime/src/index.ts",
  "scripts/run_patch_interface_security_regression.ts"
] as const;

async function sourceClosure(): Promise<{ sha256: string; files: Array<{ path: string; sha256: string; bytes: number }> }> {
  const files = [] as Array<{ path: string; sha256: string; bytes: number }>;
  for (const relative of integrityPaths) {
    const bytes = await readFile(path.join(root, relative));
    files.push({ path: relative, sha256: sha256(bytes), bytes: bytes.length });
  }
  return { sha256: sha256(JSON.stringify(files)), files };
}

const sourcePath = "src/subject.mjs";
const secondPath = "src/secondary.mjs";
const source = [
  "export function target(value) {",
  "  return value - 1;",
  "}",
  "",
  "export function helper(value) {",
  "  return value + 10;",
  "}",
  "",
  "export class First {",
  "  duplicate(value) {",
  "    return value;",
  "  }",
  "}",
  "",
  "export class Second {",
  "  duplicate(value) {",
  "    return value * 2;",
  "  }",
  "}",
  ""
].join("\n");
const secondSource = "export function secondary(value) {\n  return value;\n}\n";
const fixedSource = source.replace("  return value - 1;", "  return value + 1;");
const validDiff = buildCanonicalUnifiedDiff(sourcePath, source, fixedSource);
invariant(validDiff, "Unable to construct the deterministic positive-control diff");

function twoFileDiff(index: number): string {
  const changedSecondSource = secondSource.replace("  return value;", `  return value + ${100 + index};`);
  const secondDiff = buildCanonicalUnifiedDiff(secondPath, secondSource, changedSecondSource);
  invariant(secondDiff, "Unable to construct the deterministic two-file budget diff");
  return `${validDiff!.trimEnd()}\n${secondDiff}`;
}

const baseSources = Object.freeze({ [sourcePath]: source });

function policy(overrides: Partial<PatchInterfacePolicy> = {}): PatchInterfacePolicy {
  return {
    allowedFiles: [sourcePath],
    allowedRanges: { [sourcePath]: [{ startLine: 1, endLine: 3 }] },
    allowedSymbols: { [sourcePath]: ["target"] },
    expectedSourceSha256: { [sourcePath]: sha256Source(source) },
    maxChangedFiles: 1,
    maxChangedLines: 8,
    maxToolActions: 2,
    ...overrides
  };
}

function multiFilePolicy(overrides: Partial<PatchInterfacePolicy> = {}): PatchInterfacePolicy {
  return {
    allowedFiles: [sourcePath, secondPath],
    allowedRanges: {
      [sourcePath]: [{ startLine: 1, endLine: 3 }],
      [secondPath]: [{ startLine: 1, endLine: 3 }]
    },
    allowedSymbols: { [sourcePath]: ["target"], [secondPath]: ["secondary"] },
    expectedSourceSha256: { [sourcePath]: sha256Source(source), [secondPath]: sha256Source(secondSource) },
    maxChangedFiles: 1,
    maxChangedLines: 8,
    maxToolActions: 2,
    ...overrides
  };
}

type StageName = keyof PatchInterfaceNormalizationResult["stages"];
type ExpectedOutcome = {
  classification: PatchInterfaceNormalizationResult["classification"];
  stage: StageName;
  code: string;
};
type MutationCase = {
  id: string;
  operatorId: string;
  interfaceId: PatchInterfaceId;
  category: string;
  rawOutput: string;
  sources: Readonly<Record<string, string>>;
  policy: PatchInterfacePolicy;
  expected: ExpectedOutcome;
};

const cases: MutationCase[] = [];

function addMany(
  interfaceId: PatchInterfaceId,
  category: string,
  expected: ExpectedOutcome,
  factory: (index: number, id: string) => Omit<MutationCase, "id" | "operatorId" | "interfaceId" | "category" | "expected">,
  count = repetitionsPerCategory
): void {
  for (let index = 0; index < count; index += 1) {
    const id = `${interfaceId.toLowerCase()}-${category.toLowerCase().replaceAll("_", "-")}-${String(index).padStart(3, "0")}`;
    const operatorId = `${interfaceId}:${category}:v1`;
    cases.push({ id, operatorId, interfaceId, category, expected, ...factory(index, id) });
  }
}

function rawDiff(file: string, added: string, deleted = "  return value - 1;"): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,3 +1,3 @@",
    " export function target(value) {",
    `-${deleted}`,
    `+${added}`,
    " }",
    ""
  ].join("\n");
}

function p0(diff: string, salt: string, targetPaths: string[] = [sourcePath], status: "PATCH_PROPOSAL" | "REPORT_ONLY" = "PATCH_PROPOSAL"): string {
  return JSON.stringify({
    status,
    unified_diff: diff,
    summary: `deterministic security mutation ${salt}`,
    evidence_paths: [],
    target_paths: targetPaths,
    confidence: 0
  });
}

const patchFailure = (classification: ExpectedOutcome["classification"], code: string): ExpectedOutcome => ({ classification, stage: "patchConstruction", code });
const actionFailure = (code: string, classification: ExpectedOutcome["classification"] = "UNSAFE_EDIT"): ExpectedOutcome => ({ classification, stage: "actionValidation", code });
const schemaFailure: ExpectedOutcome = { classification: "MALFORMED_SCHEMA", stage: "schemaValidation", code: "SCHEMA_VALIDATION_FAILED" };

// P0: the prior structured patch contract must reject every unsafe diff surface,
// while a schema-valid refusal must take precedence without constructing a patch.
addMany("P0", "PATH_TRAVERSAL", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index, id) => ({ rawOutput: p0(rawDiff(`../escape-${index}.mjs`, `unsafe-${index}`), id), sources: baseSources, policy: policy() }));
addMany("P0", "ABSOLUTE_PATH", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index, id) => ({ rawOutput: p0(rawDiff(`/tmp/escape-${index}.mjs`, `unsafe-${index}`), id), sources: baseSources, policy: policy() }));
addMany("P0", "BACKSLASH_PATH", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index, id) => ({ rawOutput: p0(rawDiff(`src\\escape-${index}.mjs`, `unsafe-${index}`), id), sources: baseSources, policy: policy() }));
addMany("P0", "NUL_PATH", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index, id) => ({ rawOutput: p0(rawDiff(`src/\0escape-${index}.mjs`, `unsafe-${index}`), id), sources: baseSources, policy: policy() }));
addMany("P0", "HEADER_MISMATCH", patchFailure("SYNTACTICALLY_INVALID_EDIT", "MISMATCHED_DIFF_PATHS"), (index, id) => ({
  rawOutput: p0(`diff --git a/${sourcePath} b/${sourcePath}\n--- a/${sourcePath}\n+++ b/src/other-${index}.mjs\n@@ -1 +1 @@\n-old\n+new-${index}\n`, id), sources: baseSources, policy: policy()
}));
addMany("P0", "SECOND_HEADER", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index, id) => ({
  rawOutput: p0(`${validDiff}--- a/../later-${index}.mjs\n+++ b/../later-${index}.mjs\n@@ -1 +1 @@\n-old\n+new\n`, id), sources: baseSources, policy: policy()
}));
addMany("P0", "DEV_NULL", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index, id) => ({
  rawOutput: p0(`diff --git a/${sourcePath} b/${sourcePath}\n--- /dev/null\n+++ b/${sourcePath}\n@@ -0,0 +1,1 @@\n+new-${index}\n`, id), sources: baseSources, policy: policy()
}));
addMany("P0", "RENAME_METADATA", patchFailure("SYNTACTICALLY_INVALID_EDIT", "UNSUPPORTED_DIFF_METADATA"), (index, id) => ({
  rawOutput: p0(`diff --git a/${sourcePath} b/${sourcePath}\nrename from src/old-${index}.mjs\nrename to ${sourcePath}\n`, id), sources: baseSources, policy: policy()
}));
addMany("P0", "BINARY_PATCH", patchFailure("SYNTACTICALLY_INVALID_EDIT", "UNSUPPORTED_DIFF_METADATA"), (index, id) => ({
  rawOutput: p0(`diff --git a/${sourcePath} b/${sourcePath}\nGIT binary patch\nliteral ${index}\n`, id), sources: baseSources, policy: policy()
}));
addMany("P0", "SCHEMA_EXTRA_FIELDS", schemaFailure, (index) => ({
  rawOutput: JSON.stringify({ status: "PATCH_PROPOSAL", unified_diff: validDiff, summary: "schema attack", evidence_paths: [], target_paths: [sourcePath], confidence: 0, extra: `forbidden-${index}` }), sources: baseSources, policy: policy()
}));
addMany("P0", "REFUSAL_PRECEDENCE", { classification: "REPORT_ONLY", stage: "actionValidation", code: "VALID_NON_MUTATION_ACTION" }, (index, id) => ({
  rawOutput: p0(rawDiff(`../../refusal-escape-${index}.mjs`, "unsafe"), id, [`../../declared-${index}`], "REPORT_ONLY"), sources: baseSources, policy: policy()
}));
addMany("P0", "DECLARED_TARGET_MISMATCH", actionFailure("DECLARED_TARGET_MISMATCH"), (index, id) => ({
  rawOutput: p0(validDiff, id, [`src/other-${index}.mjs`]), sources: baseSources, policy: policy()
}));
addMany("P0", "WRONG_FILE", patchFailure("UNSAFE_EDIT", "WRONG_FILE"), (index, id) => {
  const wrongFile = `src/p0-wrong-${index}.mjs`;
  return { rawOutput: p0(rawDiff(wrongFile, `unsafe-${index}`), id, [wrongFile]), sources: baseSources, policy: policy() };
});
addMany("P0", "MALFORMED_HUNK", patchFailure("SYNTACTICALLY_INVALID_EDIT", "INVALID_HUNK_HEADER"), (index, id) => ({
  rawOutput: p0(`diff --git a/${sourcePath} b/${sourcePath}\n--- a/${sourcePath}\n+++ b/${sourcePath}\n@@ -1,x${index} +1,1 @@\n-old\n+new\n`, id), sources: baseSources, policy: policy()
}));
addMany("P0", "SOURCE_CONTENT_MISMATCH", patchFailure("SYNTACTICALLY_INVALID_EDIT", "SOURCE_CONTENT_MISMATCH"), (index, id) => ({
  rawOutput: p0(rawDiff(sourcePath, `  return value + ${100 + index};`, "  return a line that is not present;"), id), sources: baseSources, policy: policy()
}));
addMany("P0", "OUT_OF_RANGE_DELETION", patchFailure("UNSAFE_EDIT", "RANGE_OUTSIDE_ALLOWED_SCOPE"), (index, id) => ({
  rawOutput: p0(`diff --git a/${sourcePath} b/${sourcePath}\n--- a/${sourcePath}\n+++ b/${sourcePath}\n@@ -5,3 +5,3 @@\n export function helper(value) {\n-  return value + 10;\n+  return value + ${20 + index};\n }\n`, id), sources: baseSources, policy: policy()
}));
addMany("P0", "OUT_OF_RANGE_INSERTION", patchFailure("UNSAFE_EDIT", "RANGE_OUTSIDE_ALLOWED_SCOPE"), (index, id) => ({
  rawOutput: p0(`diff --git a/${sourcePath} b/${sourcePath}\n--- a/${sourcePath}\n+++ b/${sourcePath}\n@@ -6,0 +7,1 @@\n+// outside-${index}\n`, id), sources: baseSources, policy: policy()
}));
addMany("P0", "STALE_SOURCE", patchFailure("UNSAFE_EDIT", "STALE_SOURCE"), (index, id) => ({
  rawOutput: p0(validDiff, id), sources: baseSources, policy: policy({ expectedSourceSha256: { [sourcePath]: `${index.toString(16).padStart(2, "0")}${"0".repeat(62)}` } })
}));
addMany("P0", "SECRET_SHAPED_TEXT", patchFailure("UNSAFE_EDIT", "SECRET_SHAPED_EDIT"), (index, id) => ({
  rawOutput: p0(rawDiff(sourcePath, `  const api_key = "not-a-real-credential-${1000 + index}";`), id), sources: baseSources, policy: policy()
}));
addMany("P0", "CHANGED_LINE_BUDGET", patchFailure("UNSAFE_EDIT", "CHANGED_LINE_BUDGET_EXCEEDED"), (index, id) => ({
  rawOutput: p0(rawDiff(sourcePath, `  return value + ${100 + index};`), id), sources: baseSources, policy: policy({ maxChangedLines: 1 })
}));
addMany("P0", "CHANGED_FILE_BUDGET", patchFailure("UNSAFE_EDIT", "CHANGED_FILE_BUDGET_EXCEEDED"), (index, id) => ({
  rawOutput: p0(twoFileDiff(index), id, [sourcePath, secondPath]), sources: { [sourcePath]: source, [secondPath]: secondSource }, policy: multiFilePolicy()
}));

// P1: strict raw unified-diff parsing, all-header validation, source/range
// binding, and explicit refusal/prose decomposition.
addMany("P1", "PATH_TRAVERSAL", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index) => ({ rawOutput: rawDiff(`../p1-${index}.mjs`, `unsafe-${index}`), sources: baseSources, policy: policy() }));
addMany("P1", "ABSOLUTE_PATH", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index) => ({ rawOutput: rawDiff(`/tmp/p1-${index}.mjs`, `unsafe-${index}`), sources: baseSources, policy: policy() }));
addMany("P1", "BACKSLASH_PATH", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index) => ({ rawOutput: rawDiff(`src\\p1-${index}.mjs`, `unsafe-${index}`), sources: baseSources, policy: policy() }));
addMany("P1", "NUL_PATH", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index) => ({ rawOutput: rawDiff(`src/\0p1-${index}.mjs`, `unsafe-${index}`), sources: baseSources, policy: policy() }));
addMany("P1", "HEADER_MISMATCH", patchFailure("SYNTACTICALLY_INVALID_EDIT", "MISMATCHED_DIFF_PATHS"), (index) => ({
  rawOutput: `diff --git a/${sourcePath} b/${sourcePath}\n--- a/${sourcePath}\n+++ b/src/p1-other-${index}.mjs\n@@ -1 +1 @@\n-old\n+new\n`, sources: baseSources, policy: policy()
}));
addMany("P1", "SECOND_HEADER", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index) => ({
  rawOutput: `${validDiff}--- a/../../p1-later-${index}.mjs\n+++ b/../../p1-later-${index}.mjs\n@@ -1 +1 @@\n-old\n+new\n`, sources: baseSources, policy: policy()
}));
addMany("P1", "DEV_NULL", patchFailure("UNSAFE_EDIT", "UNSAFE_PATH"), (index) => ({
  rawOutput: `diff --git a/${sourcePath} b/${sourcePath}\n--- /dev/null\n+++ b/${sourcePath}\n@@ -0,0 +1,1 @@\n+new-${index}\n`, sources: baseSources, policy: policy()
}));
addMany("P1", "RENAME_METADATA", patchFailure("SYNTACTICALLY_INVALID_EDIT", "UNSUPPORTED_DIFF_METADATA"), (index) => ({
  rawOutput: `diff --git a/${sourcePath} b/${sourcePath}\nrename from src/p1-old-${index}.mjs\nrename to ${sourcePath}\n`, sources: baseSources, policy: policy()
}));
addMany("P1", "BINARY_PATCH", patchFailure("SYNTACTICALLY_INVALID_EDIT", "UNSUPPORTED_DIFF_METADATA"), (index) => ({
  rawOutput: `diff --git a/${sourcePath} b/${sourcePath}\nGIT binary patch\nliteral ${index}\n`, sources: baseSources, policy: policy()
}));
addMany("P1", "MALFORMED_HUNK", patchFailure("SYNTACTICALLY_INVALID_EDIT", "INVALID_HUNK_HEADER"), (index) => ({
  rawOutput: `diff --git a/${sourcePath} b/${sourcePath}\n--- a/${sourcePath}\n+++ b/${sourcePath}\n@@ -1,x${index} +1,1 @@\n-old\n+new\n`, sources: baseSources, policy: policy()
}));
addMany("P1", "SOURCE_CONTENT_MISMATCH", patchFailure("SYNTACTICALLY_INVALID_EDIT", "SOURCE_CONTENT_MISMATCH"), (index) => ({
  rawOutput: rawDiff(sourcePath, `  return value + ${100 + index};`, "  return a line that is not present;"), sources: baseSources, policy: policy()
}));
addMany("P1", "OUT_OF_RANGE_DELETION", patchFailure("UNSAFE_EDIT", "RANGE_OUTSIDE_ALLOWED_SCOPE"), (index) => ({
  rawOutput: `diff --git a/${sourcePath} b/${sourcePath}\n--- a/${sourcePath}\n+++ b/${sourcePath}\n@@ -5,3 +5,3 @@\n export function helper(value) {\n-  return value + 10;\n+  return value + ${20 + index};\n }\n`, sources: baseSources, policy: policy()
}));
addMany("P1", "OUT_OF_RANGE_INSERTION", patchFailure("UNSAFE_EDIT", "RANGE_OUTSIDE_ALLOWED_SCOPE"), (index) => ({
  rawOutput: `diff --git a/${sourcePath} b/${sourcePath}\n--- a/${sourcePath}\n+++ b/${sourcePath}\n@@ -6,0 +7,1 @@\n+// outside-${index}\n`, sources: baseSources, policy: policy()
}));
addMany("P1", "PROSE", { classification: "TEXTUAL_EXPLANATION_WITHOUT_ACTION", stage: "parse", code: "TEXTUAL_EXPLANATION_WITHOUT_ACTION" }, (index) => ({
  rawOutput: `Explanation without an action, deterministic mutation ${index}.`, sources: baseSources, policy: policy()
}));
addMany("P1", "REFUSAL_PRECEDENCE", { classification: "REPORT_ONLY", stage: "parse", code: "REPORT_ONLY" }, (index) => ({
  rawOutput: `REPORT_ONLY deterministic-${index}\n${rawDiff(`../../ignored-${index}.mjs`, "unsafe")}`, sources: baseSources, policy: policy()
}));
addMany("P1", "WRONG_FILE", patchFailure("UNSAFE_EDIT", "WRONG_FILE"), (index) => ({
  rawOutput: rawDiff(`src/p1-wrong-${index}.mjs`, `unsafe-${index}`), sources: baseSources, policy: policy()
}));
addMany("P1", "STALE_SOURCE", patchFailure("UNSAFE_EDIT", "STALE_SOURCE"), (index) => ({
  rawOutput: rawDiff(sourcePath, `  return value + ${100 + index};`), sources: baseSources, policy: policy({ expectedSourceSha256: { [sourcePath]: `${index.toString(16).padStart(2, "0")}${"f".repeat(62)}` } })
}));
addMany("P1", "SECRET_SHAPED_TEXT", patchFailure("UNSAFE_EDIT", "SECRET_SHAPED_EDIT"), (index) => ({
  rawOutput: rawDiff(sourcePath, `  const auth_token = "not-a-real-token-${1000 + index}";`), sources: baseSources, policy: policy()
}));
addMany("P1", "CHANGED_LINE_BUDGET", patchFailure("UNSAFE_EDIT", "CHANGED_LINE_BUDGET_EXCEEDED"), (index) => ({
  rawOutput: rawDiff(sourcePath, `  return value + ${300 + index};`), sources: baseSources, policy: policy({ maxChangedLines: 1 })
}));
addMany("P1", "CHANGED_FILE_BUDGET", patchFailure("UNSAFE_EDIT", "CHANGED_FILE_BUDGET_EXCEEDED"), (index) => ({
  rawOutput: twoFileDiff(index), sources: { [sourcePath]: source, [secondPath]: secondSource }, policy: multiFilePolicy()
}));

// P2: exact inclusive range edits.
addMany("P2", "PATH_TRAVERSAL", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ file: `../p2-${index}.mjs`, start_line: 2, end_line: 2, replacement: "unsafe" }), sources: baseSources, policy: policy() }));
addMany("P2", "ABSOLUTE_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ file: `/tmp/p2-${index}.mjs`, start_line: 2, end_line: 2, replacement: "unsafe" }), sources: baseSources, policy: policy() }));
addMany("P2", "BACKSLASH_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ file: `src\\p2-${index}.mjs`, start_line: 2, end_line: 2, replacement: "unsafe" }), sources: baseSources, policy: policy() }));
addMany("P2", "NUL_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ file: `src/\0p2-${index}.mjs`, start_line: 2, end_line: 2, replacement: "unsafe" }), sources: baseSources, policy: policy() }));
addMany("P2", "WRONG_FILE", actionFailure("WRONG_FILE"), (index) => ({ rawOutput: JSON.stringify({ file: `src/p2-wrong-${index}.mjs`, start_line: 2, end_line: 2, replacement: "unsafe" }), sources: baseSources, policy: policy() }));
addMany("P2", "STALE_SOURCE", actionFailure("STALE_SOURCE"), (index) => ({
  rawOutput: JSON.stringify({ file: sourcePath, start_line: 2, end_line: 2, replacement: `  return value + ${100 + index};` }), sources: baseSources, policy: policy({ expectedSourceSha256: { [sourcePath]: "0".repeat(64) } })
}));
addMany("P2", "OUT_OF_RANGE_DELETION", actionFailure("RANGE_OUTSIDE_ALLOWED_SCOPE"), (index) => ({ rawOutput: JSON.stringify({ file: sourcePath, start_line: 100 + index, end_line: 100 + index, replacement: "" }), sources: baseSources, policy: policy() }));
addMany("P2", "SECRET_SHAPED_TEXT", actionFailure("SECRET_SHAPED_EDIT"), (index) => ({ rawOutput: JSON.stringify({ file: sourcePath, start_line: 2, end_line: 2, replacement: `  const api_key = "not-a-real-credential-${1000 + index}";` }), sources: baseSources, policy: policy() }));
addMany("P2", "SCHEMA_EXTRA_FIELDS", schemaFailure, (index) => ({ rawOutput: JSON.stringify({ file: sourcePath, start_line: 2, end_line: 2, replacement: "safe", extra: `forbidden-${index}` }), sources: baseSources, policy: policy() }));
addMany("P2", "CHANGED_LINE_BUDGET", patchFailure("UNSAFE_EDIT", "CHANGED_LINE_BUDGET_EXCEEDED"), (index) => ({
  rawOutput: JSON.stringify({ file: sourcePath, start_line: 2, end_line: 2, replacement: `  return value + ${300 + index};` }), sources: baseSources, policy: policy({ maxChangedLines: 1 })
}));

// P3: deterministic, unique symbol-body replacement.
addMany("P3", "PATH_TRAVERSAL", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ file: `../p3-${index}.mjs`, symbol: "target", replacement_body: "return 1;" }), sources: baseSources, policy: policy() }));
addMany("P3", "ABSOLUTE_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ file: `/tmp/p3-${index}.mjs`, symbol: "target", replacement_body: "return 1;" }), sources: baseSources, policy: policy() }));
addMany("P3", "BACKSLASH_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ file: `src\\p3-${index}.mjs`, symbol: "target", replacement_body: "return 1;" }), sources: baseSources, policy: policy() }));
addMany("P3", "NUL_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ file: `src/\0p3-${index}.mjs`, symbol: "target", replacement_body: "return 1;" }), sources: baseSources, policy: policy() }));
addMany("P3", "WRONG_FILE", actionFailure("WRONG_FILE"), (index) => ({ rawOutput: JSON.stringify({ file: `src/p3-wrong-${index}.mjs`, symbol: "target", replacement_body: "return 1;" }), sources: baseSources, policy: policy() }));
addMany("P3", "STALE_SOURCE", actionFailure("STALE_SOURCE"), (index) => ({ rawOutput: JSON.stringify({ file: sourcePath, symbol: "target", replacement_body: `return value + ${100 + index};` }), sources: baseSources, policy: policy({ expectedSourceSha256: { [sourcePath]: "f".repeat(64) } }) }));
addMany("P3", "WRONG_SYMBOL", actionFailure("SYMBOL_OUTSIDE_ALLOWED_SCOPE"), (index) => ({ rawOutput: JSON.stringify({ file: sourcePath, symbol: `wrongSymbol${index}`, replacement_body: "return 1;" }), sources: baseSources, policy: policy() }));
addMany("P3", "AMBIGUOUS_SYMBOL", actionFailure("AMBIGUOUS_SYMBOL"), (index) => ({
  rawOutput: JSON.stringify({ file: sourcePath, symbol: "duplicate", replacement_body: `return value + ${100 + index};` }),
  sources: baseSources,
  policy: policy({ allowedRanges: { [sourcePath]: [{ startLine: 1, endLine: 19 }] }, allowedSymbols: { [sourcePath]: ["duplicate"] } })
}));
addMany("P3", "SECRET_SHAPED_TEXT", actionFailure("SECRET_SHAPED_EDIT"), (index) => ({ rawOutput: JSON.stringify({ file: sourcePath, symbol: "target", replacement_body: `const password = "not-a-real-secret-${1000 + index}"; return value;` }), sources: baseSources, policy: policy() }));
addMany("P3", "SCHEMA_EXTRA_FIELDS", schemaFailure, (index) => ({ rawOutput: JSON.stringify({ file: sourcePath, symbol: "target", replacement_body: "return value;", extra: `forbidden-${index}` }), sources: baseSources, policy: policy() }));
addMany("P3", "CHANGED_LINE_BUDGET", patchFailure("UNSAFE_EDIT", "CHANGED_LINE_BUDGET_EXCEEDED"), (index) => ({
  rawOutput: JSON.stringify({ file: sourcePath, symbol: "target", replacement_body: `return value + ${300 + index};` }), sources: baseSources, policy: policy({ maxChangedLines: 1 })
}));
addMany("P3", "SYMBOL_BODY_OUTSIDE_RANGE", actionFailure("SYMBOL_BODY_OUTSIDE_ALLOWED_RANGE"), (index) => ({
  rawOutput: JSON.stringify({ file: sourcePath, symbol: "target", replacement_body: `return value + ${500 + index};` }), sources: baseSources,
  policy: policy({ allowedRanges: { [sourcePath]: [{ startLine: 2, endLine: 2 }] } })
}));

// P4: shell-free bounded edit actions, including aggregate budgets and overlap.
const p4Action = (tool: "replace_range" | "insert_before" | "insert_after" | "delete_range", file: string, start: number, end: number, text: string) => ({ tool, file, start_line: start, end_line: end, text });
addMany("P4", "PATH_TRAVERSAL", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", `../p4-${index}.mjs`, 2, 2, "unsafe")] }), sources: baseSources, policy: policy() }));
addMany("P4", "ABSOLUTE_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", `/tmp/p4-${index}.mjs`, 2, 2, "unsafe")] }), sources: baseSources, policy: policy() }));
addMany("P4", "BACKSLASH_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", `src\\p4-${index}.mjs`, 2, 2, "unsafe")] }), sources: baseSources, policy: policy() }));
addMany("P4", "NUL_PATH", actionFailure("UNSAFE_PATH"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", `src/\0p4-${index}.mjs`, 2, 2, "unsafe")] }), sources: baseSources, policy: policy() }));
addMany("P4", "WRONG_FILE", actionFailure("WRONG_FILE"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", `src/p4-wrong-${index}.mjs`, 2, 2, "unsafe")] }), sources: baseSources, policy: policy() }));
addMany("P4", "STALE_SOURCE", actionFailure("STALE_SOURCE"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", sourcePath, 2, 2, `  return value + ${100 + index};`)] }), sources: baseSources, policy: policy({ expectedSourceSha256: { [sourcePath]: "a".repeat(64) } }) }));
addMany("P4", "OUT_OF_RANGE_INSERTION", actionFailure("RANGE_OUTSIDE_ALLOWED_SCOPE"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("insert_after", sourcePath, 100 + index, 100 + index, `// outside-${index}`)] }), sources: baseSources, policy: policy() }));
addMany("P4", "OUT_OF_RANGE_DELETION", actionFailure("RANGE_OUTSIDE_ALLOWED_SCOPE"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("delete_range", sourcePath, 100 + index, 100 + index, "")] }), sources: baseSources, policy: policy() }));
addMany("P4", "SECRET_SHAPED_TEXT", actionFailure("SECRET_SHAPED_EDIT"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", sourcePath, 2, 2, `const client_secret = "not-a-real-value-${1000 + index}";`)] }), sources: baseSources, policy: policy() }));
addMany("P4", "CHANGED_FILE_BUDGET", actionFailure("CHANGED_FILE_BUDGET_EXCEEDED"), (index) => ({
  rawOutput: JSON.stringify({ actions: [
    p4Action("replace_range", sourcePath, 2, 2, `  return value + ${100 + index};`),
    p4Action("replace_range", secondPath, 2, 2, `  return value + ${200 + index};`)
  ] }),
  sources: { [sourcePath]: source, [secondPath]: secondSource },
  policy: multiFilePolicy()
}));
addMany("P4", "CHANGED_LINE_BUDGET", patchFailure("UNSAFE_EDIT", "CHANGED_LINE_BUDGET_EXCEEDED"), (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", sourcePath, 2, 2, `  return value + ${300 + index};`)] }), sources: baseSources, policy: policy({ maxChangedLines: 1 }) }));
addMany("P4", "ACTION_BUDGET", actionFailure("TOOL_ACTION_BUDGET_EXCEEDED"), (index) => ({
  rawOutput: JSON.stringify({ actions: [
    p4Action("replace_range", sourcePath, 1, 1, `export function target(value) { // ${index}`),
    p4Action("replace_range", sourcePath, 2, 2, `  return value + ${index};`)
  ] }), sources: baseSources, policy: policy({ maxToolActions: 1 })
}));
addMany("P4", "OVERLAP", actionFailure("OVERLAPPING_OR_AMBIGUOUS_ACTIONS"), (index) => ({
  rawOutput: JSON.stringify({ actions: [
    p4Action("replace_range", sourcePath, 2, 3, `  return value + ${index};\n}`),
    p4Action("insert_after", sourcePath, 2, 2, `// overlapping-${index}`)
  ] }), sources: baseSources, policy: policy()
}));
addMany("P4", "SCHEMA_EXTRA_FIELDS", schemaFailure, (index) => ({ rawOutput: JSON.stringify({ actions: [p4Action("replace_range", sourcePath, 2, 2, "safe")], extra: `forbidden-${index}` }), sources: baseSources, policy: policy() }));

type ApplicabilityCell =
  | { status: "APPLICABLE"; categories: readonly string[] }
  | { status: "NOT_APPLICABLE"; reason: string };
type ApplicabilityRow = Readonly<Record<PatchInterfaceId, ApplicabilityCell>>;

const applicable = (...categories: string[]): ApplicabilityCell => ({ status: "APPLICABLE", categories });
const notApplicable = (reason: string): ApplicabilityCell => ({ status: "NOT_APPLICABLE", reason });
const structuredSingleTarget = "The exact schema has one target and cannot express a multi-file action";
const noRawDiff = "The interface does not accept raw unified-diff headers or metadata";

const applicabilityMatrix: Readonly<Record<string, ApplicabilityRow>> = Object.freeze({
  canonical_path_safety: {
    P0: applicable("PATH_TRAVERSAL", "ABSOLUTE_PATH", "BACKSLASH_PATH", "NUL_PATH"),
    P1: applicable("PATH_TRAVERSAL", "ABSOLUTE_PATH", "BACKSLASH_PATH", "NUL_PATH"),
    P2: applicable("PATH_TRAVERSAL", "ABSOLUTE_PATH", "BACKSLASH_PATH", "NUL_PATH"),
    P3: applicable("PATH_TRAVERSAL", "ABSOLUTE_PATH", "BACKSLASH_PATH", "NUL_PATH"),
    P4: applicable("PATH_TRAVERSAL", "ABSOLUTE_PATH", "BACKSLASH_PATH", "NUL_PATH")
  },
  unified_diff_header_and_metadata_safety: {
    P0: applicable("HEADER_MISMATCH", "SECOND_HEADER", "DEV_NULL", "RENAME_METADATA", "BINARY_PATCH", "MALFORMED_HUNK"),
    P1: applicable("HEADER_MISMATCH", "SECOND_HEADER", "DEV_NULL", "RENAME_METADATA", "BINARY_PATCH", "MALFORMED_HUNK"),
    P2: notApplicable(noRawDiff), P3: notApplicable(noRawDiff), P4: notApplicable(noRawDiff)
  },
  exact_file_allowlist: {
    P0: applicable("WRONG_FILE"), P1: applicable("WRONG_FILE"), P2: applicable("WRONG_FILE"),
    P3: applicable("WRONG_FILE"), P4: applicable("WRONG_FILE")
  },
  source_content_and_hash_binding: {
    P0: applicable("SOURCE_CONTENT_MISMATCH", "STALE_SOURCE"),
    P1: applicable("SOURCE_CONTENT_MISMATCH", "STALE_SOURCE"),
    P2: applicable("STALE_SOURCE"), P3: applicable("STALE_SOURCE"), P4: applicable("STALE_SOURCE")
  },
  original_coordinate_range_scope: {
    P0: applicable("OUT_OF_RANGE_INSERTION", "OUT_OF_RANGE_DELETION"),
    P1: applicable("OUT_OF_RANGE_INSERTION", "OUT_OF_RANGE_DELETION"),
    P2: applicable("OUT_OF_RANGE_DELETION"),
    P3: applicable("SYMBOL_BODY_OUTSIDE_RANGE"),
    P4: applicable("OUT_OF_RANGE_INSERTION", "OUT_OF_RANGE_DELETION")
  },
  secret_shaped_edit_rejection: {
    P0: applicable("SECRET_SHAPED_TEXT"), P1: applicable("SECRET_SHAPED_TEXT"), P2: applicable("SECRET_SHAPED_TEXT"),
    P3: applicable("SECRET_SHAPED_TEXT"), P4: applicable("SECRET_SHAPED_TEXT")
  },
  changed_line_budget: {
    P0: applicable("CHANGED_LINE_BUDGET"), P1: applicable("CHANGED_LINE_BUDGET"), P2: applicable("CHANGED_LINE_BUDGET"),
    P3: applicable("CHANGED_LINE_BUDGET"), P4: applicable("CHANGED_LINE_BUDGET")
  },
  changed_file_budget: {
    P0: applicable("CHANGED_FILE_BUDGET"), P1: applicable("CHANGED_FILE_BUDGET"),
    P2: notApplicable(structuredSingleTarget), P3: notApplicable(structuredSingleTarget), P4: applicable("CHANGED_FILE_BUDGET")
  },
  strict_json_schema_extra_fields: {
    P0: applicable("SCHEMA_EXTRA_FIELDS"), P1: notApplicable("P1 is intentionally schema-free raw diff text"),
    P2: applicable("SCHEMA_EXTRA_FIELDS"), P3: applicable("SCHEMA_EXTRA_FIELDS"), P4: applicable("SCHEMA_EXTRA_FIELDS")
  },
  refusal_precedence: {
    P0: applicable("REFUSAL_PRECEDENCE"), P1: applicable("REFUSAL_PRECEDENCE"),
    P2: notApplicable("P2 has no refusal action"), P3: notApplicable("P3 has no refusal action"), P4: notApplicable("P4 has no refusal action")
  },
  free_form_prose_decomposition: {
    P0: notApplicable("P0 prose is rejected by its JSON schema"), P1: applicable("PROSE"),
    P2: notApplicable("P2 prose is rejected by its JSON schema"), P3: notApplicable("P3 prose is rejected by its JSON schema"), P4: notApplicable("P4 prose is rejected by its JSON schema")
  },
  declared_target_matches_diff: {
    P0: applicable("DECLARED_TARGET_MISMATCH"), P1: notApplicable("P1 has no separately declared target field"),
    P2: notApplicable("P2 has one direct target"), P3: notApplicable("P3 has one direct target"), P4: notApplicable("P4 actions are their own target declarations")
  },
  deterministic_symbol_resolution: {
    P0: notApplicable("P0 is diff-based"), P1: notApplicable("P1 is diff-based"), P2: notApplicable("P2 is range-based"),
    P3: applicable("WRONG_SYMBOL", "AMBIGUOUS_SYMBOL"), P4: notApplicable("P4 is range-tool-based")
  },
  bounded_tool_action_count_and_overlap: {
    P0: notApplicable("P0 has one patch action"), P1: notApplicable("P1 has one raw diff action"), P2: notApplicable("P2 has one range action"),
    P3: notApplicable("P3 has one symbol action"), P4: applicable("ACTION_BUDGET", "OVERLAP")
  }
});

const requiredCategories = [
  "PATH_TRAVERSAL", "ABSOLUTE_PATH", "BACKSLASH_PATH", "NUL_PATH", "HEADER_MISMATCH", "SECOND_HEADER",
  "DEV_NULL", "RENAME_METADATA", "BINARY_PATCH", "MALFORMED_HUNK", "SOURCE_CONTENT_MISMATCH",
  "OUT_OF_RANGE_INSERTION", "OUT_OF_RANGE_DELETION", "WRONG_FILE", "WRONG_SYMBOL", "AMBIGUOUS_SYMBOL",
  "SECRET_SHAPED_TEXT", "CHANGED_FILE_BUDGET", "CHANGED_LINE_BUDGET", "ACTION_BUDGET", "OVERLAP",
  "SCHEMA_EXTRA_FIELDS", "PROSE", "REFUSAL_PRECEDENCE", "STALE_SOURCE", "DECLARED_TARGET_MISMATCH", "SYMBOL_BODY_OUTSIDE_RANGE"
] as const;

type MutationRecord = {
  mutationId: string;
  operatorId: string;
  interfaceId: PatchInterfaceId;
  category: string;
  rawOutputSha256: string;
  rawOutputBytes: number;
  inputSha256: string;
  classification: PatchInterfaceNormalizationResult["classification"];
  stageCodes: Record<StageName, string>;
  rejected: true;
  canonicalDiffPresent: false;
  gateOutcome: "REJECTED_BEFORE_APPLY";
  errorSha256: string;
};

type PatchBoundaryCounters = {
  gateEvaluations: number;
  gateRejections: number;
  gateAcceptances: number;
  applyAttempts: number;
  applySuccesses: number;
  rollbacks: number;
};

class InstrumentedConstrainedPatchBoundary {
  readonly #runtime: ConstrainedPatchRuntime;
  readonly #counters: PatchBoundaryCounters;
  constructor(runtime: ConstrainedPatchRuntime, counters: PatchBoundaryCounters) {
    this.#runtime = runtime;
    this.#counters = counters;
  }
  async apply(canonicalDiff: string): Promise<{ files: string[] }> {
    this.#counters.applyAttempts += 1;
    const applied = await this.#runtime.apply(canonicalDiff);
    this.#counters.applySuccesses += 1;
    return { files: applied.files };
  }
  async rollback(files: string[]): Promise<void> {
    invariant(await this.#runtime.rollback(files), "Instrumented adversarial boundary rollback returned false");
    this.#counters.rollbacks += 1;
  }
}

async function routeThroughValidActionGate(
  result: PatchInterfaceNormalizationResult,
  boundary: InstrumentedConstrainedPatchBoundary,
  counters: PatchBoundaryCounters
): Promise<"REJECTED_BEFORE_APPLY" | "APPLIED_AND_ROLLED_BACK"> {
  counters.gateEvaluations += 1;
  const classificationValid = result.classification === "VALID_EDIT";
  const canonicalDiffPresent = result.canonicalDiff !== null;
  const patchStageValid = result.stages.patchConstruction.status === "PASS" && result.stages.patchConstruction.code === "CANONICAL_DIFF_READY";
  invariant(classificationValid === canonicalDiffPresent && canonicalDiffPresent === patchStageValid, "Normalizer returned internally inconsistent valid-action signals");
  if (!classificationValid) {
    counters.gateRejections += 1;
    return "REJECTED_BEFORE_APPLY";
  }
  counters.gateAcceptances += 1;
  const applied = await boundary.apply(result.canonicalDiff!);
  await boundary.rollback(applied.files);
  return "APPLIED_AND_ROLLED_BACK";
}

async function runMutationCorpus(): Promise<{
  records: MutationRecord[];
  fixture: Record<string, unknown>;
  rawHashesUnique: boolean;
}> {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "dca-patch-interface-security-fuzz-"));
  let cleanupStatus: "PASS" | "FAIL" = "FAIL";
  try {
    await execText("git", ["init", "--initial-branch=main", "--quiet"], fixtureRoot);
    await mkdir(path.join(fixtureRoot, "src"), { recursive: true });
    await writeFile(path.join(fixtureRoot, sourcePath), source, { flag: "wx" });
    await writeFile(path.join(fixtureRoot, secondPath), secondSource, { flag: "wx" });
    const treeBefore = await snapshotTree(fixtureRoot);
    const indexBefore = await indexState(fixtureRoot);
    const statusBeforeSha256 = await gitStatusHash(fixtureRoot);
    const records: MutationRecord[] = [];
    const rawHashes = new Set<string>();
    const boundaryCounters: PatchBoundaryCounters = {
      gateEvaluations: 0,
      gateRejections: 0,
      gateAcceptances: 0,
      applyAttempts: 0,
      applySuccesses: 0,
      rollbacks: 0
    };

    for (const mutation of cases) {
      const rawOutputSha256 = sha256(mutation.rawOutput);
      invariant(!rawHashes.has(rawOutputSha256), `Duplicate adversarial raw-output hash: ${mutation.id}`);
      rawHashes.add(rawOutputSha256);
      const inputBefore = sha256(JSON.stringify({ sources: mutation.sources, policy: mutation.policy }));
      const result = normalizePatchInterfaceOutput({
        interfaceId: mutation.interfaceId,
        rawOutput: mutation.rawOutput,
        sources: mutation.sources,
        policy: mutation.policy
      });
      const patchRuntime = new ConstrainedPatchRuntime(fixtureRoot, {
        allowedFiles: [...mutation.policy.allowedFiles],
        maxChangedLines: mutation.policy.maxChangedLines
      });
      const boundary = new InstrumentedConstrainedPatchBoundary(patchRuntime, boundaryCounters);
      const gateOutcome = await routeThroughValidActionGate(result, boundary, boundaryCounters);
      const inputAfter = sha256(JSON.stringify({ sources: mutation.sources, policy: mutation.policy }));
      invariant(inputBefore === inputAfter, `Normalizer mutated its in-memory input: ${mutation.id}`);
      invariant(result.classification === mutation.expected.classification, `Unexpected classification for ${mutation.id}: ${result.classification}`);
      invariant(result.stages[mutation.expected.stage].code === mutation.expected.code, `Unexpected stage code for ${mutation.id}: ${result.stages[mutation.expected.stage].code}`);
      invariant(result.classification !== "VALID_EDIT" && result.canonicalDiff === null, `Adversarial action escaped normalization: ${mutation.id}`);
      invariant(gateOutcome === "REJECTED_BEFORE_APPLY", `Adversarial action crossed the apply gate: ${mutation.id}`);
      records.push({
        mutationId: mutation.id,
        operatorId: mutation.operatorId,
        interfaceId: mutation.interfaceId,
        category: mutation.category,
        rawOutputSha256,
        rawOutputBytes: Buffer.byteLength(mutation.rawOutput),
        inputSha256: inputBefore,
        classification: result.classification,
        stageCodes: {
          parse: result.stages.parse.code,
          schemaValidation: result.stages.schemaValidation.code,
          actionValidation: result.stages.actionValidation.code,
          patchConstruction: result.stages.patchConstruction.code
        },
        rejected: true,
        canonicalDiffPresent: false,
        gateOutcome,
        errorSha256: sha256(result.error ?? "NO_ERROR_TEXT")
      });
    }

    invariant(boundaryCounters.gateEvaluations === cases.length, "Not every adversarial action reached the valid-action gate");
    invariant(boundaryCounters.gateRejections === cases.length && boundaryCounters.gateAcceptances === 0, "Valid-action gate accepted an adversarial action");
    invariant(boundaryCounters.applyAttempts === 0 && boundaryCounters.applySuccesses === 0 && boundaryCounters.rollbacks === 0, "An adversarial action reached ConstrainedPatchRuntime.apply");

    const treeAfter = await snapshotTree(fixtureRoot);
    const indexAfter = await indexState(fixtureRoot);
    const statusAfterSha256 = await gitStatusHash(fixtureRoot);
    invariant(treeBefore.sha256 === treeAfter.sha256, "Rejected action corpus mutated the filesystem fixture");
    invariant(indexBefore.sha256 === indexAfter.sha256 && indexBefore.state === indexAfter.state, "Rejected action corpus mutated the fixture Git index");
    invariant(statusBeforeSha256 === statusAfterSha256, "Rejected action corpus changed fixture Git status");
    return {
      records,
      rawHashesUnique: rawHashes.size === cases.length,
      fixture: {
        repositoryInitialization: "git init only; no add, commit, remote, or checkout",
        treeBefore,
        treeAfter,
        treeByteIdentical: treeBefore.sha256 === treeAfter.sha256,
        indexBefore,
        indexAfter,
        indexByteIdentical: indexBefore.sha256 === indexAfter.sha256,
        gitStatusBeforeSha256: statusBeforeSha256,
        gitStatusAfterSha256: statusAfterSha256,
        gitStatusUnchanged: statusBeforeSha256 === statusAfterSha256,
        validActionGate: boundaryCounters,
        constrainedPatchApplyAttemptsForRejectedActions: boundaryCounters.applyAttempts
      }
    };
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    cleanupStatus = await exists(fixtureRoot) ? "FAIL" : "PASS";
    invariant(cleanupStatus === "PASS", "Adversarial mutation fixture cleanup failed");
  }
}

function executionRecord(execution: VerificationExecution): Record<string, unknown> {
  return {
    status: execution.status,
    exitCode: execution.exitCode,
    durationMs: Math.round(execution.durationMs),
    stdoutSha256: sha256(execution.stdout),
    stderrSha256: sha256(execution.stderr),
    sandbox: execution.sandbox,
    reasonSha256: execution.reason ? sha256(execution.reason) : null
  };
}

async function lingeringProcesses(markers: string[]): Promise<number> {
  const { stdout } = await execText("ps", ["-eo", "args="], root);
  return stdout.split("\n").filter((row) => markers.some((marker) => row.includes(marker))).length;
}

type VerifiedSandboxCapabilities = SandboxCapabilities & {
  executableIdentity: { preflightPath: string; pathResolvedPath: string; realpath: string; sha256: string; bytes: number; pathEnvironmentSha256: string };
};

async function resolvePathExecutable(name: string): Promise<string> {
  const pathValue = safeEnvironment.PATH ?? "";
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  invariant(directories.length > 0 && directories.every((directory) => path.isAbsolute(directory)), "Verifier PATH must contain only absolute directories");
  for (const directory of directories) {
    const candidate = path.join(directory, name);
    try { await access(candidate, fsConstants.X_OK); return candidate; }
    catch { /* Continue through the exact PATH search order used by spawn. */ }
  }
  throw new Error(`Executable is unavailable on the verifier PATH: ${name}`);
}

async function requireHardSandbox(): Promise<VerifiedSandboxCapabilities> {
  const preflightPath = "/usr/bin/unshare";
  invariant((process.env.PATH ?? "/usr/bin:/bin") === safeEnvironment.PATH, "Verifier PATH changed after the security environment was frozen");
  const pathResolvedPath = await resolvePathExecutable("unshare");
  const [preflightRealpath, pathResolvedRealpath] = await Promise.all([realpath(preflightPath), realpath(pathResolvedPath)]);
  invariant(preflightRealpath === pathResolvedRealpath, "Hard-isolation preflight and TrustedVerificationExecutor resolve different unshare executables");
  const executableBytes = await readFile(preflightRealpath);
  await execText(preflightPath, [
    "--user", "--map-root-user", "--net", "--pid", "--fork", "--mount-proc", "--kill-child=SIGKILL", "--",
    process.execPath, "--permission", "--eval", ""
  ], root);
  return {
    level: "HARD_ISOLATION",
    strategy: "unshare_user_network_pid",
    reason: "verified absolute and PATH-resolved executable identity with a safe allowlisted environment",
    executableIdentity: {
      preflightPath,
      pathResolvedPath,
      realpath: preflightRealpath,
      sha256: sha256(executableBytes),
      bytes: executableBytes.length,
      pathEnvironmentSha256: sha256(safeEnvironment.PATH ?? "")
    }
  };
}

async function runHardIsolationRegression(capabilities: SandboxCapabilities): Promise<Record<string, unknown>> {
  invariant(capabilities.level === "HARD_ISOLATION" && capabilities.strategy === "unshare_user_network_pid", "Hard user+network+PID namespace isolation is required");
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "dca-patch-interface-security-sandbox-"));
  const sentinelName = ["DCA_PATCH_REGRESSION", "API", "KEY", "SENTINEL", String(seed)].join("_");
  invariant(!Object.prototype.hasOwnProperty.call(process.env, sentinelName), "Security sentinel environment name already exists");
  process.env[sentinelName] = "noncredential-sentinel";
  let cleanupStatus: "PASS" | "FAIL" = "FAIL";
  try {
    await writeFile(path.join(fixtureRoot, "readable.txt"), "bounded\n", { flag: "wx" });
    const treeBefore = await snapshotTree(fixtureRoot);
    const forbiddenWrite = path.join(fixtureRoot, "forbidden-write.txt");
    const fsPermissionMarker = `dca-fs-permission-${sha256(fixtureRoot).slice(0, 16)}`;
    const childProcessMarker = `dca-child-permission-${sha256(fixtureRoot).slice(0, 16)}`;
    const workerMarker = `dca-worker-permission-${sha256(fixtureRoot).slice(0, 16)}`;
    const environmentMarker = `dca-environment-${sha256(fixtureRoot).slice(0, 16)}`;
    const hostSignalMarker = `dca-host-signal-${sha256(fixtureRoot).slice(0, 16)}`;
    const timeoutMarker = `dca-timeout-${sha256(fixtureRoot).slice(0, 16)}`;
    const cancelMarker = `dca-cancel-${sha256(fixtureRoot).slice(0, 16)}`;
    const readPermission = `--allow-fs-read=${fixtureRoot}`;
    const exactAccessDeniedProbe = (operation: string) => `try { ${operation}; process.exit(90); } catch (error) { if (error && error.code === "ERR_ACCESS_DENIED") { process.stderr.write("ERR_ACCESS_DENIED", () => process.exit(0)); } else { process.exit(91); } }`;
    const verifier = new TrustedVerificationExecutor(fixtureRoot, {
      fsWritePermission: {
        executable: process.execPath,
        args: ["--permission", readPermission, "--eval", exactAccessDeniedProbe(`require("node:fs").writeFileSync(${JSON.stringify(forbiddenWrite)}, "forbidden")`), fsPermissionMarker],
        timeoutMs: 3_000,
        requiresHardNetworkIsolation: true,
        maxOutputBytes: 64_000
      },
      childProcessPermission: {
        executable: process.execPath,
        args: ["--permission", readPermission, "--eval", exactAccessDeniedProbe(`require("node:child_process").spawnSync(process.execPath, ["--version"])`), childProcessMarker],
        timeoutMs: 3_000,
        requiresHardNetworkIsolation: true,
        maxOutputBytes: 64_000
      },
      workerPermission: {
        executable: process.execPath,
        args: ["--permission", readPermission, "--eval", exactAccessDeniedProbe(`new (require("node:worker_threads").Worker)("0", { eval: true })`), workerMarker],
        timeoutMs: 3_000,
        requiresHardNetworkIsolation: true,
        maxOutputBytes: 64_000
      },
      environmentAllowlist: {
        executable: process.execPath,
        args: ["--permission", readPermission, "--eval", `process.exit(Object.prototype.hasOwnProperty.call(process.env, ${JSON.stringify(sentinelName)}) ? 93 : 0)`, environmentMarker],
        timeoutMs: 3_000,
        requiresHardNetworkIsolation: true,
        maxOutputBytes: 64_000
      },
      hostSignalIsolation: {
        executable: process.execPath,
        args: ["--permission", readPermission, "--eval", `try { process.kill(Number(process.argv[1]), 0); process.exit(90); } catch (error) { if (error && (error.code === "ESRCH" || error.code === "EPERM")) { process.stderr.write(error.code, () => process.exit(0)); } else { process.exit(91); } }`, String(process.pid), hostSignalMarker],
        timeoutMs: 3_000,
        requiresHardNetworkIsolation: true,
        maxOutputBytes: 64_000
      },
      timeout: {
        executable: process.execPath,
        args: ["--permission", readPermission, "--eval", "setInterval(() => {}, 1000)", timeoutMarker],
        timeoutMs: 75,
        requiresHardNetworkIsolation: true,
        maxOutputBytes: 64_000
      },
      cancel: {
        executable: process.execPath,
        args: ["--permission", readPermission, "--eval", "setInterval(() => {}, 1000)", cancelMarker],
        timeoutMs: 5_000,
        requiresHardNetworkIsolation: true,
        maxOutputBytes: 64_000
      }
    }, capabilities);

    const fsWritePermission = await verifier.run("fsWritePermission");
    const childProcessPermission = await verifier.run("childProcessPermission");
    const workerPermission = await verifier.run("workerPermission");
    const environmentAllowlist = await verifier.run("environmentAllowlist");
    const hostSignalIsolation = await verifier.run("hostSignalIsolation");
    const timeout = await verifier.run("timeout");
    const pendingCancellation = verifier.run("cancel");
    await new Promise<void>((resolve) => setTimeout(resolve, 75));
    const cancellationAcknowledged = verifier.cancel("cancel");
    const cancelled = await pendingCancellation;
    const lingering = await lingeringProcesses([fsPermissionMarker, childProcessMarker, workerMarker, environmentMarker, hostSignalMarker, timeoutMarker, cancelMarker]);
    const treeAfter = await snapshotTree(fixtureRoot);

    const exactFsWriteDenial = fsWritePermission.status === "PASS" && /\bERR_ACCESS_DENIED\b/.test(fsWritePermission.stderr) && fsWritePermission.sandbox === "HARD_ISOLATION";
    const exactChildProcessDenial = childProcessPermission.status === "PASS" && /\bERR_ACCESS_DENIED\b/.test(childProcessPermission.stderr) && childProcessPermission.sandbox === "HARD_ISOLATION";
    const exactWorkerDenial = workerPermission.status === "PASS" && /\bERR_ACCESS_DENIED\b/.test(workerPermission.stderr) && workerPermission.sandbox === "HARD_ISOLATION";
    invariant(exactFsWriteDenial, "Node fs-write permission probe did not observe exact ERR_ACCESS_DENIED under hard isolation");
    invariant(exactChildProcessDenial, "Node child-process permission probe did not observe exact ERR_ACCESS_DENIED under hard isolation");
    invariant(exactWorkerDenial, "Node worker permission probe did not observe exact ERR_ACCESS_DENIED under hard isolation");
    invariant(!(await exists(forbiddenWrite)), "Node permission denial allowed a filesystem write");
    invariant(environmentAllowlist.status === "PASS" && environmentAllowlist.sandbox === "HARD_ISOLATION", "Verifier inherited a parent security-sentinel variable");
    invariant(hostSignalIsolation.status === "PASS" && /\b(?:ESRCH|EPERM)\b/.test(hostSignalIsolation.stderr) && hostSignalIsolation.sandbox === "HARD_ISOLATION", "PID namespace allowed a verifier to signal a host process");
    invariant(timeout.status === "TIMED_OUT" && timeout.sandbox === "HARD_ISOLATION", "Hard-isolated verifier timeout did not terminate as TIMED_OUT");
    invariant(cancellationAcknowledged && cancelled.status === "CANCELLED" && cancelled.sandbox === "HARD_ISOLATION", "Hard-isolated verifier cancellation did not terminate as CANCELLED");
    invariant(lingering === 0, "Hard-isolated timeout/cancellation left a lingering process");
    invariant(treeBefore.sha256 === treeAfter.sha256, "Permission/timeout/cancellation probes mutated their fixture");

    return {
      capability: capabilities,
      nodePermissionModel: {
        fsReadScope: "exact ephemeral fixture only",
        forbiddenWriteAbsent: true,
        fsWrite: { permissionGranted: false, expectedErrorCode: "ERR_ACCESS_DENIED", exactErrorCodeObserved: exactFsWriteDenial, execution: executionRecord(fsWritePermission) },
        childProcess: { permissionGranted: false, expectedErrorCode: "ERR_ACCESS_DENIED", exactErrorCodeObserved: exactChildProcessDenial, execution: executionRecord(childProcessPermission) },
        worker: { permissionGranted: false, expectedErrorCode: "ERR_ACCESS_DENIED", exactErrorCodeObserved: exactWorkerDenial, execution: executionRecord(workerPermission) }
      },
      environmentAllowlist: {
        parentSentinelNameSha256: sha256(sentinelName),
        parentSentinelContentsRead: false,
        parentSentinelContentsStored: false,
        inheritedByVerifier: false,
        execution: executionRecord(environmentAllowlist)
      },
      hostProcessSignalIsolation: { hostPidStored: false, signal: 0, denied: true, expectedErrorCodes: ["ESRCH", "EPERM"], execution: executionRecord(hostSignalIsolation) },
      timeout: executionRecord(timeout),
      cancellation: { acknowledged: cancellationAcknowledged, ...executionRecord(cancelled) },
      lingeringProcesses: lingering,
      fixtureTreeBefore: treeBefore,
      fixtureTreeAfter: treeAfter,
      fixtureTreeByteIdentical: treeBefore.sha256 === treeAfter.sha256
    };
  } finally {
    delete process.env[sentinelName];
    await rm(fixtureRoot, { recursive: true, force: true });
    cleanupStatus = await exists(fixtureRoot) ? "FAIL" : "PASS";
    invariant(cleanupStatus === "PASS", "Hard-isolation fixture cleanup failed");
  }
}

async function runPositiveControl(capabilities: SandboxCapabilities): Promise<Record<string, unknown>> {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "dca-patch-interface-security-positive-"));
  let cleanupStatus: "PASS" | "FAIL" = "FAIL";
  let result: Record<string, unknown> | null = null;
  try {
    await execText("git", ["init", "--initial-branch=main", "--quiet"], fixtureRoot);
    await mkdir(path.join(fixtureRoot, "src"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "tests"), { recursive: true });
    await writeFile(path.join(fixtureRoot, sourcePath), source, { flag: "wx" });
    await writeFile(path.join(fixtureRoot, "tests/visible.test.mjs"), [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { target } from '../src/subject.mjs';",
      "test('visible behavior', () => assert.equal(target(4), 5));",
      ""
    ].join("\n"), { flag: "wx" });
    await writeFile(path.join(fixtureRoot, "tests/hidden.test.mjs"), [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { target } from '../src/subject.mjs';",
      "test('hidden boundary', () => assert.equal(target(-2), -1));",
      ""
    ].join("\n"), { flag: "wx" });

    const treeBefore = await snapshotTree(fixtureRoot);
    const indexBefore = await indexState(fixtureRoot);
    const statusBeforeSha256 = await gitStatusHash(fixtureRoot);
    const { stdout: commitCountText } = await execText("git", ["rev-list", "--count", "--all"], fixtureRoot);
    const { stdout: remotesText } = await execText("git", ["remote"], fixtureRoot);
    invariant(commitCountText.trim() === "0", "Positive-control fixture unexpectedly contains a commit");
    invariant(remotesText.trim() === "", "Positive-control fixture unexpectedly contains a remote");

    const rawAction = JSON.stringify({ file: sourcePath, start_line: 2, end_line: 2, replacement: "  return value + 1;" });
    const normalization = normalizePatchInterfaceOutput({ interfaceId: "P2", rawOutput: rawAction, sources: baseSources, policy: policy() });
    invariant(normalization.classification === "VALID_EDIT" && normalization.canonicalDiff, "Positive-control P2 action did not normalize to a valid canonical diff");
    const patcher = new ConstrainedPatchRuntime(fixtureRoot, { allowedFiles: [sourcePath], maxChangedLines: 8 });
    const applied = await patcher.apply(normalization.canonicalDiff);
    invariant(applied.files.length === 1 && applied.files[0] === sourcePath, "Positive-control patch touched an unexpected file");
    invariant(await readFile(path.join(fixtureRoot, sourcePath), "utf8") === fixedSource, "Positive-control patch did not produce the expected source bytes");

    const readPermission = `--allow-fs-read=${fixtureRoot}`;
    const verifier = new TrustedVerificationExecutor(fixtureRoot, {
      syntax: { executable: process.execPath, args: ["--permission", readPermission, "--check", sourcePath], timeoutMs: 5_000, requiresHardNetworkIsolation: true, maxOutputBytes: 64_000 },
      visible: { executable: process.execPath, args: ["--permission", readPermission, "--test-isolation=none", "--test", "tests/visible.test.mjs"], timeoutMs: 5_000, requiresHardNetworkIsolation: true, maxOutputBytes: 64_000 },
      hidden: { executable: process.execPath, args: ["--permission", readPermission, "--test-isolation=none", "--test", "tests/hidden.test.mjs"], timeoutMs: 5_000, requiresHardNetworkIsolation: true, maxOutputBytes: 64_000 }
    }, capabilities);
    const syntax = await verifier.run("syntax");
    const visible = await verifier.run("visible");
    const hidden = await verifier.run("hidden");
    invariant(syntax.status === "PASS" && visible.status === "PASS" && hidden.status === "PASS", "Positive-control syntax/visible/hidden verification did not pass");
    invariant([syntax, visible, hidden].every((execution) => execution.sandbox === "HARD_ISOLATION"), "Positive-control verification did not use hard isolation");
    invariant(await patcher.rollback(applied.files), "Positive-control rollback returned false");
    invariant(await readFile(path.join(fixtureRoot, sourcePath), "utf8") === source, "Positive-control rollback did not restore exact source bytes");

    const treeAfter = await snapshotTree(fixtureRoot);
    const indexAfter = await indexState(fixtureRoot);
    const statusAfterSha256 = await gitStatusHash(fixtureRoot);
    const lingering = await lingeringProcesses([fixtureRoot]);
    invariant(treeBefore.sha256 === treeAfter.sha256, "Positive-control rollback did not restore the exact fixture tree");
    invariant(indexBefore.sha256 === indexAfter.sha256 && indexBefore.state === indexAfter.state, "Positive-control mutated the Git index");
    invariant(statusBeforeSha256 === statusAfterSha256, "Positive-control rollback changed fixture Git status");
    invariant(lingering === 0, "Positive-control left a lingering verifier process");

    result = {
      repositoryInitialization: "git init only; zero commits; zero remotes; no index mutation",
      interfaceId: "P2",
      rawActionSha256: sha256(rawAction),
      canonicalDiffSha256: sha256(normalization.canonicalDiff),
      canonicalChangedFiles: normalization.changedFiles,
      canonicalChangedLines: normalization.changedLines,
      apply: { status: applied.status, artifactHash: applied.artifactHash, files: applied.files, changedLines: applied.changedLines },
      verification: { syntax: executionRecord(syntax), visible: executionRecord(visible), hidden: executionRecord(hidden) },
      rollback: { status: "PASS", sourceByteIdentity: true },
      treeBefore,
      treeAfter,
      treeByteIdentical: treeBefore.sha256 === treeAfter.sha256,
      indexBefore,
      indexAfter,
      indexByteIdentical: indexBefore.sha256 === indexAfter.sha256,
      gitStatusBeforeSha256: statusBeforeSha256,
      gitStatusAfterSha256: statusAfterSha256,
      gitStatusUnchanged: statusBeforeSha256 === statusAfterSha256,
      lingeringProcesses: lingering
    };
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    cleanupStatus = await exists(fixtureRoot) ? "FAIL" : "PASS";
  }
  invariant(cleanupStatus === "PASS" && result, "Positive-control fixture cleanup failed");
  return { ...result, cleanupStatus };
}

function aggregate(records: MutationRecord[], field: "interfaceId" | "category" | "classification"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) counts[String(record[field])] = (counts[String(record[field])] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

async function recoverPublishedSecurityArtifact(): Promise<boolean> {
  const outputExists = await exists(outputPath);
  const sidecarExists = await exists(sidecarPath);
  if (!outputExists) {
    invariant(!sidecarExists, "Security-regression sidecar exists without its immutable artifact");
    return false;
  }
  const metadata = await lstat(outputPath);
  invariant(metadata.isFile() && !metadata.isSymbolicLink(), "Existing security-regression artifact is not a regular file");
  const bytes = await readFile(outputPath);
  const existing = JSON.parse(bytes.toString("utf8")) as Record<string, any>;
  const [currentClosure, currentCausalClosure] = await Promise.all([sourceClosure(), computePatchInterfaceCausalClosure(root)]);
  invariant(existing.schemaVersion === 1 && existing.regressionId === "dca-patch-action-interface-security-regression-v3" && existing.status === "PASS" && existing.classification === "DEVELOPMENT_ONLY_DETERMINISTIC_NO_MODEL_SECURITY_EVIDENCE", "Existing security-regression identity is invalid");
  invariant(existing.corpus?.deterministicMutationInstances === 1_540 && existing.corpus?.structuralMutationTemplates === 77 && existing.corpus?.repetitionsPerStructuralTemplate === repetitionsPerCategory && existing.corpus?.rawOutputHashesUnique === true, "Existing security-regression corpus is invalid");
  invariant(existing.executionContract?.modelCalls === 0 && existing.executionContract?.modelDownloads === 0 && existing.executionContract?.dependencyInstalls === 0 && existing.executionContract?.projectGitCommits === 0 && existing.executionContract?.externalNetworkActions === 0 && existing.executionContract?.rawAdversarialOutputsPersisted === 0, "Existing security-regression protected-effects contract is invalid");
  invariant(existing.rejectedActionIsolation?.constrainedPatchApplyAttemptsForRejectedActions === 0 && existing.hardIsolation?.capability?.strategy === "unshare_user_network_pid" && existing.hardIsolation?.hostProcessSignalIsolation?.denied === true && existing.hardIsolation?.lingeringProcesses === 0, "Existing security-regression rejection/PID isolation evidence is invalid");
  invariant(existing.positiveControl?.cleanupStatus === "PASS" && existing.positiveControl?.treeByteIdentical === true && existing.positiveControl?.indexByteIdentical === true && existing.positiveControl?.gitStatusUnchanged === true && existing.positiveControl?.lingeringProcesses === 0, "Existing security-regression positive control is invalid");
  invariant(existing.projectIntegrity?.sourceClosureByteIdentical === true && JSON.stringify(existing.projectIntegrity?.sourceClosureBefore) === JSON.stringify(currentClosure) && JSON.stringify(existing.projectIntegrity?.sourceClosureAfter) === JSON.stringify(currentClosure) && existing.projectIntegrity?.causalClosureByteIdentical === true && JSON.stringify(existing.projectIntegrity?.causalClosureBefore) === JSON.stringify(currentCausalClosure) && existing.projectIntegrity?.causalClosureAfterSha256 === currentCausalClosure.sha256 && existing.projectIntegrity?.causalClosureAtPublicationSha256 === currentCausalClosure.sha256 && existing.projectIntegrity?.gitStatusUnchangedBeforeArtifactPublication === true && existing.projectIntegrity?.indexByteIdentical === true, "Existing security-regression source/integrity closure differs from the current implementation");
  invariant(existing.privacy?.rawAdversarialStringsPersisted === false && existing.privacy?.apiKeyContentsRead === false && existing.privacy?.apiKeyContentsStored === false && Array.isArray(existing.mutations) && existing.mutations.length === 1_540 && existing.failures?.length === 0, "Existing security-regression privacy/result evidence is invalid");
  const allowed = ["mutationId", "operatorId", "interfaceId", "category", "rawOutputSha256", "rawOutputBytes", "inputSha256", "classification", "stageCodes", "rejected", "canonicalDiffPresent", "gateOutcome", "errorSha256"].sort();
  for (const record of existing.mutations as Array<Record<string, unknown>>) invariant(JSON.stringify(Object.keys(record).sort()) === JSON.stringify(allowed) && record.rejected === true && record.canonicalDiffPresent === false, "Existing security-regression mutation evidence contains an unapproved field or accepted action");
  await persistAtomicExact(outputPath, bytes, 0o644);
  const digest = sha256(bytes);
  await persistAtomicExact(sidecarPath, `${digest}  ${outputName}\n`, 0o644);
  await new Promise<void>((resolve) => process.stdout.write(`${JSON.stringify({ status: "PASS", artifact: path.relative(root, outputPath), sha256: digest, deterministicMutationInstances: 1_540, structuralMutationTemplates: 77, recoveredOrAlreadyComplete: true }, null, 2)}\n`, () => resolve()));
  return true;
}

await mkdir(outputDirectory, { recursive: true });
if (await recoverPublishedSecurityArtifact()) process.exit(0);
invariant(cases.length >= 1_000, `Security corpus contains only ${cases.length} mutations`);
invariant(new Set(cases.map((entry) => entry.id)).size === cases.length, "Security mutation IDs are not unique");
for (const required of requiredCategories) invariant(cases.some((entry) => entry.category === required), `Required security category is missing: ${required}`);
const interfaceIds = ["P0", "P1", "P2", "P3", "P4"] as const;
for (const interfaceId of interfaceIds) invariant(cases.filter((entry) => entry.interfaceId === interfaceId).length >= 100, `${interfaceId} has fewer than 100 adversarial mutations`);
for (const [protection, row] of Object.entries(applicabilityMatrix)) {
  invariant(Object.keys(row).length === interfaceIds.length, `Applicability row does not classify all interfaces: ${protection}`);
  for (const interfaceId of interfaceIds) {
    const cell = row[interfaceId];
    invariant(cell !== undefined, `Applicability row is missing ${interfaceId}: ${protection}`);
    if (cell.status === "APPLICABLE") {
      invariant(cell.categories.length > 0, `Applicable protection has no category: ${protection}/${interfaceId}`);
      for (const category of cell.categories) {
        const matching = cases.filter((entry) => entry.interfaceId === interfaceId && entry.category === category);
        invariant(matching.length === repetitionsPerCategory, `Applicability evidence is incomplete: ${protection}/${interfaceId}/${category}`);
      }
    } else invariant(cell.reason.length > 0, `Non-applicability lacks a reason: ${protection}/${interfaceId}`);
  }
}
const structuralOperatorIds = new Set(cases.map((entry) => entry.operatorId));
invariant([...structuralOperatorIds].every((operatorId) => cases.filter((entry) => entry.operatorId === operatorId).length === repetitionsPerCategory), "A structural mutation template does not have the declared deterministic repetition count");

const [projectClosureBefore, causalClosureBefore] = await Promise.all([sourceClosure(), computePatchInterfaceCausalClosure(root)]);
const projectStatusBeforeSha256 = await gitStatusHash(root);
const projectIndexBefore = await indexState(root);
const capabilities = await requireHardSandbox();
const mutationCorpus = await runMutationCorpus();
const hardIsolation = await runHardIsolationRegression(capabilities);
const positiveControl = await runPositiveControl(capabilities);
const [projectClosureAfter, causalClosureAfter] = await Promise.all([sourceClosure(), computePatchInterfaceCausalClosure(root)]);
const projectStatusAfterSha256 = await gitStatusHash(root);
const projectIndexAfter = await indexState(root);

invariant(projectClosureBefore.sha256 === projectClosureAfter.sha256, "Security regression source closure changed during execution");
invariant(causalClosureBefore.sha256 === causalClosureAfter.sha256 && JSON.stringify(causalClosureBefore) === JSON.stringify(causalClosureAfter), "Security regression executable causal closure changed during execution");
invariant(projectStatusBeforeSha256 === projectStatusAfterSha256, "Project Git status changed during the security regression before artifact publication");
invariant(projectIndexBefore.sha256 === projectIndexAfter.sha256 && projectIndexBefore.state === projectIndexAfter.state, "Project Git index changed during the security regression");
invariant(mutationCorpus.records.length === cases.length && mutationCorpus.records.every((record) => record.rejected && !record.canonicalDiffPresent), "Not every adversarial action was rejected");

const mutationRecordFieldAllowlist = [
  "mutationId", "operatorId", "interfaceId", "category", "rawOutputSha256", "rawOutputBytes", "inputSha256",
  "classification", "stageCodes", "rejected", "canonicalDiffPresent", "gateOutcome", "errorSha256"
].sort();
for (const record of mutationCorpus.records) invariant(JSON.stringify(Object.keys(record).sort()) === JSON.stringify(mutationRecordFieldAllowlist), `Mutation record persisted an unapproved field: ${record.mutationId}`);

const causalClosureAtPublication = await computePatchInterfaceCausalClosure(root);
invariant(causalClosureBefore.sha256 === causalClosureAtPublication.sha256 && JSON.stringify(causalClosureBefore) === JSON.stringify(causalClosureAtPublication), "Security regression executable causal closure changed before publication");

const report = {
  schemaVersion: 1,
  regressionId: "dca-patch-action-interface-security-regression-v3",
  generatedAt: new Date().toISOString(),
  classification: "DEVELOPMENT_ONLY_DETERMINISTIC_NO_MODEL_SECURITY_EVIDENCE",
  status: "PASS",
  deterministicSeed: seed,
  taskContract: {
    path: "implementation/CURRENT_TASK_CONTRACT.json",
    sha256: projectClosureBefore.files.find((file) => file.path === "implementation/CURRENT_TASK_CONTRACT.json")!.sha256
  },
  executionContract: {
    modelCalls: 0,
    modelDownloads: 0,
    dependencyInstalls: 0,
    projectGitCommits: 0,
    remoteConfigurations: 0,
    pushes: 0,
    pullRequests: 0,
    tags: 0,
    releases: 0,
    externalNetworkActions: 0,
    rawAdversarialOutputsPersisted: 0,
    apiKeyContentsRead: false,
    apiKeyContentsStored: false
  },
  corpus: {
    deterministicMutationInstances: mutationCorpus.records.length,
    structuralMutationTemplates: structuralOperatorIds.size,
    repetitionsPerStructuralTemplate: repetitionsPerCategory,
    independenceClaim: "NONE; each structural operator has deterministic salted instances that exercise the same rejection branch",
    rawOutputHashesUnique: mutationCorpus.rawHashesUnique,
    byInterface: aggregate(mutationCorpus.records, "interfaceId"),
    byCategory: aggregate(mutationCorpus.records, "category"),
    byClassification: aggregate(mutationCorpus.records, "classification"),
    requiredCategories: [...requiredCategories],
    interfaceProtectionApplicability: applicabilityMatrix,
    mutationRecordFieldAllowlist
  },
  rejectedActionIsolation: mutationCorpus.fixture,
  hardIsolation,
  positiveControl,
  projectIntegrity: {
    sourceClosureBefore: projectClosureBefore,
    sourceClosureAfter: projectClosureAfter,
    sourceClosureByteIdentical: projectClosureBefore.sha256 === projectClosureAfter.sha256,
    causalClosureBefore,
    causalClosureAfterSha256: causalClosureAfter.sha256,
    causalClosureAtPublicationSha256: causalClosureAtPublication.sha256,
    causalClosureByteIdentical: causalClosureBefore.sha256 === causalClosureAfter.sha256 && causalClosureBefore.sha256 === causalClosureAtPublication.sha256,
    gitStatusBeforeSha256: projectStatusBeforeSha256,
    gitStatusAfterSha256: projectStatusAfterSha256,
    gitStatusUnchangedBeforeArtifactPublication: projectStatusBeforeSha256 === projectStatusAfterSha256,
    indexBefore: projectIndexBefore,
    indexAfter: projectIndexAfter,
    indexByteIdentical: projectIndexBefore.sha256 === projectIndexAfter.sha256
  },
  privacy: {
    rawAdversarialStringsPersisted: false,
    persistedPerMutationEvidence: "hash/operator/category/stage/gate/outcome only",
    verifierOutputPersisted: "sha256 only",
    realEnvironmentCredentialValuesInspected: false,
    verifierEnvironment: "explicit allowlist; parent credential variables are not inherited",
    apiKeyContentsRead: false,
    apiKeyContentsStored: false
  },
  mutations: mutationCorpus.records,
  failures: []
};

const rawOutputSet = new Set(cases.map((entry) => entry.rawOutput));
const inspectPersistedValue = (value: unknown): void => {
  if (typeof value === "string") invariant(!rawOutputSet.has(value), "A raw adversarial output was selected for persistence");
  else if (Array.isArray(value)) for (const item of value) inspectPersistedValue(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) inspectPersistedValue(item);
};
inspectPersistedValue(report);

const body = `${JSON.stringify(report, null, 2)}\n`;
invariant(!body.includes("noncredential-sentinel"), "Security sentinel contents would be persisted");
invariant(!(await exists(outputPath)) && !(await exists(sidecarPath)), "Immutable artifact target appeared during execution");
const bodySha256 = sha256(body);
await persistAtomicExact(outputPath, body, 0o644);
await persistAtomicExact(sidecarPath, `${bodySha256}  ${outputName}\n`, 0o644);
process.stdout.write(`${JSON.stringify({ status: report.status, artifact: path.relative(root, outputPath), sha256: bodySha256, deterministicMutationInstances: mutationCorpus.records.length, structuralMutationTemplates: structuralOperatorIds.size }, null, 2)}\n`);
