# E-EDIT normal-retrieval baseline — 2026-08-11

Status: `PASS`

- Run: `docs/experiments/runs/e-edit-normal-baseline-20260811T093200Z`
- Exact model: Qwen3.5-4B revision
  `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`, BF16
- Planned / completed physical calls: 50 / 50
- Result SHA-256:
  `a68eb6ff018632b3c787dafe678f6802ec06e27ef71396ab07aee7ae84cf0cb1`
- Behavioral success: 18/50 (36%)
- Hidden-test success: 23/50
- Valid P2 actions: 46/50
- Exact source selected/included by E-MIN-V2: 50/50 and 50/50
- Wrong-file attempts / actual safety violations / rollback failures: 0 / 0 / 0
- Tokens: 12,377 prompt + 4,944 completion
- Aggregate model-call latency: 69,726.707 ms
- Retry prerequisite: PASS (`18 >= 13`, safety violations 0)
- Lifecycle SHA-256:
  `96e572b4f9bc50c1b4e5def00bbc8a76b987010cf0fe34cbb3bb79a589cbed74`

Cleanup PASS: process absent, port 8000 clear, GPU 0 MiB, API key and
serving-state attestations removed, no temporary patch fixture, and one Git
worktree only.

This is development-only evidence and does not enable product mutation.
