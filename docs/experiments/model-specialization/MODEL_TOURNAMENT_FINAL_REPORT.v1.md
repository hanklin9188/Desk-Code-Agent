# Practical Local 7B Model Tournament — Session D Final Report

## Tournament Status

Sessions A–D are complete. Session D made zero model calls and used only sealed
evidence. Physical Session-C lineage is 285 primary calls, three standardized
telemetry calls, 855 ordered events, zero retries, zero reviewer calls, zero
duplicate observations and zero silent retries.

## Scored Models

- Reference: Qwen3.5-4B BF16, 23/95 strict behavioral success.
- M1: Qwen2.5-Coder-7B-Instruct FP8, 7/95.
- M2: FIM-7B FP8, 29/95.

## Excluded Models

M3 SWE-agent-LM-7B remains `INFRASTRUCTURE_BLOCKED_NOT_SCORED`. Its 95 physical
calls remain in lineage, but its descriptive results are excluded from ranking,
promotion and winner selection.

## Full Capability Matrix

| Metric | Qwen3.5-4B | M1 Qwen Coder 7B | M2 FIM-7B | M3 diagnostic only |
|---|---:|---:|---:|---:|
| Exact source selected | 90/95 | 90/95 | 90/95 | 90/95 |
| Valid action | 89/95 | 92/95 | 89/95 | 22/95 |
| Syntax pass | 71/95 | 43/95 | 83/95 | 18/95 |
| Visible-test pass | 33/95 | 10/95 | 35/95 | 7/95 |
| Hidden-test pass | 42/95 | 17/95 | 54/95 | 2/95 |
| Strict behavioral | 23/95 | 7/95 | 29/95 | 2/95 |
| Wrong-file / safety / rollback failure | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

## Threshold Classification

- Reference 23/95: `BELOW_ASSISTED`.
- M1 7/95: `BELOW_ASSISTED`.
- M2 29/95: `ASSISTED_FLOOR`; it does not reach 33/95 research, 40/95 strong,
  or 57/95 product thresholds.
- M3: `NOT_SCORED`.

## M1 vs 4B Paired Result

Both pass 4, 4B-only 19, M1-only 3, both fail 69. M1 is −16.84 percentage
points; task bootstrap 95% CI `[-26.32, -8.39]`, repository-cluster CI
`[-26.88, -7.29]`, exact McNemar `p=0.00085545`. This is a material practical
regression, not evidence of a generic scale benefit.

## M2 vs 4B Paired Result

Both pass 15, 4B-only 8, M2-only 14, both fail 58. M2 is +6.32 points; task CI
`[-3.16, 15.79]`, repository-cluster CI `[0, 12.5]`, McNemar `p=0.28628`.
The observed direction is positive but material/statistical improvement over
the 4B reference is inconclusive.

## M2 vs M1 Paired Result

Both pass 5, M1-only 2, M2-only 24, both fail 64. M2 is +23.16 points; task CI
`[13.68, 32.63]`, repository-cluster CI `[14.74, 31.25]`, McNemar
`p=0.00001049`. This supports `MATERIAL_FIM_AGENTIC_GAIN` under the matched 7B
profile, without claiming pure causal isolation.

## Syntax Failure Shift

Earliest syntax failures are reference/M1/M2 = 17/49/6. M1 adds 32 versus the
reference; M2 removes 43 versus M1 and 11 versus the reference. Paired syntax
pass M2 versus M1 is +42.11 points, task CI `[30.53, 52.63]`, cluster CI
`[32.29, 52.17]`, McNemar `p=4.62e-10`.

## Visible-Test Failure Shift

Earliest visible failures are 34/30/47. M2's larger raw failure bucket reflects
many more edits advancing past syntax; it is not evidence that M2 is worse at
the paired visible gate. Paired visible pass versus M1 is +26.32 points, task CI
`[16.84, 35.79]`, cluster CI `[16.84, 35.42]`, McNemar `p=1.62e-6`.

## Hidden-Test Failure Shift

Earliest hidden failures are 10/3/6. Paired hidden pass M2 versus M1 is +38.95
points, task CI `[28.42, 49.47]`, cluster CI `[29.17, 50]`, McNemar
`p=3.02e-9`.

## Action Interface Finding

Valid-action rates are 89/95, 92/95 and 89/95 for the three scored conditions.
P2 compliance is effectively solved at this screening level. The large
correctness differences arise after the interface, principally in syntax and
behavioral reasoning.

