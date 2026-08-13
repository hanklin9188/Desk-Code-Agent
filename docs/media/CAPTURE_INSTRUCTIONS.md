# Deterministic Media Capture Instructions

## Start the fixture-only UI

```bash
npm run dev
```

Open the URL at a 1440×900 CSS viewport with browser zoom at 100%. Capture mode never starts vLLM and visibly labels the model state `Fixture replay · zero model calls`.

## Canonical screenshots

| File | URL | Required story |
|---|---|---|
| `screenshots/01-hero-workspace.png` | `/?capture=hero-workspace` | Repository, task, evidence, agent flow, and verification/review state |
| `screenshots/02-research-dashboard.png` | `/?capture=research-dashboard` | Capability, verification funnel, model comparison, and L0/L1 evidence |
| `screenshots/03-task-workflow.png` | `/?capture=task-workflow` | Task → evidence → diagnosis → proposal → verification |
| `screenshots/04-safety-verification.png` | `/?capture=safety-verification` | Mutation lock, exact approval boundary, verification, and rollback |
| `screenshots/05-architecture-evidence.png` | `/?capture=architecture-evidence` | Research timeline, privacy observability, and paired transitions |

Add `&motion=reduced` to any route for its independently testable reduced-motion state.

## Capture checklist

1. Use a clean 1440×900 browser viewport and 100% application scale.
2. Wait for fonts/layout to settle; capture-mode data is synchronous and must not show a loading skeleton.
3. Confirm `DETERMINISTIC CAPTURE`, `Local only`, and `Fixture replay · zero model calls` are visible.
4. Confirm no personal path, username, desktop chrome, cache path, token, or API key is visible.
5. Confirm autonomous mutation is `DISABLED` or `KEEP_MUTATION_DISABLED` wherever relevant.
6. Do not alter DOM values, artifact JSON, counters, or labels for composition.
7. Export PNG in sRGB. Optimize losslessly; keep each image under 1.5 MiB where legibility permits.
8. Compare the filename, route, viewport, and event-prefix count with the manifest.

## GIF A — Repository to evidence (7 seconds)

Start at `/?capture=hero-workspace&motion=reduced`, then remove `motion=reduced` before recording. Select `Repository`, focus the filter, enter `router`, select `router.test.ts`, and let the evidence inspector settle. Hold the final provenance state for 1.5 seconds.

## GIF B — Research visualization (6 seconds)

Start at `/?capture=research-dashboard`. Hold for one second, select `Experiments`, scroll once to the L0/L1 comparison, and open then close its canonical source viewer. Do not replay chart animation.

## GIF C — Verification and rollback (9 seconds)

Start at `/?capture=safety-verification`. Open `Approvals`, select review details, deny the exact action, navigate to `Diff`, and activate `Revert patch`. End on the rollback confirmation; do not imply a user repository was mutated.

## Encoding guidance

Prefer a 20–24 FPS source capture, then produce a 12–15 FPS optimized GIF with a shared palette. Keep pointer movement deliberate, crop to the application, avoid repeated loops, and target under 8 MiB. Encoding is `NOT_RUN` here because no approved capture/encoding toolchain is available; do not install one implicitly.

