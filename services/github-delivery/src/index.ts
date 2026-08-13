import { createHash } from "node:crypto";

export interface GitHubTarget { owner: string; repo: string }
export interface ApprovalRecord { action: "CREATE_BRANCH" | "PUSH" | "OPEN_DRAFT_PR"; target: GitHubTarget; artifactHash: string; expiresAt: string; approved: boolean }
export interface PublishRequest { action: ApprovalRecord["action"]; target: GitHubTarget; artifactHash: string; branch: string }
export interface DeliveryPayload { request: PublishRequest; content: string; title?: string; body?: string; baseBranch?: string }
export interface DeliveryReceipt { status: "DRY_RUN" | "EXECUTED"; action: ApprovalRecord["action"]; target: GitHubTarget; branch: string; artifactHash: string; remoteReference?: string }
export interface GitHubWriteTransport {
  createBranch(target: GitHubTarget, branch: string, baseBranch: string): Promise<string>;
  push(target: GitHubTarget, branch: string, content: string): Promise<string>;
  openDraftPr(target: GitHubTarget, branch: string, baseBranch: string, title: string, body: string): Promise<string>;
}

export class GitHubDeliveryPolicy {
  readonly #canonical: GitHubTarget;
  constructor(canonical: GitHubTarget = { owner: "hanklin9188", repo: "Desk-Code-Agent" }) { this.#canonical = canonical; }
  validateTarget(target: GitHubTarget): void {
    if (target.owner !== this.#canonical.owner || target.repo !== this.#canonical.repo) throw new Error("GitHub target does not match canonical owner/repository");
  }
  authorize(request: PublishRequest, approval?: ApprovalRecord): boolean {
    this.validateTarget(request.target);
    if (!approval?.approved) return false;
    return approval.action === request.action && approval.target.owner === request.target.owner && approval.target.repo === request.target.repo && approval.artifactHash === request.artifactHash && Date.parse(approval.expiresAt) > Date.now();
  }
  createArtifactHash(content: string): string { return `sha256:${createHash("sha256").update(content).digest("hex")}`; }
}

const SECRET_PATTERNS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9_]{20,}/, /AKIA[0-9A-Z]{16}/, /(?:api[_-]?key|token|password)\s*[:=]\s*[^\s]+/i];
export class GitHubWriteAdapter {
  readonly #policy: GitHubDeliveryPolicy;
  readonly #transport?: GitHubWriteTransport;
  readonly #usedApprovals = new Set<string>();
  constructor(options: { policy?: GitHubDeliveryPolicy; transport?: GitHubWriteTransport } = {}) { this.#policy = options.policy ?? new GitHubDeliveryPolicy(); this.#transport = options.transport; }
  async execute(payload: DeliveryPayload, approval?: ApprovalRecord, options: { dryRun?: boolean } = {}): Promise<DeliveryReceipt> {
    this.#validatePayload(payload);
    if (payload.request.artifactHash !== this.#policy.createArtifactHash(payload.content)) throw new Error("Delivery content does not match the approved artifact hash");
    if (!this.#policy.authorize(payload.request, approval)) throw new Error("Exact unexpired approval is required for this GitHub action");
    const fingerprint = createHash("sha256").update(JSON.stringify(approval)).digest("hex");
    if (this.#usedApprovals.has(fingerprint)) throw new Error("Approval replay is rejected");
    if (options.dryRun !== true && !this.#transport) throw new Error("No GitHub write transport is configured");
    this.#usedApprovals.add(fingerprint);
    const receipt: DeliveryReceipt = { status: options.dryRun === true ? "DRY_RUN" : "EXECUTED", action: payload.request.action, target: { ...payload.request.target }, branch: payload.request.branch, artifactHash: payload.request.artifactHash };
    if (options.dryRun === true) return receipt;
    const base = payload.baseBranch ?? "main";
    if (payload.request.action === "CREATE_BRANCH") receipt.remoteReference = await this.#transport!.createBranch(payload.request.target, payload.request.branch, base);
    else if (payload.request.action === "PUSH") receipt.remoteReference = await this.#transport!.push(payload.request.target, payload.request.branch, payload.content);
    else receipt.remoteReference = await this.#transport!.openDraftPr(payload.request.target, payload.request.branch, base, payload.title!, payload.body!);
    return receipt;
  }
  #validatePayload(payload: DeliveryPayload): void {
    this.#policy.validateTarget(payload.request.target);
    if (!/^(milestone|feat|fix|docs)\/[a-z0-9][a-z0-9._-]{0,79}$/.test(payload.request.branch) || payload.request.branch === "main") throw new Error("Delivery branch is unsafe or protected");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(`${payload.content}\n${payload.title ?? ""}\n${payload.body ?? ""}`))) throw new Error("Delivery payload contains secret-shaped content");
    if (payload.request.action === "OPEN_DRAFT_PR" && (!payload.title?.trim() || !payload.body?.trim())) throw new Error("Draft PR requires a non-empty title and body");
    if ((payload.title?.length ?? 0) > 256 || (payload.body?.length ?? 0) > 65_536) throw new Error("Draft PR metadata exceeds bounded size");
    if (payload.baseBranch && payload.baseBranch !== "main") throw new Error("Only the canonical base branch is allowed");
  }
}

export class GitHubReadClient {
  readonly #fetch: typeof fetch;
  constructor(fetchImpl: typeof fetch = globalThis.fetch) { this.#fetch = fetchImpl; }
  async snapshotIssue(target: GitHubTarget, number: number): Promise<{ title: string; body: string; sha256: string }> {
    if (!Number.isInteger(number) || number < 1) throw new Error("Issue number must be positive");
    const response = await this.#fetch(`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/issues/${number}`, { headers: { accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub snapshot failed with HTTP ${response.status}`);
    const data = await response.json() as { title?: string; body?: string };
    const title = data.title ?? ""; const body = data.body ?? "";
    return { title, body, sha256: createHash("sha256").update(JSON.stringify({ title, body })).digest("hex") };
  }
}
