import { readFile } from "node:fs/promises";
import path from "node:path";
import { inspectSnapshot, parseProfileId, readModelSpecializationRegistry, type SnapshotFileExpectation } from "../services/model-specialization-runtime/src/index";

const root = path.resolve(process.cwd());
const profileId = parseProfileId(process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length));
const registry = await readModelSpecializationRegistry(root);
const manifests = JSON.parse(await readFile(path.join(root, "benchmarks/model-specialization/EXACT_MODEL_MANIFESTS.json"), "utf8")) as { models: Record<"baseline" | "coder", { snapshotFiles: SnapshotFileExpectation[] }> };
const result = await inspectSnapshot(root, profileId, registry.profiles[profileId], manifests.models[profileId].snapshotFiles);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.status !== "PASS") process.exitCode = 1;
