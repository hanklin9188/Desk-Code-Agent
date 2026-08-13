# Practical Local 7B Model Tournament — Session B

Date: 2026-08-11  
Status: `MODEL_TOURNAMENT_SESSION_B = PASS`  
Primary tournament calls: `0`  
Non-primary endpoint requests: `30`  
Session C executed: `false`

## Outcome

All three explicitly authorized BF16 snapshots were downloaded only into the
repository's ignored local Hugging Face cache and verified against their exact
pinned revisions. Each candidate independently passed the frozen vLLM online
FP8 per-tensor W8A8 load and the same non-primary compatibility/fairness suite.
No model, revision, precision, context, prompt, decoding or interface fallback
was used.

| ID | Identity/license result | Load | Idle VRAM | Peak VRAM | TTFT | Throughput | Outcome |
|---|---|---:|---:|---:|---:|---:|---|
| M1 | exact snapshot; pinned Apache-2.0 LICENSE | 43.25 s | 13,466 MiB¹ | 12,696 MiB | 31.01 ms | 76.45 tok/s | ready for separate Session C |
| M2 | official Apache-2.0 metadata/card; no standalone LICENSE | 48.74 s | 12,696 MiB | 12,696 MiB | 30.29 ms | 76.50 tok/s | ready for separate Session C |
| M3 | exact snapshot; pinned Apache-2.0 LICENSE | 47.18 s | 12,696 MiB | 12,696 MiB | 28.71 ms | 76.53 tok/s | ready for separate Session C |

¹ M1's immutable first smoke artifact selected the first nonzero load sample
instead of the post-ready idle sample. A separate reload made zero inference
calls and recorded five identical 13,466 MiB idle samples. The supplement
supersedes only that telemetry field; the original artifact remains unchanged.
Its smoke peak belongs to the first load, so it is not compared as the maximum
of the separate supplement load.

## Acquisition and provenance

- M1: 14 files; BF16 weights 15,231,271,864 bytes; exact authorized revision.
- M2: 16 files; BF16 weights 15,231,271,864 bytes; exact authorized revision.
  The pinned repository still lacks a standalone LICENSE. Official model
  metadata and the pinned model card identify Apache-2.0; this technical record
  is not legal approval.
- M3: 14 files; BF16 weights 15,231,271,864 bytes; exact authorized revision.
- Every local file, config, tokenizer and weight hash was inventoried. LFS
  weight SHA-256 values match the official pinned-revision tree.
- No pre-quantized, AWQ, GPTQ, INT4, alternate-model or alternate-revision
  snapshot was downloaded.

## Frozen smoke and fairness checks

The cross-candidate request-intent digest is
`c314e57a5a1cd66c6e699c61988e3432f136f379a6b52071141947c21229e23c`.
Every candidate used temperature 0, seed 20260809, max context 8192, GPU
utilization 0.82, max one sequence and `generation-config=vllm`.

Each candidate passed:

- exact served model identity and online `fp8_per_tensor` attestation;
- E-EDIT P2 constrained JSON compatibility;
- deterministic sequential and queued structured responses;
- UTF-8 structured output;
- streaming, TTFT and throughput measurement;
- timeout and explicit cancellation;
- over-context rejection at the unchanged 8192-token cap.

The first M1 launch exposed a launcher `multiprocessing` re-import bug before
the first endpoint call. The `O_EXCL` attestation gate failed closed. The event,
zero-call status and cleanup were sealed; the launcher was corrected with an
explicit `__main__` boundary and M1 then passed without profile changes.

## Immutable evidence

- Session B: `e2d05ad3f5b6b7ff97e37bfd256d94995c1dd5be830a6246454059786f5da833`
- M1 acquisition: `69ed9e00b59f030c5fd829145a0ae09e4124437fd67c42c973fa9e70f66c9cf1`
- M1 smoke: `17ed5e3377cf478ab9097955456acfb526eb2362446e955dfbf4a969c94dfd34`
- M1 idle supplement: `34c4f8f15473ae173ad11bbbcfffdce9028f54df7796fa7036f14ab35b3b0cc1`
- M2 acquisition/smoke: `cf8e77a5bf0fe8828c1f8deeacc9c87c995a05546efde46341eeccee29998fb6` / `f703dc5ac518c1abb93a1a9ceba60ef70462fca3dcf043896308157cea7d67c6`
- M3 acquisition/smoke: `f2e92741c5f3f5f9b8f23356e4fdcef3290839f19c5769ebf1c36a1eef35fedc` / `bce992060e68d7bd1039df58b36a6e50201cf6c1367fe4aa31cf8fff05819857`

All JSON artifacts have byte-exact SHA-256 sidecars. The Session-B record binds
the acquisition, smoke, cleanup and implementation source closure.

## Boundary cleanup and stop

- Model processes: 0.
- Port 8000: clear.
- GPU memory: 0 MiB.
- Ephemeral API key and serving state: absent.
- Protected Git/GitHub/release actions: none.
- Session C: not started; it requires a separate invocation.
