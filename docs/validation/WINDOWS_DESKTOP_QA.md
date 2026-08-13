# Windows desktop QA

Status: `NOT_RUN` on 2026-08-09. The current host is WSL2 Linux and cannot prove a Windows installer or Windows assistive-technology behavior.

## Reproduction

On a clean Windows 11 machine with Node/npm, Rust 1.97.1 and WebView2 available:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows_qa.ps1
```

## Required manual evidence

- Install the produced MSI/NSIS bundle as a non-administrator where supported.
- Launch, close, relaunch and uninstall without stale runtime secrets or model weights in the application package.
- Traverse every workspace surface using keyboard only; verify visible focus and logical order.
- Verify accessible names, landmarks, status announcements and approval dialogs with Narrator and one additional screen reader where available.
- Enable Windows reduced motion and replay the same typed event trace; state and available actions must remain identical.
- Cancel model generation, indexing and verification; UI acknowledgement must be visible immediately and final replay state must be consistent.
- Exercise Repository Explorer, Architecture, Agent Flow, Code, Diff, Verification, Findings, Report, Run History, Systems and Approval surfaces.
- Capture installer SHA-256, Windows build, WebView2 version, GPU driver, screenshots and failure notes.

Passing `scripts/windows_qa.ps1` alone is not sufficient to mark the manual checks PASS.
