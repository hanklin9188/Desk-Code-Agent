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

The current desktop bridge has a narrower, explicit repository boundary. Tauri opens a native directory dialog and starts no Git process. It reads bounded, repository-reported `.git/HEAD` and loose/packed ref text, rejects metadata indirection outside `.git`, and enumerates a bounded filesystem manifest while skipping links/reparse points and fixed generated directories. It does not validate that the reported HEAD names an existing Git object. Linked worktrees and submodule checkouts are rejected because their `.git` indirection is outside this release boundary. Working-tree status is explicitly not inspected because Git content/config evaluation can invoke repository-controlled filters or external reads. The bridge performs no application-initiated network request, model call, checkout, hook, lock, or write. The Node repository-intelligence and task runtimes remain separate services and are not presented as connected to a selected desktop repository until an event/API bridge exists.

The product research viewer bundles only deterministic public projections. Raw sealed research artifacts and machine-local provenance paths remain outside the desktop bundle; the observability projection contains only aggregate denominators, counts, transitions, and zero-retention invariants.

## Product admission boundary

Read-only structured planning may be supported when its repository and machine-checkable evidence contract are complete. Navigation is assisted. Diagnosis synthesis and mutation remain report-only. Worktree isolation, exact scope, verification, approval, and rollback remain required infrastructure even for any future admitted edit path.

## Diagrams

- [`end-to-end-product-architecture.mmd`](diagrams/end-to-end-product-architecture.mmd)
- [`evidence-gated-capability-admission.mmd`](diagrams/evidence-gated-capability-admission.mmd)
- [`privacy-safe-observability.mmd`](diagrams/privacy-safe-observability.mmd)
