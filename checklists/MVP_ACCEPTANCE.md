# MVP Acceptance Checklist

## Safety foundation — must pass first

- [ ] Repository source remains unchanged; all mutation occurs in task worktree.
- [ ] Tool allowlist and path confinement tests pass.
- [ ] No unrestricted shell exposed to LLM.
- [ ] High-risk actions require explicit approval.
- [ ] Prompt injection fixtures cannot change policy/remote/approval.
- [ ] Secret redaction and never-upload policy pass.

## Local inference

- [ ] vLLM/Qwen starts from local model path/cache under WSL2.
- [ ] Server binds to `127.0.0.1`, not LAN by default.
- [ ] Desktop can health-check, stream, cancel and recover requests.
- [ ] One model instance services all logical agents.
- [ ] Quality profile runs within RTX 4080 SUPER 16GB target envelope on the actual machine.

## Repo Intelligence

- [ ] GitHub URL and local folder ingest work.
- [ ] Base commit and manifest are recorded.
- [ ] File/language/build/test fingerprint is reproducible.
- [ ] Symbol/search index supports target languages.
- [ ] Evidence bundle carries file/line/hash/trust.
- [ ] Ground-truth relevant-file Recall@5 target is met on fixture suite.

## Analysis MVP

- [ ] Architecture report identifies verified entry points/modules.
- [ ] Findings distinguish evidence, measurement and hypothesis.
- [ ] Onboarding report includes evidence-backed commands and reading order.
- [ ] All report links resolve in UI.

## Coding MVP

- [ ] Task Contract → Plan → Patch → Test → Review → Result works end-to-end.
- [ ] Targeted and full tests execute in sandbox.
- [ ] Failed attempt rolls back cleanly.
- [ ] Retry is evidence-driven and bounded.
- [ ] Unplanned modified files block completion.
- [ ] Reviewer cannot approve when mandatory verification is not PASS.

## Desktop UX

- [ ] Primary views: Overview, Architecture, Flow, Code, Diff, Tests, Findings, Report.
- [ ] Backend event stream drives UI without blocking render thread.
- [ ] Reduced motion, keyboard navigation, focus order and contrast pass.
- [ ] Main workflows sustain target frame rate on reference hardware.
- [ ] No fake progress and no decorative always-on animation.

## Evaluation

- [ ] Direct prompt, single-agent, retrieval, verification, reviewer and multi-agent variants run from one manifest.
- [ ] Task success, hidden tests, retrieval, cost, latency, VRAM and failure taxonomy recorded.
- [ ] BF16 is quality baseline; INT4 is admitted only after task-level comparison.
- [ ] Every production Skill has paired validation record.

## GitHub M0/MVP sync

- [ ] User confirms repo creation/visibility and push authorization.
- [ ] Secret scan passes.
- [ ] Design/docs/schemas/skills/checklists committed intentionally.
- [ ] Tag matches milestone policy.
- [ ] CI passes on pushed commit.
