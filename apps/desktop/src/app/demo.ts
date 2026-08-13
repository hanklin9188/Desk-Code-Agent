import type { AgentEvent, EvidenceRef, VerificationStage } from "../../../../packages/contracts/src/index";

export const evidence: EvidenceRef[] = [
  { id: "E-17", path: "src/runtime/router.ts", startLine: 42, endLine: 78, hash: "7ac91d2e", confidence: 0.96 },
  { id: "E-21", path: "tests/router.test.ts", startLine: 18, endLine: 54, hash: "9e041cb7", confidence: 0.93 },
  { id: "E-24", path: "docs/03_AGENT_HARNESS.md", startLine: 71, endLine: 112, hash: "c28fb445", confidence: 0.88 }
];

export const verification: VerificationStage[] = [
  { id: "preflight", label: "Preflight", trustedCommandId: "workspace.preflight", status: "PASS", durationMs: 92, summary: "Policy & worktree valid" },
  { id: "syntax", label: "Syntax / Types", trustedCommandId: "npm.typecheck", status: "PASS", durationMs: 1184, summary: "0 diagnostics" },
  { id: "targeted", label: "Targeted tests", trustedCommandId: "vitest.targeted", status: "PASS", durationMs: 864, summary: "12 / 12 passed" },
  { id: "related", label: "Related tests", trustedCommandId: "vitest.related", status: "PASS", durationMs: 1536, summary: "34 / 34 passed" },
  { id: "full", label: "Full suite", trustedCommandId: "vitest.full", status: "RUNNING", summary: "86 / 112 completed" },
  { id: "build", label: "Production build", trustedCommandId: "vite.build", status: "NOT_RUN", summary: "Waiting for full suite" }
];

const base = { runId: "run_demo_001", taskId: "task_demo_001", severity: "info", privacy: "local_only" } as const;
const payloads: Array<[string, string, Record<string, unknown>]> = [
  ["runtime", "run.created", { message: "Run contract created" }],
  ["runtime", "run.started", { message: "Workspace acquired · local only" }],
  ["orchestrator", "contract.created", { message: "Task Contract v3 frozen" }],
  ["orchestrator", "scope.completed", { message: "MIXED · L2 bounded scope" }],
  ["repo_service", "repo.index.started", { message: "Indexing 428 files and 1,204 symbols" }],
  ["repo_service", "evidence.retrieved", { message: "9 evidence items selected", items: evidence }],
  ["analyst", "agent.started", { message: "Tracing runtime route", role: "Repo Analyst", skill: "R11 Architecture Analysis" }],
  ["coder", "patch.planned", { message: "Patch plan mapped to SC-2", role: "Coder", skill: "R19 Patch Planning" }],
  ["coder", "patch.applied", { message: "Patch applied in isolated worktree", files: 3, lines: 54 }],
  ["verification", "verification.started", { message: "Running deterministic verification" }],
  ...verification.map((stage) => ["verification", "verification.stage", stage as unknown as Record<string, unknown>] as [string, string, Record<string, unknown>]),
  ["verification", "verification.stage", { ...verification[4], status: "PASS", durationMs: 2840, summary: "112 / 112 passed" }],
  ["verification", "verification.stage", { ...verification[5], status: "PASS", durationMs: 691, summary: "Production bundle created" }],
  ["reviewer", "review.requested", { message: "Dual-axis review in progress", role: "Reviewer", skill: "R22 Dual-Axis Review" }],
  ["approval", "approval.requested", {
    id: "approval_demo_01", action: "Accept verified patch", target: "desk-agent/task_demo_001",
    artifactHash: "sha256:8f3c41d9e7a2", scope: "3 files · +54 −2", rollback: "Revert isolated worktree",
    expiresAt: "2099-08-09T04:00:00.000Z", message: "Verified patch requires exact scoped approval"
  }]
];

export const demoEvents: AgentEvent[] = payloads.map(([source, type, payload], sequence) => ({
  ...base, eventId: `evt_demo_${sequence}`, sequence,
  timestamp: new Date(Date.UTC(2026, 7, 9, 3, 28, sequence * 2)).toISOString(), source, type, payload
}));

export const fileTree = [
  { name: "apps", kind: "folder", depth: 0 }, { name: "desktop", kind: "folder", depth: 1 },
  { name: "src", kind: "folder", depth: 2 }, { name: "app", kind: "folder", depth: 3 },
  { name: "App.tsx", kind: "tsx", depth: 4 }, { name: "components", kind: "folder", depth: 3 },
  { name: "services", kind: "folder", depth: 0 }, { name: "agent-runtime", kind: "folder", depth: 1 },
  { name: "src/index.ts", kind: "ts", depth: 2 }, { name: "repo-intelligence", kind: "folder", depth: 1 },
  { name: "packages", kind: "folder", depth: 0 }, { name: "event-protocol", kind: "folder", depth: 1 },
  { name: "tests", kind: "folder", depth: 0 }, { name: "router.test.ts", kind: "ts", depth: 1 }
];
