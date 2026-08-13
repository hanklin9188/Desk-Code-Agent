#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
model_env="$project_root/runtime/model/.venv"
runtime_state="$project_root/.runtime/model"
key_file="$runtime_state/api-key"
start_state="$runtime_state/profile-start.json"
ready_state="$runtime_state/profile-ready.json"
launch_state="$runtime_state/profile-launch.json"
profile_id="${1:-}"

if [[ "$profile_id" != "baseline" && "$profile_id" != "coder" ]]; then
  echo "Usage: scripts/start_model_profile.sh baseline|coder" >&2
  exit 2
fi
if [[ ! -x "$model_env/bin/vllm" ]]; then
  echo "Pinned model runtime is missing. Dependency installation is not performed automatically." >&2
  exit 1
fi

canonical_hf_home="$runtime_state/huggingface"
if [[ -n "${DCA_HF_CACHE_DIR:-}" && "$DCA_HF_CACHE_DIR" != "$canonical_hf_home" ]]; then
  echo "DCA_HF_CACHE_DIR cannot override the exact project-local model cache." >&2
  exit 1
fi
export DCA_HF_CACHE_DIR="$canonical_hf_home"
export HF_HOME="$canonical_hf_home"
export FLASHINFER_WORKSPACE_BASE="$runtime_state/flashinfer"
export TORCHINDUCTOR_CACHE_DIR="$runtime_state/torchinductor"
export VLLM_USE_FLASHINFER_SAMPLER=0
# vLLM 0.26 defaults dense Qwen2 models to Model Runner V2, whose mandatory
# pinned host buffer requires CUDA UVA. The approved WSL/CUDA device does not
# expose UVA. Pin V1 for both profiles: the hybrid Qwen3.5 baseline already
# resolves to V1, so this makes the shared serving path explicit and equal.
export VLLM_USE_V2_MODEL_RUNNER=0
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export DCA_MODEL_PROFILE_ID="$profile_id"

mkdir -p "$runtime_state" "$HF_HOME" "$FLASHINFER_WORKSPACE_BASE" "$TORCHINDUCTOR_CACHE_DIR"
for directory in "$runtime_state" "$HF_HOME" "$FLASHINFER_WORKSPACE_BASE" "$TORCHINDUCTOR_CACHE_DIR"; do
  if [[ -L "$directory" || ! -d "$directory" ]]; then
    echo "Serving state/cache paths must be real project-local directories: $directory" >&2
    exit 1
  fi
done
for state_file in "$key_file" "$start_state" "$launch_state" "$ready_state"; do
  if [[ -e "$state_file" || -L "$state_file" ]]; then
    echo "Existing serving state blocks a second or ambiguous profile launch: $state_file" >&2
    exit 1
  fi
done
if ss -ltn | awk '{print $4}' | grep -Eq '(^|:)8000$'; then
  echo "Port 8000 is already in use; sequential model residency is required." >&2
  exit 1
fi
umask 077
"$model_env/bin/python" -c 'import pathlib, secrets, sys
target = pathlib.Path(sys.argv[1])
with target.open("x", encoding="utf-8") as handle:
    handle.write(secrets.token_urlsafe(32) + "\n")
    handle.flush()
    __import__("os").fsync(handle.fileno())
target.chmod(0o600)' "$key_file"
export DCA_VLLM_API_KEY_FILE="$key_file"
"$model_env/bin/python" -c 'import json, pathlib, sys, time
target = pathlib.Path(sys.argv[1])
shell_pid = int(sys.argv[3])
stat = pathlib.Path(f"/proc/{shell_pid}/stat").read_text(encoding="utf-8")
start_ticks = stat[stat.rfind(")") + 2:].split()[19]
with target.open("x", encoding="utf-8") as handle:
    handle.write(json.dumps({"schemaVersion": 1, "profileId": sys.argv[2], "startedEpochMs": time.time() * 1000, "shellPid": shell_pid, "shellProcessStartTicks": start_ticks}) + "\n")
    handle.flush()
    __import__("os").fsync(handle.fileno())
target.chmod(0o600)' "$start_state" "$profile_id" "$$"

cleanup_key() {
  rm -f -- "$key_file"
}
trap cleanup_key EXIT INT TERM

"$model_env/bin/python" "$project_root/scripts/launch_model_profile.py" 2>&1 | \
  DCA_LOG_REDACT_FILE="$key_file" "$model_env/bin/python" -c 'import os, pathlib, sys
secret = pathlib.Path(os.environ["DCA_LOG_REDACT_FILE"]).read_text(encoding="utf-8").strip()
for line in sys.stdin:
    sys.stdout.write(line.replace(secret, "[REDACTED]"))
    sys.stdout.flush()'
