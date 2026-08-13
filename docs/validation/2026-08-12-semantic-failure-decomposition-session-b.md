# Semantic Failure Decomposition — Session B Validation

Status: `PASS`

Session B performed deterministic classification and evidence audit only. It
made zero target-model calls and did not enter Session C.

## Population and classifications

- Failure records: 66/66, unique, exactly one primary each.
- Success controls: 29/29, unique, no failure category assigned.
- Secondary causes: zero to two enforced; none were asserted without evidence.
- T11 retrieval failure: 5 (7.58%), HIGH.
- T12 action/patch representation: 2 (3.03%), HIGH.
- T13 syntax/code formation: 6 (9.09%), HIGH.
- T14 ambiguous/inconclusive: 53 (80.30%), LOW.

The T14 count is an observability limitation: all 53 lack persisted raw edit
content and have non-identifying failure stages. It is not a shared semantic
model-cause claim.

## Dimensions and controls

- Evidence sufficiency, failures: 5 missing-required; 61 partially sufficient.
- Evidence sufficiency, controls: 29 partially sufficient.
- Objective reference patch scope: 95/95 SINGLE_RANGE.
- Failure reasoning horizon: local 32, cross-file 13, stateful/API-level 21.
- Control reasoning horizon: local 11, cross-file 7, stateful/API-level 11.
- Retry joins: 66/66; historical retry decision unchanged.

## Audit and validation

- Frozen independent audit sample: 60 unique records.
- Disagreements: 0.
- Artifact schema/cardinality/citations: PASS.
- Standalone strict TypeScript: PASS.
- Project typecheck: PASS.
- Complete tests: PASS.
- Production build: PASS.
- Design validation: PASS.
- Secret scan, source closure, checksums and lineage: PASS.
- Target-model calls/model processes/compute processes: 0.
- Port 8000: clear; ephemeral state/temp directories: absent; worktrees: 1.

G1–G5 were not applied and no next experiment was selected. Session C is a
separate invocation.
