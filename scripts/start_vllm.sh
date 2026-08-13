#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
model_env="$project_root/runtime/model/.venv"
runtime_state="$project_root/.runtime/model"
key_file="$runtime_state/api-key"
export HF_HOME="${DCA_HF_CACHE_DIR:-$runtime_state/huggingface}"
export FLASHINFER_WORKSPACE_BASE="$runtime_state/flashinfer"
export TORCHINDUCTOR_CACHE_DIR="$runtime_state/torchinductor"
export VLLM_USE_FLASHINFER_SAMPLER=0
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1

if [[ ! -x "$model_env/bin/vllm" ]]; then
  echo "Model runtime is missing. Run scripts/setup_vllm.sh first." >&2
  exit 1
fi

mkdir -p "$runtime_state"
mkdir -p "$HF_HOME"
mkdir -p "$FLASHINFER_WORKSPACE_BASE" "$TORCHINDUCTOR_CACHE_DIR"
umask 077
"$model_env/bin/python" -c 'import secrets; print(secrets.token_urlsafe(32))' > "$key_file"
chmod 600 "$key_file"
export DCA_VLLM_API_KEY_FILE="$key_file"

"$model_env/bin/python" "$project_root/scripts/launch_vllm.py" 2>&1 | \
  DCA_LOG_REDACT_FILE="$key_file" "$model_env/bin/python" -c 'import os, pathlib, sys
secret = pathlib.Path(os.environ["DCA_LOG_REDACT_FILE"]).read_text(encoding="utf-8").strip()
for line in sys.stdin:
    sys.stdout.write(line.replace(secret, "[REDACTED]"))
    sys.stdout.flush()'
