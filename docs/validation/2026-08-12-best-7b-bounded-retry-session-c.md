# BEST 7B Bounded Retry — Session C Validation

Status: `PASS_COMPLETE`

Session C performed deterministic analysis only. It made zero model calls,
started no FIM/vLLM process, reran no task, and produced no third attempt.

## Result

- One-shot: 29/95 (30.53%).
- Maximum two calls: 30/95 (31.58%).
- Absolute gain: 1/95, or +1.05 percentage points.
- Eligible recovery: 1/66 (1.52%); unsuccessful retries: 65/66.
- Same failure stage: 55/66; exact repeated edit: 42/66.
- Safety: zero wrong-file attempts, actual safety violations, and rollback
  failures. Four `SAFETY_REJECTED` proposals were blocked before mutation.
- Cost: 66 calls, 35,877 prompt tokens, 4,485 completion tokens, and
  63,193.95 ms added latency for one recovered task.

The frozen retry gate result is `RETRY_NO_MATERIAL_GAIN`. Maximum-two-call FIM
retains only the assisted floor and misses research 33/95, strong 40/95, and
product 57/95. Retry is not admitted to the default harness. Product mutation
remains `KEEP_MUTATION_DISABLED`.

Exactly one next experiment is selected and prepared but not executed:
`SEMANTIC_FAILURE_DECOMPOSITION`.

## Verification

- standalone strict TypeScript: PASS;
- project typecheck: PASS;
- complete Vitest suite: PASS;
- production build: PASS;
- design validation: PASS;
- patch-interface security regression: PASS, 1,540/1,540;
- artifact sidecars and lineage: PASS;
- secret scan and model-cache Git exclusion: PASS;
- independent Spec review: PASS;
- independent Standards review: PASS;
- runtime cleanup: PASS (zero model/compute processes, port 8000 clear,
  ephemeral state absent, zero temporary experiment directories, one worktree).

Canonical evidence:

- `docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_C.v1.json`
- `docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_RESULTS_INDEX.v2.json`
- `docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_C_COMPLETION_SUPPLEMENT.v1.json`
