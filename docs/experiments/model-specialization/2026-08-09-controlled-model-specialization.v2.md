# Controlled model-specialization experiment — paired continuation v2

Date: 2026-08-09  
Decision: **C — no material code-specialization gain**  
Status: **candidate complete; development promotion FAIL; no holdout, routing, or 7B acquisition**

## Model acquisition and license

Only `Qwen/Qwen2.5-Coder-3B-Instruct@488639f1ff808d1d3d0ba301aef8c11461451ec5` was downloaded. All 12 snapshot files were hashed; config is Qwen2ForCausalLM/BF16, the two indexed shards are present, and the local LICENSE/model card hashes are recorded. Use is limited to the explicitly approved non-commercial research, evaluation, and experimental development scope.

## Gateway validation

Candidate load, exact `/models`, ordinary, streaming, JSON Schema, malformed handling, timeout, cancellation, sequential, queue, 8K cap, UTF-8/code/diff, and shutdown cleanup passed. The first pre-call start selected vLLM V2 and failed because CUDA UVA was unavailable; pinning the V1 runner already selected by the hybrid baseline restored runner parity before any candidate capability call.

## Frozen task-count reconciliation

The prose label says 205 observations, while the sealed phase counts sum to 203: 42/24/25/25/25/12/25/25. The sealed IDs and counts were preserved exactly; no two tasks were invented to repair the label.

## Paired capability results

| Phase | Baseline | Coder-3B | Change |
|---|---:|---:|---:|
| Oracle-context reasoning | 0/42 | 0/42 | 0.00 pp |
| Task understanding only | 0/24 | 0/24 | 0.00 pp |
| Frozen retrieval navigation | 17/25 | 23/25 | 24.00 pp |
| Diagnosis only | 2/25 | 1/25 | -4.00 pp |
| Patch-only behavioral execution | 0/25 | 0/25 | 0.00 pp |
| Structured planning | 7/12 | 7/12 | 0.00 pp |
| One-shot frozen E-MIN-V2 end to end | 0/25 | 0/25 | 0.00 pp |
| Maximum-two-call evidence retry | 0/25 | 1/25 | 4.00 pp |

Navigation improved from 17/25 to 23/25, but patch-only stayed 0/25, diagnosis fell 2/25→1/25, one-shot stayed 0/25, and bounded retry improved only 0/25→1/25.

## Development promotion gate

FAIL. Patch-only gain was 0 pp (requires ≥10 pp); diagnosis was −4 pp and one-shot 0 pp (one requires ≥10 pp). Safety passed at 0 violations and candidate peak VRAM 13316 MiB left 3060 MiB headroom, but these cannot replace the failed behavioral gates.

## Structured output and refusal

Non-retry schema validity was 122/178 (68.54%) versus 129/178 (72.47%). Unnecessary refusal fell from 68.00% to 44.00%, but patch and one-shot success remained zero.

## Safety and rollback

Both model phases had 0 actual violations, 0 wrong-file edits, and 0 rollback failures. Fresh deterministic fuzz passed 1,000/1,000, and final cleanup verified process/port/key absence with GPU memory at 0 MiB.

## Runtime

Baseline→Coder: load 58588.42→36463.46 ms; TTFT 69.78→46.66 ms; throughput 75.28→98.75 tok/s; peak VRAM 12022→13316 MiB.

## Decisions

- Fresh holdout: not created or inspected because the development gate failed.
- Product routing: unchanged; no ADR and no autonomous mutation.
- Model-switch benchmark: not run because multi-model routing is not justified.
- 7B/quantized/other model: not selected or downloaded; trigger failed.
- Existing G3/G4 evidence and old inconclusive v1 reports remain immutable.

## Protected actions

No dependency install, sudo/admin operation, Git commit, remote configuration, push, PR, tag, signing, release, or other protected external side effect occurred. The approved 3B snapshot remains only in the ignored local runtime cache.
