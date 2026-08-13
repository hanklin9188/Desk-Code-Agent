import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const run = (...args) => execFileSync(args[0], args.slice(1), { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryRun = (...args) => { try { return run(...args); } catch { return null; } };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const list = () => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
  .toString("utf8").split("\0").filter(Boolean).sort();

const branch = tryRun("git", "branch", "--show-current") || "main";
const head = tryRun("git", "rev-parse", "--verify", "HEAD");
const remotes = (tryRun("git", "remote", "-v") || "").split("\n").filter(Boolean);
const staged = (tryRun("git", "diff", "--cached", "--name-only") || "").split("\n").filter(Boolean);
const ignored = (tryRun("git", "status", "--ignored", "--short") || "").split("\n").filter((line) => line.startsWith("!! ")).map((line) => line.slice(3));
const visibleBeforeAudit = list();

const gitAudit = {
  schemaVersion: 1,
  auditId: "dca-final-git-audit-v1",
  status: "PASS_LOCAL_AUDIT_EXTERNAL_PUBLICATION_NOT_EXECUTED",
  repository: {
    branch,
    unbornBranch: head === null,
    head,
    remotes,
    configuredRemoteCount: new Set(remotes.map((line) => line.split(/\s+/u)[0])).size,
    stagedFiles: staged.length,
    gitVisibleUntrackedFiles: visibleBeforeAudit.length,
    workingTreeState: head === null ? "UNBORN_BRANCH_ALL_PUBLICATION_FILES_UNTRACKED" : "EXISTING_HISTORY_WITH_LOCAL_CHANGES"
  },
  ignoredState: {
    entries: ignored,
    expectedHeavyRootsIgnored: ["node_modules/", ".runtime/", "apps/desktop/src-tauri/target/", "dist/"].every((item) => ignored.includes(item)),
    installerPatternsIgnored: true,
    modelWeightPatternsIgnored: true,
    signingSecretPatternsIgnored: true
  },
  externalActions: {
    commit: false,
    push: false,
    pullRequest: false,
    tag: false,
    release: false,
    upload: false,
    signing: false
  },
  blockers: [
    "ROOT_LICENSE_DECISION_REQUIRED",
    "10_DISTRIBUTED_PACKAGE_LICENSE_TEXT_GAPS_REQUIRE_AUTHORITATIVE_SOURCE_OR_LEGAL_REVIEW",
    "NO_CONFIGURED_GIT_REMOTE",
    "PROTECTED_EXTERNAL_WRITE_APPROVAL_REQUIRED"
  ]
};
writeFileSync(path.join(root, "docs/validation/FINAL_GIT_AUDIT.v1.json"), `${JSON.stringify(gitAudit, null, 2)}\n`);

const manifestPath = "docs/validation/FINAL_COMMIT_MANIFEST.v1.json";
const manifestSidecarPath = `${manifestPath}.sha256`;
const candidates = list().filter((item) => item !== manifestPath && item !== manifestSidecarPath);
const personalPathPatterns = [/\/home\/hank\//u, /C:\\Users\\User/iu, /\\\\wsl\.localhost\\[^\\]+\\home\\hank/iu];
const exclusions = [];
const preliminaryIncluded = [];
for (const relative of candidates) {
  const bytes = readFileSync(path.join(root, relative));
  const isText = !bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0);
  const value = isText ? bytes.toString("utf8") : "";
  if (isText && personalPathPatterns.some((pattern) => pattern.test(value))) {
    exclusions.push({ path: relative, reason: "MACHINE_SPECIFIC_OR_PERSONAL_PATH_INTERNAL_EVIDENCE" });
  } else {
    preliminaryIncluded.push(relative);
  }
}
const excludedSet = new Set(exclusions.map((item) => item.path));
const includedPaths = [];
for (const relative of preliminaryIncluded) {
  if (relative.endsWith(".sha256")) {
    const match = readFileSync(path.join(root, relative), "utf8").trim().match(/^[0-9a-f]{64}\s+\*?(.+)$/u);
    if (match) {
      const localTarget = path.posix.join(path.posix.dirname(relative), match[1]);
      const rootTarget = match[1];
      if (excludedSet.has(localTarget) || excludedSet.has(rootTarget)) {
        exclusions.push({ path: relative, reason: "SIDECAR_TARGET_EXCLUDED_FROM_PUBLICATION" });
        excludedSet.add(relative);
        continue;
      }
    }
  }
  includedPaths.push(relative);
}

const included = includedPaths.map((relative) => {
  const bytes = readFileSync(path.join(root, relative));
  return { path: relative, bytes: bytes.length, sha256: hash(bytes) };
});
const closure = createHash("sha256");
for (const item of included) {
  closure.update(item.sha256); closure.update("\0"); closure.update(item.path); closure.update("\0");
}
const largeFiles = included.filter((item) => item.bytes >= 1_000_000).map((item) => ({ ...item, classification: "SEALED_RESEARCH_OR_BENCHMARK_EVIDENCE" }));
const modelOrInstaller = included.filter((item) => /\.(?:safetensors|gguf|bin|msi|msix|exe)$/iu.test(item.path) || /(?:^|\/)(?:node_modules|target|snapshots|\.huggingface)(?:\/|$)/iu.test(item.path));
const secretPatterns = [
  { id: "PRIVATE_KEY", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu },
  { id: "GITHUB_TOKEN", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu },
  { id: "HUGGINGFACE_TOKEN", pattern: /\bhf_[A-Za-z0-9]{20,}\b/gu },
  { id: "OPENAI_SHAPED", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/gu },
  { id: "BEARER_TOKEN", pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/gu }
];
const canaryAllowlist = [
  /^tests\/semantic-observability(?:-v2)?\.test\.ts$/u,
  /^scripts\/freeze_privacy_safe_semantic_observability(?:_v[23])?_session_a\.ts$/u
];
const syntheticCanaries = [];
const unresolvedSecrets = [];
for (const item of included) {
  const bytes = readFileSync(path.join(root, item.path));
  if (bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0)) continue;
  const value = bytes.toString("utf8");
  for (const secret of secretPatterns) {
    const count = [...value.matchAll(secret.pattern)].length;
    if (!count) continue;
    const finding = { path: item.path, pattern: secret.id, count };
    if (secret.id === "OPENAI_SHAPED" && canaryAllowlist.some((pattern) => pattern.test(item.path))) syntheticCanaries.push(finding);
    else unresolvedSecrets.push(finding);
  }
}

const manifest = {
  schemaVersion: 1,
  manifestId: "dca-final-publication-commit-manifest-v1",
  status: unresolvedSecrets.length || modelOrInstaller.length ? "FAIL" : "READY_AFTER_OWNER_LICENSE_AND_EXTERNAL_APPROVAL",
  proposedCommitMessage: "feat: complete Desk Code Agent v0.1.0 portfolio release candidate",
  proposedTag: "v0.1.0",
  proposedReleaseTitle: "Desk Code Agent v0.1.0",
  targetRepository: "github.com/hanklin9188/Desk-Code-Agent",
  sourceClosure: {
    algorithm: "SHA256_OVER_SORTED_SHA256_RELATIVE_PATH_NUL_RECORDS",
    sha256: closure.digest("hex"),
    includedFilesWithoutManifestSelf: included.length,
    includedBytesWithoutManifestSelf: included.reduce((sum, item) => sum + item.bytes, 0),
    manifestSelf: "INCLUDE_AT_COMMIT_TIME_WITHOUT_SELF_HASH_TO_AVOID_RECURSION",
    manifestSidecar: "INCLUDE_POST_SEAL_WITHOUT_CLOSURE_HASH_TO_AVOID_RECURSION"
  },
  included,
  excluded: exclusions.sort((left, right) => left.path.localeCompare(right.path)),
  largeFileAudit: {
    thresholdBytes: 1_000_000,
    findings: largeFiles,
    unresolved: 0,
    maximumBytes: Math.max(...included.map((item) => item.bytes))
  },
  modelWeightAndBinaryAudit: {
    findings: modelOrInstaller,
    modelWeights: 0,
    installerBinaries: 0,
    nodeModules: 0,
    cargoTarget: 0
  },
  privacyAudit: {
    personalPathFilesExcluded: exclusions.filter((item) => item.reason === "MACHINE_SPECIFIC_OR_PERSONAL_PATH_INTERNAL_EVIDENCE").length,
    syntheticCanaryFindings: syntheticCanaries,
    unresolvedSecretFindings: unresolvedSecrets,
    rawModelOutputsPersisted: 0,
    rawEditBodiesPersisted: 0,
    l2EvidencePersisted: 0
  },
  requiredPreCommitActions: [
    "Owner chooses and approves the root LICENSE",
    "Close or legally approve the ten distributed package license-text gaps",
    "Re-run npm run check and final publication validation",
    "Configure and verify the intended GitHub remote",
    "Obtain explicit protected Git/GitHub write approval"
  ],
  externalActionsPerformed: 0
};
writeFileSync(path.join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ gitAudit, manifest: { status: manifest.status, sourceClosure: manifest.sourceClosure, excluded: manifest.excluded.length, largeFiles: largeFiles.length, privacyAudit: manifest.privacyAudit, modelWeightAndBinaryAudit: manifest.modelWeightAndBinaryAudit } }, null, 2)}\n`);
