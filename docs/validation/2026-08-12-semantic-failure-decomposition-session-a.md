# Semantic Failure Decomposition — Session A Validation

Status: `PASS`

Session A performed taxonomy and analysis freeze only. It made zero target-model
calls, started no model process, inspected no individual solution deeply, and
did not enter Session B.

## Frozen contract

- Primary population: 66 FIM-7B first-attempt failures.
- Controls: 29 first-attempt strict successes.
- Taxonomy: T1–T14, exactly one primary and at most two secondary causes.
- Dimensions: patch scope, reasoning horizon, evidence sufficiency, failure
  observability, first failure stage, retry behavior, and frozen task complexity.
- Gates: G1 context/evidence, G2 patch scope, G3 local semantics, G4 code
  formation, G5 mixed ceiling; denominator and thresholds are sealed.
- Audit: all LOW, T14, T10, T11 and T8 rows plus a deterministic sample of
  remaining HIGH/MEDIUM rows; disagreements must be append-only.

## Evidence preflight

- 95/95 unique original observations and 285 call events verified.
- 29 successes and 66 failures verified.
- 66/66 retry links verified.
- Retrieval and verification metadata: 95/95.
- Canonical-diff hashes: 89/95.
- Raw model outputs/actions persisted: 0/95 by the prior privacy contract.

The missing edit bodies are a binding claim limitation: a semantic label that
requires edit-content evidence must use T14/LOW unless another immutable
observable artifact supports it. Oracle/reference material cannot reconstruct
an unobserved model edit.

## Validation

- standalone strict TypeScript: PASS;
- project typecheck: PASS;
- complete test suite: PASS;
- targeted taxonomy/population tests: 2/2 PASS;
- artifact sidecars, source closure, secret scan and lineage: PASS;
- target-model calls: 0;
- model/compute processes: 0;
- port 8000: clear;
- model GPU allocation: 0 MiB;
- ephemeral state and temporary directories: absent;
- worktrees: 1.

Session B is ready only as a separate invocation.
