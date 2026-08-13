#!/usr/bin/env python3
"""Launch one pinned specialization profile without exposing its API key."""

from __future__ import annotations

import json
import hashlib
import os
from pathlib import Path
import sys
import time

import torch
import transformers
import vllm
from vllm.entrypoints.cli.main import main


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def required_key() -> str:
    key_path = os.environ.get("DCA_VLLM_API_KEY_FILE")
    if not key_path:
        raise SystemExit("DCA_VLLM_API_KEY_FILE is required")
    key = Path(key_path).read_text(encoding="utf-8").strip()
    if len(key) < 32:
        raise SystemExit("The ephemeral vLLM API key is invalid")
    return key


def selected_profile() -> tuple[dict[str, object], dict[str, object], Path]:
    profile_id = os.environ.get("DCA_MODEL_PROFILE_ID")
    if profile_id not in {"baseline", "coder"}:
        raise SystemExit("DCA_MODEL_PROFILE_ID must be baseline or coder")
    registry = json.loads((PROJECT_ROOT / "config/model_specialization_profiles.json").read_text(encoding="utf-8"))
    shared = registry["sharedServing"]
    profile = registry["profiles"][profile_id]
    runtime_state = PROJECT_ROOT / ".runtime" / "model"
    expected_environment = {
        "HF_HOME": str(runtime_state / "huggingface"),
        "DCA_HF_CACHE_DIR": str(runtime_state / "huggingface"),
        "FLASHINFER_WORKSPACE_BASE": str(runtime_state / "flashinfer"),
        "TORCHINDUCTOR_CACHE_DIR": str(runtime_state / "torchinductor"),
        "VLLM_USE_FLASHINFER_SAMPLER": "0",
        "VLLM_USE_V2_MODEL_RUNNER": "0",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "DCA_MODEL_PROFILE_ID": profile_id,
    }
    for name, expected in expected_environment.items():
        if os.environ.get(name) != expected:
            raise SystemExit(f"Serving environment differs from the exact frozen value: {name}")
    snapshot = Path(expected_environment["HF_HOME"]) / "hub" / profile["snapshotDirectoryName"] / "snapshots" / profile["revision"]
    if not snapshot.is_dir():
        raise SystemExit(f"Pinned local snapshot is unavailable for profile {profile_id}: {snapshot}")
    if snapshot.resolve() != snapshot:
        raise SystemExit(f"Pinned snapshot directory must resolve to the exact project-local revision path: {snapshot}")
    return shared, profile, snapshot


def sha256_file(target: Path) -> str:
    digest = hashlib.sha256()
    with target.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def process_start_ticks() -> str:
    value = Path(f"/proc/{os.getpid()}/stat").read_text(encoding="utf-8")
    return value[value.rfind(")") + 2 :].split()[19]


def write_launch_attestation(profile: dict[str, object], snapshot: Path, sanitized_args: list[str]) -> None:
    runtime_state = PROJECT_ROOT / ".runtime" / "model"
    target = runtime_state / "profile-launch.json"
    python_executable = Path(sys.executable).resolve()
    installed_runtime = {
        "pythonExecutable": str(python_executable),
        "pythonExecutableSha256": sha256_file(python_executable),
        "pythonVersion": sys.version.split()[0],
        "packages": {
            "vllm": vllm.__version__,
            "transformers": transformers.__version__,
            "torch": torch.__version__,
        },
    }
    value = {
        "schemaVersion": 1,
        "profileId": os.environ["DCA_MODEL_PROFILE_ID"],
        "modelId": profile["modelId"],
        "revision": profile["revision"],
        "tokenizerRevision": profile["tokenizerRevision"],
        "processId": os.getpid(),
        "processStartTicks": process_start_ticks(),
        "createdEpochMs": time.time() * 1000,
        "sanitizedArgs": sanitized_args,
        "sanitizedArgsSha256": hashlib.sha256("\0".join(sanitized_args).encode("utf-8")).hexdigest(),
        "environment": {
            "HF_HOME": os.environ.get("HF_HOME"),
            "DCA_HF_CACHE_DIR": os.environ.get("DCA_HF_CACHE_DIR"),
            "FLASHINFER_WORKSPACE_BASE": os.environ.get("FLASHINFER_WORKSPACE_BASE"),
            "TORCHINDUCTOR_CACHE_DIR": os.environ.get("TORCHINDUCTOR_CACHE_DIR"),
            "VLLM_USE_FLASHINFER_SAMPLER": os.environ.get("VLLM_USE_FLASHINFER_SAMPLER"),
            "VLLM_USE_V2_MODEL_RUNNER": os.environ.get("VLLM_USE_V2_MODEL_RUNNER"),
            "HF_HUB_OFFLINE": os.environ.get("HF_HUB_OFFLINE"),
            "TRANSFORMERS_OFFLINE": os.environ.get("TRANSFORMERS_OFFLINE"),
            "DCA_MODEL_PROFILE_ID": os.environ.get("DCA_MODEL_PROFILE_ID"),
        },
        "snapshot": {"path": str(snapshot), "realpath": str(snapshot.resolve())},
        "installedRuntime": installed_runtime,
        "files": {
            "startScriptSha256": sha256_file(PROJECT_ROOT / "scripts" / "start_model_profile.sh"),
            "launchScriptSha256": sha256_file(PROJECT_ROOT / "scripts" / "launch_model_profile.py"),
            "registrySha256": sha256_file(PROJECT_ROOT / "config" / "model_specialization_profiles.json"),
            "profileStartStateSha256": sha256_file(runtime_state / "profile-start.json"),
        },
        "apiKeyStored": False,
    }
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(value, separators=(",", ":")) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


if __name__ == "__main__":
    shared, profile, snapshot = selected_profile()
    api_key = required_key()
    args = [
        "vllm", "serve", profile["modelId"],
        "--host", shared["host"],
        "--port", str(shared["port"]),
        "--api-key", api_key,
        "--revision", profile["revision"],
        "--tokenizer-revision", profile["tokenizerRevision"],
        "--served-model-name", profile["modelId"],
        "--dtype", shared["precision"],
        "--max-model-len", str(shared["comparisonContextLimit"]),
        "--gpu-memory-utilization", str(shared["gpuMemoryUtilization"]),
        "--max-num-seqs", str(shared["maxNumSequences"]),
        "--generation-config", shared["generationConfig"],
    ]
    if shared["prefixCaching"]:
        args.append("--enable-prefix-caching")
    sanitized_args = ["[EPHEMERAL_REDACTED]" if index > 0 and args[index - 1] == "--api-key" else str(value) for index, value in enumerate(args)]
    write_launch_attestation(profile, snapshot, sanitized_args)
    sys.argv = args
    main()
