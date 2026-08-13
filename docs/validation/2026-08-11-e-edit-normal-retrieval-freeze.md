# E-EDIT normal-retrieval zero-call freeze — 2026-08-11

Status: `PASS`

## Decision boundary

Patch Interface V3 selected `P2_MINIMAL` under the preregistered
`E_EDIT_JUSTIFIED` gate.  The production mutation default remains disabled and
the frozen E-MIN-V2 artifact was not modified.  This phase creates a separate
development-only `E-EDIT-P2-V1` candidate.

## Immutable artifacts

- `docs/experiments/patch-interface/E_EDIT_CANDIDATE.v1.json`
  - SHA-256 `7abdcd7cfe84b3e3e6844ecc81c8a4c783a9af53e45dcbb0489fa0e157a32fbc`
- `benchmarks/patch-interface/E_EDIT_NORMAL_RETRIEVAL_PREREGISTRATION.v1.json`
  - SHA-256 `937e4a80d871d63626cee70b22a1248af22eae2a4b395a63870cf01c023dd6b3`

Both sidecars match exact bytes.  A second writer execution reproduced both
hashes exactly.

## Frozen secondary design

- unchanged retrieval: `E-MIN-V2`, hybrid fallback Top-2, C1, 2,048-token cap;
- selected action surface: structured P2 range edit;
- 50 development tasks per profile, one call each, no retry;
- baseline intent digest
  `856af2b114c08ed3feb577caef91391cafacc1c77eb1088f1e530ec5f24db988`;
- Coder-3B intent digest
  `be7a94f65d6523e3014363fbdb6095cbcc68c7ac833f9f930f359e4c05bdd077`;
- combined 100-intent digest
  `f4ef0be03c7722b16a61404aa458a4f43f2ce4928f64915b3c7c1d16a3e19039`.

The prompt receives normal retrieval context plus the deterministic mutation
allowlist/range.  It does not receive the known root cause, a forced complete
source/test context, hidden assertions, or the reference fix.

## Verification

- standalone strict TypeScript: PASS;
- project typecheck: PASS;
- full Vitest: 26 files / 130 tests PASS;
- 100 request intents unique and deterministically regenerated;
- hidden/root-cause/reference-fix leak checks: PASS;
- hard user/network/PID sandbox required by the runner;
- no Git commit in fixtures (`git init` only);
- vLLM absent, port 8000 clear, GPU allocation 0 MiB, serving state absent;
- no model call or protected action occurred during this phase.

## Next gate

Execute the exact baseline 50-call one-shot normal-retrieval schedule, seal the
result, stop the model, and publish lifecycle cleanup evidence before starting
Coder-3B.
