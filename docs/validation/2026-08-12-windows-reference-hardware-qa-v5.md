# Windows reference hardware QA — W1 v5

Status: `BLOCKED_EXTERNAL`.

The retained NTFS snapshot now has a normalized authoritative-source identity,
the approved MSVC desktop component is installed, and both the locked Cargo
build and Tauri `--no-bundle` release build pass. The current-source x64
executable launches as a native Tauri/WebView2 application and shuts down
without retained child processes.

At the host's actual 150% scale, all 18 workspace surfaces rendered without
horizontal overflow. Native keyboard input, modal focus behavior, read-only
artifact display, Windows separators, and rejection of absolute, traversing,
and non-allowlisted paths passed. Normal and WebView2-emulated reduced motion
were captured and inspected.

W1 cannot pass from this session. The machine exposes one display fixed at
150%, so actual 100%, 125%, and 200% Windows scale states remain `NOT_RUN`.
Narrator ran and followed six named UIA focus transitions, but the automation
session has no trustworthy audio-observation channel. The actual Windows
reduced-motion preference was not changed. These conditions are not inferred
as PASS, and `FINAL_MEDIA_CAPTURE` remains unauthorized.

Canonical evidence:

- `WINDOWS_REFERENCE_HARDWARE_QA_REPORT.v5.json`
- `WINDOWS_NATIVE_SOURCE_IDENTITY.v3.json`
- `WINDOWS_VISUAL_STUDIO_COMPONENT_PROVISIONING.v1.json`
- `WINDOWS_NATIVE_QA_BUILD_MANIFEST.v2.json`
- `WINDOWS_NATIVE_RUNTIME_QA.v1.json`
