import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const relative = "config/production/emin-v3-frozen-2026-08-09.json";
const bytes = await readFile(path.join(root, relative));
const value = JSON.parse(bytes.toString("utf8")) as { candidate_id: string; status: string; repository_state: { candidate_source_closure_sha256: string; candidate_source_closure: Array<{ path: string; sha256: string }> }; retrieval: { maximum_fallback_rounds: number }; orchestration: { primary_model_calls: number; semantic_reviewer: string; multi_agent: string } };
const sha256 = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
const expectedArtifact = (await readFile(path.join(root, `${relative}.sha256`), "utf8")).trim().split(/\s+/)[0];
const errors: string[] = [];
if (sha256(bytes) !== expectedArtifact) errors.push("candidate artifact checksum mismatch");
const rows = [];
for (const item of [...value.repository_state.candidate_source_closure].sort((a, b) => a.path.localeCompare(b.path))) { const actual = sha256(await readFile(path.join(root, item.path))); rows.push({ path: item.path, actual }); if (actual !== item.sha256) errors.push(`source closure changed: ${item.path}`); }
const closureSha256 = sha256(rows.map((row) => `${row.path}\0${row.actual}`).join("\n"));
if (closureSha256 !== value.repository_state.candidate_source_closure_sha256) errors.push("source closure checksum mismatch");
if (value.candidate_id !== "E-MIN-V3" || value.status !== "FROZEN_FOR_HOLDOUT_G2") errors.push("candidate identity/status invalid");
if (value.retrieval.maximum_fallback_rounds !== 1 || value.orchestration.primary_model_calls !== 1 || value.orchestration.semantic_reviewer !== "OFF" || value.orchestration.multi_agent !== "OFF") errors.push("bounded orchestration invariant changed");
const result = { status: errors.length ? "FAIL" : "PASS", candidateId: value.candidate_id, artifact: relative, artifactSha256: sha256(bytes), sourceClosureSha256: closureSha256, sourceFiles: rows.length, errors };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (errors.length) process.exitCode = 1;
