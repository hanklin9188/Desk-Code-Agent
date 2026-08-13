// @vitest-environment node
import { describe, expect, it } from "vitest";
import path from "node:path";
import { redactUntrusted, RepoIntelligence, safeResolve } from "../services/repo-intelligence/src/index";

describe("repository intelligence safety", () => {
  it("rejects traversal and redacts secret-shaped values", () => {
    expect(() => safeResolve("/tmp/workspace", "../secret")).toThrow(/escapes workspace/);
    expect(redactUntrusted("api_key=secret-value\npassword: hunter2")).toBe("api_key=[REDACTED]\npassword: [REDACTED]");
  });

  it("fingerprints and retrieves bounded evidence from the design pack", async () => {
    const root = path.resolve(process.cwd());
    const repo = new RepoIntelligence(root);
    const fingerprint = await repo.fingerprint();
    expect(fingerprint.fileCount).toBeGreaterThan(50);
    expect(fingerprint.languages.md).toBeGreaterThan(10);
    const items = await repo.retrieve("Task Contract", 3);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items[0].path).not.toContain("node_modules");
  });
});
