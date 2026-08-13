# UX onboarding and workspace refinement

Status: approved by explicit user request

## Problem statement

The packaged desktop shell opens into a populated demonstration workspace, while
the visible repository action does not select or inspect a repository. Text is
materially smaller than the design baseline, navigation mixes daily work with
research presentation, several controls look interactive without having a real
effect, and reduced-motion/appearance settings do not control the app shell.

## User outcomes

1. A first-time user immediately sees how to start and where their repository
   remains on disk.
2. Choosing a local Git folder opens a native picker and validates it through a
   read-only, bounded command surface.
3. Demo data is available only after an explicit choice and is persistently
   labelled as demo data.
4. Normal UI text is comfortable at Windows scaling levels, with 14px body text,
   12px minimum compact metadata, and 13px minimum code text.
5. Daily navigation exposes a short repository-to-report path; research evidence
   remains accessible but does not dominate first use.
6. Theme, text size, density, and motion preferences have immediate, persistent
   effects.

## Repository state model

`EMPTY → SELECTING → VALIDATING → READY_READ_ONLY | ERROR`

`EMPTY → GUIDED_DEMO` is separate. User-selected repositories never consume demo
events, evidence, diffs, metrics, or verification outcomes.

## Native boundary

- The dialog plugin may select one directory.
- `inspect_repository` canonicalizes the selected path and starts no Git or
  other child process. It accepts only an in-tree, real `.git` directory,
  reads bounded HEAD/ref metadata, and rejects metadata indirection outside it.
- It performs no file writes, network calls, model calls, checkout, branch, or
  worktree operation.
- It returns only repository name, canonical root, repository-reported branch and HEAD text (untrusted metadata; object existence/type is not validated), an explicit
  `NOT_CHECKED_SAFETY_BOUNDARY` worktree state, bounded filesystem paths that
  skip symlinks and fixed generated directories, file count, and manifests.
- It does not parse repository-local Git config or run `git status` because
  repository-configured includes, paths, and filters are untrusted input.
- Invalid, non-Git, unborn, inaccessible, or oversized inputs return
  typed user-facing errors rather than raw host details.
- Mutation remains disabled.

## Acceptance criteria

- Fresh launch has no fixture repository identity, fake SHA, fake index state, or
  enabled Run action.
- The first screen explains three steps and exposes `Choose local folder` and
  `Try guided demo`.
- Picker cancellation is neutral; validation errors are announced and retryable.
- A valid response updates the repository identity/tree using observed values and
  clearly states `Read-only`.
- Browser preview honestly says the installed desktop app is required.
- GitHub URL acquisition remains unavailable; the UI instructs users to clone
  locally and then choose the folder.
- Guided demo carries `DEMO DATA · NO REPOSITORY ACCESSED` on every surface and
  provides an exit action.
- Main navigation contains at most eight daily/research destinations.
- Every rendered button has an effect; unavailable actions are disabled with an
  explanation.
- Reduced motion reacts to the OS preference and the Appearance setting.
- Targeted onboarding, accessibility, motion, and existing UI regressions pass;
  full `npm run check` passes.

## Out of scope

- GitHub clone/network acquisition.
- Connecting arbitrary user tasks to the local model runtime.
- Enabling patch mutation or autonomous actions.
- New benchmark/model/research work.