## Generic 7B Effect

`PRACTICAL_LOCAL_MODEL_EFFECT = MATERIAL_REGRESSION`. M1 does not improve over
the 4B reference. Parameter count alone is not supported as an explanation.

## FIM / Agentic Specialization Effect

`MATERIAL_FIM_AGENTIC_GAIN` is supported against M1 under matched model scale,
architecture family, FP8 profile, task set, prompt, retrieval, interface and
verification. The inference is bounded to the whole post-training/model package.

## M3 Infrastructure Finding

Both affected calls generated exactly 640 completion tokens and ended with
`finishReason=length`. The structured runtime then produced `INVALID_JSON`, and
the frozen runner coarsened that error to `TRANSPORT_FAILURE`. No network,
endpoint or serializer failure was observed. The cap was reached after token
generation but before a valid structured action existed. This occurred only on
M3, while the handling path is generic; model-specific causality is not proven.

## Performance

| Metric | M1 | M2 |
|---|---:|---:|
| Load | 36.33 s | 35.80 s |
| TTFT | 270.59 ms | 257.98 ms |
| Throughput | 73.59 tok/s | 76.52 tok/s |
| Input / output / total tokens | 18,140 / 5,443 / 23,583 | 18,140 / 6,120 / 24,260 |
| Median / p95 latency | 733.51 / 1,559.52 ms | 798.55 / 1,495.52 ms |
| Loaded idle / inference peak | 13,466 / 16,019 MiB | 13,466 / 13,492 MiB |

Session-C standardized telemetry supersedes the historical M1 idle/peak
inconsistency. Both satisfy peak ≥ idle.

## RTX 4080 SUPER Feasibility

M2 has 2,884 MiB (17.61%) measured peak headroom on the 16,376 MiB GPU and
clean sequential lifecycle evidence. M1 has only 357 MiB (2.18%) headroom,
which is operationally fragile despite no observed OOM. A future product should
use one selected resident model, not simultaneous multi-model residency.

## License / Provenance

M1 and M3 have a pinned standalone Apache-2.0 LICENSE plus official metadata.
M2 official metadata/model card declares Apache-2.0, but its pinned snapshot
still lacks a standalone LICENSE. That caveat remains a product gate and is not
upgraded into a legal conclusion.

## Model Winner Decision

`NO_MODEL_PROMOTED`. M2 is the highest scored candidate, but rank and 29/95 are
insufficient under the all-gates policy. It misses research/product thresholds,
lacks established paired gain over the 4B reference, retains a provenance
caveat, and was evaluated on disclosed screening reuse rather than a new product
holdout.

## Product Mutation Decision

`KEEP_MUTATION_DISABLED`. No assisted, experimental bounded or autonomous
mutation route is enabled. E-EDIT P2 remains a research interface.

## Retry Eligibility

M2 meets the inherited retry prerequisite: exactly 29/95, zero actual safety
violations, and zero rollback failures. `BEST_7B_BOUNDED_RETRY_PROTOCOL` is
justified as a new protocol only. No retry call was made in Session D.

## Next Experiment

Exactly one next experiment is selected: a separately sealed bounded M2 retry
generation over its 66 deterministic failures, maximum one evidence-driven
second call each. The protocol forbids hidden-oracle answers, expected patches,
semantic review, human patches, tuning and fallback. It is not authorized or
started by Session D.

## Portfolio-Facing Technical Finding

Simplifying the mutation interface removed most action-generation friction,
but matched 7B post-training—not parameter count alone—was associated with
whether valid edits became correct repository patches. FIM-7B materially beat
generic Qwen Coder 7B, yet did not establish a reliable gain over the 4B BF16
reference or satisfy product gates.

## Validation

Canonical machine-readable evidence is the Session-D artifact, paired analysis,
capability matrix and results index. Final project, security, checksum, closure,
lineage, secret, cache and runtime checks are sealed by Session-D v2 validation.

## Cleanup

No vLLM/model process is present; port 8000 is clear; GPU use is 0 MiB; the
ephemeral API key/state and temporary worktrees are absent.

## Remaining Protected / External Blockers

Model calls for the retry protocol, any new model or precision, sudo/admin,
commit, remote configuration, push, PR, tag, release and signing remain
unauthorized. Native Linux/Windows packaging, accessibility, root licensing and
external release gates remain separate blockers.
