# G3 naturalistic open-ended preregistration — 2026-08-09

Status: **LOCKED BEFORE REPOSITORY ACQUISITION, TASK AUTHORING, OR MODEL CALLS**.

This generation tests frozen E-MIN-V2 and E-MIN-V3 without the answer-choice
shortcut that saturated G2. G2 remains valuable for regression, pipeline,
safety, retrieval-acquisition, and reproducibility checks, but its 210/210
ceiling cannot rank candidates or support a strong real-world superiority
claim.

The machine-readable protocol is
`benchmarks/g3/G3_PREREGISTRATION.json`. It fixes the following design before
any G3 repository is selected:

- 24 new public repositories split at repository level into 6 development,
  6 validation, and 12 holdout repositories.
- 192 open-ended tasks across local coding, cross-file coding, diagnosis,
  navigation, understanding, review, safety, and unsupported/escalation.
- 36 holdout-only long-horizon tasks and 60 new executable patch tasks.
- No answer options, decision tokens, required paths, benchmark labels, or
  task-specific answer shape in model-visible input.
- One shared pinned BF16 Qwen3.5-4B/vLLM environment, temperature zero, fixed
  seeds, reviewer off, and multi-agent off.
- A confirmatory holdout comparison plus separate validation-only context,
  evidence-order/range, call-depth, and deterministic routing experiments.
- No post-seal tuning, exclusion, prompt repair, K/fallback change, or route
  change.

The production default changes only for statistically supported end-to-end
quality, a preregistered task-subset gain with deterministic affordable
routing, a material safety/reliability gain, or materially lower cost at
non-inferior quality. Evidence completeness alone is insufficient.

Protected release actions and quantized-model acquisition remain prohibited.
