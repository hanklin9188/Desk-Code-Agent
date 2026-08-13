# ADR 0003 — WSL2 vLLM Loopback Model Service

**Status:** Proposed pending M2 benchmark  
**Decision:** On Windows, host vLLM and Qwen under WSL2; Desktop/Agent Runtime calls a loopback OpenAI-compatible endpoint.

## Rationale

Separates GPU lifecycle from Tauri/UI and Python Agent logic, loads the model once, enables streaming/structured requests and backend substitution.

## Constraints

- Bind loopback only by default.
- Health/lifecycle/cancel/restart are product features.
- Exact versions pinned at M2.
- Embedded Transformers remains fallback prototype, not default release architecture.
