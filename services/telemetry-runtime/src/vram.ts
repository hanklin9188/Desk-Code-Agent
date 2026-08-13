import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface VramReading {
  source: "NVIDIA_SMI_DEVICE_MEMORY" | "NVML_DEVICE_MEMORY";
  deviceIndex: number;
  usedMiB: number;
  totalMiB: number;
  sampledAt: string;
  valid: boolean;
  note: string | null;
}

export async function sampleNvidiaSmiDevice(deviceIndex = 0): Promise<VramReading> {
  const { stdout } = await execFileAsync("nvidia-smi", ["--query-gpu=index,memory.used,memory.total", "--format=csv,noheader,nounits"], { timeout: 5_000, maxBuffer: 64_000 });
  const row = stdout.trim().split(/\r?\n/).map((line) => line.split(",").map((item) => item.trim())).find((items) => Number(items[0]) === deviceIndex);
  if (!row) throw new Error(`nvidia-smi did not return device ${deviceIndex}`);
  const usedMiB = Number(row[1]);
  const totalMiB = Number(row[2]);
  return { source: "NVIDIA_SMI_DEVICE_MEMORY", deviceIndex, usedMiB, totalMiB, sampledAt: new Date().toISOString(), valid: Number.isFinite(usedMiB) && usedMiB >= 0 && Number.isFinite(totalMiB) && totalMiB > 0, note: null };
}

export async function sampleNvmlDevice(projectRoot: string, deviceIndex = 0): Promise<VramReading> {
  const python = path.join(projectRoot, "runtime/model/.venv/bin/python");
  const program = [
    "import json,pynvml,sys",
    "i=int(sys.argv[1])",
    "pynvml.nvmlInit()",
    "h=pynvml.nvmlDeviceGetHandleByIndex(i)",
    "m=pynvml.nvmlDeviceGetMemoryInfo(h)",
    "print(json.dumps({'used':m.used/1024/1024,'total':m.total/1024/1024}))",
    "pynvml.nvmlShutdown()"
  ].join(";");
  const { stdout } = await execFileAsync(python, ["-c", program, String(deviceIndex)], { timeout: 5_000, maxBuffer: 64_000 });
  const value = JSON.parse(stdout) as { used: number; total: number };
  return { source: "NVML_DEVICE_MEMORY", deviceIndex, usedMiB: Number(value.used.toFixed(3)), totalMiB: Number(value.total.toFixed(3)), sampledAt: new Date().toISOString(), valid: Number.isFinite(value.used) && value.used >= 0 && Number.isFinite(value.total) && value.total > 0, note: "NVML may include WSL/driver-reserved memory that nvidia-smi presentation excludes; compare loaded/workload deltas as well as absolute values." };
}

export async function crossCheckVram(projectRoot: string, deviceIndex = 0) {
  const [primary, independent] = await Promise.all([sampleNvidiaSmiDevice(deviceIndex), sampleNvmlDevice(projectRoot, deviceIndex)]);
  return {
    schemaVersion: 1,
    primary,
    independent,
    absoluteDifferenceMiB: Number(Math.abs(primary.usedMiB - independent.usedMiB).toFixed(3)),
    totalDifferenceMiB: Number(Math.abs(primary.totalMiB - independent.totalMiB).toFixed(3)),
    valid: primary.valid && independent.valid
  };
}
