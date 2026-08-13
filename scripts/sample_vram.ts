import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { crossCheckVram } from "../services/telemetry-runtime/src/vram";

const root = path.resolve(process.cwd());
const label = process.argv.find((argument) => argument.startsWith("--label="))?.slice("--label=".length) ?? "manual";
const durationMs = Number(process.argv.find((argument) => argument.startsWith("--duration-ms="))?.slice("--duration-ms=".length) ?? "0");
const intervalMs = Number(process.argv.find((argument) => argument.startsWith("--interval-ms="))?.slice("--interval-ms=".length) ?? "100");
if (!Number.isFinite(durationMs) || durationMs < 0 || !Number.isFinite(intervalMs) || intervalMs < 50) throw new Error("Invalid duration/interval");
const readings: Awaited<ReturnType<typeof crossCheckVram>>[] = [];
const startedAt = new Date().toISOString();
const started = performance.now();
do {
  readings.push(await crossCheckVram(root));
  if (durationMs === 0 || performance.now() - started >= durationMs) break;
  await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(0, durationMs - (performance.now() - started)))));
} while (performance.now() - started <= durationMs + intervalMs);

const report = {
  schemaVersion: 1,
  label,
  status: readings.every((reading) => reading.valid) ? "PASS" : "FAIL",
  startedAt,
  completedAt: new Date().toISOString(),
  durationMs: Number((performance.now() - started).toFixed(3)),
  intervalMs,
  samples: readings.length,
  primarySource: "NVIDIA_SMI_DEVICE_MEMORY",
  independentSource: "NVML_DEVICE_MEMORY",
  primaryPeakMiB: Math.max(...readings.map((reading) => reading.primary.usedMiB)),
  independentPeakMiB: Math.max(...readings.map((reading) => reading.independent.usedMiB)),
  primaryMinimumMiB: Math.min(...readings.map((reading) => reading.primary.usedMiB)),
  independentMinimumMiB: Math.min(...readings.map((reading) => reading.independent.usedMiB)),
  readings
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputRoot = path.join(root, "docs/experiments/vram");
await mkdir(outputRoot, { recursive: true });
const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label.replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
await writeFile(path.join(outputRoot, filename), serialized, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ file: `docs/experiments/vram/${filename}`, sha256: createHash("sha256").update(serialized).digest("hex"), ...report }, null, 2)}\n`);
