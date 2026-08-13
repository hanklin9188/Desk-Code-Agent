import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, lstat, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactUntrusted, safeResolve } from "../../repo-intelligence/src/index";
import type { VerificationStatus } from "../../../packages/contracts/src/index";

export interface PatchPolicy { allowedFiles: string[]; maxChangedLines: number }
export interface AppliedPatch { artifactHash: string; files: string[]; changedLines: number; status: "APPLIED" }
interface FileSnapshot { existed: boolean; content?: Buffer; mode?: number }

interface ProcessResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; cancelled: boolean; durationMs: number }

async function runProcess(options: { executable: string; args: string[]; cwd: string; input?: string; timeoutMs: number; maxOutputBytes?: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv }): Promise<ProcessResult> {
  const started = performance.now();
  const maxOutput = options.maxOutputBytes ?? 1_000_000;
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args, { cwd: options.cwd, shell: false, windowsHide: true, env: options.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let timedOut = false; let cancelled = false; let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const finish = (result: ProcessResult) => { if (settled) return; settled = true; clearTimeout(timer); if (forceKillTimer) clearTimeout(forceKillTimer); options.signal?.removeEventListener("abort", abort); resolve(result); };
    const append = (current: string, chunk: Buffer) => (current + chunk.toString("utf8")).slice(0, maxOutput);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.on("close", (code) => finish({ code, stdout, stderr, timedOut, cancelled, durationMs: performance.now() - started }));
    const terminate = () => {
      child.kill("SIGTERM");
      forceKillTimer ??= setTimeout(() => { if (!settled) child.kill("SIGKILL"); }, 250);
    };
    const abort = () => { cancelled = true; terminate(); };
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; terminate(); }, options.timeoutMs);
    if (options.input !== undefined) child.stdin.end(options.input); else child.stdin.end();
  });
}

