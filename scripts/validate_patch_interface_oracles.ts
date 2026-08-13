import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const benchmarkRoot = path.join(root, "benchmarks/patch-interface");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hardenedV2 = process.argv.includes("--hardened-v2");

type SourceFile = { path: string; content: string };
type Range = { start_line: number; end_line: number; semantics: string };
type Task = {
  task_id: string;
  category: string;
  prompt: string;
  allowed_files: string[];
  visible_files: SourceFile[];
  trusted_visible_command: string[];
  changed_line_budget: number;
  mutation_certification: string;
  relevant_range_1_based: Range;
};
type Oracle = {
  task_id: string;
  exact_relevant_file: string;
  exact_relevant_symbol: string;
  exact_relevant_range_1_based: Range;
  root_cause: string;
  behavioral_requirement: string;
  original_source_sha256: string;
  relevant_range_source_sha256: string;
  reference_fixed_source: string;
  fixed_source_sha256: string;
  hidden_files: SourceFile[];
  trusted_hidden_command: string[];
  mutation_certification: { classification: string; certified: boolean; deterministic_runtime_controls: string[] };
};

async function verifiedJson<T>(name: string): Promise<{ value: T; path: string; sha256: string }> {
  const target = path.join(benchmarkRoot, name);
  const bytes = await readFile(target);
  const expected = (await readFile(`${target}.sha256`, "utf8")).trim().split(/\s+/)[0];
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${name} checksum mismatch`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: `benchmarks/patch-interface/${name}`, sha256: actual };
}

function assertSafeRelative(relative: string): void {
  const normalized = relative.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..") || normalized.includes("\0")) throw new Error(`Unsafe fixture path: ${relative}`);
}

async function run(command: string[], cwd: string): Promise<{ status: "PASS" | "FAIL" | "TIMED_OUT"; exitCode: number | null; outputHash: string; isolation: "HARD_USER_NETWORK_NAMESPACE_AND_NODE_PERMISSION_MODEL" | "LEGACY_PROXY_ENV_ONLY" }> {
  if (!command.length || !path.isAbsolute(command[0])) throw new Error("Oracle command executable must be an exact absolute path");
  const originalArgs = command.slice(1);
  if (hardenedV2 && path.resolve(command[0]) !== path.resolve(process.execPath) && command[0] !== "/usr/bin/node") throw new Error("Hardened oracle commands must use the pinned Node executable");
  const nodePermissionArgs = hardenedV2
    ? ["--permission", `--allow-fs-read=${cwd}`, ...(originalArgs.includes("--test") ? ["--test-isolation=none"] : []), ...originalArgs]
    : originalArgs;
  const executable = hardenedV2 ? "/usr/bin/unshare" : command[0];
  const args = hardenedV2
    ? ["--user", "--map-root-user", "--net", "--pid", "--fork", "--mount-proc", "--kill-child=SIGKILL", "--", command[0], ...nodePermissionArgs]
    : originalArgs;
  const isolation = hardenedV2 ? "HARD_USER_NETWORK_NAMESPACE_AND_NODE_PERMISSION_MODEL" as const : "LEGACY_PROXY_ENV_ONLY" as const;
  try {
    const result = await execFileAsync(executable, args, {
      cwd,
      timeout: 10_000,
      maxBuffer: 1_000_000,
      env: {
        PATH: process.env.PATH,
        LANG: process.env.LANG ?? "C.UTF-8",
        HTTP_PROXY: "http://127.0.0.1:9",
        HTTPS_PROXY: "http://127.0.0.1:9",
        NO_PROXY: "127.0.0.1,localhost",
        DCA_NETWORK_POLICY: "off"
      }
    });
    return { status: "PASS", exitCode: 0, outputHash: sha256(`${result.stdout}\n${result.stderr}`), isolation };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { killed?: boolean; code?: string | number; stdout?: string; stderr?: string };
    const timedOut = failure.killed === true || failure.code === "ETIMEDOUT";
    return { status: timedOut ? "TIMED_OUT" : "FAIL", exitCode: typeof failure.code === "number" ? failure.code : null, outputHash: sha256(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`), isolation };
  }
}

