# Desk Code Agent v0.2.0 release-candidate contract

Status: approved by explicit owner request on 2026-08-13

## Goal

Complete the first-use and visual-comfort refinement, build and validate a
separate Windows v0.2.0 release candidate, refresh GitHub-facing README/media,
and synchronize the reviewed source through a non-main branch and draft pull
request.

## Authorized work

- Empty-first repository onboarding and a native, read-only local Git picker
- Typography, semantic color, theme, density, motion, focus, and responsive UI
  refinement
- Current deterministic product screenshots and social-preview preparation
- English and Traditional Chinese first-run documentation
- Coherent v0.2.0 package metadata, unsigned MSI/NSIS generation, dependency
  inventory, SBOM, notices, checksums, and Windows install lifecycle QA
- Intentional local commit, normal branch push, draft pull request, and remote
  CI verification against `hanklin9188/Desk-Code-Agent`

## Preserved boundaries

- `RESEARCH_COMPLETE_INCONCLUSIVE_FORMATION_RESULT`
- `KEEP_MUTATION_DISABLED`
- Target-model calls: 0
- Benchmark calls: 0
- No semantic indexing or task-runtime claim for a desktop-selected repository
- No clean/dirty worktree claim; status is `NOT_CHECKED_SAFETY_BOUNDARY`
- No repository-controlled filter/process execution during acquisition
- No Git child process or repository-local Git config parsing during acquisition
- HEAD/ref values are repository-reported untrusted metadata; no Git object-validity claim
- Linked worktree/submodule `.git` indirection is rejected in this release candidate
- No sealed raw research artifact or machine-local provenance path in the
  desktop bundle; research views use bounded public aggregate projections
- No GitHub URL cloning
- No trusted signing claim
- No Narrator spoken-output or accessibility-certification claim
- Published v0.1.0 commit, tag, release assets, checksums, and sealed media are
  immutable

## Publication boundary

This contract permits a scoped branch commit, normal push, and draft PR. It
does not permit a direct main push, merge, tag, GitHub Release, binary-asset
upload, force push, history rewrite, or social-preview Settings mutation.
Those actions remain separate post-review decisions after remote CI is green.

## Completion gates

- Full design, type, test, and production-build gate passes
- Windows Rust format/test/clippy gates pass
- Native installed Windows folder selection succeeds against a real committed
  repository without starting or requiring a Git executable
- Source/media/artifact hashes and privacy scans pass
- The actual final locked runtime dependency closure has authoritative license
  text for every distributed component and unresolved legal inventory blockers
  equal zero
- Spec and Standards reviews have no unresolved High or Medium finding
- Intended Git staging set is closed and excludes unrelated experiment/QA
  artifacts, installers, model weights, caches, credentials, and local state
- Draft PR exists and its remote CI checks pass
