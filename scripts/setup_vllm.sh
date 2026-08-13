#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
model_project="$project_root/runtime/model"

command -v uv >/dev/null
uv sync --project "$model_project" --python 3.12 --no-dev --frozen
"$model_project/.venv/bin/python" -c 'import sys, vllm; print(f"python={sys.version.split()[0]} vllm={vllm.__version__}")'
