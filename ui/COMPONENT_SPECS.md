# Key Component Specifications

## AgentFlowCanvas

**Inputs:** normalized graph, active spans, semantic events, reduced-motion flag.  
**Outputs:** selection events only; it cannot mutate workflow.

Acceptance:

- 1,000 historical events replay to identical final graph state.
- Node status reflects runtime state within 100ms.
- Selection has keyboard/list alternative.
- No more than one active travelling marker per physical model request.
- Retry edge includes reason/evidence.

## RepositoryExplorer

- Virtualized file/symbol/test/finding modes.
- Shows excluded/generated/vendor state.
- Exact SHA/index confidence visible.
- Multi-select cannot silently change task scope.
- Context menu actions flow through Task Contract, not direct tool calls.

## DiffWorkbench

- Monaco side-by-side/unified modes.
- Each hunk maps to patch-plan item, requirement and tests.
- Badges: proposed, syntax-green, targeted-green, full-green, reviewed, approved.
- Accept/revert acts on selected hunk/worktree with confirmation when dependent.
- Raw model explanation is secondary to evidence.

## VerificationPanel

- Stages: preflight, targeted, related, full, lint, typecheck, build.
- Status: queued/running/pass/fail/not-run/cancelled/timed-out.
- Shows trusted command ID and environment fingerprint.
- NOT_RUN cannot use success color/icon.
- Failure opens structured evidence first, raw log second.

## ApprovalManagementBar

- Appears only when a protected action is pending.
- Shows exact target, artifact hash, files/lines, network destination, rollback.
- Primary actions: Review details, Approve once, Deny.
- No default keyboard shortcut for destructive/remote approval.
- Hash/scope change invalidates approval and visibly resets state.

## LocalModelStatus

- Model/revision/profile/runtime/backend endpoint mode.
- VRAM used/total, tok/s, queue, context, health.
- `Local only`, `Network used` and cloud state are explicit.
- Does not imply privacy if Git clone/GitHub integration used network; per-run provenance remains available.
