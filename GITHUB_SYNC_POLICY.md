# GitHub Sync and Release Policy

## 1. Target

- **Owner:** `hanklin91888`
- **Proposed repository:** `Desk-Code-Agent`
- **Canonical URL:** `https://github.com/hanklin91888/Desk-Code-Agent`
- **Default branch:** `main`
- **Milestone branches:** `milestone/mN-short-name`
- **Feature branches:** `feat/<ticket>-<slug>`

At design time the repository may not yet exist or may not be accessible. This document is a required delivery policy, not evidence that any remote action has occurred.

## 2. Definition of delivered

A milestone is not delivered merely because files exist locally. It is delivered when:

1. Local acceptance and validation pass.
2. Manifest, hashes, docs, benchmark metadata and reproduction commands are complete.
3. Secret/license/private-content scans pass.
4. User explicitly approves the exact GitHub action.
5. A branch is pushed to the canonical repository.
6. A draft PR is created.
7. Required CI is green.
8. User separately approves merge/tag/release where applicable.
9. Remote SHA, PR URL and tag are saved in `docs/checkpoints/MN.yaml`.

## 3. Protected actions

Each action requires explicit approval and is not implied by approval of another:

- Create repository
- Set visibility
- Add remote
- Push branch
- Open PR
- Update PR
- Merge
- Tag
- Create release
- Upload binary/artifact
- Change Actions/secrets/permissions

No direct push to `main`.

## 4. Content allowed

- Source code for Desk Code Agent
- Original design/docs/schemas/skills
- Tests and sanitized fixtures
- Benchmark manifests and aggregate results
- Reproduction scripts
- Small screenshots/assets with provenance
- License/attribution/SBOM

## 5. Content prohibited

- User repositories analyzed by the product
- Model weights or model caches
- Tokens, private keys, `.env`, credentials
- Private prompts/traces containing source code
- Raw proprietary code/logs
- Build cache, virtualenv, node_modules
- Unredacted telemetry
- Unlicensed copied content

## 6. Milestones

| M | Tag | Acceptance focus | Mandatory GitHub checkpoint |
|---|---|---|---|
| M0 | `v0.2.0-design` | v2 master design, Skills, schemas, validation | Design pack + ADRs + source notices |
| M1 | `v0.3.0-shell` | Tauri shell, navigation, event simulator | UI prototypes, tokens, accessibility baseline |
| M2 | `v0.4.0-local-model` | WSL2 vLLM, Qwen client, streaming, telemetry | model/runtime lock, benchmark baseline |
| M3 | `v0.5.0-repo-intel` | acquisition, fingerprint, codebase map, retrieval | index fixtures, Recall@K results |
| M4 | `v0.6.0-analysis` | overview, architecture, onboarding, findings | report benchmark and evidence UI |
| M5 | `v0.7.0-bounded-code` | worktree, reproduce, patch, verify, rollback | hidden-test benchmark, safety suite |
| M6 | `v0.8.0-skill-runtime` | all production candidate Skills, routing, A/B | validation records and ablations |
| M7 | `v0.9.0-github` | issue/PR ingestion, approved delivery | permission/approval/secret tests |
| M8 | `v0.10.0-ux-beta` | Animate UI integration, motion, a11y, installer | UI performance traces and beta package |
| M9 | `v0.11.0-evaluation` | single vs multi, quantization, cost/quality | reproducible benchmark report |
| M10 | `v1.0.0` | release gate, docs, SBOM, signed installer | release, checksums, final report |

## 7. PR gate

Every milestone PR includes:

- Problem / scope / out-of-scope
- Design/ADR links
- Changed modules/interfaces
- Verification commands and results
- Skill validation records
- Security/license scan
- Screenshots/video for UI changes
- Performance before/after
- Known limitations
- Rollback/migration
- Checklist and artifact hashes

## 8. CI

Planned checks:

```text
format / lint / typecheck
unit / integration / schema
Rust / TypeScript / Python
security / secret / dependency / license
skill static validation
UI accessibility / reduced motion / event replay
package / installer smoke
benchmark subset (nightly/full on milestone)
```

## 9. Current action status

This design pack does **not** create the remote repository, push a branch, open a PR, merge, tag or release. Those operations occur only after the user explicitly authorizes them through D11/R27.
