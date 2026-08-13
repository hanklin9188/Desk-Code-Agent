# Environment preflight — 2026-08-09

| Capability | Status | Evidence |
|---|---|---|
| WSL2 | PASS | Linux `5.15.167.4-microsoft-standard-WSL2` |
| GPU | PASS | RTX 4080 SUPER, 16,376 MiB, CUDA 13.1 from `nvidia-smi` |
| Node/npm | PASS | Node 24.15.0, npm 11.12.1 |
| vLLM | PASS | isolated Python 3.12.13, vLLM 0.26.0, Qwen BF16 live probe |
| Tree-sitter | PASS | pinned Node parser dependencies and fixture |
| SQLite | PASS | Node DatabaseSync evidence fixture |
| Rust toolchain | PASS | project-local rustc/cargo 1.97.1, rustfmt and locked metadata |
| Tauri Linux compile | BLOCKED_ADMIN | missing pkg-config/dbus/webkit2gtk/rsvg2 dev packages; sudo password required |
| Tauri Windows installer | NOT_RUN | requires native Windows QA host |
| GitHub publication | NEED_APPROVAL | no write attempted |
| Verification hard network isolation | PASS | user+network namespace blocks external fetch; runtime reports capability level explicitly |

This is environment evidence, not model-quality or release evidence.
