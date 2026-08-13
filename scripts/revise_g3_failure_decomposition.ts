import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const source = "docs/experiments/g4-diagnostics/G3_FAILURE_DECOMPOSITION_MATRIX.json";
const bytes = await readFile(path.join(root, source));
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const document = JSON.parse(bytes.toString("utf8")) as Record<string, any>;
let revisedRows = 0;
const rows = document.rows.map((row: Record<string, any>) => {
  if (row.failureTaxonomy.primary !== "TOOL_EXECUTION") return row;
  revisedRows += 1;
  return { ...row, failureTaxonomy: { primary: "REASONING", secondary: [...new Set([...(row.failureTaxonomy.secondary ?? []).filter((cause: string) => cause !== "REASONING" && cause !== "TOOL_EXECUTION")])], basis: [...row.failureTaxonomy.basis, "Revision 2: malformed or truncated model JSON is a model output-contract/reasoning failure; no tool execution occurred."] } };
});
const causes = [...new Set(rows.map((row: Record<string, any>) => row.failureTaxonomy.primary))].sort();
const counts = Object.fromEntries(causes.map((cause) => [cause, rows.filter((row: Record<string, any>) => row.failureTaxonomy.primary === cause).length]));
const bySuite = Object.fromEntries([...new Set(rows.map((row: Record<string, any>) => row.suite))].map((suite) => [suite, Object.fromEntries(causes.map((cause) => [cause, rows.filter((row: Record<string, any>) => row.suite === suite && row.failureTaxonomy.primary === cause).length]).filter(([, count]) => Number(count) > 0))]));
const reasoningCauses = new Set(["TASK_UNDERSTANDING", "EVIDENCE_COMPOSITION", "REASONING", "PATCH_GENERATION"]);
const revised = { ...document, schemaVersion: 2, status: "PASS_DIAGNOSTIC_NOT_CANDIDATE_TUNING", supersedes: { path: source, sha256: sha256(bytes), preserved: true }, revisionReason: "95 model responses were malformed/truncated JSON with zero tool actions. Revision 1 incorrectly labeled them TOOL_EXECUTION; revision 2 maps them to REASONING under the user-specified taxonomy.", aggregate: { failures: rows.length, counts, percentages: Object.fromEntries(Object.entries(counts).map(([cause, count]) => [cause, Number((Number(count) / rows.length * 100).toFixed(2))])), bySuite }, reasoningVersusRetrieval: { reasoningBoundary: rows.filter((row: Record<string, any>) => reasoningCauses.has(row.failureTaxonomy.primary)).length, retrieval: rows.filter((row: Record<string, any>) => row.failureTaxonomy.primary === "RETRIEVAL").length }, rows };
const name = "G3_FAILURE_DECOMPOSITION_MATRIX.v2.json"; const target = path.join(root, "docs/experiments/g4-diagnostics", name); const body = `${JSON.stringify(revised, null, 2)}\n`;
await writeFile(target, body, { flag: "wx" }); await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: revised.status, artifact: { path: `docs/experiments/g4-diagnostics/${name}`, sha256: sha256(body) }, revisedRows, aggregate: revised.aggregate, reasoningVersusRetrieval: revised.reasoningVersusRetrieval }, null, 2)}\n`);
