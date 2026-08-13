# Target Repository Layout

```text
Desk-Code-Agent/
├── apps/desktop/
│   ├── src-tauri/
│   └── src/
│       ├── app/
│       ├── components/
│       ├── components/animate-internal/
│       ├── features/repository/
│       ├── features/agent-flow/
│       ├── features/diff/
│       ├── features/verification/
│       ├── features/report/
│       └── state/events/
├── services/
│   ├── agent-runtime/
│   ├── model-gateway/
│   └── repo-intelligence/
├── packages/
│   ├── contracts/
│   ├── event-protocol/
│   ├── benchmark-sdk/
│   └── ui-tokens/
├── skills/
├── agents/
├── schemas/
├── tests/
├── docs/
├── scripts/
└── .github/
```

Each top-level module exposes one small interface and owns its internal adapters. Cross-module imports are checked in CI.
