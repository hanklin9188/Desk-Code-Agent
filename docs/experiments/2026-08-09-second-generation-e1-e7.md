# Second-generation E1–E7 report — 2026-08-09

## Classification and benchmark

The original `m9-e1-e7-2026-08-09T01-18-51-568Z` remains immutable and is explicitly **PILOT / DIAGNOSTIC**: six unique tasks, three repeated seeds, and success increments of 16.67 percentage points. It is not final generalization evidence.

Generation 2 uses 108 distinct deterministic synthetic tasks: Coding 33, Diagnosis 15, Repository navigation 15, Review 12, Analysis 15, Safety 18; L1/L2/L3/L4 = 17/28/54/9. Manifest SHA-256 is `ec6f36072709fc701ad6028918794474bf266304f67e9ece14e3b4fb6c14a368`. The 3-seed run contains 2,592 observations and uses pinned Qwen revision `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`, BF16, vLLM 0.26.0, temperature 0.

| Config | Observation success | Unique-task success | Rate | Cluster Wilson 95% CI | Tokens median/p95 | Latency median/p95 | Mean model calls |
|---|---:|---:|---:|---:|---:|---:|---:|
| E1 | 321/324 | 107/108 | 99.07% | 94.94%–99.84% | 135/143 | 347.13/391.91 ms | 1.000 |
| E2 | 315/324 | 105/108 | 97.22% | 92.15%–99.05% | 163/173 | 355.01/399.71 ms | 1.000 |
| E3 | 318/324 | 106/108 | 98.15% | 93.50%–99.49% | 188/198 | 356.70/398.29 ms | 1.000 |
| E4 | 318/324 | 106/108 | 98.15% | 93.50%–99.49% | 164/174 | 355.40/395.52 ms | 1.000 |
| E5 | 318/324 | 106/108 | 98.15% | 93.50%–99.49% | 179.5/189 | 363.53/406.04 ms | 1.000 |
| E6 | 315/324 | 105/108 | 97.22% | 92.15%–99.05% | 181/450 | 370.64/604.71 ms | 1.194 |
| E7 | 315/324 | 105/108 | 97.22% | 92.15%–99.05% | 181/450 | 363.44/590.04 ms | 1.194 |
| E-MIN | 318/324 | 106/108 | 98.15% | 93.50%–99.49% | 179.5/189 | 360.38/400.36 ms | 1.000 |
| E-MIN-V2 follow-up | 324/324 | 108/108 | 100.00% | 96.57%–100.00% | 136/152 | 341.62/396.55 ms | 1.000 |

The cluster confidence interval uses 108 unique tasks, not 324 repeated observations, to avoid seed pseudoreplication. Per-category counts are stored in the immutable run. Peak VRAM was 12046 MiB.

## Root causes and decision

The pilot degraded because E3 searched the constant query `export` and simultaneously removed visible task/source information; E4 changed both evidence and wrapper format; E6 used a free-form second-agent handoff; E7 injected verbose duplicated policy. Those were confounded comparisons, not isolated Skill effects.

Generation 2 shows that task-aware evidence and minimal packaging preserve quality, while adding context or another model pass does not. E-MIN-V2 is the best current default for this synthetic suite. Direct prompt remains an essential control. Reviewer/multi-agent remain rejected for production default.

## Limitations

These are curated multiple-choice/action fixtures with hidden answer/policy/report oracles, not full SWE-bench patches or unseen real repositories. E-MIN-V2 was tuned after viewing diagnostic/final failures on this same suite. A fresh holdout, real patch execution corpus, and external repository tasks remain required before a release-quality generalization claim or M9 final gate.
