# M5 bounded coding validation — 2026-08-09

## Result

`PASS` for the deterministic bounded-coding workflow. This result validates
reproduction, diagnosis, constrained mutation, visible and withheld verification,
dual-axis review, policy blocks, cancellation, and exact rollback. It does not
claim model coding quality; model invocation is explicitly `NOT_RUN` in this run
and remains an M9 experiment.

## Immutable hidden-oracle run

Final run: `m5-hidden-oracle-2026-08-09T01-07-30-366Z`  
SHA-256: `1808c796860c2806a738d3f676b3e7735c97931ba68db39cdf683bfb2e687717`

The pinned manifest contains twenty unique task categories. Twelve coding cases
execute a real RED command, falsify the misleading initial hypothesis, support a
bounded implementation hypothesis, apply an approved-file/line-budget patch,
run the visible oracle, materialize and run the withheld oracle, independently
aggregate Spec and Standards reviews, then restore the exact baseline. Eight
policy/artifact cases exercise source/test affinity, repository prompt injection,
forbidden paths, timeout and cancellation, patch budget, missing oracle,
architecture-wide scope, and rollback after a verification failure.

| Metric | Result |
|---|---:|
| Tasks | 20 / 20 PASS |
| Coding hidden-test success | 12 / 12 |
| First-patch success | 12 / 12 |
| Diagnosis accuracy | 12 / 12 |
| Spec/Standards approval | 12 / 12 |
| Wrong-file edit rate | 0 |
| Regression escape rate | 0 |
| Retry rate | 0 |
| End-to-end duration | 2,501.243 ms |

The preceding `m5-hidden-oracle-2026-08-09T01-06-16-533Z` result is preserved
as FAIL because the TypeScript visible oracle lacked a target path. The manifest
was corrected to pin `src/types.ts`; the failure was not relabelled. The following
PASS at `01-06-43-568Z` predates per-task dual-axis aggregation and is also kept.

## Boundaries

- All child processes use a registered executable and argument array with no shell.
- Repository instructions are untrusted data and grant zero permissions.
- `TIMED_OUT`, `CANCELLED`, `FAIL`, and `NOT_RUN` remain distinct from `PASS`.
- Process-constrained execution is reported honestly; this run does not claim
  kernel-level network isolation.
- Hidden-oracle files are withheld until after visible verification succeeds.
- No user repository, Git index, remote, commit, push, PR, or release was mutated.
