import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string): string => readFileSync(path.join(root, relativePath), "utf8");
const sha256 = (relativePath: string): string => createHash("sha256").update(readFileSync(path.join(root, relativePath))).digest("hex");

describe("final publication readiness", () => {
  it("keeps the first-visitor README sections in the intended order and preserves capability boundaries", () => {
    const value = read("README.md");
    const headings = [
      "# Desk Code Agent",
      "## What Desk Code Agent is",
      "## Why it exists",
      "## Key capabilities",
      "## Architecture",
      "## Product workflow",
      "## Verification and safety",
      "## Research findings",
      "## Benchmarks",
      "## Capability boundaries",
      "## Privacy",
      "## Local hardware and runtime requirements",
      "## Windows install status",
      "## Documentation",
      "## Known limitations",
      "## Roadmap"
    ];
    let previous = -1;
    for (const heading of headings) {
      const next = value.indexOf(heading);
      expect(next, heading).toBeGreaterThan(previous);
      previous = next;
    }
    expect(value).toContain("A local-first, verification-first software engineering workbench for small language models.");
    expect(value).toContain("Autonomous mutation remains disabled because it has not crossed the preregistered reliability threshold.");
    expect(value).toContain("It is neither a Codex replacement nor a fully autonomous coding system.");
    expect(value).not.toContain("production autonomous mutation agent");
  });

  it("closes every previously unexplained license row without guessing", () => {
    const inventory = JSON.parse(read("artifacts/release/third-party-license-inventory.v1.json"));
    expect(inventory.counts).toMatchObject({
      historicalUnexplainedInput: 139,
      historicalRawNoAssertionRemaining: 0,
      historicalResolvedLicense: 22,
      historicalNotDistributed: 110,
      historicalBuildOnlyNotDistributed: 6,
      historicalOwnerLegalReviewRequired: 1,
      distributedRuntimeDependencies: 197,
      packagesWithPinnedText: 187,
      packagesWithTextGap: 10,
      uniquePinnedTexts: 120
    });
    expect(inventory.historicalClosure).toHaveLength(139);
    expect(inventory.historicalClosure.every((item: { finalClassification?: string }) => Boolean(item.finalClassification))).toBe(true);
    expect(inventory.distributedRuntime).toHaveLength(197);
    for (const item of inventory.pinnedTexts as Array<{ path: string; sha256: string }>) {
      expect(existsSync(path.join(root, item.path)), item.path).toBe(true);
      expect(sha256(item.path), item.path).toBe(item.sha256);
    }
    const finalInventory = JSON.parse(read("artifacts/release/third-party-license-inventory.v2.json"));
    expect(finalInventory.status).toBe("PASS_ALL_DISTRIBUTED_LICENSE_TEXT_GAPS_CLOSED");
    expect(finalInventory.counts).toMatchObject({
      priorPackageTextGaps: 10,
      textPinnedAuthoritative: 10,
      legalReviewRequired: 0,
      unresolvedDistributedLicenseBlockers: 0,
      packagesWithAuthoritativeText: 197
    });
    for (const item of finalInventory.closure as Array<{ finalClassification: string }>) {
      expect(item.finalClassification).toBe("TEXT_PINNED_AUTHORITATIVE");
    }
  });

  it("applies the owner-approved Apache-2.0 root license without fabricating a NOTICE", () => {
    const license = read("LICENSE");
    expect(license).toContain("Apache License");
    expect(license).toContain("Version 2.0, January 2004");
    expect(sha256("LICENSE")).toBe("cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30");
    expect(existsSync(path.join(root, "NOTICE"))).toBe(false);
    const inventory = JSON.parse(read("artifacts/release/third-party-license-inventory.v2.json"));
    expect(inventory.counts.unresolvedDistributedLicenseBlockers).toBe(0);
    expect(inventory.rootNotice.status).toBe("ROOT_NOTICE_NOT_REQUIRED_BY_CURRENT_AUDIT");
  });

  it("keeps version 0.1.0 consistent across release surfaces", () => {
    const npm = JSON.parse(read("package.json"));
    const npmLock = JSON.parse(read("package-lock.json"));
    const tauri = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
    expect([npm.version, npmLock.version, tauri.version]).toEqual(["0.1.0", "0.1.0", "0.1.0"]);
    expect(read("apps/desktop/src-tauri/Cargo.toml")).toMatch(/^version = "0\.1\.0"$/mu);
    expect([npm.license, npmLock.packages[""].license]).toEqual(["Apache-2.0", "Apache-2.0"]);
    expect(read("apps/desktop/src-tauri/Cargo.toml")).toMatch(/^license = "Apache-2\.0"$/mu);
    expect(read("CHANGELOG.md")).toContain("## [0.1.0]");
    expect(read("docs/releases/v0.1.0.md")).toContain("Desk Code Agent v0.1.0");
  });

  it("provides a valid 1280x640 social preview with the audited identity", () => {
    const relativePath = "docs/media/social/desk-code-agent-social-preview.png";
    const bytes = readFileSync(path.join(root, relativePath));
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1280);
    expect(bytes.readUInt32BE(20)).toBe(640);
    const audit = JSON.parse(read("docs/validation/SOCIAL_PREVIEW_AUDIT.v1.json"));
    expect(audit.status).toBe("PASS_LOCAL_NOT_UPLOADED");
    expect(audit.asset.sha256).toBe(sha256(relativePath));
    expect(audit.checks.unsupportedCapabilityClaims).toBe(0);
    expect(audit.checks.privatePaths).toBe(0);
    expect(audit.checks.secretFindings).toBe(0);
  });
});
