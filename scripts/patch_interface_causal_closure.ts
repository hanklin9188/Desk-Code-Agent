import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

export const PATCH_INTERFACE_SOURCE_CLOSURE_PATHS = [
  "scripts/patch_interface_causal_closure.ts",
  "scripts/patch_interface_prompt_runtime.ts",
  "scripts/model_serving_attestation.ts",
  "scripts/run_patch_interface_experiment.ts",
  "scripts/run_patch_interface_security_regression.ts",
  "scripts/run_model_specialization_development.ts",
  "scripts/write_patch_interface_development_manifest.ts",
  "scripts/validate_patch_interface_oracles.ts",
  "scripts/audit_patch_interface_pipeline.ts",
  "scripts/preregister_patch_interface_experiment.ts",
  "scripts/write_patch_interface_precall_supersession.ts",
  "scripts/write_patch_interface_v2_partial_supersession.ts",
  "scripts/record_patch_interface_lifecycle.ts",
  "scripts/start_model_profile.sh",
  "scripts/launch_model_profile.py",
  "services/patch-interface-runtime/src/index.ts",
  "services/model-specialization-runtime/src/index.ts",
  "services/tool-runtime/src/index.ts",
  "services/repo-intelligence/src/index.ts",
  "packages/contracts/src/index.ts",
  "config/model_specialization_profiles.json",
  "config/production/emin-v2-frozen-2026-08-09.json",
  "implementation/CURRENT_TASK_CONTRACT.json",
  "runtime/model/model-lock.toml",
  "runtime/model/pyproject.toml",
  "runtime/model/uv.lock",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.node.json"
] as const;

const runtimePackageRoots = [
  "node_modules/ajv",
  "node_modules/fast-deep-equal",
  "node_modules/fast-uri",
  "node_modules/json-schema-traverse",
  "node_modules/require-from-string",
  "node_modules/tree-sitter",
  "node_modules/tree-sitter-typescript",
  "node_modules/tree-sitter-python",
  "node_modules/node-addon-api",
  "node_modules/node-gyp-build",
  "node_modules/tsx",
  "node_modules/tsx/node_modules/esbuild",
  "node_modules/tsx/node_modules/@esbuild/linux-x64",
  "node_modules/get-tsconfig",
  "node_modules/resolve-pkg-maps"
] as const;

export type PatchInterfaceCausalClosure = {
  schemaVersion: 1;
  sourceFiles: Record<string, string>;
  runtimePackageFiles: Record<string, string>;
  environment: {
    node: { executable: string; version: string; sha256: string };
    git: { executable: string; version: string; sha256: string };
    unshare: { executable: string; version: string; sha256: string };
    ps: { executable: string; version: string; sha256: string };
    platform: string;
    architecture: string;
    operatingSystemRelease: string;
    operatingSystemVersion: string;
  };
  sha256: string;
};

async function executableFingerprint(executable: string, versionArgs: string[]): Promise<{ executable: string; version: string; sha256: string }> {
  const { stdout, stderr } = await execFileAsync(executable, versionArgs, { timeout: 5_000, maxBuffer: 256_000 });
  const resolved = await realpath(executable.includes(path.sep) ? executable : (await execFileAsync("which", [executable], { timeout: 5_000 })).stdout.trim());
  return { executable: resolved, version: `${stdout}${stderr}`.trim().split("\n")[0], sha256: sha256(await readFile(resolved)) };
}

async function hashPackageTree(root: string, relativeRoot: string, output: Record<string, string>): Promise<void> {
  const absoluteRoot = path.join(root, relativeRoot);
  const walk = async (directory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      if (child.name === ".bin" && child.isDirectory()) continue;
      const target = path.join(directory, child.name);
      const relative = path.relative(root, target).split(path.sep).join("/");
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink()) throw new Error(`Runtime package closure contains an unexpected symlink: ${relative}`);
      if (metadata.isDirectory()) await walk(target);
      else if (metadata.isFile()) output[relative] = sha256(await readFile(target));
      else throw new Error(`Runtime package closure contains an unsupported object: ${relative}`);
    }
  };
  await walk(absoluteRoot);
}

export async function computePatchInterfaceCausalClosure(root: string): Promise<PatchInterfaceCausalClosure> {
  const sourceFiles: Record<string, string> = {};
  for (const relative of PATCH_INTERFACE_SOURCE_CLOSURE_PATHS) sourceFiles[relative] = sha256(await readFile(path.join(root, relative)));
  const runtimePackageFiles: Record<string, string> = {};
  for (const relative of runtimePackageRoots) await hashPackageTree(root, relative, runtimePackageFiles);
  const [git, unshare, ps] = await Promise.all([
    executableFingerprint("git", ["--version"]),
    executableFingerprint("unshare", ["--version"]),
    executableFingerprint("ps", ["--version"])
  ]);
  const environment = {
    node: { executable: await realpath(process.execPath), version: process.version, sha256: sha256(await readFile(await realpath(process.execPath))) },
    git,
    unshare,
    ps,
    platform: os.platform(),
    architecture: os.arch(),
    operatingSystemRelease: os.release(),
    operatingSystemVersion: os.version()
  };
  const payload = { schemaVersion: 1 as const, sourceFiles, runtimePackageFiles, environment };
  return { ...payload, sha256: sha256(JSON.stringify(payload)) };
}
