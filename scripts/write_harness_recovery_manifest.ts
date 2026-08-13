import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildExpandedBenchmarkManifest } from "../services/benchmark-runtime/src/index";

const root = path.resolve(process.cwd());
const output = path.join(root, "benchmarks", "harness_recovery_manifest.json");
const manifest = buildExpandedBenchmarkManifest();
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ output, manifestHash: manifest.manifest_hash, integrity: manifest.integrity }, null, 2)}\n`);
