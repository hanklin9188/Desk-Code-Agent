#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import time

import torch
import transformers
import vllm
from vllm.entrypoints.cli.main import main

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime" / "model"

def file_sha256(target: Path) -> str:
    digest = hashlib.sha256()
    with target.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def launch_candidate() -> None:
    candidate_id = os.environ.get("DCA_TOURNAMENT_CANDIDATE_ID")
    if candidate_id not in {"M1", "M2", "M3"}:
        raise SystemExit("DCA_TOURNAMENT_CANDIDATE_ID must be M1, M2, or M3")
    manifest_path = ROOT / "benchmarks/model-specialization/MODEL_TOURNAMENT_CANDIDATE_MANIFEST.v1.json"
    manifest_bytes = manifest_path.read_bytes()
    if hashlib.sha256(manifest_bytes).hexdigest() != "0ff04ada4842631ca3973b380667daa9b58f592c1b090e18b6903beb553066e1":
        raise SystemExit("Session-A candidate manifest drift")
    manifest = json.loads(manifest_bytes)
    candidate = next(item for item in manifest["candidates"] if item["candidateId"] == candidate_id)
    snapshot = RUNTIME / "huggingface" / "hub" / f"models--{candidate['modelId'].replace('/', '--')}" / "snapshots" / candidate["revision"]
    if not snapshot.is_dir() or snapshot.resolve() != snapshot:
        raise SystemExit("Exact local candidate snapshot is unavailable")
    acquisition_path = ROOT / f"docs/experiments/model-specialization/tournament-session-b/{candidate_id}_ACQUISITION.v1.json"
    if not acquisition_path.is_file():
        raise SystemExit("Candidate acquisition integrity artifact is absent")

    key_path = Path(os.environ.get("DCA_VLLM_API_KEY_FILE", ""))
    api_key = key_path.read_text(encoding="utf-8").strip()
    if len(api_key) < 32:
        raise SystemExit("Invalid ephemeral API key")
    expected_environment = {
        "HF_HOME": str(RUNTIME / "huggingface"),
        "DCA_HF_CACHE_DIR": str(RUNTIME / "huggingface"),
        "FLASHINFER_WORKSPACE_BASE": str(RUNTIME / "flashinfer"),
        "TORCHINDUCTOR_CACHE_DIR": str(RUNTIME / "torchinductor"),
        "VLLM_USE_FLASHINFER_SAMPLER": "0",
        "VLLM_USE_V2_MODEL_RUNNER": "0",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "DCA_TOURNAMENT_CANDIDATE_ID": candidate_id,
    }
    for name, expected in expected_environment.items():
        if os.environ.get(name) != expected:
            raise SystemExit(f"Frozen serving environment differs: {name}")

    args = [
        "vllm", "serve", candidate["modelId"],
        "--host", "127.0.0.1", "--port", "8000", "--api-key", api_key,
        "--revision", candidate["revision"], "--tokenizer-revision", candidate["revision"],
        "--served-model-name", candidate["modelId"], "--dtype", "bfloat16",
        "--quantization", "fp8_per_tensor", "--max-model-len", "8192",
        "--gpu-memory-utilization", "0.82", "--max-num-seqs", "1",
        "--generation-config", "vllm", "--seed", "20260809", "--enable-prefix-caching",
    ]
    sanitized = ["[EPHEMERAL_REDACTED]" if index and args[index - 1] == "--api-key" else value for index, value in enumerate(args)]
    launch = {
        "schemaVersion": 1, "candidateId": candidate_id, "modelId": candidate["modelId"],
        "revision": candidate["revision"], "createdEpochMs": time.time() * 1000,
        "processId": os.getpid(), "sanitizedArgs": sanitized,
        "sanitizedArgsSha256": hashlib.sha256("\0".join(sanitized).encode()).hexdigest(),
        "environment": expected_environment, "snapshot": {"path": str(snapshot), "realpath": str(snapshot.resolve())},
        "installedRuntime": {"python": sys.version.split()[0], "vllm": vllm.__version__, "transformers": transformers.__version__, "torch": torch.__version__},
        "sources": {"start": file_sha256(ROOT / "scripts/start_model_tournament_candidate.sh"), "launcher": file_sha256(Path(__file__)), "candidateManifest": hashlib.sha256(manifest_bytes).hexdigest(), "acquisition": file_sha256(acquisition_path)},
        "apiKeyStored": False,
    }
    target = RUNTIME / "tournament-launch.json"
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(launch, separators=(",", ":")) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    sys.argv = args
    main()


if __name__ == "__main__":
    launch_candidate()
