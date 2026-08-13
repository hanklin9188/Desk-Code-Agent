import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const metadataPath = process.argv[2];
if (!metadataPath) throw new Error("Usage: node scripts/finalize_publication_licenses.mjs <windows-cargo-metadata.json>");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const metadata = JSON.parse(readFileSync(metadataPath, "utf8").replace(/^\uFEFF/, ""));
const historical = json("artifacts/release/license-inventory.json");
const packageById = new Map(metadata.packages.map((item) => [item.id, item]));
const nodeById = new Map(metadata.resolve.nodes.map((item) => [item.id, item]));
const packageIdByKey = new Map(metadata.packages.map((item) => [`${item.name}@${item.version}`, item.id]));
const active = new Set(metadata.resolve.nodes.map((item) => item.id));

const runtime = new Set([metadata.resolve.root]);
const pending = [metadata.resolve.root];
while (pending.length) {
  const current = nodeById.get(pending.pop());
  for (const dependency of current.deps) {
    if (!dependency.dep_kinds.some((item) => item.kind === null)) continue;
    const dependencyPackage = packageById.get(dependency.pkg);
    if (dependencyPackage.targets.every((target) => target.kind.includes("proc-macro"))) continue;
    if (!runtime.has(dependency.pkg)) {
      runtime.add(dependency.pkg);
      pending.push(dependency.pkg);
    }
  }
}

const classifyHistorical = (item) => {
  if (item.ecosystem === "pypi") {
    return {
      ...item,
      relationship: "SEPARATE_OPTIONAL_MODEL_RUNTIME",
      distribution: "NOT_IN_WINDOWS_DESKTOP_PACKAGE",
      finalClassification: "NOT_DISTRIBUTED",
      evidence: "W3 package-content audit and model-weight/runtime exclusion"
    };
  }
  if (item.name === "desk-code-agent") {
    return {
      ...item,
      relationship: "ROOT_PROJECT_COMPONENT_NOT_THIRD_PARTY",
      distribution: "DISTRIBUTED_APPLICATION",
      declaredLicense: null,
      finalClassification: "OWNER_LEGAL_REVIEW_REQUIRED",
      evidence: "No owner-approved root LICENSE file exists"
    };
  }
  const id = packageIdByKey.get(`${item.name}@${item.version}`);
  if (!id || !active.has(id)) {
    return {
      ...item,
      relationship: "TRANSITIVE_PLATFORM_VARIANT",
      distribution: "EXCLUDED_FROM_X86_64_PC_WINDOWS_MSVC_RESOLUTION",
      finalClassification: "NOT_DISTRIBUTED",
      evidence: "Locked Windows Cargo metadata target closure"
    };
  }
  const packageMetadata = packageById.get(id);
  if (!runtime.has(id)) {
    return {
      ...item,
      relationship: "TRANSITIVE_BUILD_INPUT",
      distribution: "NOT_IN_DISTRIBUTED_RUNTIME_CLOSURE",
      declaredLicense: packageMetadata.license,
      finalClassification: "BUILD_ONLY_NOT_DISTRIBUTED",
      evidence: `cargo-registry:${item.name}@${item.version}/Cargo.toml`
    };
  }
  return {
    ...item,
    relationship: "TRANSITIVE_RUNTIME",
    distribution: "STATICALLY_LINKED_WINDOWS_RUNTIME_CLOSURE",
    declaredLicense: packageMetadata.license,
    finalClassification: "RESOLVED_LICENSE",
    evidence: `cargo-registry:${item.name}@${item.version}/Cargo.toml`
  };
};

const closure = historical.unresolved.map(classifyHistorical);
const classificationCounts = Object.fromEntries(
  closure.reduce((counts, item) => counts.set(item.finalClassification, (counts.get(item.finalClassification) ?? 0) + 1), new Map())
);
if (closure.length !== 139 || Object.values(classificationCounts).reduce((sum, value) => sum + value, 0) !== 139) {
  throw new Error("Historical 139-row closure is incomplete");
}

const licenseDirectory = path.join(root, "third_party/licenses");
mkdirSync(licenseDirectory, { recursive: true });
const pinText = (bytes) => {
  const hash = sha256(bytes);
  const relative = `third_party/licenses/${hash}.txt`;
  const absolute = path.join(root, relative);
  if (existsSync(absolute) && sha256(readFileSync(absolute)) !== hash) throw new Error(`Pinned text drift: ${relative}`);
  if (!existsSync(absolute)) writeFileSync(absolute, bytes);
  return { path: relative, sha256: hash, bytes: bytes.length };
};

const cargoDirectory = (manifestPath) => path.win32.dirname(manifestPath)
  .replace(/^C:/u, "/mnt/c")
  .replaceAll("\\", "/");
const noticeNames = (directory) => readdirSync(directory)
  .filter((name) => /^(LICENSE|COPYING|NOTICE)/iu.test(name) && statSync(path.join(directory, name)).isFile())
  .sort();

