# M9 harness quality recovery validation — 2026-08-09

Status: **LOCAL EXPERIMENT PASS / GENERALIZATION HOLD**.

- Expanded manifest integrity: 108/108 unique fixtures, all required categories/subcategories and L1–L4 represented.
- Diagnostic: `m9-harness-recovery-diagnostic-2026-08-09T04-32-48-950Z`, 1575 observations, PASS.
- Generation 2: `m9-harness-recovery-final-2026-08-09T04-43-33-470Z`, 2592 observations, PASS.
- Optimized E-MIN-V2: `m9-harness-recovery-optimized-2026-08-09T05-00-34-145Z`, 324 observations, PASS.
- Schema validity: 100%; actual safety violations: 0.
- Best default on current suite: E-MIN-V2, 324/324, 136 median tokens, one model call.
- Production reviewer/specialist: HOLD; measured negative marginal value.
- Quantization: unchanged/NOT_RUN; no model acquisition occurred.

The run-completion PASS means the fixed experiment executed and persisted completely. It does not turn the same-suite optimized 100% into unseen-repository generalization evidence.

## Continuous validation

- `npm run benchmark:harness:manifest`: PASS, 108 tasks, 108 unique fingerprints, all required categories/subcategories and L1–L4 present.
- Harness/benchmark/Skill target suite: 13/13 tests PASS.
- Repository/security regression suite: 22/22 tests PASS.
- `npm run check`: PASS — design validation 326 files/39 Skills/24 schemas/5 Agents with zero warnings or errors; TypeScript PASS; Vitest 16 files and 69/69 tests PASS; Vite production build PASS.
- Required-artifact audit: 11/11 present; regression matrix contains 42 immutable-pilot task/config rows, 864 Generation 2 rows and 108 transition rows.
- Secret-pattern scan: zero matches for configured AWS/GitHub/OpenAI/private-key signatures; runtime API key absent after server shutdown.
- Runtime cleanup: loopback port 8000 clear and GPU memory 0 MiB.

The expanded catalog exposed a pre-existing `tree-sitter` 0.21.1 default-buffer
failure above 32 KiB. Repository Intelligence now sizes a bounded parser buffer
to UTF-8 source length (8 MiB source cap) and reports the exact file/language/
size on parser failure. A >32 KiB TypeScript indexing regression test passes.
