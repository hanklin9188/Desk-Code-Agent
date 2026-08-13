import { describe, expect, it } from "vitest";
import { GitHubDeliveryPolicy, GitHubReadClient, GitHubWriteAdapter, type ApprovalRecord, type GitHubWriteTransport } from "../services/github-delivery/src/index";

describe("approval-gated GitHub delivery", () => {
  it("rejects wrong targets and stale or mismatched approvals", () => {
    const policy = new GitHubDeliveryPolicy(); const request = { action: "PUSH" as const, target: { owner: "hanklin91888", repo: "Desk-Code-Agent" }, artifactHash: "sha256:a", branch: "milestone/m7" };
    expect(policy.authorize(request)).toBe(false);
    expect(policy.authorize(request, { action: "PUSH", target: request.target, artifactHash: "sha256:b", expiresAt: new Date(Date.now() + 1000).toISOString(), approved: true })).toBe(false);
    expect(policy.authorize(request, { action: "PUSH", target: request.target, artifactHash: "sha256:a", expiresAt: new Date(Date.now() + 1000).toISOString(), approved: true })).toBe(true);
    expect(() => policy.authorize({ ...request, target: { owner: "attacker", repo: "other" } })).toThrow(/canonical/);
  });
  it("supports read-only issue snapshots through an injected client", async () => {
    const client = new GitHubReadClient((async () => new Response(JSON.stringify({ title: "Bug", body: "untrusted issue" }), { status: 200 })) as typeof fetch);
    const snapshot = await client.snapshotIssue({ owner: "hanklin91888", repo: "Desk-Code-Agent" }, 1);
    expect(snapshot.title).toBe("Bug"); expect(snapshot.sha256).toHaveLength(64);
  });
  it("executes an approval-scoped branch, push, and draft PR only through the injected transport", async () => {
    const calls: string[] = []; const transport: GitHubWriteTransport = {
      async createBranch(_target, branch) { calls.push(`branch:${branch}`); return `refs/heads/${branch}`; },
      async push(_target, branch) { calls.push(`push:${branch}`); return "fixture-sha"; },
      async openDraftPr(_target, branch) { calls.push(`pr:${branch}`); return "https://example.invalid/pr/1"; }
    };
    const policy = new GitHubDeliveryPolicy(); const adapter = new GitHubWriteAdapter({ policy, transport }); const target = { owner: "hanklin91888", repo: "Desk-Code-Agent" }; const content = "bounded artifact"; const artifactHash = policy.createArtifactHash(content); const branch = "milestone/m7-offline";
    const approval = (action: ApprovalRecord["action"]): ApprovalRecord => ({ action, target, artifactHash, approved: true, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await adapter.execute({ request: { action: "CREATE_BRANCH", target, artifactHash, branch }, content }, approval("CREATE_BRANCH"))).status).toBe("EXECUTED");
    expect((await adapter.execute({ request: { action: "PUSH", target, artifactHash, branch }, content }, approval("PUSH"))).remoteReference).toBe("fixture-sha");
    expect((await adapter.execute({ request: { action: "OPEN_DRAFT_PR", target, artifactHash, branch }, content, title: "M7", body: "Offline verified", baseBranch: "main" }, approval("OPEN_DRAFT_PR"))).remoteReference).toContain("/pr/1");
    expect(calls).toEqual([`branch:${branch}`, `push:${branch}`, `pr:${branch}`]);
  });
  it("rejects approval replay, protected branches, hash drift, secrets, and missing transport", async () => {
    const policy = new GitHubDeliveryPolicy(); const target = { owner: "hanklin91888", repo: "Desk-Code-Agent" }; const content = "safe"; const artifactHash = policy.createArtifactHash(content); const request = { action: "PUSH" as const, target, artifactHash, branch: "feat/safe" }; const approval: ApprovalRecord = { action: "PUSH", target, artifactHash, approved: true, expiresAt: new Date(Date.now() + 60_000).toISOString() }; const adapter = new GitHubWriteAdapter({ policy });
    expect((await adapter.execute({ request, content }, approval, { dryRun: true })).status).toBe("DRY_RUN");
    await expect(adapter.execute({ request, content }, approval, { dryRun: true })).rejects.toThrow(/replay/);
    await expect(new GitHubWriteAdapter({ policy }).execute({ request: { ...request, branch: "main" }, content }, approval, { dryRun: true })).rejects.toThrow(/branch/);
    await expect(new GitHubWriteAdapter({ policy }).execute({ request, content: "changed" }, approval, { dryRun: true })).rejects.toThrow(/hash/);
    const secret = "api_key=fixture-secret"; const secretHash = policy.createArtifactHash(secret); await expect(new GitHubWriteAdapter({ policy }).execute({ request: { ...request, artifactHash: secretHash }, content: secret }, { ...approval, artifactHash: secretHash }, { dryRun: true })).rejects.toThrow(/secret/);
    await expect(new GitHubWriteAdapter({ policy }).execute({ request, content }, approval)).rejects.toThrow(/transport/);
  });
});
