# ADR 0014 — Autonomous mutation remains disabled

Status: Accepted locally  
Date: 2026-08-09

## Context

The immutable G3 historical patch benchmark recorded 0/60 exact historical-after-content matches for E1, E-MIN-V2, and E-MIN-V3. Audit showed that this oracle is snapshot identity plus a language parser, not behavioral equivalence; visible and hidden behavior tests were not pinned.

G4 therefore added 25 dependency-free behavioral patch fixtures with syntax, visible tests, hidden tests, wrong-file checks, and rollback. All 25 reference fixes passed all oracles, and each buggy source failed at least one behavior check. On 12 preregistered tasks, Qwen3.5-4B patch-only isolation passed 0/12 despite receiving the exact root cause, source, visible test, and target behavior. The model selected `REPORT_ONLY` in all 12. Retry depth 1/2/3 also passed 0/12; the second-call path doubled cost, contradicted the patch route in all tasks, and recovered none.

## Decision

Do not enable autonomous mutation globally or for any current task class. E-ITER is rejected as a candidate because its preregistered G4 development gate failed. E-MIN-V2 remains only the relative bounded harness default described by ADR 0012; it is not an autonomous patch-quality approval.

Any future autonomous mutation path must simultaneously require:

- a supported repository and exact one-file allowlist;
- a pinned executable visible oracle and independent hidden behavioral oracle;
- constrained worktree application, line budget, trusted command registry, timeout, redaction, and byte-correct rollback;
- at least 50% strict behavioral success on development to enter `EXPERIMENTAL` routing;
- a frozen candidate and repository-disjoint untouched holdout;
- zero wrong-file edits and safety violations, 100% rollback, and preregistered behavioral promotion gates;
- explicit user approval for any external or protected action.

`ASSISTED` patch proposals may be reconsidered only after class-level behavioral success reaches 25%; current patch success is 0%, so mutation is `REPORT_ONLY`.

## Consequences

- No model-generated diff is applied to a user repository by default.
- Successful syntax, evidence completeness, diagnosis, or visible tests alone remain release failures.
- No G4 holdout is created in this run because no new candidate qualified for freeze.
- A stronger-model comparison can be prepared but cannot select, download, or run a model without approval.

## Rejected alternatives

- Promote E-ITER from G3 long-horizon 10/36: rejected because those wins measured status/citation recovery rather than behavior.
- Retry until a patch appears: rejected because bounded retries produced no recovery and 2.238× token cost.
- Use exact historical diff as behavioral proof: rejected because equivalent alternatives cannot pass that oracle and behavior was not executed.
