import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPatchCorpusManifest } from "../services/patch-benchmark-runtime/src/index";
const root = path.resolve(process.cwd()); const directory = path.join(root, "benchmarks", "holdout"); await mkdir(directory, { recursive: true });
const output = buildPatchCorpusManifest(); if (output.manifest.integrity.status !== "PASS") throw new Error(output.manifest.integrity.errors.join("; "));
const manifestPath = path.join(directory, "real_patch_corpus_manifest.json"); const oraclePath = path.join(directory, "real_patch_corpus_oracle.sealed.json");
await writeFile(manifestPath, `${JSON.stringify(output.manifest, null, 2)}\n`, { flag: "wx" }); await writeFile(oraclePath, `${JSON.stringify(output.oracle, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ manifestPath, oraclePath, manifestHash: output.manifest.manifest_hash, oracleHash: output.oracle.oracle_hash, integrity: output.manifest.integrity }, null, 2)}\n`);
