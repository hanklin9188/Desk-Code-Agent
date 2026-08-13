#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="$project_root/.runtime/rust"
export RUSTUP_HOME="$runtime_root/rustup"
export CARGO_HOME="$runtime_root/cargo"
export PATH="$CARGO_HOME/bin:$PATH"

exec "$@"
