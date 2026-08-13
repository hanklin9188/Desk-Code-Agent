import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const relativeConfig = process.argv[2] ?? "config/production/emin-v2-frozen-2026-08-09.json";
const configPath = path.resolve(root, relativeConfig);
const checksumPath = `${configPath}.sha256`;
const raw = await readFile(configPath);
const config = JSON.parse(raw.toString("utf8")) as {
  candidate_id: string;
  status: string;
  repository_state: {
    candidate_source_closure_sha256: string;
    candidate_source_closure: Array<{ path: string; sha256: string }>;
  };
  model: { revision: string; tokenizer_revision: string };
};
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const expectedArtifact = (await readFile(checksumPath, "utf8")).trim().split(/\s+/)[0];
const artifactSha256 = sha256(raw);
const errors: string[] = [];
if (artifactSha256 !== expectedArtifact) errors.push("frozen candidate artifact checksum mismatch");
const closureRows: Array<{ path: string; expected: string; actual: string }> = [];
for (const entry of [...config.repository_state.candidate_source_closure].sort((a, b) => a.path.localeCompare(b.path))) {
  const actual = sha256(await readFile(path.resolve(root, entry.path)));
  closureRows.push({ path: entry.path, expected: entry.sha256, actual });
  if (actual !== entry.sha256) errors.push(`source closure changed: ${entry.path}`);
}
const closurePayload = closureRows.map((entry) => `${entry.path}\0${entry.actual}`).join("\n");
const closureSha256 = sha256(closurePayload);
if (closureSha256 !== config.repository_state.candidate_source_closure_sha256) errors.push("candidate source closure checksum mismatch");
if (config.candidate_id !== "E-MIN-V2" || config.status !== "FROZEN_FOR_FRESH_HOLDOUT") errors.push("candidate identity/status is not frozen E-MIN-V2");
if (config.model.revision !== config.model.tokenizer_revision) errors.push("model/tokenizer revision mismatch");

const result = {
  status: errors.length === 0 ? "PASS" : "FAIL",
  candidateId: config.candidate_id,
  artifact: relativeConfig,
  artifactSha256,
  sourceClosureSha256: closureSha256,
  sourceFiles: closureRows.length,
  errors
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (errors.length) process.exitCode = 1;
