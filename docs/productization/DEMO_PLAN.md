# Deterministic Demo Plan

P5 canonical filenames, URL presets, GIF timing, and the final video sequence are maintained in [`../media/`](../media/README.md). This document retains the audience-centered scenario definitions.

All scenarios use existing fixtures, typed trace replay, or sealed dashboard artifacts. None requires a live model or a fresh benchmark.

## 1. Repository navigation

- Fixture: bundled Desk Code Agent file-tree fixture.
- Prompt: “Show me where feasibility, verification, and event replay are implemented.”
- Journey: Repository → filter files → evidence inspector → Architecture.
- Evidence/visual: source ranges, hashes, architecture map, capability label.
- Audience learns: repository context is retrieved and cited, not uploaded wholesale.
- Capture: 12-second 1440p GIF; pointer focus on file filter and evidence provenance.

## 2. Evidence-backed diagnosis

- Fixture: deterministic runtime trace `run_demo_001`.
- Prompt: “Analyze the runtime flow and rank the top bounded risks.”
- Journey: Workspace → replay trace → Flow → Findings → Report.
- Evidence/visual: typed events, current stage, evidence IDs, NOT RUN honesty.
- Audience learns: UI state comes from typed events and distinguishes claims from machine outcomes.
- Capture: 20-second video with reduced UI chrome; pause on evidence provenance.

## 3. Bounded patch preview

- Fixture: existing router patch preview.
- Prompt: “Add deterministic security and missing-oracle gates.”
- Journey: Code → Diff → verification beside patch → exact approval scope.
- Evidence/visual: file allowlist, patch reason, verification chips, artifact hash.
- Audience learns: proposals remain scoped, reversible, and approval-bound; autonomous mutation is disabled.
- Capture: three stills—before, diff with rationale, approval boundary.

## 4. Safety rejection

- Fixture: replayed approval-required trace.
- Prompt: “Push this change directly to the protected branch.”
- Journey: Safety → Approvals → inspect target/hash/scope → Deny.
- Evidence/visual: disabled mutation banner, exact protected action, retained partial trace.
- Audience learns: a natural-language request cannot widen authority.
- Capture: 10-second GIF ending on `Protected action denied`.

## 5. Failed verification and rollback

- Fixture: deterministic failed/cancelled trace plus rollback preview.
- Prompt: “Apply the bounded proposal, verify it, and recover if it fails.”
- Journey: Workspace → Verify → failed or NOT RUN stage → Diff → Revert patch → Report.
- Evidence/visual: verification funnel, stage semantics, rollback confirmation.
- Audience learns: failure remains visible and recoverable; model prose cannot mark PASS.
- Capture: 18-second video; no looping animation; include final restored-state frame.

## Capture checklist

- Use 1440×900, 100% scale, seeded deterministic data, and a clean local-only status.
- Capture standard and reduced-motion versions of one scenario.
- Hide personal paths, usernames, tokens, caches, and unrelated desktop chrome.
- Add concise captions; never label fixture replay as live inference.
- Generated media capture requires a supported browser/reference environment. External publication remains separately protected.
