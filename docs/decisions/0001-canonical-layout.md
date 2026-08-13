# Implementation Decision 0001 — Canonical design layout

Status: accepted locally

The received operating instructions referenced a future `docs/design/...` layout that does not exist in this workspace. The existing release artifacts, manifests and cross-links use the repository root master design plus `docs/`, `implementation/`, `ui/`, `schemas/`, `benchmarks/` and `adrs/`.

To avoid duplicating or silently forking canonical documents, implementation keeps the existing layout and corrects `AGENTS.md` pointers. A future migration may move files only with link validation and updated release hashes.
