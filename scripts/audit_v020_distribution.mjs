import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();
const metadataPath = process.argv[2];
if (!metadataPath) {
  throw new Error("Usage: node scripts/audit_v020_distribution.mjs <windows-cargo-metadata.json>");
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (relative) => JSON.parse(readFileSync(path.join(repositoryRoot, relative), "utf8"));
const metadata = JSON.parse(readFileSync(metadataPath, "utf8").replace(/^\uFEFF/u, ""));
const outputDirectory = path.join(repositoryRoot, "artifacts/release/v0.2.0");
const licenseDirectory = path.join(repositoryRoot, "third_party/licenses");
mkdirSync(outputDirectory, { recursive: true });
mkdirSync(licenseDirectory, { recursive: true });

const packageById = new Map(metadata.packages.map((item) => [item.id, item]));
const nodeById = new Map(metadata.resolve.nodes.map((item) => [item.id, item]));
const runtimeIds = new Set([metadata.resolve.root]);
const pending = [metadata.resolve.root];
while (pending.length) {
  const node = nodeById.get(pending.pop());
  if (!node) throw new Error("Cargo metadata runtime node is missing");
  for (const dependency of node.deps) {
    if (!dependency.dep_kinds.some((kind) => kind.kind === null)) continue;
    const dependencyPackage = packageById.get(dependency.pkg);
    if (!dependencyPackage) throw new Error(`Cargo package is missing: ${dependency.pkg}`);
    if (dependencyPackage.targets.every((target) => target.kind.includes("proc-macro"))) continue;
    if (!runtimeIds.has(dependency.pkg)) {
      runtimeIds.add(dependency.pkg);
      pending.push(dependency.pkg);
    }
  }
}

function windowsPathToHost(value) {
  const normalized = value.replaceAll("\\", "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/u);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

function authoritativeFiles(directory) {
  return readdirSync(directory)
    .filter((name) => /^(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[._-].*)?$/iu.test(name))
    .filter((name) => statSync(path.join(directory, name)).isFile())
    .sort();
}

function pinText(bytes, authoritativeSource) {
  const hash = sha256(bytes);
  const relative = `third_party/licenses/${hash}.txt`;
  const absolute = path.join(repositoryRoot, relative);
  if (existsSync(absolute) && sha256(readFileSync(absolute)) !== hash) {
    throw new Error(`Pinned license text drift: ${relative}`);
  }
  if (!existsSync(absolute)) writeFileSync(absolute, bytes);
  return { authoritativeSource, path: relative, sha256: hash, bytes: bytes.length };
}

const priorInventory = json("artifacts/release/third-party-license-inventory.v1.json");
const priorFinalClosure = json("artifacts/release/third-party-license-inventory.v2.json").closure;
function priorPinnedTexts(ecosystem, name, version) {
  const fromInventory = priorInventory.distributedRuntime.find(
    (item) => item.ecosystem === ecosystem && item.name === name && item.version === version
  );
  if (fromInventory?.licenseSources?.length) {
    return fromInventory.licenseSources.map((source) => {
      const bytes = readFileSync(path.join(repositoryRoot, source.path));
      if (sha256(bytes) !== source.sha256) throw new Error(`Historical license drift: ${source.path}`);
      return { ...source, bytes: bytes.length };
    });
  }

  const fromClosure = priorFinalClosure.find((item) =>
    item.ecosystem === ecosystem
      && item.version === version
      && (item.package === name || item.packages?.includes(name))
  );
  const references = fromClosure ? [fromClosure.text, ...(fromClosure.texts ?? [])].filter(Boolean) : [];
  return references.map((reference) => {
    const bytes = readFileSync(path.join(repositoryRoot, reference.path));
    if (sha256(bytes) !== reference.sha256) throw new Error(`Historical license drift: ${reference.path}`);
    return {
      authoritativeSource: fromClosure.upstreamEvidence,
      path: reference.path,
      sha256: reference.sha256,
      bytes: bytes.length
    };
  });
}

function cargoComponent(item) {
  const directory = path.dirname(windowsPathToHost(item.manifest_path));
  const localTexts = authoritativeFiles(directory).map((name) =>
    pinText(readFileSync(path.join(directory, name)), `cargo-registry:${item.name}@${item.version}/${name}`)
  );
  const texts = localTexts.length ? localTexts : priorPinnedTexts("cargo", item.name, item.version);
  return {
    ecosystem: "cargo",
    name: item.name,
    version: item.version,
    relationship: "TRANSITIVE_OR_DIRECT_RUNTIME",
    distribution: "STATICALLY_LINKED_WINDOWS_RUNTIME_CLOSURE",
    declaredLicense: item.license,
    authoritativeMetadata: `cargo-registry:${item.name}@${item.version}/Cargo.toml`,
    licenseSources: texts,
    repository: item.repository ?? null
  };
}

const cargoRuntime = [...runtimeIds]
  .filter((id) => id !== metadata.resolve.root)
  .map((id) => packageById.get(id))
  .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`))
  .map(cargoComponent);

const npmRuntimeNames = [
  "@tauri-apps/api",
  "@tauri-apps/plugin-dialog",
  "react",
  "react-dom",
  "scheduler"
];
const npmRuntime = npmRuntimeNames.map((name) => {
  const directory = path.join(repositoryRoot, "node_modules", name);
  const packageMetadata = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  return {
    ecosystem: "npm",
    name,
    version: packageMetadata.version,
    relationship: ["scheduler"].includes(name) ? "TRANSITIVE_RUNTIME" : "DIRECT_RUNTIME",
    distribution: "BUNDLED_FRONTEND_JAVASCRIPT",
    declaredLicense: packageMetadata.license,
    authoritativeMetadata: `npm:${name}@${packageMetadata.version}/package.json`,
    licenseSources: authoritativeFiles(directory).map((filename) =>
      pinText(readFileSync(path.join(directory, filename)), `npm:${name}@${packageMetadata.version}/${filename}`)
    ),
    repository: packageMetadata.repository?.url ?? packageMetadata.repository ?? null
  };
});

const distributedRuntime = [...npmRuntime, ...cargoRuntime];
const unresolved = distributedRuntime.filter(
  (item) => !item.declaredLicense || item.licenseSources.length === 0
);
if (unresolved.length) {
  throw new Error(`Distributed license closure is incomplete: ${unresolved.map((item) => `${item.name}@${item.version}`).join(", ")}`);
}

const pinnedTexts = [...new Map(
  distributedRuntime.flatMap((item) => item.licenseSources).map((item) => [item.sha256, item])
).values()].sort((left, right) => left.sha256.localeCompare(right.sha256));
const inventory = {
  schemaVersion: 1,
  inventoryId: "dca-v0.2.0-windows-distributed-runtime",
  status: "PASS_ALL_DISTRIBUTED_LICENSE_TEXTS_PINNED",
  release: "0.2.0",
  sourceTarget: "x86_64-pc-windows-msvc",
  sourcePolicy: "LOCKED_WINDOWS_TARGET_METADATA_AND_LOCAL_PACKAGE_OR_PREVIOUSLY_PINNED_AUTHORITATIVE_TEXT_ONLY",
  counts: {
    distributedRuntimeDependencies: distributedRuntime.length,
    distributedNpm: npmRuntime.length,
    distributedCargo: cargoRuntime.length,
    packagesWithAuthoritativeText: distributedRuntime.length,
    uniquePinnedTexts: pinnedTexts.length,
    unresolvedDistributedLicenseBlockers: unresolved.length
  },
  distributedRuntime,
  pinnedTexts,
  unresolved,
  excludedScopes: {
    npmDevelopmentAndBuildDependencies: "NOT_DISTRIBUTED_IN_FINAL_FRONTEND_BUNDLE",
    cargoBuildAndProcMacroDependencies: "NOT_DISTRIBUTED_AS_RUNTIME_COMPONENTS",
    optionalPythonModelRuntime: "SEPARATELY_CONFIGURED_AND_NOT_DISTRIBUTED",
    modelWeights: 0,
    researchCorpora: 0
  }
};

const inventoryPath = path.join(outputDirectory, "third-party-license-inventory.json");
writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);

const documentSeed = sha256(JSON.stringify(distributedRuntime.map((item) => [item.ecosystem, item.name, item.version])));
function spdxLicenseExpression(value) {
  // Cargo metadata historically serializes dual-license choices with `/`.
  // The authoritative package declaration is preserved in the inventory;
  // SPDX 2.3 uses the `OR` operator for these exact dual-license choices.
  return value.replace(/\s*\/\s*/gu, " OR ");
}

function validateSpdxExpression(value) {
  if (value.includes("/")) throw new Error(`Invalid SPDX license operator: ${value}`);
  const tokens = value.match(/\(|\)|AND|OR|WITH|[A-Za-z0-9.+-]+/gu);
  if (!tokens || tokens.join(" ").replace(/ \)/gu, ")").replace(/\( /gu, "(") !== value.replace(/\s+/gu, " ")) {
    throw new Error(`Unsupported SPDX license expression syntax: ${value}`);
  }
}
const rootSpdxId = "SPDXRef-Package-Desk-Code-Agent";
function packagePurl(item) {
  if (item.ecosystem === "npm" && item.name.startsWith("@")) {
    const separator = item.name.indexOf("/");
    if (separator < 2) throw new Error(`Invalid scoped npm package name: ${item.name}`);
    const namespace = encodeURIComponent(item.name.slice(0, separator));
    const name = encodeURIComponent(item.name.slice(separator + 1));
    return `pkg:npm/${namespace}/${name}@${encodeURIComponent(item.version)}`;
  }
  return `pkg:${item.ecosystem}/${encodeURIComponent(item.name)}@${encodeURIComponent(item.version)}`;
}
const dependencyPackages = distributedRuntime.map((item, index) => {
  const licenseExpression = spdxLicenseExpression(item.declaredLicense);
  validateSpdxExpression(licenseExpression);
  return {
    SPDXID: `SPDXRef-Package-${index + 1}`,
    name: item.name,
    versionInfo: item.version,
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: licenseExpression,
    licenseDeclared: licenseExpression,
    comment: `Original package declaration: ${item.declaredLicense}`,
    externalRefs: [{
      referenceCategory: "PACKAGE-MANAGER",
      referenceType: "purl",
      referenceLocator: packagePurl(item)
    }]
  };
});
const sbom = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "Desk-Code-Agent-v0.2.0-Windows-runtime",
  documentNamespace: `https://desk-code-agent.invalid/spdx/v0.2.0/${documentSeed.slice(0, 24)}`,
  creationInfo: {
    created: "2026-08-13T00:00:00Z",
    creators: ["Tool: Desk-Code-Agent-v0.2.0-distribution-audit"]
  },
  documentDescribes: [rootSpdxId],
  packages: [{
    SPDXID: rootSpdxId,
    name: "Desk Code Agent",
    versionInfo: "0.2.0",
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "Apache-2.0",
    licenseDeclared: "Apache-2.0",
    primaryPackagePurpose: "APPLICATION"
  }, ...dependencyPackages],
  relationships: [
    { spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: rootSpdxId },
    ...dependencyPackages.map((item) => ({
      spdxElementId: rootSpdxId,
      relationshipType: "DEPENDS_ON",
      relatedSpdxElement: item.SPDXID
    }))
  ]
};
if (sbom.documentDescribes.length !== 1 || sbom.packages.length !== distributedRuntime.length + 1 || sbom.relationships.length !== distributedRuntime.length + 1) {
  throw new Error("SPDX document closure is incomplete");
}
const sbomPath = path.join(outputDirectory, "sbom.spdx.json");
writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`);

const table = distributedRuntime.map((item) => {
  const texts = item.licenseSources.map((source) => `[${source.sha256.slice(0, 12)}](${source.path})`).join(", ");
  return `| ${item.ecosystem} | \`${item.name}\` | \`${item.version}\` | ${item.declaredLicense} | ${texts} |`;
}).join("\n");
const notices = `# Third-Party Notices

This inventory covers dependencies included in the Desk Code Agent 0.2.0 Windows x86_64 distributable. It was generated from locked Windows-target package metadata and package-provided or previously pinned authoritative license texts. It is a technical inventory, not legal advice.

## Distribution boundary

- Desktop frontend runtime: Tauri API/dialog bindings, React, React DOM, and Scheduler.
- Windows native runtime: the normal-dependency Cargo closure compiled into the Tauri executable.
- npm development/build dependencies, Cargo build/proc-macro-only dependencies, the separately configured Python model runtime, model weights, research corpora, and adaptation-inspiration sources are not distributed.
- The application source is licensed under Apache-2.0. The installer also carries the root LICENSE, this notice, and the pinned text directory as resources.

## Counts

| Classification | Count |
|---|---:|
| Distributed runtime dependencies | ${inventory.counts.distributedRuntimeDependencies} |
| npm runtime packages | ${inventory.counts.distributedNpm} |
| Cargo runtime packages | ${inventory.counts.distributedCargo} |
| Packages with authoritative text | ${inventory.counts.packagesWithAuthoritativeText} |
| Unique pinned texts | ${inventory.counts.uniquePinnedTexts} |
| Unresolved distributed blockers | ${inventory.counts.unresolvedDistributedLicenseBlockers} |

## Distributed runtime dependencies

| Ecosystem | Package | Version | Declared license | Pinned text |
|---|---|---:|---|---|
${table}

## Adaptation lineage

- mattpocock/skills: design-workflow inspiration only; no third-party Skill body is distributed.
- Animate UI: design inspiration only; no copied component path is distributed.

Checksums and per-package evidence are recorded in [the v0.2.0 machine-readable inventory](artifacts/release/v0.2.0/third-party-license-inventory.json).

Attribution does not imply endorsement.
`;
writeFileSync(path.join(repositoryRoot, "THIRD_PARTY_NOTICES.md"), notices);

const outputs = {
  "third-party-license-inventory.json": sha256(readFileSync(inventoryPath)),
  "sbom.spdx.json": sha256(readFileSync(sbomPath)),
  "THIRD_PARTY_NOTICES.md": sha256(Buffer.from(notices))
};
writeFileSync(path.join(outputDirectory, "SHA256SUMS.json"), `${JSON.stringify(outputs, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: inventory.status, counts: inventory.counts, outputs }, null, 2)}\n`);
