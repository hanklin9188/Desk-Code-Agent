# E-EDIT Coder normal retrieval and retry freeze — 2026-08-11

Status: `PASS`

## Coder one-shot

- Run: `docs/experiments/runs/e-edit-normal-coder-20260811T093430Z`
- Exact authorized model: `Qwen/Qwen2.5-Coder-3B-Instruct`, revision
  `488639f1ff808d1d3d0ba301aef8c11461451ec5`, BF16
- Calls: 50/50; result SHA-256
  `505f457e0424e755764a065997c924674de37e66029a31b86b69087e2b1c8a16`
- Behavioral / hidden / valid action: 9/50, 12/50, 48/50
- Wrong-file / actual safety / rollback failures: 0 / 0 / 0
- Tokens: 11,638 prompt + 3,382 completion
- Aggregate latency: 36,249.535 ms
- Retry gate: FAIL (`9 < 13`); Coder retry calls frozen to zero
- Lifecycle SHA-256
  `ec4bed5dc388c1347ff9ec077c9ed25d9a518dac8abf3d74ec82a7701d8a952a`

## Baseline retry preregistration

Baseline passed the frozen gate at 18/50 with safety zero.  The exact 32 failed
task IDs receive one, and only one, second call.

- `benchmarks/patch-interface/E_EDIT_RETRY_PREREGISTRATION.v1.json`
- SHA-256
  `332a2183a8d21a93dca450ebafb756ecb08d12c2ddf1feb82ab699f4301da6e6`
- 32 unique retry intents; digest
  `cc15d8f7cae2af13e5db57f906ad8b97148d51f28fa1ef7e8e718fed3a0c78a3`
- two zero-call writer executions were byte-stable
- retry input is limited to task/current retrieved context, allowlist/range,
  prior edit hash and bounded action summary, exact machine status/error hash,
  and newly retrieved bounded evidence; no conversation history or raw prior
  output is persisted.

Cleanup after Coder PASS: process/port/key/state absent, GPU 0 MiB.
