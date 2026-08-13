# ADR 0002 — Selective Adaptation into Original Bounded Skills

**Status:** Accepted for design  
**Decision:** Do not import `mattpocock/skills` wholesale into runtime. Select engineering principles, retain MIT attribution, and rewrite them as Desk Skills with artifacts, tools, states, budgets, security and paired evaluation.

## Rationale

General coding-session Skills do not by themselves enforce local 4B limits, worktree safety, typed UI events or production admission. External changes must not silently change released behavior.

## Consequences

More initial specification and validation work; substantially better auditability and reproducibility.
