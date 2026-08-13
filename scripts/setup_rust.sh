#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="$project_root/.runtime/rust"
bootstrap="$runtime_root/bootstrap"
export RUSTUP_HOME="$runtime_root/rustup"
export CARGO_HOME="$runtime_root/cargo"

mkdir -p "$bootstrap" "$RUSTUP_HOME" "$CARGO_HOME"
curl -fsSL https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init -o "$bootstrap/rustup-init"
curl -fsSL https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init.sha256 -o "$bootstrap/rustup-init.sha256"
(
  cd "$bootstrap"
  sha256sum --check rustup-init.sha256
)
chmod 700 "$bootstrap/rustup-init"
"$bootstrap/rustup-init" -y --no-modify-path --profile minimal --default-toolchain 1.97.1
"$CARGO_HOME/bin/rustup" component add rustfmt clippy --toolchain 1.97.1
"$CARGO_HOME/bin/rustc" --version --verbose
"$CARGO_HOME/bin/cargo" --version --verbose
