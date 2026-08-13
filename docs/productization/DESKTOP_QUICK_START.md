# Desktop quick start

Desk Code Agent opens into an empty, local-only workspace. It does not preload a repository, start a model, or run a task.

## 1. Choose a repository

Select **Choose local folder**, then pick the root of an existing Git repository or a folder inside it. The native desktop boundary canonicalizes the selection and reads only:

- repository name;
- repository-reported branch and observed HEAD text (untrusted metadata; the object is not validated);
- an explicit notice that working-tree status was not inspected for safety;
- a bounded filesystem manifest that skips symlinks and fixed generated directories; and
- recognized project manifest names.

The check starts no Git process. It reads bounded `.git/HEAD` and ref metadata and performs no write, network request, model call, clone, checkout, hook, lock, or working-tree content comparison. Absolute paths are not shown in the workspace. Because repository-controlled configuration and filters are untrusted, Desk does not claim the working tree is clean or dirty.

Linked worktrees and submodule checkouts use `.git` indirection and are intentionally rejected in v0.2.0. Choose the primary checkout, whose `.git` entry is a real local directory.

Desk requires WebView2. If it is absent, the Windows installer may perform a
one-time Microsoft WebView2 bootstrapper download; repository inspection
itself opens no application network connection.

If the repository is on GitHub, clone it first with Git or GitHub Desktop and then choose the local folder. URL cloning is not available in this build.

## 2. Understand the current boundary

After validation, the header and Repository page display only observed local facts. Repository mutation remains disabled.

The desktop task runtime and semantic index are not connected to a selected repository in this build. For that reason, **Run** stays disabled; Desk does not substitute a sample trace and present it as real work.

## 3. Learn with the guided demo

Select **Try guided demo** to explore the product workflow. Every demo surface carries:

`DEMO DATA · NO REPOSITORY ACCESSED · ZERO MODEL CALLS`

Use **Exit demo** at any time to return to the empty workspace. Demo evidence, events, changes, verification, and history never become state for a user-selected repository.

## Make it comfortable

Open **Settings → Appearance** to choose:

- System, Dark, or Light color mode;
- Comfortable or Compact spacing;
- 100%, 110%, or 125% interface text; and
- a local reduced-motion override or the operating-system preference.

The main navigation follows the everyday flow: Start, Repository, Workspace, Changes, Verify, Report, Research, and History. Task-only destinations remain visibly unavailable until a compatible runtime or the explicit guided demo is active.
