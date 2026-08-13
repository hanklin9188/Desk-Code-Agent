# Practical Local 7B Model Tournament — Session A

Date: 2026-08-11  
Status: `MODEL_TOURNAMENT_SESSION_A = PASS`  
Tournament model calls: `0`  
Model weights acquired: `0`

## Frozen scientific scope

Session A freezes a practical local model tournament over the disclosed,
no-longer-untouched 95-task mutation population from the completed E-EDIT
holdout. The 25 non-mutation tasks remain deterministic zero-call policy and
safety evidence. E-MIN-V2 retrieval, C1 context, the P2 range-edit schema and
system/prompt semantics, action validation, constrained patching, verification,
hidden behavioral oracle, rollback, scoring and failure taxonomy are unchanged.

The existing Qwen3.5-4B BF16 result (23/95 strict behavioral success) is reused
without another reference call. This screening tournament cannot directly make
a product claim; any candidate promotion still requires a new repository-
disjoint untouched holdout.

## Candidate identity

| ID | Immutable repository/revision | Declared license | Role |
|---|---|---|---|
| M1 | `Qwen/Qwen2.5-Coder-7B-Instruct@c03e6d358207e414f1eca0bb1891e29f1db0e242` | Apache-2.0, pinned LICENSE | generic coder control |
| M2 | `TIGER-Lab/FIM-7B@5a1d4294185e4fa0bbd40750c87d0beab7e67a3a` | Apache-2.0 model metadata; no standalone LICENSE at the pin | FIM/agentic candidate |
| M3 | `SWE-bench/SWE-agent-LM-7B@a44fce0216647696a7437126e82fc1eaa34008d7` | Apache-2.0, pinned LICENSE | SWE-trajectory candidate |

All three report `Qwen2ForCausalLM`, 7,615,616,512 BF16 parameters and the
same 15,231,271,864 weight bytes. Metadata/config/tokenizer/chat-template hashes
and exact acquisition commands are recorded in the candidate manifest. The M2
license-file caveat must be rechecked at acquisition; this technical record is
not legal approval.

## Feasibility

The RTX 4080 SUPER exposes 16,376 MiB. Candidate BF16 weights alone occupy
14,525.67 MiB. Using the previously measured 4B BF16 vLLM peak to estimate
non-weight runtime margin projects a 7B BF16 peak above physical memory, so
BF16 is rejected as not safely feasible.

The selected matched candidate profile is
`VLLM_ONLINE_FP8_PER_TENSOR_W8A8` for M1, M2 and M3, with the official BF16
snapshot as the source and `--quantization fp8_per_tensor` under vLLM 0.26.0.
Its projected steady-state headroom is recorded, but fit, transient load peak,
quality and structured-output compatibility are not claimed until Session-B
smoke evidence exists. OOM or incompatibility becomes `INFRASTRUCTURE_BLOCKED`;
there is no automatic AWQ/GPTQ/BitsAndBytes or context fallback.

This gives a matched practical comparison among the three 7B candidates. The
comparison against historical 4B BF16 is explicitly not a pure scale or
model-only causal comparison.

## Frozen gates

- Research-level signal: at least 33/95.
- Assisted-patch floor: at least 29/95.
- Strong-candidate target: at least 40/95.
- Product promotion: at least 57/95.
- Wrong-file attempts, actual safety violations and rollback failures: zero.
- One shot per task; no model-specific retry, prompt, evidence or decoding.
- Existing holdout is screening evidence only; a new untouched holdout is
  mandatory before product promotion.

## Immutable evidence

- Candidate manifest: `0ff04ada4842631ca3973b380667daa9b58f592c1b090e18b6903beb553066e1`
- Feasibility: `141a0aa14d6190286121bf8fb0fb676279b7f6b09c966fbb4f98fa725d7531c7`
- Preregistration: `51f983f63719494e8877eb7b24fcbc7a47b0b9fb53d5c1e2bb838961b87246c1`
- Session A: `9d6a610829405f146ee36651961273bd25c9d6264a1c54c1e20917e186af7200`
- Tournament composite: `ad2166cad3e2b64319346bd9f543296a5c8e568d7740c96890e373a984d8d5b4`
- 95 task IDs: `82397a366d715769fb72e94cb9dd968967cdabc5004da7b3cd787de29193f80b`

Publication was rerun and recovered byte-identically. All four sidecars,
the 14-file execution source closure, frozen E-EDIT candidate hash, holdout seal,
manifest and sealed oracle hashes passed.

## Validation and cleanup

- Targeted Session-A tests: 3/3 PASS, with red evidence before implementation.
- Standalone strict TypeScript: PASS.
- Full repository check: design validation 1,225 files / 39 Skills / 24
  schemas / 5 agents / zero errors; TypeScript PASS; 27 test files / 133
  tests PASS; production build PASS.
- Frozen patch-interface security evidence: 1,540/1,540 PASS and zero rejected-
  action patch attempts.
- Boundary-aware secret scan over new Session-A sources/artifacts: PASS.
- Artifact SHA-256 sidecars and 14-file source closure: PASS.
- Model/cache Git exclusion: PASS; the existing Python environment's ignored
  package data is not a tournament model snapshot.
- Tournament/vLLM process: absent.
- Port 8000: clear.
- GPU memory: 0 MiB.
- Ephemeral API key: absent.
- Candidate cache directories: absent.
- GitHub/release/protected actions: none.

## Next gate

Session B is `BLOCKED_APPROVAL`. Before any download, the owner must explicitly
approve each exact `modelId@revision` BF16 source snapshot. Session B then
acquires and smokes one approved candidate at a time, rechecks license and
snapshot identity, validates exact FP8 serving behavior and cleans the GPU
before another candidate. This Session-A run stops here.
