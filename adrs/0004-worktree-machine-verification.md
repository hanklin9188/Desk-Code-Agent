# ADR 0004 — Worktree-First Mutation and Machine Verification

**Status:** Accepted  
**Decision:** Original repositories are read-only. Every change occurs in a task worktree. Completion requires real syntax/tests/build/static checks; Reviewer cannot substitute.

## Consequences

Requires Git/workspace management and test adapters, but makes rollback, diff review and trust possible.
