# Single-agent optimization — 2026-08-09

The final E1–E7 generation is `m9-harness-recovery-final-2026-08-09T04-43-33-470Z` (SHA-256 `a5f37342e3f080d1b7dee1f0dbceca8867a3057958609f00bf5ad9f7e5c65097`). The post-diagnostic E-MIN iteration is `m9-harness-recovery-optimized-2026-08-09T05-00-34-145Z` (SHA-256 `89d5fbaf59b06a6d9a9b69f8fc5858b1abcb19357a010c0d3cbb60f88af844dd`).

E1 scored 321/324 observations (107/108 unique tasks), while E-MIN scored 318/324 (106/108) with deterministic retrieval/verification/policy seams. Removing the redundant workflow sentence and replacing the full model-facing contract with task-conditional progressive disclosure produced E-MIN-V2 at 324/324 (108/108 unique tasks), 136 median tokens, 152 p95 tokens, 341.62 ms median, 396.55 ms p95, one model call, and zero wrong-action attempts.

E-MIN-V2 pipeline:

`immutable task artifact → symbol Top-2 (hybrid fallback) → C1 task+source → one agent → code-enforced verification/safety/rollback`

The 100% follow-up is post-diagnostic tuning on the same 108-task suite; it requires a new holdout or external benchmark before being treated as a generalization estimate.
