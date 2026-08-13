# Product Architecture Overview

Desk Code Agent is a local-first engineering workspace organized around one trust boundary: probabilistic reasoning may propose, but deterministic systems own repository access, state transitions, tool execution, verification, approval, and rollback.

## Layers

| Layer | Responsibility | Trust boundary |
|---|---|---|
| Desktop workspace | Navigation, evidence, flow, diff, verification, research dashboard | Renders typed state; never infers PASS |
| Tauri shell | Lifecycle, filesystem permission, secure event bridge | Native capability boundary |
| Agent runtime | Contract, routing, state machine, bounded roles, retry policy | Cannot expand scope or authority |
| Repository intelligence | Git-safe acquisition, index, symbols, dependencies, retrieval | Repository text remains untrusted |
| Local model gateway | One shared backend, structured requests, cancellation, telemetry | No direct filesystem or shell access |
| Tool/verification runtime | Allowlisted patch, test, type, lint, build, rollback | Machine outcomes are authoritative |
| Artifact/event store | Append-only typed evidence, replay, privacy-safe aggregates | Raw retention follows explicit policy |

## Current runtime topology

The baseline is Qwen3.5-4B served through vLLM on loopback, with logical roles sharing one model instance. E-MIN-V2 remains the relative bounded harness default from earlier evaluation; this designation does not mean autonomous patch readiness. Task-aware V3 retrieval, specialists, global multi-agent, retries, and alternative models remain unpromoted unless a separately frozen gate says otherwise.

## Product admission boundary

Read-only structured planning may be supported when its repository and machine-checkable evidence contract are complete. Navigation is assisted. Diagnosis synthesis and mutation remain report-only. Worktree isolation, exact scope, verification, approval, and rollback remain required infrastructure even for any future admitted edit path.

## Diagrams

- [`end-to-end-product-architecture.mmd`](diagrams/end-to-end-product-architecture.mmd)
- [`evidence-gated-capability-admission.mmd`](diagrams/evidence-gated-capability-admission.mmd)
- [`privacy-safe-observability.mmd`](diagrams/privacy-safe-observability.mmd)

