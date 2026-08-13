# Desktop UX and repository-onboarding refinement validation

Date: 2026-08-13
Work package: `DESKTOP_UX_ONBOARDING_REFINEMENT`
State: `PASS`

## Scope and preserved boundaries

This work responds to first-use confusion, undersized text, weak guidance,
inconsistent color/motion, and uncertainty about how to open a repository. It
does not reopen engineering research or enable unvalidated coding behavior.

- `RESEARCH_COMPLETE_INCONCLUSIVE_FORMATION_RESULT` is preserved.
- `KEEP_MUTATION_DISABLED` is preserved.
- Target-model calls: 0.
- Benchmark/experiment calls: 0.
- The published v0.1.0 commit, tag, release assets, checksums, and sealed media
  were not modified. v0.2.0 is prepared separately on a review branch.

## Observable outcomes

1. Normal startup contains no fixture repository, SHA, metrics, evidence, or
   enabled Run action. It presents a three-step local-repository guide.
2. **Choose local folder** uses the Tauri directory dialog. The native command
   canonicalizes the selection and returns only observed Git identity,
   manifests, a bounded filesystem list that skips symlinks and generated
   directories, and an explicit
   `NOT_CHECKED_SAFETY_BOUNDARY` worktree state.
3. Native inspection is off the UI thread and starts no Git or other child
   process. It requires a real in-tree `.git` directory, reads only bounded
   HEAD/ref metadata, rejects metadata indirection outside `.git`, skips
   symlinks while building the bounded manifest, and never parses local Git
   config. It intentionally performs no worktree content comparison because
   repository-configured includes, paths, and filters are untrusted surfaces.
4. A user repository is explicitly `READY_READ_ONLY`. Its absolute path is not
   rendered. Semantic indexing/task execution is not claimed, and Run stays
   disabled until a real runtime bridge exists.
5. The guided demo is a separate fixed scenario. It is persistently labelled
   `DEMO DATA · NO REPOSITORY ACCESSED · ZERO MODEL CALLS`, is reversible, and
   cannot leak its task, evidence, verification, or approval state into a user
   repository.
6. The app provides semantic dark/light/system palettes, a 12px compact floor,
   14px UI base, 15px body, 13px code, 100/110/125% scaling, density settings,
   live reduced-motion behavior, visible focus, and responsive panels.
7. The main rail is reduced to Start, Repository, Workspace, Changes, Verify,
   Report, Research, and History. Unavailable actions are disabled and explain
   their boundary.

## Automated evidence

Final command evidence is recorded append-only after the independent reviews.
The current completed runs are:

| Command / oracle | Result |
|---|---|
| Clean exact-index `npm run check` | PASS: design 2390 files, 0 warnings/errors; TypeScript PASS; 50 test files / 255 passed plus one explicit installed-runtime probe skipped; Vite production build PASS. The developer tree separately ran 256/256 as supplemental evidence. |
| Focused onboarding/gateway/motion/theme/productization/media/accessibility suite | 8 files / 39 tests PASS after final state-integrity and contrast remediation |
| Windows `cargo fmt --check` | PASS |
| Windows `cargo test --locked` | PASS: 5 passed, 0 failed. The malicious-filter regression actually ran on Windows and proved the canary was not executed. |
| Windows `cargo clippy --lib --tests -- -D warnings` | PASS |
| `git diff --check` | PASS |

The Rust repository test creates only uniquely named OS-temporary directories
and covers nested selection, loose HEAD/ref metadata, unborn and non-Git
errors, repository config/include/filter non-execution, symlink skipping, and
bounded file enumeration. Acquisition has no Git executable dependency.

## Visual evidence

Real Windows Edge/WebView-compatible rendering was inspected at:

- 1440×900 dark onboarding/demo/research;
- 1440×900 light research after semantic alias and component remediation;
- 980×680 light onboarding with 125% application text; and
- the native 760×520 minimum with 125% application text.

The final minimum-size inspection keeps the repository CTA, navigation labels,
task boundary, and disabled Run state visible without horizontal clipping.
Reduced motion is covered by live `matchMedia` behavior and CSS suppression
tests; motion does not carry semantic state.

## Independent review

The initial Spec and Standards axes correctly failed the candidate for blocking
native Git work, incomplete type scaling, mixed light-theme component colors,
READY-state Settings routing, acquisition races, inherited Git routing, process
cleanup, and misleading demo affordances. Subsequent independent review drove
the no-Git-process pivot, repository-reported untrusted HEAD wording,
privacy-safe public projection, media v4, and privacy-remapped Windows
packages. Those findings are remediated; the final dual-axis disposition is
recorded only after reviewing the exact staged delta and v4 evidence, and
remote CI remains a delivery gate.

## Honest limitations

- The desktop-selected repository is inspected, not semantically indexed or
  connected to the task runtime. Run is intentionally disabled.
- GitHub URL cloning is unavailable; users clone locally first.
- Native interactive folder-dialog QA on the installed v0.2.0 Windows release
  candidate is `PASS`: a deterministic repository with a configured harmless
  malicious filter was selected with no Git child process, its identity
  was rendered without an absolute-path leak or clean/dirty claim, the canary
  remained absent, Run remained disabled, and uninstall/reinstall passed.
- The sealed v0.1.0 screenshots, installers, and public release remain
  unchanged. v0.2.0 has separate media, installers, checksums, and reports.
- Human-observed Narrator spoken-output validation retains its existing
  deferral; no accessibility certification is claimed.
