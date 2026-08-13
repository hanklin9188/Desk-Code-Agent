# UI Performance and Accessibility Budget

## Performance targets

| Metric | Target |
|---|---:|
| Interaction frame rate | 60 FPS target |
| Main-thread frame p95 | ≤16.7ms during normal motion |
| Event-to-visible-state p95 | <100ms |
| Button/keyboard feedback | <50ms |
| Cancel acknowledgement | <100ms |
| Large tree initial usable state | <1s after index artifact available |
| Concurrent continuous animations | ≤3 |
| Long task UI memory growth | bounded; no transcript/event DOM leak |

Targets are validated on the reference Windows 11 + RTX 4080 SUPER machine and a CPU-throttled profile.

## Implementation rules

- Animate only `transform` and `opacity` by default.
- Virtualize repository tree, findings, event trace, tests and large diffs.
- Monaco handles source/diff; do not duplicate full code in React DOM.
- Web Worker for graph transforms/filtering where appropriate.
- Event reducer batches high-frequency telemetry; semantic events remain lossless.
- Graph layout is debounced and cached.
- UI process never runs model inference, repo indexing or tests.
- Tauri IPC/events are typed and backpressured.
- Pause ambient animation when unfocused/hidden.
- Performance marks wrap event receive → reducer → commit → paint.

## Accessibility

- Full keyboard navigation, visible focus, skip links and command palette.
- ARIA live region: only major task transitions, not every tool event.
- Graph has parallel list/tree representation.
- Color contrast meets WCAG AA; status includes icon/text.
- 200% zoom without content loss.
- Reduced motion follows OS and explicit app override.
- Error/approval content is readable before buttons.
- Tooltips supplement, never replace labels.
- Screen reader names include Agent/Skill/state and evidence count.
- Diff review supports next/previous hunk and accept/reject by keyboard.

## Test matrix

- Windows scaling 100/125/150/200%.
- Light/dark/high contrast.
- Keyboard-only.
- NVDA baseline.
- Reduced motion.
- GPU busy, CPU busy, large event stream.
- Window resize/minimize/restore.
- Long run ≥60 minutes with replay.
