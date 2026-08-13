#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
model_env="$project_root/runtime/model/.venv"
runtime_state="$project_root/.runtime/model"
key_file="$runtime_state/tournament-api-key"
start_state="$runtime_state/tournament-start.json"
launch_state="$runtime_state/tournament-launch.json"
ready_state="$runtime_state/tournament-ready.json"
candidate_id="${1:-}"

if [[ ! "$candidate_id" =~ ^M[123]$ ]]; then
  echo "Usage: scripts/start_model_tournament_candidate.sh M1|M2|M3" >&2
  exit 2
fi
if [[ ! -x "$model_env/bin/python" ]]; then
  echo "Pinned model runtime is unavailable; dependency installation is not authorized." >&2
  exit 1
fi

canonical_hf_home="$runtime_state/huggingface"
export DCA_HF_CACHE_DIR="$canonical_hf_home"
export HF_HOME="$canonical_hf_home"
export FLASHINFER_WORKSPACE_BASE="$runtime_state/flashinfer"
export TORCHINDUCTOR_CACHE_DIR="$runtime_state/torchinductor"
export VLLM_USE_FLASHINFER_SAMPLER=0
export VLLM_USE_V2_MODEL_RUNNER=0
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export DCA_TOURNAMENT_CANDIDATE_ID="$candidate_id"

mkdir -p "$runtime_state" "$HF_HOME" "$FLASHINFER_WORKSPACE_BASE" "$TORCHINDUCTOR_CACHE_DIR"
for directory in "$runtime_state" "$HF_HOME" "$FLASHINFER_WORKSPACE_BASE" "$TORCHINDUCTOR_CACHE_DIR"; do
  if [[ -L "$directory" || ! -d "$directory" ]]; then
    echo "Tournament state/cache must be real project-local directories: $directory" >&2
    exit 1
  fi
done
for state_file in "$key_file" "$start_state" "$launch_state" "$ready_state"; do
  if [[ -e "$state_file" || -L "$state_file" ]]; then
    echo "Existing tournament serving state blocks ambiguous launch: $state_file" >&2
    exit 1
  fi
done
if ss -ltn | awk '{print $4}' | grep -Eq '(^|:)8000$'; then
  echo "Port 8000 is already in use; sequential residency is mandatory." >&2
  exit 1
fi

umask 077
"$model_env/bin/python" -c 'import pathlib, secrets, sys
target=pathlib.Path(sys.argv[1]); target.write_text(secrets.token_urlsafe(32)+"\n",encoding="utf-8"); target.chmod(0o600)' "$key_file"
"$model_env/bin/python" -c 'import json, os, pathlib, sys, time
target=pathlib.Path(sys.argv[1]); value={"schemaVersion":1,"candidateId":sys.argv[2],"startedEpochMs":time.time()*1000,"shellPid":os.getppid()}; target.write_text(json.dumps(value,separators=(",",":"))+"\n",encoding="utf-8"); target.chmod(0o600)' "$start_state" "$candidate_id"
export DCA_VLLM_API_KEY_FILE="$key_file"

cleanup_key() { rm -f -- "$key_file"; }
trap cleanup_key EXIT INT TERM

"$model_env/bin/python" "$project_root/scripts/launch_model_tournament_candidate.py" 2>&1 | \
  DCA_LOG_REDACT_FILE="$key_file" "$model_env/bin/python" -c 'import os,pathlib,sys
secret=pathlib.Path(os.environ["DCA_LOG_REDACT_FILE"]).read_text(encoding="utf-8").strip()
for line in sys.stdin:
 sys.stdout.write(line.replace(secret,"[REDACTED]"));sys.stdout.flush()'
