# Executable implementation guide

The design pack now includes an executable vertical product slice. Runtime behavior remains local-only by default and remote/GitHub writes are intentionally absent.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Optional desktop packaging: Rust 1.77.2+, platform WebView prerequisites and Tauri CLI 2
- Optional real model adapter: WSL2/NVIDIA/vLLM/Qwen deployment matching the pinned deployment profile

## Run and verify

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173`. For deterministic validation:

```bash
npm run check
```

The command validates the original design pack, type-checks every TypeScript module, runs unit/integration/UI tests, and creates a production bundle in `dist/desktop`.

## Implemented modules

| Module | Public behavior |
|---|---|
| Contracts | Task, event, approval, evidence and verification types; immutable contract assertion |
| Event Protocol | Append, subscribe, replay, duplicate suppression and pure projection |
| Agent Runtime | Route, feasibility gate, run start, cancellation, exact approval validation |
| Repo Intelligence | Root-bounded traversal, fingerprint, lexical evidence and secret redaction |
| Model Gateway | Loopback enforcement, health, bounded streaming and cancellation |
| Verification | Trusted command IDs and strict result aggregation (`NOT_RUN != PASS`) |
| Desktop | Ten workspace views, event replay, live run/cancel, evidence inspector, approval bar and reduced motion |

## Desktop packaging

The Tauri v2 entry point and minimum capability policy live in `apps/desktop/src-tauri`. This environment did not contain a Rust toolchain, so the Rust wrapper is provided but is not reported as machine-verified here. On a prepared host:

```bash
npm install --save-dev @tauri-apps/cli@2
npx tauri dev --config apps/desktop/src-tauri/tauri.conf.json
npx tauri build --config apps/desktop/src-tauri/tauri.conf.json
```

Dependency installation and installer signing remain approval-gated operational actions.

## Adapter boundary

The current desktop demo uses a deterministic local event fixture so every view is usable without model weights. Replacing it with a live backend must preserve the same `AgentEvent` envelope. A real adapter may connect only to loopback under local-only policy, must batch streaming updates, and may never convert model prose into verification state.

## Known environment gates

- Real Qwen/vLLM health, VRAM and throughput require the target GPU machine.
- Windows MSI/NSIS packaging and signing require the Windows release environment.
- GitHub issue, PR and release flows require exact approval and are not enabled by this implementation.
- Skill production promotion requires the three-run paired evaluation defined in `skills/VALIDATION_FRAMEWORK.md`; no unexecuted benchmark is labelled PASS.
