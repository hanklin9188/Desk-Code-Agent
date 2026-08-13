// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  CodebaseIndex, EvidenceStore, WorkspaceManager, packageContext,
  type StoredEvidence
} from "../services/repo-intelligence/src/index";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixtureRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dca-repo-")); roots.push(root);
  await mkdir(path.join(root, "src")); await mkdir(path.join(root, "tests"));
  await writeFile(path.join(root, "src", "math.ts"), "export function add(a: number, b: number) { return a + b; }\n");
  await writeFile(path.join(root, "src", "ignored.ts"), "export function shouldNeverBeIndexed() {}\n");
  await writeFile(path.join(root, "tests", "math.test.ts"), "import { add } from '../src/math';\nexport const mathResult = add(1, 2);\ntest('add', () => expect(mathResult).toBe(3));\n");
  await writeFile(path.join(root, ".gitignore"), "src/ignored.ts\n");
  await exec("git", ["init", "-b", "main"], { cwd: root });
  await exec("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root });
  await exec("git", ["config", "user.name", "Fixture"], { cwd: root });
  await exec("git", ["add", "."], { cwd: root }); await exec("git", ["commit", "-m", "fixture"], { cwd: root });
  return root;
}

describe("workspace acquisition and codebase map", () => {
  it("creates an isolated worktree pinned to the immutable baseline", async () => {
    const repo = await fixtureRepo();
    const worktrees = await mkdtemp(path.join(os.tmpdir(), "dca-worktrees-")); roots.push(worktrees);
    const manager = new WorkspaceManager({ allowedRoots: [repo, worktrees] });
    const manifest = await manager.acquireLocal({ locator: repo, taskId: "task-001", worktreeRoot: worktrees, mutation: true });
    expect(manifest.baselineSha).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.workspacePath).not.toBe(repo);
    expect(manifest.branch).toBe("desk-agent/task-001");
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: manifest.workspacePath });
    expect(stdout.trim()).toBe(manifest.baselineSha);
  });

  it("indexes Tree-sitter symbols, imports and source-test affinity", async () => {
    const repo = await fixtureRepo();
    const index = new CodebaseIndex(repo, ":memory:");
    const manifest = await index.build("fixture-sha");
    expect(manifest.parserLanguages).toContain("typescript");
    expect(index.findDefinition("add")[0]).toMatchObject({ path: "src/math.ts", kind: "function" });
    expect(index.findDefinition("mathResult")[0]).toMatchObject({ path: "tests/math.test.ts", kind: "variable" });
    expect(index.findTests("src/math.ts").map((item) => item.path)).toContain("tests/math.test.ts");
    expect(index.findReferences("add").some((item) => item.path.includes("math.test.ts"))).toBe(true);
    expect(index.findDefinition("shouldNeverBeIndexed")).toEqual([]);
    expect(index.findDependencies("tests/math.test.ts")).toContainEqual(expect.objectContaining({ targetPath: "src/math.ts", kind: "SYNTACTIC" }));
    expect(index.findReverseDependencies("src/math.ts")).toContainEqual(expect.objectContaining({ sourcePath: "tests/math.test.ts" }));
    index.close();
  });

  it("indexes TypeScript sources larger than tree-sitter's default 32 KiB buffer", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "dca-large-source-")); roots.push(repo);
    const source = `${Array.from({ length: 1_400 }, (_, index) => `export const value${index} = ${index};`).join("\n")}\nexport function finalSymbol() { return value1399; }\n`;
    await writeFile(path.join(repo, "large.ts"), source);
    const index = new CodebaseIndex(repo, ":memory:");
    const manifest = await index.build("large-source");
    expect(Buffer.byteLength(source, "utf8")).toBeGreaterThan(32 * 1024);
    expect(manifest.files).toBe(1);
    expect(index.findDefinition("finalSymbol")).toHaveLength(1);
    index.close();
  });

  it("incrementally reuses, reparses, renames and invalidates indexed files", async () => {
    const repo = await fixtureRepo();
    const index = new CodebaseIndex(repo, ":memory:");
    const cold = await index.build("sha-cold");
    expect(cold).toMatchObject({ files: 2, reparsedFiles: 2, reusedFiles: 0, deletedFiles: 0, renamedFiles: 0 });

    await writeFile(path.join(repo, "src", "math.ts"), "export function add(a: number, b: number) { return a + b + 0; }\n");
    const edited = await index.build("sha-edit");
    expect(edited).toMatchObject({ reparsedFiles: 1, reusedFiles: 1, deletedFiles: 0, renamedFiles: 0 });

    await rename(path.join(repo, "src", "math.ts"), path.join(repo, "src", "arithmetic.ts"));
    const renamed = await index.build("sha-rename");
    expect(renamed).toMatchObject({ reparsedFiles: 0, reusedFiles: 2, deletedFiles: 0, renamedFiles: 1 });
    expect(index.findDefinition("add")[0].path).toBe("src/arithmetic.ts");
    expect(index.findDependencies("tests/math.test.ts")).toContainEqual(expect.objectContaining({ kind: "UNRESOLVED", targetPath: null }));

    await unlink(path.join(repo, "tests", "math.test.ts"));
    const deleted = await index.build("sha-delete");
    expect(deleted).toMatchObject({ reparsedFiles: 0, reusedFiles: 1, deletedFiles: 1, renamedFiles: 0 });
    expect(index.findReferences("add").some((item) => item.path.includes("math.test.ts"))).toBe(false);
    expect(index.findTests("src/arithmetic.ts")).toEqual([]);
    index.close();
  });

  it("invalidates a persistent cache when its workspace identity changes", async () => {
    const firstRepo = await fixtureRepo();
    const secondRepo = await fixtureRepo();
    const databasePath = path.join(firstRepo, ".shared-index.sqlite");
    const first = new CodebaseIndex(firstRepo, databasePath);
    expect(await first.build("first")).toMatchObject({ reparsedFiles: 2, reusedFiles: 0 });
    first.close();
    const reopened = new CodebaseIndex(firstRepo, databasePath);
    expect(await reopened.build("first-again")).toMatchObject({ reparsedFiles: 0, reusedFiles: 2 });
    reopened.close();
    const otherWorkspace = new CodebaseIndex(secondRepo, databasePath);
    expect(await otherWorkspace.build("second")).toMatchObject({ reparsedFiles: 2, reusedFiles: 0, cacheIntegrity: "PASS" });
    otherWorkspace.close();
  });

  it("persists evidence, invalidates changed files and packages a bounded context", async () => {
    const store = new EvidenceStore(":memory:");
    const item: StoredEvidence = { id: "E1", repoSha: "sha1", path: "src/a.ts", startLine: 1, endLine: 2, hash: "h1", confidence: 0.9, excerpt: "const value = 1", reason: "definition" };
    store.put(item); expect(store.get("E1")).toEqual(item);
    expect(store.invalidate(["src/a.ts"])).toBe(1);
    expect(store.get("E1")).toBeUndefined();
    store.put(item);
    expect(store.invalidateStale("sha1", { "src/a.ts": "different-hash" })).toBe(1);
    expect(store.get("E1")).toBeUndefined();
    store.put(item);
    const context = packageContext({ role: "coder", contract: "Fix value", evidence: [item, { ...item, id: "E2" }], hardTokenCap: 80 });
    expect(context.estimatedTokens).toBeLessThanOrEqual(80);
    expect(context.sections.filter((section) => section.evidenceId === "E1")).toHaveLength(1);
    expect(context.omittedEvidenceIds).toContain("E2");
    store.close();
  });
});
