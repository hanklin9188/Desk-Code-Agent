import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFreshHoldoutManifest } from "../services/holdout-runtime/src/index";

const root = path.resolve(process.cwd()); const directory = path.join(root, "benchmarks", "holdout");
const manifestPath = path.join(directory, "fresh_holdout_manifest.json"); const oraclePath = path.join(directory, "fresh_holdout_oracle.sealed.json");
await mkdir(directory, { recursive: true }); const output = buildFreshHoldoutManifest();
await writeFile(manifestPath, `${JSON.stringify(output.manifest, null, 2)}\n`, { flag: "wx" });
await writeFile(oraclePath, `${JSON.stringify(output.oracle, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ manifestPath, oraclePath, manifestHash: output.manifest.manifest_hash, oracleHash: output.oracle.oracle_hash, integrity: output.manifest.integrity }, null, 2)}\n`);
