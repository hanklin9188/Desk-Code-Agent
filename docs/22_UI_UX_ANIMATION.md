# UI/UX and Animation

The product uses Animate UI selectively as copy-first source material, then applies Desk Code Agent design tokens and semantic motion.

Core views: Repository, Overview, Architecture, Flow, Code, Diff, Verify, Findings, Report, History, Telemetry.

Animation rules:

- only typed events drive status
- active Agent breathes subtly
- tool call uses one edge marker
- retry shows new evidence
- tests use real stages
- no fake progress, RGB neon, confetti or persistent motion
- reduced-motion preserves information without transform/layout movement
- 60 FPS target, virtualized large data, UI/backend separation

See `ui/`.
