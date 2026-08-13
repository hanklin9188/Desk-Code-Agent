# BEST 7B bounded retry — Session A validation

Status: `PASS_SESSION_A_ZERO_CALL`

Session A froze the new bounded-retry generation without starting vLLM,
loading FIM-7B, or issuing a model request. It did not rerun or replace any
historical first attempt.

## Frozen evidence

- Exact candidate: `TIGER-Lab/FIM-7B` revision
  `5a1d4294185e4fa0bbd40750c87d0beab7e67a3a`.
- The existing 16-file, 15,247,186,377-byte snapshot was fully rehashed against
  the sealed Session-B acquisition inventory.
- M2 reference lineage: 95 observations, 285 ordered events, 29 strict
  successes, 66 strict failures, zero wrong-file attempts, zero actual safety
  violations and zero rollback failures.
- Retry population: all 66 failures in task-ID order. Failure distribution is
  `VISIBLE_TEST=47`, `HIDDEN_TEST=6`, `SYNTAX_TYPE=6`, `RETRIEVAL=5`, and
  `ACTION_VALIDATION=2`.
- Intent aggregate:
  `765c9f8171d5f8d8dee95de7962da16ef9bf5f5111f918a969116deead451b45`.
- Source closure:
  `f0d2cf3b01161645ea302cbbf03fe46108d034ff0ae2dffdc7366b965c72f2b4`.

## Verification

- RED baseline: targeted retry test was absent and failed discovery.
- GREEN: bounded-retry runtime tests pass 4/4.
- Project TypeScript build-mode typecheck passes.
- Relevant runtime regression passes 39/39 across bounded retry, tournament
  analysis, patch interface and trusted tool runtime.
- Dry materialization passes 66/66 with deterministic regeneration, zero
  duplicate intents and zero hidden-oracle/reference-fix leakage.
- Every frozen E-MIN-V2 context digest matches its immutable M2 observation.
- JSON artifact sidecars match exact bytes.
- Both Session-B ledgers exist at zero bytes with SHA-256 `e3b0c442...b855`.
- End boundary: no model process, port 8000 clear, GPU model allocation 0 MiB,
  and ephemeral API key/state absent.

## Immutable outputs

- `BEST_7B_BOUNDED_RETRY_ELIGIBILITY_MANIFEST.v1.json`:
  `0eb3a573d5e2401d14c4793f730521f91f2e5ff93bf1dc0e102aa2bad66df6a0`
- `BEST_7B_BOUNDED_RETRY_PREREGISTRATION.v1.json`:
  `aaede424d4ae204a098d5fb2610ce7117d0e5fa4159441a56e646059cfd07cf1`
- `BEST_7B_BOUNDED_RETRY_SESSION_A.v1.json`:
  `fd81c875019ba4ef903185bb6b96faf94d99b202dea5b33fb626405947ec9c08`

Session B was not entered. Product mutation remains disabled.
