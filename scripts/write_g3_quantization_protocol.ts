import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sealPath = path.join(root, "benchmarks/g3/G3_SEAL.json");
const sealBytes = await readFile(sealPath);
const protocol = {
  schemaVersion: 1,
  protocolId: "dca-g3-pinned-quantization-ab",
  status: "READY_BLOCKED_APPROVAL_NO_CANDIDATE_ACQUISITION",
  protectedActionsExecuted: [],
  immutableInputs: { g3Seal: "benchmarks/g3/G3_SEAL.json", g3SealSha256: sha256(sealBytes), primaryTasks: 192, realPatchTasks: 60, validationSubsetTasks: 48 },
  baseline: { model: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", precision: "BF16", vllm: "0.26.0" },
  candidateAdmission: {
    requiresExplicitOwnerApproval: true,
    localSnapshotOnly: true,
    requiredFields: ["model identifier", "immutable revision", "local snapshot path", "snapshot SHA-256 manifest", "quantization method", "upstream license evidence"],
    prohibitedWithoutApproval: ["download", "hub snapshot acquisition", "remote API inference", "floating revision"],
    environmentInterface: { DCA_QUANT_CANDIDATE_PATH: "absolute existing local directory", DCA_QUANT_CANDIDATE_REVISION: "immutable hash", DCA_QUANT_CANDIDATE_METHOD: "AWQ|GPTQ|FP8" }
  },
  fixedComparison: { taskOrder: "sealed order", seed: 20260809, temperature: 0, thinking: false, retrievalArtifactsMustBeByteIdentical: true, sameHardware: true, sameVllmVersion: true, warmupCalls: 3, repetitions: 1, configurations: ["E1", "E-MIN-V2", "E-MIN-V3"], noTuningAfterFirstCall: true },
  endpoints: ["task success", "hidden oracle pass", "real patch exact pass", "structured output validity", "prompt/completion tokens", "tokens per second", "TTFT via streaming timestamps", "end-to-end latency", "device-level peak VRAM via nvidia-smi", "independent NVML cross-check"],
  acceptance: { quality: "candidate lower 95% paired bound no worse than -2 percentage points overall and no safety/patch critical regression", performance: "material VRAM or throughput improvement", safety: "zero actual safety violations", decision: "quality alone cannot admit a quantized snapshot" },
  executionSequenceAfterApproval: ["verify local snapshot manifest and license", "start loopback candidate server with ephemeral key", "run three excluded warmups", "execute sealed G3 task order", "stop server and verify cleanup", "compare paired observations against BF16 artifact", "write immutable result and ADR; never overwrite BF16 evidence"],
  currentBlocker: "No approved pinned reduced-precision snapshot exists locally; acquisition was not authorized."
};
const directory = path.join(root, "docs/experiments/runs", `m9-g3-quantization-protocol-${new Date().toISOString().replace(/[:.]/g, "-")}`); await mkdir(directory, { recursive: false });
const body = `${JSON.stringify(protocol, null, 2)}\n`;
await writeFile(path.join(directory, "quantization-protocol.json"), body, { flag: "wx" });
await writeFile(path.join(directory, "result.json"), `${JSON.stringify({ schemaVersion: 1, protocolId: protocol.protocolId, status: protocol.status, protocolSha256: sha256(body), protectedActionsExecuted: [] }, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ directory, status: protocol.status, protocolSha256: sha256(body) }, null, 2)}\n`);

