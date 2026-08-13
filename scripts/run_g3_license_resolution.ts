import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const inventoryPath = path.join(root, "artifacts/release/license-inventory.json");
const bytes = await readFile(inventoryPath);
interface Component { ecosystem: string; name: string; version: string }
const inventory = JSON.parse(bytes.toString("utf8")) as { totalComponents: number; resolvedLicenseComponents: number; unresolved: Component[]; resolutionPolicy: string };
if (inventory.unresolved.length !== 139) throw new Error(`Expected carried-forward 139 NOASSERTION rows, received ${inventory.unresolved.length}`);
const localCargo = path.join(root, ".runtime/rust/cargo/registry/src");
const localPython = path.join(root, "runtime/model/.venv/lib/python3.12/site-packages");
const classification = await Promise.all(inventory.unresolved.map(async (component) => {
  const internalRoot = component.name === "desk-code-agent" || component.name === "desk-code-agent-model-runtime";
  if (internalRoot) return { ...component, class: "C_AMBIGUOUS_MANUAL_LEGAL_REVIEW", reason: "First-party root component has no owner-selected license; the agent must not choose one." };
  const localMetadata = component.ecosystem === "cargo"
    ? await readFile(path.join(localCargo, `index.crates.io-1949cf8c6b5b557f`, `${component.name}-${component.version}`, "Cargo.toml"), "utf8").catch(() => "")
    : await readFile(path.join(localPython, `${component.name.replaceAll("-", "_")}-${component.version}.dist-info`, "METADATA"), "utf8").catch(() => "");
  const hasAuthoritativeLicense = component.ecosystem === "cargo"
    ? /^license(?:-file)?\s*=\s*"[^"]+"/m.test(localMetadata)
    : /^License-(?:Expression|File):\s*\S+/m.test(localMetadata) || /^License:\s*(?!UNKNOWN\s*$)\S+/m.test(localMetadata) || /^Classifier:\s*License ::/m.test(localMetadata);
  return hasAuthoritativeLicense
    ? { ...component, class: "A_RESOLVABLE_LOCALLY", reason: "Authoritative local license field or license-file reference exists and can be resolved without network access." }
    : { ...component, class: "B_REQUIRES_AUTHORITATIVE_EXTERNAL_METADATA", reason: "Lock entry exists, but the platform-specific package/crate metadata and license payload are absent from local caches." };
}));
const classNames = ["A_RESOLVABLE_LOCALLY", "B_REQUIRES_AUTHORITATIVE_EXTERNAL_METADATA", "C_AMBIGUOUS_MANUAL_LEGAL_REVIEW"] as const;
const counts = Object.fromEntries(classNames.map((name) => [name, classification.filter((row) => row.class === name).length]));
const report = { schemaVersion: 3, experimentId: `m10-g3-license-resolution-${new Date().toISOString().replace(/[:.]/g, "-")}`, status: "PASS_CLASSIFIED_NO_GUESSES", supersedesClassificationRun: "m10-g3-license-resolution-2026-08-09T09-47-15-953Z", revisionHistory: ["Revision 1 treated the mere presence of cuda-toolkit METADATA as locally resolvable even though it contains no authoritative license field or license-file reference.", "Revision 2 requires actual license evidence and is semantically correct but omitted the zero-count A key from its compact count object.", "Revision 3 explicitly reports all required A/B/C buckets, including A=0. All earlier immutable reports remain preserved."], policy: "AUTHORITATIVE_LOCAL_METADATA_ONLY; no network lookup; no inferred license; no owner decision made", sourceInventory: { path: "artifacts/release/license-inventory.json", sha256: sha256(bytes), totalComponents: inventory.totalComponents, resolvedBeforeThisAudit: inventory.resolvedLicenseComponents, carriedForwardNoAssertion: inventory.unresolved.length }, counts, classifications: classification, rootLicenseOptionsInformationalOnly: [
  { option: "Apache-2.0", tradeoff: "Permissive with explicit patent grant and notice obligations; broadly compatible with the present Apache/MIT-heavy dependency set." },
  { option: "MIT", tradeoff: "Short permissive terms and simple attribution; lacks Apache-2.0's express patent-license language." },
  { option: "Apache-2.0 OR MIT", tradeoff: "Common ecosystem-friendly dual choice but increases notice and owner-governance work." },
  { option: "Proprietary internal-only", tradeoff: "Can fit non-distributed internal use, but does not resolve third-party notices and is not an open-source grant." }
], legalDisclaimer: "Informational inventory comparison only; not legal advice. Root license selection requires the project owner and legal review.", distributionDecision: "BLOCKED_ROOT_LICENSE_AND_AUTHORITATIVE_METADATA" };
const directory = path.join(root, "docs/experiments/runs", report.experimentId); await mkdir(directory, { recursive: false });
await writeFile(path.join(directory, "license-resolution-report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
await writeFile(path.join(directory, "result.json"), `${JSON.stringify({ schemaVersion: 1, experimentId: report.experimentId, status: report.status, counts, distributionDecision: report.distributionDecision }, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ directory, status: report.status, counts, distributionDecision: report.distributionDecision }, null, 2)}\n`);
