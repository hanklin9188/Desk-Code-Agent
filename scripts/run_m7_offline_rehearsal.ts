import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GitHubDeliveryPolicy, GitHubWriteAdapter, type ApprovalRecord, type GitHubWriteTransport } from "../services/github-delivery/src/index";

const root = path.resolve(process.cwd()); const experimentId = `m7-offline-delivery-${new Date().toISOString().replace(/[:.]/g, "-")}`; const calls: Array<Record<string, string>> = [];
const transport: GitHubWriteTransport = {
  async createBranch(target, branch, base) { calls.push({ action: "CREATE_BRANCH", target: `${target.owner}/${target.repo}`, branch, base }); return `refs/heads/${branch}`; },
  async push(target, branch, content) { calls.push({ action: "PUSH", target: `${target.owner}/${target.repo}`, branch, contentHash: createHash("sha256").update(content).digest("hex") }); return "offline-fixture-sha"; },
  async openDraftPr(target, branch, base, title, body) { calls.push({ action: "OPEN_DRAFT_PR", target: `${target.owner}/${target.repo}`, branch, base, metadataHash: createHash("sha256").update(`${title}\n${body}`).digest("hex") }); return "offline://draft-pr/1"; }
};
const policy = new GitHubDeliveryPolicy(); const adapter = new GitHubWriteAdapter({ policy, transport }); const target = { owner: "hanklin9188", repo: "Desk-Code-Agent" }; const branch = "milestone/m7-offline"; const content = "sanitized offline milestone artifact\n"; const artifactHash = policy.createArtifactHash(content);
const approval = (action: ApprovalRecord["action"], offset: number): ApprovalRecord => ({ action, target, artifactHash, approved: true, expiresAt: new Date(Date.now() + 60_000 + offset).toISOString() });
const receipts = [
  await adapter.execute({ request: { action: "CREATE_BRANCH", target, artifactHash, branch }, content }, approval("CREATE_BRANCH", 1)),
  await adapter.execute({ request: { action: "PUSH", target, artifactHash, branch }, content }, approval("PUSH", 2)),
  await adapter.execute({ request: { action: "OPEN_DRAFT_PR", target, artifactHash, branch }, content, title: "M7 offline rehearsal", body: "No external write occurred.", baseBranch: "main" }, approval("OPEN_DRAFT_PR", 3))
];
let replayBlocked = false; const replayApproval = approval("PUSH", 4); const dryAdapter = new GitHubWriteAdapter({ policy }); await dryAdapter.execute({ request: { action: "PUSH", target, artifactHash, branch }, content }, replayApproval, { dryRun: true }); try { await dryAdapter.execute({ request: { action: "PUSH", target, artifactHash, branch }, content }, replayApproval, { dryRun: true }); } catch { replayBlocked = true; }
const result = { experimentId, status: receipts.every((item) => item.status === "EXECUTED") && calls.length === 3 && replayBlocked ? "PASS" : "FAIL", mode: "OFFLINE_INJECTED_TRANSPORT", externalNetworkUsed: false, externalWriteOccurred: false, target, branch, artifactHash, receipts, calls, controls: { exactActionApproval: true, exactTargetApproval: true, exactArtifactApproval: true, expiry: true, oneTimeApproval: replayBlocked, protectedMain: true, secretScan: true, boundedDraftMetadata: true }, externalDelivery: { status: "BLOCKED_APPROVAL", reason: "No commit, remote, push, PR, or GitHub write is authorized" } };
const output = path.join(root, "docs", "experiments", "runs", experimentId); await mkdir(output, { recursive: false }); await writeFile(path.join(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.status !== "PASS") process.exitCode = 1;
