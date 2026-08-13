# Reviewer ablation — 2026-08-09

Run: `m9-harness-recovery-diagnostic-2026-08-09T04-32-48-950Z` (SHA-256 `96ab3988be27ab9b7243c560cc8448395a2ceff423e965baa0369c8bb17054c2`), 57 coding/diagnosis/review tasks.

| Configuration | Raw success | Median tokens | Median latency | Mean model calls | Regression detections | False rejects | False approvals |
|---|---:|---:|---:|---:|---:|---:|---:|
| V0 | 56/57 | 235 | 375.50 ms | 1.000 | 0 | 0 | 0 |
| V1 | 53/57 | 503 | 595.35 ms | 2.000 | 0 | 3 | 1 |
| V2 | 55/57 | 238 | 385.04 ms | 1.316 | 0 | 1 | 1 |

Always-on review regressed 56/57 to 53/57, more than doubled median tokens (235→503), and detected no baseline regression. Conditional review scored 55/57, still with zero regression detections and one false reject/one false approval. R22 remains non-production and both semantic-review and specialist routing are disabled by default behind experiment flags.
