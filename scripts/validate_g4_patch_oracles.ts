import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const manifest = JSON.parse(await readFile(path.join(root, "benchmarks/g4-development/G4_DEVELOPMENT_MANIFEST.v2.json"), "utf8")) as { tasks: Array<Record<string, any>> };
const oracle = JSON.parse(await readFile(path.join(root, "benchmarks/g4-development/G4_DEVELOPMENT_ORACLE.v2.sealed.json"), "utf8")) as { rows: Array<Record<string, any>> };
const oracleById = new Map(oracle.rows.map((row) => [row.task_id, row]));
const rows = [];
for (const task of manifest.tasks.filter((row) => row.category === "behavioral_patch")) {
  const expected = oracleById.get(task.task_id)!;
  const directory = await mkdtemp(path.join(os.tmpdir(), "dca-g4-oracle-"));
  try {
    for (const file of [...task.visible_files, ...expected.hidden_files]) { await mkdir(path.dirname(path.join(directory, file.path)), { recursive: true }); await writeFile(path.join(directory, file.path), file.content); }
    const run = async (command: string[]) => { try { await execFileAsync(command[0], command.slice(1), { cwd: directory, timeout: 10_000 }); return "PASS"; } catch { return "FAIL"; } };
    const beforeVisible = await run(task.trusted_visible_command); const beforeHidden = await run(expected.trusted_hidden_command);
    await writeFile(path.join(directory, expected.exact_relevant_file), expected.reference_fixed_source);
    const syntax = await run([process.execPath, "--check", expected.exact_relevant_file]);
    const fixedVisible = await run(task.trusted_visible_command); const fixedHidden = await run(expected.trusted_hidden_command);
    const valid = syntax === "PASS" && fixedVisible === "PASS" && fixedHidden === "PASS" && (beforeVisible === "FAIL" || beforeHidden === "FAIL");
    rows.push({ taskId: task.task_id, beforeVisible, beforeHidden, fixedSyntax: syntax, fixedVisible, fixedHidden, valid });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const failed = rows.filter((row) => !row.valid);
process.stdout.write(`${JSON.stringify({ status: failed.length ? "FAIL" : "PASS", tasks: rows.length, valid: rows.length - failed.length, failed }, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
