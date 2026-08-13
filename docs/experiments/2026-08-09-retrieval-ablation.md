# Retrieval ablation — 2026-08-09

Run: `m9-harness-recovery-diagnostic-2026-08-09T04-32-48-950Z` (SHA-256 `96ab3988be27ab9b7243c560cc8448395a2ceff423e965baa0369c8bb17054c2`). This is a 108-task expanded synthetic diagnostic, one temperature-zero seed.

| Configuration | Raw success | Rate | Precision@K | Recall@K | MRR | Relevant-token ratio | Median total tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| R-LEX-1 | 105/108 | 97.22% | 0.991 | 0.356 | 0.991 | 99.07% | 162 |
| R-LEX-2 | 105/108 | 97.22% | 0.954 | 0.687 | 0.995 | 93.20% | 188 |
| R-SYM-2 | 106/108 | 98.15% | 1.000 | 0.719 | 1.000 | 100.00% | 188 |
| R-HYB-1 | 105/108 | 97.22% | 1.000 | 0.360 | 1.000 | 100.00% | 162 |
| R-HYB-2 | 105/108 | 97.22% | 0.986 | 0.710 | 1.000 | 97.85% | 188 |
| R-HYB-3 | 103/108 | 95.37% | 0.923 | 0.975 | 1.000 | 93.05% | 207 |
| R-HYB-5 | 103/108 | 95.37% | 0.716 | 1.000 | 1.000 | 57.18% | 245 |

Symbol Top-2 is the retained primary: 106/108, Precision 1.000, MRR 1.000, no irrelevant retrieved tokens, and 188 median tokens. Hybrid Top-3/5 reached more evidence but regressed success to 103/108; Top-5 had 42.82% irrelevant-token ratio. This directly demonstrates that Recall@K=1 is insufficient and that less evidence performs better for this Qwen3.5-4B fixture suite.

Production policy: exact-symbol Top-2 when a symbol exists; hybrid Top-2 only as fallback. Tests/callers are progressively retrieved only when source evidence is insufficient. Duplicate-evidence ratio was zero for every configuration. Retrieval latency was below 0.2 ms median and is negligible relative to model latency.
