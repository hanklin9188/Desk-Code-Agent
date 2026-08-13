# Instruction-load analysis — 2026-08-09

Token classes are estimated as characters/4 and stored separately from API-reported prompt tokens. The system prompt is counted as instruction; task, evidence, previous handoff/history, and relevant/irrelevant evidence are separate fields in every observation.

| Configuration | Instruction | Task | Evidence | History | Signal ratio | API total-token median |
|---|---:|---:|---:|---:|---:|---:|
| E1 | 25 | 14 | 25 | 0 | 61.54% | 135 |
| C1 | 25 | 49 | 19 | 0 | 73.12% | 164 |
| C5 | 45 | 49 | 52 | 0 | 68.75% | 279 |
| Always reviewer | 46 | 48 | 42 | 131 | 33.67% | 503 |
| E-MIN-V2 | 25 | 15 | 19 | 0 | 59.02% | 136 |

The strongest overload signal is history/handoff: always-review introduced 131 median history tokens and reduced signal ratio to 33.67%. Moving invariant verification/security into code and disclosing only a one-line Diagnosis or Review instruction produced E-MIN-V2 at 136 median tokens and 324/324 observations.
