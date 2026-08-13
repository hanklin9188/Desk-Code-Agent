#!/usr/bin/env python3
"""Launch vLLM without placing its API key in the operating-system command line."""

from __future__ import annotations

import os
from pathlib import Path
import sys

from vllm.entrypoints.cli.main import main


def require_api_key() -> str:
    key_path = os.environ.get("DCA_VLLM_API_KEY_FILE")
    if not key_path:
        raise SystemExit("DCA_VLLM_API_KEY_FILE is required")
    path = Path(key_path)
    key = path.read_text(encoding="utf-8").strip()
    if len(key) < 32:
        raise SystemExit("The vLLM API key file is invalid")
    return key


if __name__ == "__main__":
    api_key = require_api_key()
    sys.argv = [
        "vllm",
        "serve",
        "Qwen/Qwen3.5-4B",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
        "--api-key",
        api_key,
        "--revision",
        "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a",
        "--tokenizer-revision",
        "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a",
        "--served-model-name",
        "Qwen/Qwen3.5-4B",
        "--dtype",
        "bfloat16",
        "--max-model-len",
        "8192",
        "--gpu-memory-utilization",
        "0.82",
        "--max-num-seqs",
        "1",
        "--enable-prefix-caching",
    ]
    main()
