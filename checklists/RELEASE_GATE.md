# Milestone and Release Gate

For every M0–M10 milestone:

1. [ ] Deliverables in the roadmap are complete.
2. [ ] Specs/ADRs/interfaces are current.
3. [ ] Static/unit/integration/adversarial/security/a11y checks pass.
4. [ ] Relevant Skills have validation records; experimental Skills are disabled in production.
5. [ ] Benchmark regression and failure taxonomy reviewed.
6. [ ] No secrets, private repo content, model weights/cache or raw private prompts in Git status/history.
7. [ ] Third-party source locks, license notices and SBOM updated.
8. [ ] Changelog, reproduction commands, manifest and checksums generated.
9. [ ] D07 review has no blocker.
10. [ ] D11 handoff identifies completed/open/risks/next entry.
11. [ ] User explicitly approves exact GitHub action.
12. [ ] Branch pushed to `https://github.com/hanklin9188/Desk-Code-Agent`.
13. [ ] Draft PR and required CI green.
14. [ ] Merge/tag/release only after separate approval.

## Stop-ship

- Unauthorized filesystem/network/Git action.
- False PASS or required verification NOT_RUN.
- Critical prompt injection/secret/path escape.
- Original repo modified outside worktree.
- Quantized/default profile without quality/safety gate.
- UI can approve remote action without target/hash/reversibility.
- Reduced-motion or keyboard workflow broken.
- Installer cannot stop/remove local services.

## Current G3 release-gate snapshot (2026-08-09)

- [x] G3 preregistration, repository/task/provenance manifests, cue audit, and scoring policy were sealed before model calls.
- [x] Repository-disjoint G3 primary, long-horizon, real-patch, onboarding, ablation, scale, mutation, stability, crash, security, UI, telemetry, and failure-taxonomy artifacts are immutable and indexed.
- [x] ADR 0012 retains E-MIN-V2; E-MIN-V3 and conditional routing are not promoted; Multi-Agent and semantic review remain disabled.
- [x] No actual unsafe mutation occurred in the primary comparison; crash recovery emitted no fake PASS; security fuzz passed 1,000/1,000.
- [ ] Autonomous-patch quality gate: BLOCKED — E1/V2/V3 each passed 0/60 exact historical patches and naturalistic holdout success was 6/96, 3/96, and 2/96.
- [ ] Root project license: NEED_OWNER_DECISION; dependency license metadata: 137 authoritative external lookups plus 2 manual/legal reviews remain.
- [ ] Approved reduced-precision snapshot and quantization comparison: BLOCKED_APPROVAL.
- [ ] Native Windows installer, upgrade/uninstall, keyboard, screen-reader, compositor, and signing QA: NOT_RUN/BLOCKED_EXTERNAL.
- [ ] Intentional source commit, canonical remote, push, draft PR, tag, release, and signing: BLOCKED_APPROVAL.

Evidence: `benchmarks/g3/G3_RESULTS_INDEX.json`, `docs/experiments/G3_FINAL_REPORT.json`, `docs/validation/2026-08-09-g3-generalization.md`, and ADR 0012.
