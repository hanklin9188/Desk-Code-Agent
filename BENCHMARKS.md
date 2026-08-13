# Benchmarks and Research Findings

Status: `FROZEN`  
Research conclusion: `RESEARCH_COMPLETE_INCONCLUSIVE_FORMATION_RESULT`  
Product mutation: `KEEP_MUTATION_DISABLED`

This page is the short, portfolio-facing index to the sealed research record. It does not replace immutable result indexes or validation reports. Values with different denominators are never treated as directly interchangeable.

## Outcome vocabulary

| Outcome | Meaning | Not sufficient for |
|---|---|---|
| Valid action | Schema and bounded-action contract accepted | Syntax or behavior |
| Syntax validity | Proposed or resulting source parses/type-checks at the measured stage | Correct software behavior |
| Visible behavioral verification | Declared visible behavior passes executable checks | Hidden behavior or any unmeasured product gate |
| Hidden verification | Held-out behavior passes without exposing the oracle to the model | Generalization beyond that frozen population |
| Strict success | All required retrieval, action, safety, syntax, visible/hidden behavior, and rollback gates pass | Generalization beyond that frozen population |

Counts from development routing, untouched holdouts, model screening, semantic observability, and code-formation recovery are separate populations. They are not pooled into one headline success rate.

## Capability routing

The G4 development routing evaluation covered 72 observations. Structured cross-file planning routed 12 tasks to `SUPPORTED` and passed 12/12. Complete-context navigation routed 12 to `ASSISTED` and passed 6/12. Diagnosis, behavioral patching, and onboarding synthesis routed to `REPORT_ONLY`; autonomous mutation routed zero tasks.

Source: [`CAPABILITY_ROUTING_EVALUATION.json`](docs/experiments/g4-capability/CAPABILITY_ROUTING_EVALUATION.json)

## Practical local model tournament

| Model | Strict behavior | Status |
|---|---:|---|
| Qwen3.5-4B BF16 reference | 23/95 | Below assisted |
| Qwen2.5-Coder-7B FP8 | 7/95 | Below assisted |
| FIM-7B FP8 | 29/95 | Assisted floor only |
| SWE-agent-LM-7B FP8 | 2/95 observed | Infrastructure-blocked; not scored |

FIM-7B materially outperformed the matched generic 7B control under practical FP8 7B serving, but did not establish a material improvement over the BF16 4B reference and missed the 33/95 research, 40/95 strong-candidate, and 57/95 product thresholds. Precision and architecture differ, so this is not a pure scale comparison. The final decision was `NO_MODEL_PROMOTED`.

Sources: [`MODEL_CAPABILITY_MATRIX.v6.json`](docs/experiments/model-specialization/MODEL_CAPABILITY_MATRIX.v6.json), [`MODEL_TOURNAMENT_SESSION_D.v2.json`](docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_D.v2.json), [ADR 0016](adrs/0016-no-model-promoted-after-practical-7b-tournament.md)

## Bounded retry

The strongest scored candidate moved from 29/95 one-shot strict successes to 30/95 at maximum two calls. One of 66 eligible failures recovered. The sealed decision was `RETRY_NO_MATERIAL_GAIN`; retry was not admitted as a default.

Source: [`BEST_7B_BOUNDED_RETRY_SESSION_C.v1.json`](docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_C.v1.json)

## Failure decomposition and observability

The first L0 decomposition classified 66 failures: T11 retrieval 5, T12 action representation 2, T13 syntax/code formation 6, and T14 inconclusive 53. In the later exactly paired 44-failure privacy-safe study, L0 supported 13 non-T14 failures and L1 supported 28. Supported T1–T9 semantic causes rose from 0/44 to 15/44, high/medium confidence rose from 13/44 to 28/44, and T14 fell from 31/44 to 16/44.

The L1 path retained zero raw model outputs, raw edit bodies, raw identifiers, raw literals, parser messages, or HMAC key material. No additional model calls were required.

Sources: [`SEMANTIC_FAILURE_DECOMPOSITION_SESSION_B.v1.json`](docs/experiments/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_SESSION_B.v1.json), [`PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V3_PAIRED_OBSERVABILITY_REPORT.v3.json`](docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V3_PAIRED_OBSERVABILITY_REPORT.v3.json)

## Code-formation closure

The original paired code-formation experiment reached zero valid actions in both conditions and was invalid for formation-effect inference because the formation stage was never reached and control variables diverged. A fresh control-recovery generation was preregistered, but its single non-primary sanity response failed the allowed-range gate. Zero primary calls ran. The correct conclusion is inconclusive, not a negative or positive formation effect.

Source: [`CODE_FORMATION_CONTROL_RECOVERY_RESULTS_INDEX.v6.json`](docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_RESULTS_INDEX.v6.json)

## Measured FIM runtime

The sealed tournament reports 76.5 generation tokens/s, 799 ms median latency, 1,496 ms p95 latency, and 13,492 MiB inference peak VRAM for FIM-7B FP8. These are historical measurements on the recorded environment, not live desktop telemetry or general hardware requirements.

Source: [`MODEL_TOURNAMENT_FINAL_REPORT.v1.json`](docs/experiments/model-specialization/MODEL_TOURNAMENT_FINAL_REPORT.v1.json)

## Claim boundary

Synthetic development results, exact historical-patch identity, privacy observability, and model rankings answer different questions. None independently authorizes autonomous repository mutation. Current product admission remains the conservative routing policy documented in [CAPABILITY_STATUS.md](docs/productization/CAPABILITY_STATUS.md).
