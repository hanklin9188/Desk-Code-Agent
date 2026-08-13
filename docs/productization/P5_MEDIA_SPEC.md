# P5 Media and GitHub Portfolio Specification

```yaml
skill_id: D02
skill_version: 0.2.0
run_id: d02-p5-media-2026-08-12
status: PASS
input_artifact_hashes: []
evidence_ids:
  - P1_P4_PRODUCTIZATION_VALIDATION
  - CURRENT_DESKTOP_UI
warnings:
  - No supported browser capture binary is installed in the current Linux environment.
errors: []
metrics:
  canonical_capture_states: 5
  planned_gif_flows: 3
```

## Problem

The P1–P4 UI is presentation-ready but its strongest states depend on manual navigation and replay. That makes screenshots nondeterministic, complicates GIF capture, and leaves repository-relative artifact links unreliable in a packaged shell.

## Solution

Add a query-driven, fixture-only media mode with five stable presets. Each preset selects a page, an exact prefix of the immutable demo trace, panel visibility, task text, motion preference, and capture dimensions. Add an in-app read-only artifact viewer backed by the already bundled canonical artifacts. Document capture commands and media filenames without requiring a model, benchmark, new dependency, or packaging integration.

## Public interfaces

```text
?capture=hero-workspace
?capture=research-dashboard
?capture=task-workflow
?capture=safety-verification
?capture=architecture-evidence
&motion=reduced
```

Unknown presets fall back to normal product mode. Capture mode visibly labels fixture replay and never changes artifact values. It uses fixed timestamps and exact demo-event prefixes.

## Acceptance criteria

1. Five capture presets resolve deterministically from a URL and have stable view, trace, panel, task, and chrome settings.
2. Research capture pages use only the existing canonical visualization view-model.
3. Capture mode labels itself as deterministic fixture evidence and never presents the model as live.
4. Standard and reduced-motion capture modes are independently addressable.
5. Chart source controls open an in-app read-only artifact viewer with exact path and canonical bundled JSON.
6. A machine-readable media manifest defines stable filenames, viewport/scaling targets, and intended README/demo use.
7. Three GIF flows and a 2.5–4 minute storyboard specify actions, results, narration, and duration.
8. README follows the requested first-visitor hierarchy and does not embed missing media files.
9. Scaling checks at 100%, 125%, 150%, and 200% are documented; unavailable Windows results remain `NOT_RUN`.
10. All repository validation gates pass with zero target-model and benchmark calls.

## Out of scope

Actual Windows capture, browser installation, media encoding dependency installation, Git commit/push/PR, GitHub publication, release packaging, model execution, research changes, and autonomous mutation remain outside P5.

