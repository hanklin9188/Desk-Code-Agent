import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHoldoutG2Artifacts } from "../services/holdout-g2-runtime/src/index";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hashFile = async (relative: string) => sha256(await readFile(path.join(root, relative)));
const preregistration = "benchmarks/holdout-g2/HOLDOUT_G2_PREREGISTRATION.json";
const manifest = "benchmarks/holdout-g2/holdout_g2_manifest.json";
const oracle = "benchmarks/holdout-g2/holdout_g2_oracle.sealed.json";
const candidateV2 = "config/production/emin-v2-frozen-2026-08-09.json";
const candidateV3 = "config/production/emin-v3-frozen-2026-08-09.json";
const generated = buildHoldoutG2Artifacts();
const diskManifest = JSON.parse(await readFile(path.join(root, manifest), "utf8")) as { manifest_hash: string; oracle_hash: string };
if (diskManifest.manifest_hash !== generated.manifest.manifest_hash || diskManifest.oracle_hash !== generated.oracle.oracle_hash) throw new Error("Generated G2 artifacts differ from disk before seal");
const seal = {
  schema_version: 1,
  seal_id: "dca-holdout-g2-seal-2026-08-09",
  state: "SEALED_BEFORE_FIRST_MODEL_CALL",
  sealed_at: new Date().toISOString(),
  preregistration: { path: preregistration, sha256: await hashFile(preregistration) },
  candidates: {
    "E-MIN-V2": { path: candidateV2, artifact_sha256: await hashFile(candidateV2), source_closure_sha256: "bb8c8b9abc4d863691446f3ff4523a68489a6139425acddd05ead5df6043cdf8" },
    "E-MIN-V3": { path: candidateV3, artifact_sha256: await hashFile(candidateV3), source_closure_sha256: "e307862f7728ac6bc90b231c23b7562cbb5d114aaed3af77200a2c7b77a3a76b" }
  },
  suite: { manifest: { path: manifest, sha256: await hashFile(manifest), payload_sha256: diskManifest.manifest_hash }, oracle: { path: oracle, sha256: await hashFile(oracle), payload_sha256: diskManifest.oracle_hash }, task_count: 210 },
  model: { repository: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", vllm: "0.26.0", precision: "bfloat16", temperature: 0, seed: 20260809, thinking: false, max_output_tokens: 32 },
  immutability: "Any post-seal change to manifest, oracle, candidates, candidate source closures, or model variables invalidates G2. Candidate behavior may not be tuned from G2 outcomes."
};
const relative = "benchmarks/holdout-g2/HOLDOUT_G2_SEAL.json";
const body = `${JSON.stringify(seal, null, 2)}\n`;
await writeFile(path.join(root, relative), body, { flag: "wx" });
const hash = sha256(body);
await writeFile(path.join(root, `${relative}.sha256`), `${hash}  HOLDOUT_G2_SEAL.json\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: "PASS", seal: relative, sha256: hash, state: seal.state }, null, 2)}\n`);
