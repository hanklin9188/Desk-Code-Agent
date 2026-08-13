# Windows Reference Hardware QA — W1

Date: 2026-08-12  
Canonical report: [`WINDOWS_REFERENCE_HARDWARE_QA_REPORT.json`](WINDOWS_REFERENCE_HARDWARE_QA_REPORT.json)  
Result: `BLOCKED_EXTERNAL`

W1 used the actual Windows 11 host and Microsoft Edge to validate deterministic UI rendering, including the four device-scale factors and all five canonical product surfaces at the host's 150% scale. Static Windows rendering was readable and showed no clipping, overlap, chart truncation, or unexpected scrollbars.

Two bounded product defects were reproduced and fixed: the artifact dialog now traps and restores focus and closes with Escape, and canonical artifact lookup now handles Windows separators while failing closed for absolute, traversing, long non-allowlisted, and spaced non-allowlisted paths.

W1 cannot pass. Windows-native Node/npm and Rust/cargo are absent, and no prebuilt Windows executable or installer exists. The native Tauri startup gate therefore stopped deterministically at `node --version`. Interactive native keyboard, screen-reader, native OS scaling at 100/125/200%, scaled dialog/tooltip, native font, and native motion checks remain `NOT_RUN_ENVIRONMENT_LIMITATION`.

`FINAL_MEDIA_CAPTURE` is not authorized. The next authorized phase remains `WINDOWS_REFERENCE_HARDWARE_QA` after the documented environment is provisioned. No model, benchmark, dependency-installation, Git, packaging, signing, release, upload, or publication action occurred.
