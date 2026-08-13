# E-EDIT Untouched Holdout — Session B Validation

Date: 2026-08-11  
Session: B (Phases 4–9 only)  
Status: PASS  
Scientific one-shot outcome: `E_EDIT_HOLDOUT_GATE_FAIL`

`PASS` denotes complete preregistered execution, evidence publication and
cleanup. It does not denote E-EDIT promotion.

## Inputs revalidated before the first call

- E-EDIT candidate: `7abdcd7cfe84b3e3e6844ecc81c8a4c783a9af53e45dcbb0489fa0e157a32fbc`
- Holdout preregistration V2: `5e1d4ece269cd807f625ef7f0c41b1867dce5600f25e4080bfcf02746e4833c5`
- Holdout manifest V5: `36e13ea25be42009ea98738687b6e854f75a2de0c75c3cd2ad0e0df2b04d3014`
- Hidden oracle V5: `3109a023ed5c07faa4acc029824bf8988f9ee0515ecc7b1ea07387861d5d787d`
- Session-A seal V2: `51b7c6d79d7f07eab84017488aeae6aa8a061430af36eda3df34348b76f9f823`
- Execution source closure: PASS, 18/18 files
- Repository revisions: PASS, 15/15
- Prior holdout model calls: 0

## Immutable runs

- Baseline result: `8358b36d6bebd8b5a5322497698e7679552f5018c9825ee83febcb060b51323e`
- E-EDIT result: `e6eb86b1837525581c134fc0e3cc24ea51e83bfeac7594af76809338b17f797f`
- Retry branch: `b317464943c2c9623353143a42539208bf4706ff9e65720b63b81c0bb6c63592`
- Paired results V2: `9564d1c970c08fe2654c62b41ec0fb8d71f6c10d4e803338891fd76effef1f20`
- Promotion decision V2: `816d457d295654806b6aac3d35bb710c83c6fceca8e22920a58f7774b788be22`
- Session-B record V2: `8a553c4cd080c71282c71148f146bf9198b359b1ff16268eeba1e839312ec4b9`
- Baseline lifecycle: `646ef54e1e4a6eeed3e72bee7943555469ddefaca350d20f42e1b8c99b42fa28`
- E-EDIT lifecycle: `dc52fafcb0015ff00208f884a74e68df9e80db917598f2497b4b5ad134fa9f4c`

Every JSON result listed above has a byte-exact SHA-256 sidecar. Each one-shot
run has exactly 95 checkpoint observations and 190 ledger events: 95
`CALL_STARTED` plus 95 `CALL_COMPLETED`.

## One-shot results

| Metric | Baseline P0_EXACT | E-EDIT P2 |
|---|---:|---:|
| Model calls | 95 | 95 |
| Valid actions | 0 | 89 |
| Patch construction PASS | 0 | 89 |
| Syntax PASS | 0 | 71 |
| Visible test PASS | 0 | 33 |
| Hidden test PASS | 0 | 42 |
| Strict behavioral success | 0 | 23 |
| Wrong-file attempts | 0 | 0 |
| Actual safety violations | 0 | 0 |
| Rollback failures | 0 | 0 |
| Policy successes (zero model calls) | 25 | 25 |
| Prompt tokens | 17,172 | 18,977 |
| Completion tokens | 22,345 | 5,769 |
| Total latency | 305,618.85 ms | 84,839.33 ms |

Total token overhead for E-EDIT was -37.38%; total latency overhead was
-72.24%. These pass the frozen maximum-overhead gates.

## Paired analysis

- Both pass: 0
- Baseline only: 0
- E-EDIT only: 23
- Both fail: 72
- Baseline success: 0.00%
- E-EDIT success: 24.21%
- Absolute difference: +24.21 percentage points
- Task-paired bootstrap 95% CI, 10,000 repetitions, seed 20260811:
  +15.79 to +32.63 pp
- Repository-cluster bootstrap 95% CI: +16.84 to +32.63 pp
- Exact two-sided McNemar p-value: `2.384185791015625e-7`

## Frozen gates

Passed:

- at least +15 tasks and +15 percentage points over baseline;
- hidden success non-regression;
- 0 wrong-file regression;
- 0 actual safety regression;
- 0 rollback regression;
- E-EDIT valid actions at least 86/95;
- token overhead at most 20%;
- latency overhead at most 25%.

Failed:

- E-EDIT behavioral success at least 57/95: observed 23/95;
- assisted-only floor at least 29/95: observed 23/95.

Therefore the exact outcome is `E_EDIT_HOLDOUT_GATE_FAIL`.

## Retry and lineage

The retry prerequisite required at least 29/95 E-EDIT successes with zero
safety and rollback failures. The observed 23/95 did not qualify. Retry is
sealed as `NOT_ELIGIBLE_ZERO_CALLS`; potential first-attempt failures were not
called again.

- Historical physical calls before holdout: 979
- Baseline calls: 95
- E-EDIT calls: 95
- Retry calls: 0
- Total physical lineage: 1,169
- Duplicate calls: 0
- Silent retries: 0

## Cleanup and regression

- Qwen3.5-4B/vLLM process: absent
- Port 8000 listener: absent
- GPU memory after cleanup: 0 MiB
- Ephemeral API key and serving state: absent
- Orphan worktrees: absent
- Temporary holdout fixtures: absent
- Project typecheck: PASS
- Vitest: 26 files and 130 tests PASS
- Protected actions: none

## Boundary

Session B is complete. This invocation stops before Session C. No product
mutation decision, capability promotion, 7B protocol or release change is made
here. Product mutation remains disabled until Session C consumes these sealed
results.
