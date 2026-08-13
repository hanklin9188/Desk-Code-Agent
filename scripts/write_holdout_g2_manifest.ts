import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHoldoutG2Artifacts } from "../services/holdout-g2-runtime/src/index";

const root = path.resolve(process.cwd());
const directory = path.join(root, "benchmarks", "holdout-g2");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const artifacts = buildHoldoutG2Artifacts();
const outputs = [
  { name: "holdout_g2_manifest.json", value: artifacts.manifest },
  { name: "holdout_g2_oracle.sealed.json", value: artifacts.oracle }
];
await mkdir(directory, { recursive: true });
const written = [];
for (const output of outputs) {
  const body = `${JSON.stringify(output.value, null, 2)}\n`;
  await writeFile(path.join(directory, output.name), body, { flag: "wx" });
  const hash = sha256(body);
  await writeFile(path.join(directory, `${output.name}.sha256`), `${hash}  ${output.name}\n`, { flag: "wx" });
  written.push({ path: path.relative(root, path.join(directory, output.name)), sha256: hash });
}
process.stdout.write(`${JSON.stringify({ status: "PASS", integrity: artifacts.manifest.integrity, manifestHash: artifacts.manifest.manifest_hash, oracleHash: artifacts.oracle.oracle_hash, written }, null, 2)}\n`);
