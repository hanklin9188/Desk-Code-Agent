# ADR 0013 — Capability-tier routing after G4 development

Status: Accepted locally  
Date: 2026-08-09

## Context

G3 primary holdout success remained E1/V2/V3 = 6/96, 3/96, and 2/96. A post-hoc failure decomposition cannot tune those candidates, so a new 217-task G4 development set was sealed before model calls. Isolated Qwen3.5-4B experiments then measured navigation, diagnosis, patch generation, planning, onboarding, and retry behavior.

With complete source and visible-test context, navigation passed 6/12. Diagnosis passed 2/12. Patch generation passed 0/12 even after receiving the exact root cause and behavioral requirement; every structured response selected `REPORT_ONLY`. Structured cross-file planning passed 12/12 under a path/component oracle, but this does not establish semantic patch correctness. G4 onboarding exact-all passed 0/24.

The deterministic routing evaluation covered 72 observations. It routed 12 planning tasks to `SUPPORTED` with 12/12 observed success, 12 complete-context navigation tasks to `ASSISTED` with 6/12 success, 48 diagnosis/patch/onboarding tasks to `REPORT_ONLY`, and zero tasks to autonomous `EXPERIMENTAL` mutation.

## Decision

Adopt four deterministic routes:

- `SUPPORTED`: read-only, repository-supported, evidence-complete task classes with at least 80% applicable benchmark success. Current scope is bounded structured planning with machine-checkable paths/components.
- `ASSISTED`: read-only task classes with at least 50% success. Current scope is complete-context navigation; the user must treat the result as an aid, not verified truth.
- `EXPERIMENTAL`: one-file mutation only when visible and hidden behavioral oracles exist and the task class has at least 50% behavioral success. No current class qualifies.
- `REPORT_ONLY`: unsupported repository, incomplete evidence, missing behavioral oracle, L4 mutation, or task class below the applicable threshold.

Routing uses file scope, oracle availability, task class, repository support, evidence completeness, difficulty, and prior class-level benchmark success. Model self-confidence is not a routing input.

## Consequences

- Repository planning may be product-visible only with its machine-checkable evidence boundary and no mutation authority.
- Navigation is explicitly assisted because 50% precision is insufficient for a safe-default factual claim.
- Diagnosis, onboarding synthesis, open-ended coding, and mutation remain report-only with the current 4B model.
- A stronger model or new candidate must qualify under the same route thresholds on development data and then an untouched holdout.
- Partial-credit improvements cannot promote a route without strict task success.

## Rejected alternatives

- Route by model confidence: rejected because confidence is neither a machine oracle nor demonstrated calibration.
- Treat planning 12/12 as general coding capability: rejected because the planning scorer validates structure and evidence paths, not behavior.
- Keep all read-only tasks in `SUPPORTED`: rejected because diagnosis and onboarding remained low even with oracle evidence.
