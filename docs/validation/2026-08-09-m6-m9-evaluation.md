# M6 Skill admission and M9 evaluation — 2026-08-09

## M6 L1/L2

Run `m6-l1-l2-2026-08-09T01-13-06-538Z` (`3f33823786821c6c09f7e1c73e96e3094928204c750997d2b90af442e6f1c62b`) is PASS.

- L0: 39/39 Skills.
- Nine high-impact Runtime Skill candidates: 9/9 L1 PASS.
- Each candidate: 17 fixtures, repeated twice; 306 executions total.
- L2: one real cross-runtime flow with 15/15 integration checks PASS.
- Safety violations: zero in L1/L2.
- Production promotion before L3: zero.

## Original M6 L3 and M9 E1–E7 pilot

Immutable run `m9-e1-e7-2026-08-09T01-18-51-568Z` (`ff00d43950028aa373d32bcccebc7271d6850a6fb770833eb9a372c069d84cb3`) is an experiment-completion PASS, not a quality PASS for E7 and not generalization evidence.
The exact Qwen revision, BF16, vLLM 0.26.0, six tasks, three independent
seeds, temperature zero and constrained schema were fixed. All nine admission
records pass their JSON Schema and include a bootstrap 95% CI.

The effective sample was exactly six unique tasks. The 16.67 percentage-point
increments are therefore expected. This result is classified **PILOT /
DIAGNOSTIC** and remains unchanged below.

| Config | Success | Median tokens | Median latency |
|---|---:|---:|---:|
| E1 Direct Prompt | 83.33% | 139.5 | 349.24 ms |
| E2 Task Contract | 83.33% | 177.5 | 326.63 ms |
| E3 Retrieval | 66.67% | 164 | 360.74 ms |
| E4 Context Packaging | 33.33% | 191 | 327.37 ms |
| E5 Single-Agent Workflow | 50.00% | 215 | 328.89 ms |
| E6 Multi-Agent Review | 33.33% | 451 | 656.95 ms |
| E7 Full Skill Harness | 16.67% | 235.5 | 322.18 ms |

Multi-agent review regressed success by 16.67 percentage points and added
109.77% tokens. No candidate was promoted: R01/R08/R09/R22 missed thresholds;
R04/R17/R18/R21/R26 pairs changed multiple components and were not attributable;
R26 also had safety violations. At that point the evidence-backed registry
correctly recorded nine EXPERIMENTAL and zero PRODUCTION Skills.

## Expanded harness recovery

The second-generation manifest has 108 unique deterministic tasks: Coding 33,
Diagnosis 15, Repository navigation 15, Review 12, Analysis 15 and Safety 18.
Difficulty counts are L1/L2/L3/L4 = 17/28/54/9. Its SHA-256 is
`ec6f36072709fc701ad6028918794474bf266304f67e9ece14e3b4fb6c14a368`.

The diagnostic run
`m9-harness-recovery-diagnostic-2026-08-09T04-32-48-950Z`
(`96ab3988be27ab9b7243c560cc8448395a2ceff423e965baa0369c8bb17054c2`)
contains 1,575 retrieval, context and reviewer observations. The fixed
Generation 2 run
`m9-harness-recovery-final-2026-08-09T04-43-33-470Z`
(`a5f37342e3f080d1b7dee1f0dbceca8867a3057958609f00bf5ad9f7e5c65097`)
contains 2,592 observations: 108 tasks × three seeds × eight configurations.

| Config | Raw success | Unique tasks | Rate | Median tokens | Median latency | Mean model calls |
|---|---:|---:|---:|---:|---:|---:|
| E1 Direct Prompt | 321/324 | 107/108 | 99.07% | 135 | 347.13 ms | 1.000 |
| E2 Task Contract | 315/324 | 105/108 | 97.22% | 163 | 355.01 ms | 1.000 |
| E3 Symbol Top-2 | 318/324 | 106/108 | 98.15% | 188 | 356.70 ms | 1.000 |
| E4 C1 Context | 318/324 | 106/108 | 98.15% | 164 | 355.40 ms | 1.000 |
| E5 Single Agent | 318/324 | 106/108 | 98.15% | 179.5 | 363.53 ms | 1.000 |
| E6 Conditional Specialist | 315/324 | 105/108 | 97.22% | 181 | 370.64 ms | 1.194 |
| E7 Full Conditional Harness | 315/324 | 105/108 | 97.22% | 181 | 363.44 ms | 1.194 |
| E-MIN | 318/324 | 106/108 | 98.15% | 179.5 | 360.38 ms | 1.000 |

The post-diagnostic E-MIN-V2 follow-up
`m9-harness-recovery-optimized-2026-08-09T05-00-34-145Z`
(`89d5fbaf59b06a6d9a9b69f8fc5858b1abcb19357a010c0d3cbb60f88af844dd`)
scored 324/324 (108/108 unique tasks), with 136 median tokens, 341.62 ms
median latency, one model call and zero wrong-action attempts. It was tuned
after inspecting failures on the same suite, so this is optimization evidence,
not an unseen holdout estimate.

Symbol Top-2 achieved Precision@2 1.0 and MRR 1.0. C1 preserved the E3 raw
success count while reducing median tokens from 188 to 164, admitting R09
alone to PRODUCTION. Always-on and conditional semantic review found zero
regressions and introduced false decisions, so reviewer and specialist calls
remain experiment-gated. The other eight evaluated candidates remain
EXPERIMENTAL.

Full analysis and limitations are in
`docs/experiments/2026-08-09-second-generation-e1-e7.md` and
`docs/validation/2026-08-09-m9-harness-recovery.md`.

Reduced precision remains `NOT_RUN`: no pinned AWQ/GPTQ snapshot is present,
and acquiring another model is a protected network/model action.
