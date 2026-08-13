import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type NativeSourceClass = "AUTHORITATIVE_SOURCE" | "GENERATED_MUTABLE_STATE";

const exactGeneratedFiles = new Set([
  "apps/desktop/src-tauri/gen/schemas/acl-manifests.json",
  "apps/desktop/src-tauri/gen/schemas/capabilities.json",
  "apps/desktop/src-tauri/gen/schemas/desktop-schema.json",
  "apps/desktop/src-tauri/gen/schemas/windows-schema.json",
  "tsconfig.app.tsbuildinfo",
  "tsconfig.node.tsbuildinfo"
]);

const exactGeneratedTrees = [
  ".git/",
  ".qa-logs/",
  ".runtime/",
  "apps/desktop/src-tauri/target/",
  "coverage/",
  "dist/",
  "node_modules/",
  "runtime/model/.venv/"
] as const;

function normalizeRelativePath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Native source identity requires a safe repository-relative path: ${relativePath}`);
  }
  return normalized;
}

/** Unknown paths are authoritative by default; only explicit generated paths are excluded. */
export function classifyNativeSourcePath(relativePath: string): NativeSourceClass {
  const normalized = normalizeRelativePath(relativePath);
  if (exactGeneratedFiles.has(normalized)) return "GENERATED_MUTABLE_STATE";
  if (exactGeneratedTrees.some((prefix) => normalized.startsWith(prefix))) return "GENERATED_MUTABLE_STATE";
  return "AUTHORITATIVE_SOURCE";
}

export interface NativeSourceIdentity {
  policyVersion: 3;
  algorithm: "SHA256_OVER_SORTED_NUL_DELIMITED_SHA256_AND_RELATIVE_PATH_PAIRS";
  sha256: string;
  authoritativeFileCount: number;
  authoritativeBytes: number;
  generatedPaths: string[];
}

export function computeNativeSourceIdentity(root: string): NativeSourceIdentity {
  const authoritative: Array<{ path: string; bytes: Buffer }> = [];
  const generatedPaths: string[] = [];

  const visit = (relativeDirectory: string): void => {
    const absoluteDirectory = path.join(root, relativeDirectory);
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.posix.join(relativeDirectory.replaceAll("\\", "/"), entry.name).replace(/^\.\//, "");
      const classification = classifyNativeSourcePath(relativePath + (entry.isDirectory() ? "/" : ""));
      if (classification === "GENERATED_MUTABLE_STATE") {
        generatedPaths.push(relativePath + (entry.isDirectory() ? "/" : ""));
        continue;
      }
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links fail closed in native source identity: ${relativePath}`);
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile()) authoritative.push({ path: relativePath, bytes: readFileSync(path.join(root, relativePath)) });
      else throw new Error(`Unsupported filesystem entry in native source identity: ${relativePath}`);
    }
  };

  visit(".");
  authoritative.sort((left, right) => left.path.localeCompare(right.path));
  const closure = createHash("sha256");
  let authoritativeBytes = 0;
  for (const file of authoritative) {
    authoritativeBytes += file.bytes.length;
    closure.update(createHash("sha256").update(file.bytes).digest("hex"));
    closure.update("\0");
    closure.update(`./${file.path}`);
    closure.update("\0");
  }
  return {
    policyVersion: 3,
    algorithm: "SHA256_OVER_SORTED_NUL_DELIMITED_SHA256_AND_RELATIVE_PATH_PAIRS",
    sha256: closure.digest("hex"),
    authoritativeFileCount: authoritative.length,
    authoritativeBytes,
    generatedPaths: generatedPaths.sort()
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) throw new Error("Usage: tsx scripts/windows_native_source_identity.ts <repository-root>");
  process.stdout.write(`${JSON.stringify(computeNativeSourceIdentity(path.resolve(root)), null, 2)}\n`);
}
