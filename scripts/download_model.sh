#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
model_env="$project_root/runtime/model/.venv"
runtime_state="$project_root/.runtime/model"
export HF_HOME="${DCA_HF_CACHE_DIR:-$runtime_state/huggingface}"

if [[ ! -x "$model_env/bin/hf" ]]; then
  echo "Model runtime is missing. Run scripts/setup_vllm.sh first." >&2
  exit 1
fi

mkdir -p "$HF_HOME"
"$model_env/bin/hf" download "Qwen/Qwen3.5-4B" \
  --revision 851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a
