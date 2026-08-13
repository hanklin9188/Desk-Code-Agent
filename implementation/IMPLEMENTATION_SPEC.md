# Desk Code Agent v2 — Executable Product Specification

Status: approved by explicit user implementation request  
Task Contract: `CURRENT_TASK_CONTRACT.json`

## Problem statement

The repository currently contains an implementation-ready design pack but no executable product. This change creates a local-first vertical product slice that turns the documented contracts into typed modules, an event-driven workspace, deterministic tests and reproducible developer commands.

## Architecture decision

- `apps/desktop`: React/Vite workspace. The UI consumes projections only and never parses model prose for state.
- `packages/contracts`: shared domain types and validation helpers.
- `packages/event-protocol`: append-only event store and pure idempotent projector.
- `services/agent-runtime`: contract routing, feasibility gate, run state machine, cancellation and approvals.
- `services/repo-intelligence`: bounded, ignore-aware workspace fingerprint and lexical evidence retrieval.
- `services/model-gateway`: OpenAI-compatible loopback gateway contract plus an offline simulator.
- `services/verification`: trusted command registry and stage/result aggregation.

Cross-module flow:

```text
Task Contract → Route/Gate → typed events → pure projection → React workspace
                         ↘ artifacts / verification / approvals
```

## User stories and acceptance criteria

1. A developer can open the demo workspace and understand privacy, repository identity, active stage and required action without reading logs.
2. A developer can start, pause/cancel and replay a run; replaying the same event stream yields the same final projection.
3. A developer can navigate Repository, Overview, Architecture, Flow, Code, Diff, Verify, Report, History and Settings using pointer or keyboard.
4. Every displayed PASS originates from a verification event; NOT_RUN has a distinct neutral presentation.
5. Protected actions show exact target/hash/scope and stay blocked until an exact, unexpired approval is submitted.
6. Reduced-motion mode preserves all state and actions while removing travelling/layout/ambient movement.
7. Repository reads reject traversal/out-of-root paths and redact secret-shaped values from surfaced evidence.
8. Model connectivity defaults to loopback and offline simulation; non-loopback endpoints are rejected unless policy explicitly allows them.

## Testing seams

- Pure router, feasibility gate, reducer and projection tests.
- Event ordering, duplicate delivery, cancellation and replay integration tests.
- Repository boundary, ignored path and redaction tests.
- Verification aggregation tests proving `NOT_RUN != PASS`.
- Component interaction and accessibility smoke tests.
- `tsc` and Vite production build.

## Security and side effects

- Development dependency installation is the only network-affecting setup action in this slice.
- Runtime network policy is off by default; only loopback model access is accepted.
- Runtime source mutation, arbitrary shell and GitHub writes are not exposed by the UI implementation.
- No secrets, prompt bodies or source snippets are written to telemetry.

## Out of scope for local verification

- Loading Qwen weights and measuring VRAM/tok/s on an NVIDIA GPU.
- Windows installer signing and clean-machine installation.
- Real GitHub write operations.
- Declaring Skill production promotion without the required three-run benchmark datasets.

These remain explicit gated adapters, not mocked success claims.
