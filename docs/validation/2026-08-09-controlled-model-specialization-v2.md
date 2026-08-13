# Controlled model-specialization continuation v2 validation

Date: 2026-08-09  
Task: `dca-20260809-controlled-model-specialization`  
Result: `PASS_EXECUTION / FAIL_DEVELOPMENT_PROMOTION_GATE`  
Decision: `C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN`

## Scope and authorization

- The v1 task contract was preserved byte-for-byte at `implementation/task-contracts/dca-20260809-controlled-model-specialization-v1.json`.
- The active v2 contract and `MODEL_ACQUISITION_AUTHORIZATION.v2.json` authorize only `Qwen/Qwen2.5-Coder-3B-Instruct` revision `488639f1ff808d1d3d0ba301aef8c11461451ec5` for this project's non-commercial research, evaluation, and experimental development.
- No 7B, quantized, alternate, or fallback model was downloaded. No dependency installation, sudo/admin action, Git commit/remote/push/PR, tag, signing, or release occurred.

## Acquisition and runtime validation

- Exact snapshot path: `.runtime/model/huggingface/hub/models--Qwen--Qwen2.5-Coder-3B-Instruct/snapshots/488639f1ff808d1d3d0ba301aef8c11461451ec5`.
- Twelve files totaling 6,183,465,285 bytes were inventoried and hashed. The eight preregistered critical hashes passed, both BF16 shards named by the index exist, Qwen2ForCausalLM/32768 native context was verified, and the chat-template hash is `cd8e9439f0570856fd70470bf8889ebd8b5d1107207f67a5efb46e342330527f`.
- The local Qwen Research License and model-card hashes are recorded without changing the root project license or adding model files to Git.
- The first pre-call candidate start exposed a vLLM 0.26.0 V2-runner dependency on unavailable CUDA UVA. The shared V1 runner was explicitly pinned; this matches the V1 runner already selected by the hybrid Qwen3.5 baseline. Targeted tests passed 5/5 and typecheck passed before retry.
- Candidate smoke passed exact model identity, load, ordinary completion, streaming, JSON Schema, malformed handling, timeout, cancellation, sequential requests, queueing, 8K context rejection, UTF-8/code/diff transport, and shutdown cleanup.
- Candidate runtime: load 36,463.46 ms, TTFT 46.66 ms, 98.75 tokens/s, idle/peak VRAM 13,316/13,316 MiB, device headroom 3,060 MiB.

## Fairness and execution

- `MODEL_SPECIALIZATION_FAIRNESS_GATE.v2.json` passed before any candidate capability call.
- Frozen E-MIN-V2, retrieval, C1 packaging, tasks, oracles, prompts, schemas, seed, temperature, retry rules, constrained patch runtime, deterministic verification, safety, reviewer-off, and multi-agent-off settings were preserved.
- The preregistration prose says 205 observations, but the sealed counts `42+24+25+25+25+12+25+25` equal 203. The exact sealed IDs/counts controlled; no task was generated, dropped, replaced, tuned, or rescored.
- The candidate completed all 203 calls/observations with immutable hash-only output evidence.

## Paired results and gate

| Phase | Baseline | Coder-3B | Difference |
|---|---:|---:|---:|
| Oracle context | 0/42 | 0/42 | 0 pp |
| Task understanding | 0/24 | 0/24 | 0 pp |
| Navigation | 17/25 | 23/25 | +24 pp |
| Diagnosis | 2/25 | 1/25 | -4 pp |
| Patch only | 0/25 | 0/25 | 0 pp |
| Planning | 7/12 | 7/12 | 0 pp |
| One-shot end to end | 0/25 | 0/25 | 0 pp |
| Maximum-two-call retry | 0/25 | 1/25 | +4 pp |

Navigation had seven coder-only and one baseline-only paired wins; its deterministic paired bootstrap 95% interval was `[+4 pp, +44 pp]`. This secondary gain cannot satisfy the frozen coding promotion gate. Patch-only gain was below 10 pp, and neither diagnosis nor one-shot gained 10 pp. Safety and VRAM gates passed, but the required-all promotion result is FAIL.

## Safety, cleanup, and regression

- Baseline and candidate each had 0 actual safety violations, 0 wrong-file edits, and 0 rollback failures.
- Fresh deterministic security fuzz: 1,000/1,000 PASS across traversal, shell-metacharacter, injection, encoded instruction, symlink, oversized content, malformed filename, and fake-approval cases.
- Candidate cleanup: process absent, port 8000 clear, ephemeral API key absent, GPU memory 0 MiB. Temporary candidate fixture worktrees are absent; the approved snapshot remains in the ignored cache.
- Full regression: design validation 854 files / 39 Skills / 24 schemas / 5 Agents, 0 warnings and 0 errors; typecheck PASS; 23 test files and 94 tests PASS; production build PASS.
- All v2 SHA-256 sidecars pass, the candidate snapshot re-verifies after execution, and the prior v1 results-index hash remains `7b16d31fe883894484afb6c44a9aee7145d19523869d4104d431009e0f9247e4`.

## Independent review axes

Spec review: PASS for the controlled development experiment. Exact acquisition, local license provenance, smoke, pre-call fairness, paired execution, behavioral verification, promotion decision, cleanup, and immutable reporting are complete. The holdout was correctly not created because the required gate failed.

Standards review: PASS. Loopback-only serving, ephemeral secret handling, ignored weights, sequential residency, deterministic safety/verification, exact rollback, no raw prompt/output persistence, no original-repository mutation, and protected-action boundaries remained intact. The V1 compatibility pin is shared and restores effective runner parity; it is not a candidate-specific prompt or reasoning optimization.

## Product and release consequence

No candidate freeze, fresh holdout, model switch benchmark, routing ADR, autonomous mutation enablement, 7B protocol/acquisition, or release-gate promotion is allowed from this result. ADR 0013/0014 and the existing release blockers remain controlling.
