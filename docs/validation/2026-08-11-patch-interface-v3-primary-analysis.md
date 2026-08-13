# Patch Interface V3 primary analysis

Status: **PASS — E_EDIT_JUSTIFIED; P2_MINIMAL SELECTED**

The deterministic report writer analyzed exactly 840 valid primary observations
and preserved the seven V2 calls as excluded. It emitted an append-only failure
matrix, results artifact, promotion decision and results index with exact
sidecars.

## Primary behavioral results (successes / 50)

| Profile | P0 exact | P0 minimal | P1 diff | P2 range | P3 symbol | P4 tool |
|---|---:|---:|---:|---:|---:|---:|
| Qwen3.5-4B | 7 | 9 | 10 | 21 | 15 | 20 |
| Coder-3B | 0 | 0 | 0 | 12 | 12 | 3 |

P2 hidden-test successes were 27/50 baseline and 15/50 coder. P2 had 48/50
and 50/50 runtime-accepted actions respectively, zero wrong-file attempts, zero
forbidden mutation and zero safety violations.

The frozen discrete gate requires at least +8/50 for one model versus both P0
baselines, +15/100 pooled versus both P0 baselines, the matching hidden-test
gain, and zero wrong-file/safety regression. P2 passes with pooled behavioral
33 versus P0 exact 7 and P0 minimal 9. P3 also passes; P2 wins the preregistered
tie-break by pooled behavioral success, 33 versus 27. P4 does not qualify: it
has one wrong-file output attempt and gains only 14 pooled successes over P0
minimal.

## Other findings

- Paired P2 outcomes: baseline-only 12, coder-only 3, both-pass 9, both-fail 26.
- REPORT_ONLY availability had no measured effect in the matched 12-task A/B:
  neither model emitted REPORT_ONLY and behavioral results were identical in
  each profile (baseline 1/12, coder 0/12).
- Schema ladder does not show a clean monotonic behavioral penalty: baseline
  S0/S1/S2/S3 = 1/1/1/2 of 12; coder = 0/0/0/0. Representation choice, not
  field count alone, is the stronger observed factor.
- Granularity is a bundled edit-surface comparison, not a pure causal contrast.
  On its 12 tasks, whole-file scored 4/1, symbol 3/2, range 2/0 and minimal diff
  0/0 for baseline/coder; whole-file churn/transport differs and does not
  override the all-50 P2 gate.
- Across all 840 cells: 83 no-attempt outcomes, 342 attempted actions rejected,
  276 accepted edits with incorrect behavior, and 139 behavioral successes.
  Earliest failures concentrate at canonical patch construction (324), visible
  tests (136), syntax (89), action validation (78), and hidden tests (51).

Decision: `E_EDIT_JUSTIFIED`, selected interface `P2_MINIMAL`. Product mutation
remains disabled. Next: freeze a separate E-EDIT candidate and preregister the
100-call maximum normal-retrieval secondary phase before any call. Retry remains
conditional on at least 13/50 one-shot success per profile.
