# Corrected VRAM evidence

Date: 2026-08-09  
Status: measured and independently cross-checked

The earlier process-level `nvidia-smi --query-compute-apps` zero/N/A sample is invalid for this WSL/vLLM workload and remains historical evidence. It is not interpreted as zero VRAM.

The corrected primary method is device-level `nvidia-smi --query-gpu=memory.used,memory.total`; independent readings use pynvml. NVML consistently reports about 330.32 MiB more under WSL/driver accounting, while total memory agrees at 16,376 MiB.

| Phase | Primary nvidia-smi | Independent NVML | Evidence |
|---|---:|---:|---|
| Pre-server idle | 0 MiB | 331 MiB | `2026-08-09T07-27-10-062Z-idle-pre-server.json` |
| Model loaded idle | 12,020 MiB | 12,350.32 MiB | `2026-08-09T07-28-25-511Z-model-loaded-idle.json` |
| 600-second retrieval workload | peak 12,046 MiB | peak 12,376.32 MiB | 569 samples in `2026-08-09T07-38-29-458Z-retrieval-v3-development-workload.json` |
| 300-second hard stress | peak 12,046 MiB | peak 12,376.32 MiB | 542 samples in `2026-08-09T07-48-20-365Z-retrieval-v3-hard-stress.json` |
| Sealed G2, 630 calls | peak 12,282 MiB | start/end 12,612.32 MiB | `m9-fresh-holdout-g2-2026-08-09T08-14-16-853Z` |

The corrected BF16 peak is 12,282 MiB, 75.0% of the device by the primary presentation. No reduced-precision comparison ran and no quantization saving is claimed.