let hardIsolationProbe = { status: "NOT_APPLICABLE", outputHash: sha256("NOT_APPLICABLE") };
if (hardenedV2) {
  try {
    const probe = await execFileAsync("/usr/bin/unshare", ["--user", "--map-root-user", "--net", "--pid", "--fork", "--mount-proc", "--kill-child=SIGKILL", "--", process.execPath, "--permission", "--eval", ""], { cwd: root, timeout: 5_000, maxBuffer: 64 * 1024 });
    hardIsolationProbe = { status: "PASS", outputHash: sha256(`${probe.stdout}\n${probe.stderr}`) };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    hardIsolationProbe = { status: "FAIL", outputHash: sha256(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}\n${failure.message}`) };
  }
  if (hardIsolationProbe.status !== "PASS") throw new Error("Hardened oracle preflight requires working user+network+PID namespaces and the Node permission model");
}

const [manifestArtifact, oracleArtifact] = await Promise.all([
  verifiedJson<{ corpus: { tasks: number; reusedG4PatchTasks: number; newBehavioralMutationTasks: number }; safeMutationCertification: { taskIds: string[] }; tasks: Task[] }>("PATCH_INTERFACE_DEVELOPMENT_MANIFEST.v1.json"),
  verifiedJson<{ manifestSha256: string; rows: Oracle[] }>("PATCH_INTERFACE_DEVELOPMENT_ORACLE.v1.sealed.json")
]);
if (oracleArtifact.value.manifestSha256 !== manifestArtifact.sha256) throw new Error("Oracle does not bind the exact manifest");
if (manifestArtifact.value.tasks.length !== 50 || oracleArtifact.value.rows.length !== 50) throw new Error("Patch interface corpus must contain exactly 50 task/oracle rows");
if (manifestArtifact.value.corpus.reusedG4PatchTasks !== 25 || manifestArtifact.value.corpus.newBehavioralMutationTasks !== 25) throw new Error("Patch interface corpus must preserve the preregistered 25+25 composition");

const oracleById = new Map(oracleArtifact.value.rows.map((row) => [row.task_id, row]));
const taskIds = manifestArtifact.value.tasks.map((task) => task.task_id);
if (new Set(taskIds).size !== taskIds.length || new Set(oracleArtifact.value.rows.map((row) => row.task_id)).size !== 50) throw new Error("Task/oracle IDs must be unique");
if (!taskIds.every((id) => oracleById.has(id)) || !oracleArtifact.value.rows.every((row) => taskIds.includes(row.task_id))) throw new Error("Task/oracle ID sets differ");

const rows: Array<Record<string, unknown>> = [];
for (const task of manifestArtifact.value.tasks) {
  const oracle = oracleById.get(task.task_id)!;
  const source = task.visible_files.find((file) => file.path === oracle.exact_relevant_file);
  if (!source) throw new Error(`${task.task_id} is missing exact source in visible files`);
  for (const file of [...task.visible_files, ...oracle.hidden_files]) assertSafeRelative(file.path);
  if (task.allowed_files.length !== 1 || task.allowed_files[0] !== oracle.exact_relevant_file) throw new Error(`${task.task_id} must allow exactly the source file`);
  if (task.mutation_certification !== "SAFE_MUTATION_REQUIRED" || !oracle.mutation_certification.certified || oracle.mutation_certification.classification !== "SAFE_MUTATION_REQUIRED") throw new Error(`${task.task_id} lacks safe mutation certification`);
  if (sha256(source.content) !== oracle.original_source_sha256 || sha256(oracle.reference_fixed_source) !== oracle.fixed_source_sha256) throw new Error(`${task.task_id} source hash mismatch`);
  const lines = source.content.split(/\r?\n/);
  const range = oracle.exact_relevant_range_1_based;
  if (range.start_line < 1 || range.end_line < range.start_line || range.end_line > lines.length) throw new Error(`${task.task_id} has an invalid exact range`);
  if (task.relevant_range_1_based.start_line !== range.start_line || task.relevant_range_1_based.end_line !== range.end_line) throw new Error(`${task.task_id} task/oracle ranges differ`);
  const rangeText = lines.slice(range.start_line - 1, range.end_line).join("\n");
  if (!rangeText.includes(oracle.exact_relevant_symbol) || sha256(rangeText) !== oracle.relevant_range_source_sha256) throw new Error(`${task.task_id} exact range does not bind the declared symbol`);
  if (source.content === oracle.reference_fixed_source) throw new Error(`${task.task_id} reference fix does not change source`);

  const directory = await mkdtemp(path.join(os.tmpdir(), "dca-patch-interface-oracle-"));
  try {
    for (const file of [...task.visible_files, ...oracle.hidden_files]) {
      const target = path.join(directory, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    const beforeSyntax = await run([process.execPath, "--check", oracle.exact_relevant_file], directory);
    const beforeVisible = await run(task.trusted_visible_command, directory);
    const beforeHidden = await run(oracle.trusted_hidden_command, directory);
    await writeFile(path.join(directory, oracle.exact_relevant_file), oracle.reference_fixed_source);
    const fixedSyntax = await run([process.execPath, "--check", oracle.exact_relevant_file], directory);
    const fixedVisible = await run(task.trusted_visible_command, directory);
    const fixedHidden = await run(oracle.trusted_hidden_command, directory);
    const valid = beforeSyntax.status === "PASS" && (beforeVisible.status === "FAIL" || beforeHidden.status === "FAIL") && fixedSyntax.status === "PASS" && fixedVisible.status === "PASS" && fixedHidden.status === "PASS";
    rows.push({
      taskId: task.task_id,
      valid,
      before: { syntax: beforeSyntax, visible: beforeVisible, hidden: beforeHidden },
      referenceFix: { syntax: fixedSyntax, visible: fixedVisible, hidden: fixedHidden },
      exactRange: range,
      allowedFiles: task.allowed_files,
      changedLineBudget: task.changed_line_budget,
      mutationCertification: task.mutation_certification
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const failures = rows.filter((row) => row.valid !== true);
const result = {
  schemaVersion: hardenedV2 ? 2 : 1,
  validationId: hardenedV2 ? "dca-patch-interface-development-oracle-preflight-hardened-v2" : "dca-patch-interface-development-oracle-preflight-v1",
  generatedAt: new Date().toISOString(),
  classification: "DEVELOPMENT_ONLY_PRE_MODEL_CALL",
  status: failures.length === 0 ? "PASS" : "FAIL",
  inputs: {
    manifest: { path: manifestArtifact.path, sha256: manifestArtifact.sha256 },
    oracle: { path: oracleArtifact.path, sha256: oracleArtifact.sha256 }
  },
  contract: {
    taskCount: 50,
    realBehavioralOracleRequired: true,
    buggySourceMustFailAtLeastOneBehavioralOracle: true,
    referenceFixMustPassSyntaxVisibleHidden: true,
    noNetwork: hardenedV2 ? "HARD_USER_NETWORK_NAMESPACE" : "LEGACY_PROXY_ENV_ONLY_NOT_HARD_ISOLATION",
    nodePermissionModel: hardenedV2 ? { allowFsRead: "EXACT_EPHEMERAL_FIXTURE_ONLY", allowFsWrite: false, allowChildProcess: false, allowWorker: false, testIsolation: "none" } : "NOT_ENABLED",
    hardIsolationProbe,
    shell: false,
    rawCommandOutputPersisted: false,
    outputHashesPersisted: true
  },
  summary: {
    tasks: rows.length,
    valid: rows.length - failures.length,
    failures: failures.length,
    buggyVisibleFailures: rows.filter((row) => (row.before as { visible: { status: string } }).visible.status === "FAIL").length,
    buggyHiddenFailures: rows.filter((row) => (row.before as { hidden: { status: string } }).hidden.status === "FAIL").length,
    referenceSyntaxPasses: rows.filter((row) => (row.referenceFix as { syntax: { status: string } }).syntax.status === "PASS").length,
    referenceVisiblePasses: rows.filter((row) => (row.referenceFix as { visible: { status: string } }).visible.status === "PASS").length,
    referenceHiddenPasses: rows.filter((row) => (row.referenceFix as { hidden: { status: string } }).hidden.status === "PASS").length
  },
  rows
};
const name = hardenedV2 ? "PATCH_INTERFACE_ORACLE_PREFLIGHT.v2.json" : "PATCH_INTERFACE_ORACLE_PREFLIGHT.v1.json";
const body = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(path.join(benchmarkRoot, name), body, { flag: "wx" });
await writeFile(path.join(benchmarkRoot, `${name}.sha256`), `${sha256(body)}  ${name}\n`, { flag: "wx" });
if (hardenedV2) {
  const legacyName = "PATCH_INTERFACE_ORACLE_PREFLIGHT.v1.json";
  const legacyBytes = await readFile(path.join(benchmarkRoot, legacyName));
  const legacySidecarSha256 = (await readFile(path.join(benchmarkRoot, `${legacyName}.sha256`), "utf8")).trim().split(/\s+/)[0];
  if (sha256(legacyBytes) !== legacySidecarSha256) throw new Error("Legacy preflight checksum mismatch while writing the network-isolation caveat");
  const caveatName = "PATCH_INTERFACE_ORACLE_PREFLIGHT_V1_NETWORK_CAVEAT.v2.json";
  const caveat = {
    schemaVersion: 2,
    caveatId: "dca-patch-interface-oracle-preflight-v1-network-claim-caveat",
    createdAt: new Date().toISOString(),
    status: "V1_NETWORK_CLAIM_SUPERSEDED_ONLY",
    legacyArtifact: { path: `benchmarks/patch-interface/${legacyName}`, sha256: legacySidecarSha256 },
    supersedingArtifact: { path: `benchmarks/patch-interface/${name}`, sha256: sha256(body) },
    correction: "V1 used a sanitized proxy environment but no kernel-enforced network namespace, so its noNetwork=true field was not supported. Its task/oracle/hash/behavioral results remain historical evidence; only the network-isolation claim is superseded by hardened V2.",
    immutablePriorArtifactModified: false
  };
  const caveatBody = `${JSON.stringify(caveat, null, 2)}\n`;
  await writeFile(path.join(benchmarkRoot, caveatName), caveatBody, { flag: "wx" });
  await writeFile(path.join(benchmarkRoot, `${caveatName}.sha256`), `${sha256(caveatBody)}  ${caveatName}\n`, { flag: "wx" });
}
process.stdout.write(`${JSON.stringify({ output: `benchmarks/patch-interface/${name}`, sha256: sha256(body), status: result.status, summary: result.summary }, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
