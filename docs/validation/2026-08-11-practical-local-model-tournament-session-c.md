# Practical local 7B model tournament — Session C validation

Date: 2026-08-11  
Status: `PASS`  
Classification: `PRIMARY_EXECUTION_COMPLETE_WITH_PREREGISTERED_INFRASTRUCTURE_EXCLUSION`

Session C executed the frozen 95-task E-EDIT P2 screening once for each exact
candidate in the preregistered M1 → M2 → M3 order. It made 285 physical primary
calls and three identical non-primary telemetry calls. There were no retries,
reviewer calls, candidate-specific prompt/decoding changes, additional model
downloads, or protected Git/external actions.

## Durable call accounting

| Candidate | Primary calls | Event rows | Retry | Session-D eligibility |
|---|---:|---:|---:|---|
| M1 Qwen2.5-Coder-7B | 95 | 285 | 0 | `VALID_FOR_SESSION_D_ANALYSIS` |
| M2 FIM-7B | 95 | 285 | 0 | `VALID_FOR_SESSION_D_ANALYSIS` |
| M3 SWE-agent-LM-7B | 95 | 285 | 0 | `INFRASTRUCTURE_BLOCKED_NOT_SCORED` |

Every task has exactly one ordered `CALL_INTENT`, `CALL_STARTED`, and
`CALL_COMPLETED` event bound to the immutable observation hash. Checkpoint and
final observations are byte-semantically equal, task indices are 0–94 per
candidate, and all 285 observation IDs are unique.

M3 had two consumed post-call responses with `finishReason=length` at the
frozen 640-token limit. The runner classified them as transport failures, as
required by the sealed one-shot policy. They were not retried or silently
converted into model failures. An earlier M3 endpoint-readiness check failed
before any durable event or model request; the same sealed execution resumed
only after the endpoint was ready and is recorded as an allowed pre-call
recovery, not a scored retry.

## Operational capability record

| Metric | M1 | M2 | M3 (not scored) |
|---|---:|---:|---:|
| Exact source selected/included | 90/95 | 90/95 | 90/95 |
| Valid action | 92/95 | 89/95 | 22/95 |
| Syntax pass | 43/95 | 83/95 | 18/95 |
| Visible-test pass | 10/95 | 35/95 | 7/95 |
| Hidden-test pass | 17/95 | 54/95 | 2/95 |
| Strict behavioral success | 7/95 | 29/95 | 2/95 |
| Wrong-file / safety / rollback failure | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Transport failure | 0 | 0 | 2 |

These are sealed Session-C observations, not a Session-D comparison or product
decision. M3's capability values remain audit evidence only because its
candidate run is infrastructure-blocked.

## Standardized telemetry

| Metric | M1 | M2 | M3 |
|---|---:|---:|---:|
| Load time | 36.33 s | 35.80 s | 161.80 s |
| TTFT | 270.59 ms | 257.98 ms | 246.13 ms |
| Generation throughput | 73.59 tok/s | 76.52 tok/s | 76.15 tok/s |
| Median task latency | 733.51 ms | 798.55 ms | 706.60 ms |
| p95 task latency | 1,559.52 ms | 1,495.52 ms | 4,914.31 ms |
| Loaded idle VRAM | 13,466 MiB | 13,466 MiB | 13,466 MiB |
| Inference peak VRAM | 16,019 MiB | 13,492 MiB | 16,009 MiB |

The same sampling boundary was used for all candidates, and all three satisfy
`inference_peak_vram >= loaded_idle_vram`.

## Validation and boundary

- Candidate result/checkpoint/event/final/cleanup sidecars: PASS.
- Result summaries independently recomputed from 95 rows each: PASS.
- Serving identity and source closure: PASS.
- Raw prompt/output/action/hidden-oracle persistence: false.
- Model processes: 0; port 8000: clear; GPU allocation: 0 MiB.
- Ephemeral API key/state: absent; orphan worktrees: 0.
- TypeScript, test suite, source/secret/worktree checks: recorded by the final
  Session-C handoff.

Canonical artifact:
`docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_C.v1.json`
SHA-256: `32ff39c05b5ce6c64b57ac77085df2b5666750a8a5689d3ac801a683bd3ec683`.

Session D was not executed. It is a separate zero-primary-call analysis and
decision invocation. Product mutation remains disabled.
