# Practical local 7B model tournament — Session D validation

Date: 2026-08-11  
Status: `PASS` after append-only Session-D v2 final validation

Session D used only immutable Session A/B/C and E-EDIT reference evidence. It
made zero model calls, did not rerun M3, and did not alter thresholds, prompts,
retrieval, P2, model snapshots or scoring.

Validated outputs include deterministic 10,000-repetition task and repository-
cluster bootstrap intervals, exact McNemar tests, failure-stage decomposition,
performance/resource comparison, provenance, model/product decisions, M3
exclusion, retry eligibility and exactly one protocol-only next experiment.

The final validation runner executes the full design/type/test/build suite,
the existing deterministic patch-interface security regression, artifact
sidecar checks, source closure, lineage, secret scan, model-cache Git exclusion,
worktree checks and runtime cleanup before publishing Session-D v2.

Canonical results:

- `benchmarks/model-specialization/MODEL_TOURNAMENT_PAIRED_ANALYSIS.v1.json`
- `docs/experiments/model-specialization/MODEL_CAPABILITY_MATRIX.v5.json`
- `docs/experiments/model-specialization/MODEL_TOURNAMENT_MODEL_SELECTION.v1.json`
- `docs/experiments/model-specialization/MODEL_TOURNAMENT_PRODUCT_DECISION.v1.json`
- `docs/experiments/model-specialization/MODEL_TOURNAMENT_RESULTS_INDEX.v2.json`
- `docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_D.v2.json`

Final decisions are `NO_MODEL_PROMOTED` and `KEEP_MUTATION_DISABLED`. The next
experiment is protocol-only and was not started.
