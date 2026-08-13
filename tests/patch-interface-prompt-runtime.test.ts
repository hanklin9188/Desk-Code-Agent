// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderPatchInterfacePrompt, type PatchInterfacePromptReplacements } from "../scripts/patch_interface_prompt_runtime";

const root = path.resolve(process.cwd());
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const template = [
  "{behavioral_requirement}",
  "{exact_relevant_file}:{exact_relevant_symbol}:{start_line}:{end_line}",
  "{root_cause}",
  "{exact_relevant_file}\n{source}",
  "{visible_test_path}\n{visible_preflight_status}\n{visible_test}",
  "{hidden_preflight_status}"
].join("\n");
const base: PatchInterfacePromptReplacements = {
  behavioral_requirement: "fix behavior",
  exact_relevant_file: "src/example.js",
  exact_relevant_symbol: "example",
  start_line: "1",
  end_line: "3",
  root_cause: "known cause",
  source: "export function example() {}\n",
  visible_test_path: "test/visible.test.js",
  visible_test: "assert.equal(example(), true);\n",
  visible_preflight_status: "FAIL",
  hidden_preflight_status: "FAIL"
};

describe("patch-interface prompt runtime", () => {
  it("preserves injected template-literal braces without treating them as placeholders", () => {
    const source = "export const join = (base, part) => `${base}/${part}`;\n";
    const prompt = renderPatchInterfacePrompt(template, { ...base, source }, { taskId: "join-url", blockedExactValues: [] });
    expect(prompt).toContain("`${base}/${part}`");
  });

  it("preserves replacement-string dollar syntax and injected brace text byte-exactly", () => {
    const source = "literal ${base}/${part} {source} {visible_test} $& $` $' $$";
    const prompt = renderPatchInterfacePrompt(template, { ...base, source }, { taskId: "escape-regexp", blockedExactValues: [] });
    expect(prompt).toContain(source);
    const reverseOrdered = Object.fromEntries(Object.entries({ ...base, source }).reverse()) as PatchInterfacePromptReplacements;
    expect(renderPatchInterfacePrompt(template, reverseOrdered, { taskId: "escape-regexp", blockedExactValues: [] })).toBe(prompt);
  });

  it("rejects missing, duplicated, malformed, prototype, or unapproved template placeholders before injection", () => {
    expect(() => renderPatchInterfacePrompt(template.replace("{root_cause}", "missing"), base, { taskId: "missing", blockedExactValues: [] })).toThrow(/placeholder counts differ/);
    expect(() => renderPatchInterfacePrompt(`${template}\n{root_cause}`, base, { taskId: "duplicate", blockedExactValues: [] })).toThrow(/placeholder counts differ/);
    expect(() => renderPatchInterfacePrompt(`${template}\n{unknown}`, base, { taskId: "unknown", blockedExactValues: [] })).toThrow(/unapproved placeholder/);
    expect(() => renderPatchInterfacePrompt(`${template}\n{toString}`, base, { taskId: "prototype", blockedExactValues: [] })).toThrow(/unapproved placeholder/);
    expect(() => renderPatchInterfacePrompt(`${template}\n{unknown-name}`, base, { taskId: "malformed", blockedExactValues: [] })).toThrow(/unapproved placeholder/);
    expect(() => renderPatchInterfacePrompt(`${template}\n{unclosed`, base, { taskId: "unclosed", blockedExactValues: [] })).toThrow(/malformed brace syntax/);
    const inaccessibleReplacements = new Proxy(base, { ownKeys: () => { throw new Error("replacement object was accessed"); } });
    expect(() => renderPatchInterfacePrompt(`${template}\n{unknown}`, inaccessibleReplacements, { taskId: "validation-order", blockedExactValues: [] })).toThrow(/unapproved placeholder/);
  });

  it("rejects a runtime replacement object with missing, extra, or non-string values", () => {
    const missing = { ...base } as Record<string, unknown>;
    delete missing.source;
    expect(() => renderPatchInterfacePrompt(template, missing as PatchInterfacePromptReplacements, { taskId: "missing-value", blockedExactValues: [] })).toThrow(/missing or extra fields/);
    expect(() => renderPatchInterfacePrompt(template, { ...base, unexpected: "value" } as PatchInterfacePromptReplacements, { taskId: "extra-value", blockedExactValues: [] })).toThrow(/missing or extra fields/);
    expect(() => renderPatchInterfacePrompt(template, { ...base, source: 7 } as unknown as PatchInterfacePromptReplacements, { taskId: "non-string", blockedExactValues: [] })).toThrow(/not a string/);
  });

  it("rejects exact hidden or reference source leakage", () => {
    expect(() => renderPatchInterfacePrompt(template, { ...base, visible_test: "SEALED-HIDDEN" }, { taskId: "leak", blockedExactValues: ["SEALED-HIDDEN"] })).toThrow(/leaks hidden oracle/);
  });

  it("reproduces the exact sealed 50-task prompt corpus, including task 8 and task 9", async () => {
    type SourceFile = { path: string; content: string };
    type Task = { task_id: string; visible_files: SourceFile[] };
    type Oracle = { task_id: string; behavioral_requirement: string; exact_relevant_file: string; exact_relevant_symbol: string; exact_relevant_range_1_based: { start_line: number; end_line: number }; root_cause: string; reference_fixed_source: string; hidden_files: SourceFile[] };
    type Preflight = { taskId: string; before: { visible: { status: string }; hidden: { status: string } } };
    const readJson = async <T,>(relative: string): Promise<T> => JSON.parse(await readFile(path.join(root, relative), "utf8")) as T;
    const [manifest, oracle, preflight, promptContract] = await Promise.all([
      readJson<{ tasks: Task[] }>("benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_MANIFEST.v1.json"),
      readJson<{ rows: Oracle[] }>("benchmarks/patch-interface/PATCH_INTERFACE_DEVELOPMENT_ORACLE.v1.sealed.json"),
      readJson<{ rows: Preflight[] }>("benchmarks/patch-interface/PATCH_INTERFACE_ORACLE_PREFLIGHT.v2.json"),
      readJson<{ promptTemplate: string }>("tests/fixtures/patch-interface-prompt-contract.json")
    ]);
    const tasks = new Map(manifest.tasks.map((task) => [task.task_id, task]));
    const oracles = new Map(oracle.rows.map((row) => [row.task_id, row]));
    const preflights = new Map(preflight.rows.map((row) => [row.taskId, row]));
    const rows = manifest.tasks.map(({ task_id: taskId }) => {
      const task = tasks.get(taskId); const oracleRow = oracles.get(taskId); const preflightRow = preflights.get(taskId);
      expect(task, taskId).toBeDefined(); expect(oracleRow, taskId).toBeDefined(); expect(preflightRow, taskId).toBeDefined();
      const source = task!.visible_files.find((file) => file.path === oracleRow!.exact_relevant_file);
      const visible = task!.visible_files.find((file) => file.path !== oracleRow!.exact_relevant_file && file.path.includes("visible.test"));
      expect(source, taskId).toBeDefined(); expect(visible, taskId).toBeDefined();
      const prompt = renderPatchInterfacePrompt(promptContract.promptTemplate, {
        behavioral_requirement: oracleRow!.behavioral_requirement,
        exact_relevant_file: oracleRow!.exact_relevant_file,
        exact_relevant_symbol: oracleRow!.exact_relevant_symbol,
        start_line: String(oracleRow!.exact_relevant_range_1_based.start_line),
        end_line: String(oracleRow!.exact_relevant_range_1_based.end_line),
        root_cause: oracleRow!.root_cause,
        source: source!.content,
        visible_test_path: visible!.path,
        visible_test: visible!.content,
        visible_preflight_status: preflightRow!.before.visible.status,
        hidden_preflight_status: preflightRow!.before.hidden.status
      }, { taskId, blockedExactValues: [...oracleRow!.hidden_files.map((file) => file.content), oracleRow!.reference_fixed_source] });
      expect(prompt.split(source!.content)).toHaveLength(2);
      expect(prompt.split(visible!.content)).toHaveLength(2);
      return { taskId, promptSha256: sha256(prompt), promptBytes: Buffer.byteLength(prompt) };
    });
    expect(rows).toHaveLength(50);
    expect(rows.reduce((sum, row) => sum + row.promptBytes, 0)).toBe(69_687);
    expect(sha256(rows.map((row) => `${row.taskId}\0${row.promptSha256}`).join("\n"))).toBe("97c80839d7b1505ff7981f2598f5acc0d016826f64f305b694448d2d2070fb0e");
    expect(rows[7].promptSha256).toBe("651fd5e5c3ede53b849215ee3c88a1e475fa93c6d6cc9c591898c984d9baca64");
    expect(rows[8].promptSha256).toBe("8b0c5522ba25768731dda7111636e184f71278456cdefe2bf80f8504fbc39812");
  });
});
