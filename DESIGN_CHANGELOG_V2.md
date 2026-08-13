# Design Changelog — v2

## Why v2 exists

v1 proved the product direction but mixed runtime Skills with the process used to build the product. v2 introduces a two-layer Skill system and makes third-party inspiration explicit, bounded and testable.

## Major changes

1. Correct GitHub target to `https://github.com/hanklin91888/Desk-Code-Agent`.
2. Split Skills into **11 Development Skills** and **28 Runtime Skills**.
3. Selectively adapted engineering principles from `mattpocock/skills`; no wholesale runtime import.
4. Added exact trigger/non-trigger, tools, states, LLM/context/retry budgets and completion criteria to every Skill.
5. Added centralized paired evaluation and production promotion lifecycle.
6. Added tight reproduction loop and hypothesis ledger before non-trivial bug patches.
7. Split review into isolated Spec and Standards axes.
8. Added deep-module Tool Surface design for small-model reliability.
9. Added untrusted-content defense, approval hashing, rollback and GitHub delivery Skill.
10. Expanded Animate UI integration, motion semantics, accessibility and 60 FPS performance budget.
11. Extended roadmap to M0–M10 with mandatory GitHub checkpoint after each accepted milestone.
12. Added provenance, licensing, source locks, ADRs, implementation work packages and comprehensive schemas.

## Compatibility

v1 `S01–S22` IDs are retired. Migration mapping is documented in `docs/20_V1_TO_V2_MIGRATION.md`. Runtime APIs should use v2 `Rxx` IDs only.