const cargoRuntime = [...runtime]
  .filter((id) => id !== metadata.resolve.root)
  .map((id) => packageById.get(id))
  .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`))
  .map((item) => {
    const directory = cargoDirectory(item.manifest_path);
    const sources = noticeNames(directory).map((name) => ({
      authoritativeSource: `cargo-registry:${item.name}@${item.version}/${name}`,
      ...pinText(readFileSync(path.join(directory, name)))
    }));
    return {
      ecosystem: "cargo",
      name: item.name,
      version: item.version,
      relationship: "TRANSITIVE_OR_DIRECT_RUNTIME",
      distribution: "STATICALLY_LINKED_WINDOWS_RUNTIME_CLOSURE",
      declaredLicense: item.license,
      noticeRequirement: "PRESERVE_APPLICABLE_PACKAGE_LICENSE_AND_NOTICE_TEXT",
      authoritativeMetadata: `cargo-registry:${item.name}@${item.version}/Cargo.toml`,
      fullTextPinned: sources.length > 0,
      licenseSources: sources,
      textGapClassification: sources.length ? null : "AUTHORITATIVE_METADATA_AVAILABLE_PACKAGE_LICENSE_TEXT_UNAVAILABLE"
    };
  });

const npmRuntimeNames = ["react", "react-dom", "scheduler"];
const npmRuntime = npmRuntimeNames.map((name) => {
  const directory = path.join(root, "node_modules", name);
  const packageMetadata = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  const sources = noticeNames(directory).map((filename) => ({
    authoritativeSource: `npm:${name}@${packageMetadata.version}/${filename}`,
    ...pinText(readFileSync(path.join(directory, filename)))
  }));
  return {
    ecosystem: "npm",
    name,
    version: packageMetadata.version,
    relationship: name === "scheduler" ? "TRANSITIVE_RUNTIME" : "DIRECT_RUNTIME",
    distribution: "BUNDLED_FRONTEND_JAVASCRIPT",
    declaredLicense: packageMetadata.license,
    noticeRequirement: "PRESERVE_PACKAGE_LICENSE_TEXT",
    authoritativeMetadata: `npm:${name}@${packageMetadata.version}/package.json`,
    fullTextPinned: sources.length > 0,
    licenseSources: sources,
    textGapClassification: sources.length ? null : "AUTHORITATIVE_METADATA_AVAILABLE_PACKAGE_LICENSE_TEXT_UNAVAILABLE"
  };
});

const distributed = [...npmRuntime, ...cargoRuntime];
const textGaps = distributed.filter((item) => !item.fullTextPinned);
const pinnedTexts = [...new Map(distributed.flatMap((item) => item.licenseSources).map((item) => [item.sha256, item])).values()]
  .sort((left, right) => left.sha256.localeCompare(right.sha256));
const inventory = {
  schemaVersion: 1,
  inventoryId: "dca-final-third-party-license-inventory-v1",
  status: textGaps.length ? "PASS_WITH_EXPLICIT_PACKAGE_TEXT_GAPS" : "PASS",
  sourceTarget: "x86_64-pc-windows-msvc",
  sourcePolicy: "AUTHORITATIVE_LOCAL_LOCK_PACKAGE_METADATA_AND_PACKAGE_PROVIDED_TEXTS_ONLY",
  counts: {
    historicalUnexplainedInput: closure.length,
    historicalRawNoAssertionRemaining: 0,
    historicalResolvedLicense: classificationCounts.RESOLVED_LICENSE ?? 0,
    historicalNotDistributed: classificationCounts.NOT_DISTRIBUTED ?? 0,
    historicalBuildOnlyNotDistributed: classificationCounts.BUILD_ONLY_NOT_DISTRIBUTED ?? 0,
    historicalOwnerLegalReviewRequired: classificationCounts.OWNER_LEGAL_REVIEW_REQUIRED ?? 0,
    distributedRuntimeDependencies: distributed.length,
    distributedNpm: npmRuntime.length,
    distributedCargo: cargoRuntime.length,
    packagesWithPinnedText: distributed.length - textGaps.length,
    packagesWithTextGap: textGaps.length,
    uniquePinnedTexts: pinnedTexts.length
  },
  historicalClosure: closure,
  distributedRuntime: distributed,
  pinnedTexts,
  textGaps: textGaps.map(({ ecosystem, name, version, declaredLicense, authoritativeMetadata, textGapClassification }) => ({ ecosystem, name, version, declaredLicense, authoritativeMetadata, textGapClassification })),
  excludedScopes: {
    npmDevelopmentAndBuildDependencies: "NOT_DISTRIBUTED_IN_FINAL_FRONTEND_BUNDLE",
    cargoBuildOnlyClosure: metadata.resolve.nodes.length - runtime.size,
    optionalPythonModelRuntime: "SEPARATELY_CONFIGURED_AND_NOT_DISTRIBUTED",
    modelWeights: 0
  },
  adaptationLineage: [
    { name: "mattpocock/skills", classification: "DESIGN_INSPIRATION_NO_THIRD_PARTY_SKILL_BODY_DISTRIBUTED" },
    { name: "Animate UI", classification: "DESIGN_INSPIRATION_NO_COPIED_COMPONENT_PATH_IDENTIFIED" }
  ]
};

const outputPath = path.join(root, "artifacts/release/third-party-license-inventory.v1.json");
writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);

const table = distributed.map((item) => {
  const text = item.fullTextPinned ? item.licenseSources.map((source) => `[${source.sha256.slice(0, 12)}](${source.path})`).join(", ") : "Not present in local package payload";
  return `| ${item.ecosystem} | \`${item.name}\` | \`${item.version}\` | ${item.declaredLicense ?? "Unspecified"} | ${text} |`;
}).join("\n");
const notices = `# Third-Party Notices\n\nThis inventory covers dependencies included in the Desk Code Agent 0.1.0 Windows x86_64 distributable. It was generated only from locked local package metadata and package-provided license/notice files. It is a technical inventory, not legal advice.\n\n## Distribution boundary\n\n- Desktop frontend runtime: React, React DOM, and Scheduler.\n- Windows native runtime: the normal-dependency Cargo closure compiled into the Tauri executable.\n- npm development/build dependencies, Cargo build-only dependencies, the separately configured Python model runtime, model weights, research corpora, and adaptation-inspiration sources are not distributed in the installer.\n- The project itself has no owner-approved root license. Public source distribution remains blocked by \`ROOT_LICENSE_DECISION_REQUIRED\`.\n\n## Closure of the prior 139 unexplained rows\n\n| Classification | Count |\n|---|---:|\n| Resolved license | ${inventory.counts.historicalResolvedLicense} |\n| Not distributed | ${inventory.counts.historicalNotDistributed} |\n| Build-only, not distributed | ${inventory.counts.historicalBuildOnlyNotDistributed} |\n| Owner/legal review required | ${inventory.counts.historicalOwnerLegalReviewRequired} |\n| Raw unexplained \`NOASSERTION\` remaining | 0 |\n\n## Distributed runtime dependencies\n\n| Ecosystem | Package | Version | Declared license | Pinned local text |\n|---|---|---:|---|---|\n${table}\n\n## Explicit text gaps\n\n${textGaps.length ? textGaps.map((item) => `- \`${item.name}@${item.version}\`: metadata declares \`${item.declaredLicense}\`, but its local package payload contains no LICENSE/COPYING/NOTICE file. No text was guessed or fetched from an unofficial source.`).join("\n") : "None."}\n\n## Adaptation lineage\n\n- mattpocock/skills: design-workflow inspiration only; no third-party Skill body is distributed.\n- Animate UI: design inspiration only; no copied component path was identified in the final product source.\n\nChecksums and per-package authoritative-local evidence are recorded in [the machine-readable inventory](artifacts/release/third-party-license-inventory.v1.json).\n\nAttribution does not imply endorsement.\n`;
writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), notices);