export class ConstrainedPatchRuntime {
  readonly #root: string;
  readonly #allowed: Set<string>;
  readonly #maxChangedLines: number;
  readonly #snapshots = new Map<string, FileSnapshot>();
  constructor(worktreeRoot: string, policy: PatchPolicy) {
    this.#root = path.resolve(worktreeRoot);
    this.#allowed = new Set(policy.allowedFiles.map((file) => this.#normalize(file)));
    this.#maxChangedLines = policy.maxChangedLines;
    if (this.#allowed.size === 0 || this.#maxChangedLines < 1) throw new Error("Patch policy requires approved files and a positive line budget");
  }

  async apply(patchText: string): Promise<AppliedPatch> {
    if (!patchText.trim()) throw new Error("Patch is empty");
    const files = this.#extractFiles(patchText);
    const forbidden = files.filter((file) => !this.#allowed.has(file));
    if (forbidden.length) throw new Error(`Patch targets files outside approved patch plan: ${forbidden.join(", ")}`);
    const changedLines = patchText.split(/\r?\n/).filter((line) => (/^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line))).length;
    if (changedLines > this.#maxChangedLines) throw new Error(`Patch exceeds changed-line budget (${changedLines} > ${this.#maxChangedLines})`);
    for (const file of files) await this.#assertNoSymlinks(file);
    const check = await runProcess({ executable: "git", args: ["apply", "--check", "--whitespace=error", "-"], cwd: this.#root, input: patchText, timeoutMs: 10_000 });
    if (check.code !== 0) throw new Error(`Patch preflight failed: ${redactUntrusted(check.stderr).slice(0, 2_000)}`);
    const snapshots = new Map<string, FileSnapshot>();
    for (const file of files) snapshots.set(file, await this.#capture(file));
    const applied = await runProcess({ executable: "git", args: ["apply", "--whitespace=error", "-"], cwd: this.#root, input: patchText, timeoutMs: 10_000 });
    if (applied.code !== 0) throw new Error(`Patch application failed: ${redactUntrusted(applied.stderr).slice(0, 2_000)}`);
    for (const [file, snapshot] of snapshots) this.#snapshots.set(file, snapshot);
    return { artifactHash: `sha256:${createHash("sha256").update(patchText).digest("hex")}`, files, changedLines, status: "APPLIED" };
  }

  async rollback(files: string[]): Promise<boolean> {
    const normalized = files.map((file) => this.#normalize(file));
    if (normalized.some((file) => !this.#allowed.has(file))) throw new Error("Rollback target is outside approved patch plan");
    if (normalized.some((file) => !this.#snapshots.has(file))) throw new Error("Rollback target has no captured pre-patch snapshot");
    for (const file of normalized) {
      await this.#assertNoSymlinks(file);
      const snapshot = this.#snapshots.get(file)!;
      const absolute = safeResolve(this.#root, file);
      if (snapshot.existed) {
        await writeFile(absolute, snapshot.content!);
        await chmod(absolute, snapshot.mode!);
      } else {
        try { await unlink(absolute); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      this.#snapshots.delete(file);
    }
    return true;
  }
  async #capture(file: string): Promise<FileSnapshot> {
    const absolute = safeResolve(this.#root, file);
    try {
      const [content, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
      if (!metadata.isFile()) throw new Error(`Patch target is not a regular file: ${file}`);
      return { existed: true, content, mode: metadata.mode };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { existed: false };
      throw error;
    }
  }
  async #assertNoSymlinks(file: string): Promise<void> {
    const parts = file.split("/"); let current = this.#root;
    for (const part of parts) {
      current = path.join(current, part);
      const metadata = await lstat(current).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
      if (metadata?.isSymbolicLink()) throw new Error(`Patch path crosses a symbolic link: ${file}`);
      if (!metadata) return;
    }
  }
  #normalize(file: string): string {
    const clean = file.replace(/^([ab])\//, "").replaceAll("\\", "/");
    if (!clean || clean === "/dev/null" || path.posix.isAbsolute(clean) || clean.split("/").includes("..")) throw new Error("Patch contains an unsafe path");
    safeResolve(this.#root, clean); return clean;
  }
  #extractFiles(patchText: string): string[] {
    const files = new Set<string>();
    for (const line of patchText.split(/\r?\n/)) if (line.startsWith("+++ ") && !line.endsWith("/dev/null")) files.add(this.#normalize(line.slice(4).split("\t")[0]));
    if (files.size === 0) throw new Error("Patch has no target file headers");
    return [...files];
  }
}

export interface TrustedCommand { executable: string; args: string[]; timeoutMs: number; requiresHardNetworkIsolation: boolean; maxOutputBytes?: number }
export type SandboxCapabilityLevel = "HARD_ISOLATION" | "PROCESS_CONSTRAINED";
export type SandboxExecutionLevel = SandboxCapabilityLevel | "NO_NETWORK_GUARANTEE_UNAVAILABLE";
export interface SandboxCapabilities { level: SandboxCapabilityLevel; strategy: "unshare_user_network_pid" | "none"; reason?: string }
export interface SandboxProbeAdapters {
  probeUnshareUserNetworkPid: () => Promise<boolean>;
  probeDockerNetworkNone: () => Promise<boolean>;
}
export interface VerificationExecution { commandId: string; status: VerificationStatus; exitCode: number | null; durationMs: number; stdout: string; stderr: string; sandbox: SandboxExecutionLevel; reason?: string }

const probeCommand = async (executable: string, args: string[]): Promise<boolean> => {
  try {
    const result = await runProcess({ executable, args, cwd: process.cwd(), timeoutMs: 5_000, maxOutputBytes: 16_384 });
    return result.code === 0;
  } catch { return false; }
};

const defaultSandboxProbes: SandboxProbeAdapters = {
  probeUnshareUserNetworkPid: () => probeCommand("unshare", ["--user", "--map-root-user", "--net", "--pid", "--fork", "--mount-proc", "--kill-child=SIGKILL", "--", "true"]),
  probeDockerNetworkNone: () => probeCommand("docker", ["info", "--format", "{{.ServerVersion}}"])
};

export async function detectSandboxCapabilities(adapters: SandboxProbeAdapters = defaultSandboxProbes): Promise<SandboxCapabilities> {
  if (await adapters.probeUnshareUserNetworkPid()) return { level: "HARD_ISOLATION", strategy: "unshare_user_network_pid" };
  const dockerAvailable = await adapters.probeDockerNetworkNone();
  return {
    level: "PROCESS_CONSTRAINED",
    strategy: "none",
    reason: dockerAvailable
      ? "Docker is available, but no pinned verifier image is configured; hard network isolation cannot be claimed"
      : "No executable user+network+PID namespace or configured container isolation is available"
  };
}

export class TrustedVerificationExecutor {
  readonly #root: string;
  readonly #commands: Readonly<Record<string, TrustedCommand>>;
  readonly #capabilities: SandboxCapabilities;
  readonly #active = new Map<string, AbortController>();
  constructor(root: string, commands: Record<string, TrustedCommand>, capabilities: SandboxCapabilities) {
    this.#root = path.resolve(root); this.#commands = Object.freeze({ ...commands }); this.#capabilities = Object.freeze({ ...capabilities });
  }
  async run(commandId: string): Promise<VerificationExecution> {
    const command = this.#commands[commandId];
    if (!command) throw new Error(`Trusted command is not registered: ${commandId}`);
    if (command.requiresHardNetworkIsolation && this.#capabilities.level !== "HARD_ISOLATION") return {
      commandId, status: "NOT_RUN", exitCode: null, durationMs: 0, stdout: "", stderr: "",
      sandbox: "NO_NETWORK_GUARANTEE_UNAVAILABLE", reason: this.#capabilities.reason ?? "Hard network isolation is unavailable"
    };
    const controller = new AbortController(); this.#active.set(commandId, controller);
    try {
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH, LANG: process.env.LANG ?? "C.UTF-8", LC_ALL: process.env.LC_ALL,
        SYSTEMROOT: process.env.SYSTEMROOT, COMSPEC: process.env.COMSPEC, TEMP: process.env.TEMP, TMP: process.env.TMP,
        HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NO_PROXY: "127.0.0.1,localhost", DCA_NETWORK_POLICY: "off"
      };
      const isolated = command.requiresHardNetworkIsolation && this.#capabilities.strategy === "unshare_user_network_pid";
      const executable = isolated ? "unshare" : command.executable;
      // --kill-child makes timeout/cancellation fail closed: when the wrapper is
      // terminated, unshare kills the verifier instead of orphaning untrusted code.
      const args = isolated ? ["--user", "--map-root-user", "--net", "--pid", "--fork", "--mount-proc", "--kill-child=SIGKILL", "--", command.executable, ...command.args] : [...command.args];
      const result = await runProcess({ executable, args, cwd: this.#root, timeoutMs: command.timeoutMs, maxOutputBytes: command.maxOutputBytes, signal: controller.signal, env });
      const status: VerificationStatus = result.cancelled ? "CANCELLED" : result.timedOut ? "TIMED_OUT" : result.code === 0 ? "PASS" : "FAIL";
      return { commandId, status, exitCode: result.code, durationMs: result.durationMs, stdout: redactUntrusted(result.stdout), stderr: redactUntrusted(result.stderr), sandbox: isolated ? "HARD_ISOLATION" : "PROCESS_CONSTRAINED" };
    } finally { this.#active.delete(commandId); }
  }
  cancel(commandId: string): boolean { const controller = this.#active.get(commandId); controller?.abort(); return Boolean(controller); }
}

export interface SanitizedContent { content: string; trust: "untrusted"; flags: string[]; permissionsGranted: never[] }
export function sanitizeUntrustedContent(content: string): SanitizedContent {
  const flags: string[] = [];
  if (/ignore\s+(all\s+)?previous|system\s+prompt|change\s+(the\s+)?policy|reveal\s+|grant\s+permission|disable\s+(security|tests)/i.test(content)) flags.push("policy_override_attempt");
  if (/(api[_-]?key|token|password|private key)/i.test(content)) flags.push("secret_shaped_content");
  return { content: redactUntrusted(content).slice(0, 32_000), trust: "untrusted", flags, permissionsGranted: [] };
}
