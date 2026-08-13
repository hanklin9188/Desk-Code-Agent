# BEST 7B bounded retry — Session B validation

Status: `PASS_SESSION_B_EXECUTION_COMPLETE_NO_DECISION`

Session B executed only the 66 request intents sealed by Session A. It did not
rerun a first attempt, call M1/M3, make a third call, invoke a reviewer, or enter
Session C.

## Execution evidence

- Eligibility: 66 tasks — visible-test 47, hidden-test 6, syntax/type 6,
  retrieval 5 and action-validation 2.
- Physical retry calls: expected 66, actual 66.
- Call lineage: 198 ordered `RETRY_CALL_INTENT` / `RETRY_CALL_STARTED` /
  `RETRY_CALL_COMPLETED` events; duplicate, silent-retry and unmatched counts
  are zero.
- Outcomes: recovered 1, failed-different 12, repeated-edit 42,
  contradiction 4, malformed 3, safety-rejected 4, infrastructure-failure 0.
- Most frequent transition: `VISIBLE_TEST → VISIBLE_TEST` (44). One transition
  reached `VISIBLE_TEST → SUCCESS`.
- Tokens: 35,877 prompt and 4,485 completion.
- End-to-end latency: 63,193.95 ms total; median 816.83 ms; p95 2,335.01 ms.

## Safety and privacy

- Wrong-file attempts: 0.
- Actual safety violations: 0.
- Rollback failures: 0.
- Hidden oracle/reference fix/raw prompt/raw output persistence leaks: 0.
- Patch-interface deterministic security regression recovered PASS at
  1,540 instances / 77 structural templates.
- Secret scan and model-cache Git exclusion pass.

## Telemetry limitation

The run's per-process `nvidia-smi` query returned an unsupported nonnumeric
value, and the executor's ready marker was created after endpoint readiness.
The immutable raw result is retained. An append-only supplement marks load
time, loaded-idle VRAM, inference-peak VRAM and TTFT as `NOT_MEASURED`; it does
not convert missing values to zero or substitute historical tournament data.

## Regression and cleanup

- Standalone strict TypeScript: PASS.
- Project typecheck: PASS.
- Design validation: PASS with zero warnings/errors.
- Complete test suite: 143/143 PASS.
- Bounded-retry targeted tests: 7/7 PASS.
- Artifact sidecars and 66-row/198-event cross-binding: PASS.
- Model stopped; process count 0; port 8000 clear; GPU allocation 0 MiB;
  ephemeral key/state absent; orphan worktrees 0.

Canonical Session-B record SHA-256:
`631769a8d1b2dae6c27970a9898c18e4db028d225e484fa4d1ac05212b32b4e5`.

No model-promotion, product-mutation or retry-value decision was made. Session C
requires a separate invocation.