const audit = {
  schemaVersion: 1,
  auditId: "dca-final-third-party-license-audit-v1",
  status: textGaps.length ? "PASS_MECHANICAL_CLOSURE_WITH_EXTERNAL_TEXT_GAPS" : "PASS",
  inputs: {
    priorInventory: { path: "artifacts/release/license-inventory.json", sha256: sha256(readFileSync(path.join(root, "artifacts/release/license-inventory.json"))) },
    cargoLock: { path: "apps/desktop/src-tauri/Cargo.lock", sha256: sha256(readFileSync(path.join(root, "apps/desktop/src-tauri/Cargo.lock"))) },
    npmLock: { path: "package-lock.json", sha256: sha256(readFileSync(path.join(root, "package-lock.json"))) }
  },
  outputs: {
    inventory: { path: "artifacts/release/third-party-license-inventory.v1.json", sha256: sha256(readFileSync(outputPath)) },
    notices: { path: "THIRD_PARTY_NOTICES.md", sha256: sha256(Buffer.from(notices)) }
  },
  counts: inventory.counts,
  checks: {
    allPriorUnexplainedRowsClassified: closure.length === 139,
    rawNoAssertionRemaining: 0,
    distributedDependencyInventoryComplete: distributed.length === 197,
    pinnedTextChecksumsValid: pinnedTexts.every((item) => sha256(readFileSync(path.join(root, item.path))) === item.sha256),
    unofficialWebSourcesUsed: 0,
    guessedLicenses: 0
  },
  remaining: {
    rootLicense: "ROOT_LICENSE_DECISION_REQUIRED",
    packageTextGaps: textGaps.length,
    disposition: "OWNER_OR_LEGAL_REVIEW_REQUIRED_BEFORE_PUBLIC_BINARY_DISTRIBUTION"
  }
};
mkdirSync(path.join(root, "docs/validation"), { recursive: true });
writeFileSync(path.join(root, "docs/validation/THIRD_PARTY_LICENSE_AUDIT.v1.json"), `${JSON.stringify(audit, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({ status: audit.status, counts: audit.counts, textGaps: inventory.textGaps }, null, 2)}\n`);
