# Windows installer and accessibility QA

W3 local unsigned packaging is `PASS_WITH_RELEASE_BLOCKERS` on the Windows 11
reference host. Current-source x64 MSI/NSIS builds, package-content audit,
installed runtime, and install → uninstall → reinstall lifecycle pass. Signing,
public distribution, and the deferred accessibility gate remain unexecuted.
The PowerShell entry point is `scripts/windows_qa.ps1`; signing is a separately
approved step through `scripts/sign_windows.ps1`.

## Deferred public-release accessibility gate

Human-observed Narrator spoken-output validation is
`DEFERRED_NONBLOCKING_PUBLIC_RELEASE_ACCESSIBILITY_QA` from W1 portfolio-media
readiness. It remains required here before public release and must cover:

- application and window identity;
- headings and landmarks;
- navigation items;
- tabs and buttons;
- dialog title and controls;
- status and error announcements;
- disabled capability state;
- chart textual alternatives; and
- safety-rejection announcements.

The deferral does not claim Narrator PASS, full screen-reader certification,
WCAG certification, or accessibility certification.

1. Confirm Windows version, WSL2 status, NVIDIA driver/CUDA visibility, Node,
   pinned Rust, WebView2 and free disk space.
2. Run `npm ci`, `npm run check`, and `npm run tauri:build` from a clean checkout.
3. Verify MSI/EXE SHA-256, Authenticode signature and publisher identity.
4. Install as a standard user; confirm Start menu entry and first launch.
5. Verify local Qwen/vLLM connectivity through WSL2 and loopback-only binding.
6. Disconnect networking and confirm repository analysis/replay remains local.
7. Exercise keyboard-only navigation, visible focus, skip link, dialogs,
   repository import, run/cancel, verification, approval denial and rollback.
8. Exercise Narrator for navigation labels, status changes, verification truth,
   errors and approval action/target/hash/scope/rollback.
9. Enable Windows reduced motion and confirm semantic state remains visible with
   travel/breathing animation removed.
10. Replay success, failure, timeout, cancel, injection, approval, rollback,
    rejected Skill, model-offline, sandbox-downgrade and report-only traces.
11. Inspect logs/telemetry for secrets, raw source, raw prompts and external URLs.
12. Upgrade from the prior signed installer; verify data migration and rollback.
13. Uninstall; verify app files/services are removed while user-selected evidence
    retention follows the documented choice.
14. Reinstall cleanly and repeat launch/model-offline/cancel smoke tests.

No checklist item may be promoted from `NOT_RUN` using Linux, browser-only,
mocked, screenshot-only or code-review evidence.
