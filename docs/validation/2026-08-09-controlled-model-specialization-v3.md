# Controlled model-specialization corrected validation

Date: 2026-08-09  
Task: `dca-20260809-controlled-model-specialization`  
Canonical result: `docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.v4.json`  
Decision: `C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN`

## Correction audit

Post-seal standards review found a real fairness confound: the first candidate server used the snapshot's `generation_config.json` while the baseline snapshot had no such file. Request temperature was zero, but candidate-only `repetition_penalty=1.05` remained operative. `MODEL_SPECIALIZATION_V2_INVALIDATION.v3.json` therefore marks the first paired result invalid for model-only causal comparison without deleting it.

The launcher now pins shared `generationConfig: vllm` and vLLM Model Runner V1. The baseline had already used these effective generation defaults because its snapshot has no generation config; its hybrid architecture had already selected V1. The candidate was rerun only after corrected smoke and `MODEL_SPECIALIZATION_FAIRNESS_GATE.v3.json` passed. No task, prompt, oracle, scoring, retrieval, context, safety, or verification rule changed.

The first rendering of corrected data retained two old literal prose counts. Its raw rows, paired machine metrics, and gate were correct, but `MODEL_SPECIALIZATION_V3_REPORTING_SUPERSESSION.v4.json` supersedes that narrative. The canonical v4 report derives every count from the corrected immutable v3 rows; no additional model run occurred.

## Exact corrected results

| Phase | Baseline | Coder-3B | Difference | Paired bootstrap 95% |
|---|---:|---:|---:|---:|
| Oracle context | 0/42 | 0/42 | 0 pp | `[0, 0]` |
| Task understanding | 0/24 | 0/24 | 0 pp | `[0, 0]` |
| Navigation | 17/25 | 25/25 | +32 pp | `[+16, +52]` pp |
| Diagnosis | 2/25 | 5/25 | +12 pp | `[-8, +32]` pp |
| Patch only | 0/25 | 0/25 | 0 pp | `[0, 0]` |
| Planning | 7/12 | 9/12 | +16.67 pp | `[-16.67, +50]` pp |
| One-shot end to end | 0/25 | 0/25 | 0 pp | `[0, 0]` |
| Maximum-two-call retry | 0/25 | 0/25 | 0 pp | `[0, 0]` |

The candidate passed the diagnosis-or-one-shot sub-gate through diagnosis (+12 pp), the zero-safety-regression gate, and the 512 MiB VRAM-headroom gate. It failed the separately required patch-only ≥10 pp gate because patch success remained 0/25. Required-all promotion is therefore FAIL; no holdout or product routing change is permitted.

Non-retry schema validity improved 122/178→136/178 and unnecessary refusal fell 68%→44%, but neither is a promotion metric. Corrected runtime was load 33,890.52 ms, TTFT 24.87 ms, 100.10 tokens/s, and 13,316 MiB peak VRAM with 3,060 MiB headroom.

## Final safety and scope review

- Corrected model phase: 0 safety violations, 0 wrong-file edits, 0 rollback failures.
- Post-correction deterministic fuzz: 1,000/1,000 PASS.
- Shutdown: process absent, port clear, ephemeral key absent, GPU memory 0 MiB.
- The approved snapshot remains in the ignored cache; all critical hashes re-verify.
- No holdout was created or inspected. No 7B, quantized, or alternate model was acquired.
- No dependency install, sudo/admin operation, commit, remote, push, PR, tag, release, or signing occurred.

Spec review: PASS for the corrected controlled-development experiment. Standards review: PASS after invalidating the decoding-confounded result and superseding the stale prose rendering. The product decision remains conservative because exact behavioral patch capability did not improve.
