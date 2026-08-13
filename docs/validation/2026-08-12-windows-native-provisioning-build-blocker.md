# W1 Windows Native Provisioning and Build Blocker

Status: `BLOCKED_ADDITIONAL_MSVC_COMPONENT_APPROVAL_REQUIRED`

The approved Node and Rust provisioning completed successfully: Node 24.15.0, npm 11.12.1, rustup 1.29.0, Rust/Cargo 1.97.1 MSVC, rustfmt, and clippy are available from fresh Windows processes. The current source was copied to NTFS and passed an exact 2,197-file, 86,239,290-byte closure comparison. Locked `npm ci` installed 137 packages and `cargo fetch --locked` passed without lockfile changes.

Windows-native TypeScript, 12 targeted tests, and the frontend production build passed. The locked native Cargo build reached Microsoft's installed linker, then failed with `LNK1104: cannot open file 'msvcrt.lib'`.

Read-only diagnosis shows that the Visual Studio installation contains the OneCore MSVC libraries but not the desktop x64 CRT libraries. The exact additional component requiring approval is:

`Microsoft.VisualStudio.Component.VC.Tools.x86.x64` — MSVC x64/x86 desktop build tools.

No attempt was made to install that unapproved component. Consequently no executable exists, and native startup, WebView2, DPI, keyboard, Narrator, fonts, motion, artifact-path, and safety gates remain `NOT_RUN_ENVIRONMENT_LIMITATION`. W2 remains unauthorized.
