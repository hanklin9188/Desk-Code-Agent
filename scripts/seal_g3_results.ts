import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const runsRoot = path.join(root, "docs/experiments/runs");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const prefixes = {
  primary: "m9-g3-primary-",
  longHorizon: "m9-g3-long-horizon-",
  realPatch: "m9-g3-real-patch-",
  secondary: "m9-g3-secondary-",
  onboarding: "m9-g3-onboarding-",
  streamingTelemetry: "m9-g3-streaming-telemetry-",
  repoScale: "m9-g3-repo-scale-",
  indexMutation: "m9-g3-index-mutation-",
  retrievalTaxonomy: "m9-g3-retrieval-taxonomy-v2-",
  securityFuzz: "m9-g3-security-fuzz-",
  uiSoak: "m9-g3-ui-soak-",
  quantizationProtocol: "m9-g3-quantization-protocol-",
  licenseResolution: "m10-g3-license-resolution-",
  longRunStability: "m9-g3-long-run-stability-",
  crashRecovery: "m9-g3-crash-recovery-"
} as const;
const directories = await readdir(runsRoot);
const selected: Record<string, { directory: string; files: Record<string, string>; resultStatus: string }> = {};
for (const [kind, prefix] of Object.entries(prefixes)) {
  const matches = directories.filter((directory) => directory.startsWith(prefix)).sort();
  const directory = matches.at(-1);
  if (!directory) throw new Error(`Missing required G3 result family: ${kind}`);
  const files: Record<string, string> = {};
  for (const file of (await readdir(path.join(runsRoot, directory))).sort()) files[file] = sha256(await readFile(path.join(runsRoot, directory, file)));
  const result = JSON.parse(await readFile(path.join(runsRoot, directory, "result.json"), "utf8")) as { status?: string };
  selected[kind] = { directory: `docs/experiments/runs/${directory}`, files, resultStatus: String(result.status ?? "UNKNOWN") };
}
const sealBytes = await readFile(path.join(root, "benchmarks/g3/G3_SEAL.json"));
const payload = { schemaVersion: 1, state: "G3_RESULTS_COMPLETE_IMMUTABLE_INDEX", generatedAt: new Date().toISOString(), inputSeal: { path: "benchmarks/g3/G3_SEAL.json", sha256: sha256(sealBytes) }, selected, rejectedRunsPreserved: ["m9-g3-index-mutation-2026-08-09T09-43-02-648Z", "m9-g3-security-fuzz-2026-08-09T09-43-47-115Z", "m9-g3-repo-scale-2026-08-09T09-42-50-849Z", "m10-g3-license-resolution-2026-08-09T09-45-52-305Z"], protectedActions: { commit: false, remoteConfigured: false, push: false, pullRequest: false, tag: false, release: false, signing: false, quantizedModelAcquisition: false } };
const body = `${JSON.stringify(payload, null, 2)}\n`;
const target = path.join(root, "benchmarks/g3/G3_RESULTS_INDEX.json");
await writeFile(target, body, { flag: "wx" });
await writeFile(`${target}.sha256`, `${sha256(body)}  G3_RESULTS_INDEX.json\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: payload.state, target, sha256: sha256(body), selected: Object.fromEntries(Object.entries(selected).map(([kind, value]) => [kind, { directory: value.directory, resultStatus: value.resultStatus }])) }, null, 2)}\n`);

