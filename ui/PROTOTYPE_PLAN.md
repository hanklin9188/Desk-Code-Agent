# UI and Motion Prototype Plan

Every prototype answers one decision and lives on a throwaway branch.

## P1 — Workspace shell variants

Question: which layout best balances repo navigation, live automation and evidence inspection?

- A: persistent three-column
- B: two-column + contextual Sheet
- C: focus mode with command palette and bottom status dock

Test with onboarding, bug fix and report tasks at 1280/1440/4K.

## P2 — Agent Flow information density

- A: Agent-only nodes, Skills/Tools in timeline
- B: Agent + Skill nodes, Tool edges
- C: phase lanes with current Agent badge

Measure task-state comprehension, visual clutter, event-to-answer time and reduced-motion equivalence.

## P3 — Approval experience

Compare modal, side Sheet and Management Bar. Validate exact target/hash comprehension, denial discoverability and accidental approval rate.

## P4 — Diff + evidence relationship

Compare Inspector, inline hunk annotations and bottom evidence drawer. Test large diff, keyboard flow and Monaco performance.

## P5 — Long-run telemetry

Compare compact status, expandable panel and dedicated telemetry view. Keep normal workspace calm.

## Prototype acceptance

- ≥5 walkthrough tasks
- 3 users or structured heuristic review until user study available
- 60 FPS profile and reduced-motion recording
- accessibility keyboard walkthrough
- decision captured in ADR/spec
- prototype excluded from main; branch pointer retained
