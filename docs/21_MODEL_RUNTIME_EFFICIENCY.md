# Model Runtime and Efficiency

## Reference profile

- Windows 11 desktop
- RTX 4080 SUPER 16GB
- WSL2 Linux model service
- Qwen3.5-4B, exact revision pinned at M2
- vLLM loopback/OpenAI-compatible endpoint
- one model instance, one physical generation by default

## Profiles

| Profile | Precision | Context | Use |
|---|---|---:|---|
| Quality | BF16 | 8K default / 16K hard | correctness baseline |
| Balanced | FP8/INT8 only after task benchmark | 8–16K | normal product candidate |
| Compact | INT4 AWQ/GPTQ only after non-inferiority | 8K | lower VRAM/hardware |

Quantization is not accepted from perplexity alone; evaluate repo analysis, bug fix, hidden tests, tool/schema validity, review and safety.

## Latency control

- deterministic router, indexing and tests on CPU
- short/non-thinking Orchestrator/Reporter
- thinking only for diagnosis/patch
- role-specific context, no transcript accumulation
- targeted tests before full
- cache index/retrieval/prefix where valid
- logical parallel work scheduled sequentially or carefully micro-batched
- telemetry reports queue, prefill, generation and tool time separately
