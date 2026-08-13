# ADR 0001 — One Shared Model, Five Logical Agents

**Status:** Accepted for design  
**Decision:** Load one Qwen3.5-4B model through a local model service. Orchestrator, Repo Analyst, Coder, Reviewer and Reporter are role/context/skill/permission configurations, not separate weights.

## Rationale

- Fits RTX 4080 SUPER 16GB.
- Avoids VRAM multiplication.
- Preserves context isolation and permission separation.
- Makes Single vs Multi-Agent comparison fair at fixed model capacity.

## Consequences

Agent count affects LLM calls and latency. Physical execution defaults sequential; logical parallelism may be scheduled but not assumed faster.
