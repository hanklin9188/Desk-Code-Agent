# ADR 0008 — Deep Tool Surfaces for Small-Model Reliability

**Status:** Accepted  
**Decision:** Hide ripgrep, Tree-sitter, LSP, AST, Git and cache details behind small RepoIntelligence and Verification interfaces.

## Rationale

A 4B model should choose among a few semantically distinct tools, not dozens of low-level commands. This improves tool-selection accuracy, security and testability.
