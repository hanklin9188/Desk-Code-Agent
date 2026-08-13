import { createHash } from "node:crypto";
import path from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import Parser, { type SyntaxNode } from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

export type PatchInterfaceId = "P0" | "P1" | "P2" | "P3" | "P4";

export type PatchOutputClassification =
  | "VALID_EDIT"
  | "SYNTACTICALLY_INVALID_EDIT"
  | "REPORT_ONLY"
  | "BLOCKED_MISSING_ORACLE"
  | "GENERATION_FAILURE"
  | "TEXTUAL_EXPLANATION_WITHOUT_ACTION"
  | "MALFORMED_SCHEMA"
  | "UNSAFE_EDIT"
  | "EMPTY_RESPONSE"
  | "OTHER";

export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface PatchInterfacePolicy {
  allowedFiles: readonly string[];
  allowedRanges?: Readonly<Record<string, readonly LineRange[]>>;
  allowedSymbols?: Readonly<Record<string, readonly string[]>>;
  expectedSourceSha256: Readonly<Record<string, string>>;
  maxChangedFiles: number;
  maxChangedLines: number;
  maxToolActions?: number;
}

export interface NormalizePatchInterfaceInput {
  interfaceId: PatchInterfaceId;
  rawOutput: string;
  sources: Readonly<Record<string, string>>;
  policy: PatchInterfacePolicy;
}

export type PatchPipelineStageStatus = "PASS" | "FAIL" | "NOT_APPLICABLE" | "NOT_RUN";

export interface PatchPipelineStageResult {
  status: PatchPipelineStageStatus;
  code: string;
  message?: string;
}

export interface PatchInterfaceNormalizationResult {
  canonicalDiff: string | null;
  classification: PatchOutputClassification;
  jsonParsed: boolean;
  schemaValidated: boolean;
  stages: {
    parse: PatchPipelineStageResult;
    schemaValidation: PatchPipelineStageResult;
    actionValidation: PatchPipelineStageResult;
    patchConstruction: PatchPipelineStageResult;
  };
  targets: string[];
  changedFiles: number;
  changedLines: number;
  parsedAction: unknown | null;
  error: string | null;
}

export type DiffPolicyErrorCode =
  | "INVALID_POLICY"
  | "EMPTY_DIFF"
  | "UNSUPPORTED_DIFF_METADATA"
  | "INVALID_DIFF_HEADER"
  | "MISMATCHED_DIFF_PATHS"
  | "MISSING_FILE_HEADER"
  | "MISSING_HUNK"
  | "INVALID_HUNK_HEADER"
  | "INVALID_HUNK_BODY"
  | "HUNK_COUNT_MISMATCH"
  | "NO_CHANGES"
  | "UNSAFE_PATH"
  | "WRONG_FILE"
  | "CHANGED_FILE_BUDGET_EXCEEDED"
  | "CHANGED_LINE_BUDGET_EXCEEDED"
  | "RANGE_OUTSIDE_ALLOWED_SCOPE"
  | "SOURCE_NOT_AVAILABLE"
  | "SOURCE_HASH_EXPECTATION_MISSING"
  | "STALE_SOURCE"
  | "SOURCE_CONTENT_MISMATCH"
  | "SECRET_SHAPED_EDIT";

export interface CanonicalDiffPolicyValidation {
  valid: boolean;
  targets: string[];
  changedFiles: number;
  changedLines: number;
  errorCode: DiffPolicyErrorCode | null;
  error: string | null;
}

/** Exact schema used by the previous G4/model-specialization patch-only runner. */
export const PATCH_INTERFACE_P0_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["PATCH_PROPOSAL", "BLOCKED_MISSING_ORACLE", "REPORT_ONLY"] },
    unified_diff: { type: "string" },
    summary: { type: "string" },
    evidence_paths: { type: "array", items: { type: "string" }, maxItems: 6 },
    target_paths: { type: "array", items: { type: "string" }, maxItems: 4 },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["status", "unified_diff", "summary", "evidence_paths", "target_paths", "confidence"]
} as const);

export const PATCH_INTERFACE_P2_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    file: { type: "string" },
    start_line: { type: "integer", minimum: 1 },
    end_line: { type: "integer", minimum: 1 },
    replacement: { type: "string" }
  },
  required: ["file", "start_line", "end_line", "replacement"]
} as const);

export const PATCH_INTERFACE_P3_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    file: { type: "string" },
    symbol: { type: "string" },
    replacement_body: { type: "string" }
  },
  required: ["file", "symbol", "replacement_body"]
} as const);

export const PATCH_INTERFACE_P4_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    actions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool: { type: "string", enum: ["replace_range", "insert_before", "insert_after", "delete_range"] },
          file: { type: "string" },
          start_line: { type: "integer", minimum: 1 },
          end_line: { type: "integer", minimum: 1 },
          text: { type: "string" }
        },
        required: ["tool", "file", "start_line", "end_line", "text"]
      }
    }
  },
  required: ["actions"]
} as const);

interface P0Action {
  status: "PATCH_PROPOSAL" | "BLOCKED_MISSING_ORACLE" | "REPORT_ONLY";
  unified_diff: string;
  summary: string;
  evidence_paths: string[];
  target_paths: string[];
  confidence: number;
}

interface P2Action { file: string; start_line: number; end_line: number; replacement: string }
interface P3Action { file: string; symbol: string; replacement_body: string }
interface P4ToolAction {
  tool: "replace_range" | "insert_before" | "insert_after" | "delete_range";
  file: string;
  start_line: number;
  end_line: number;
  text: string;
}
interface P4Action { actions: P4ToolAction[] }

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators: Readonly<Record<Exclude<PatchInterfaceId, "P1">, ValidateFunction>> = Object.freeze({
  P0: ajv.compile(PATCH_INTERFACE_P0_SCHEMA),
  P2: ajv.compile(PATCH_INTERFACE_P2_SCHEMA),
  P3: ajv.compile(PATCH_INTERFACE_P3_SCHEMA),
  P4: ajv.compile(PATCH_INTERFACE_P4_SCHEMA)
});

const passed = (code: string, message?: string): PatchPipelineStageResult => ({ status: "PASS", code, ...(message ? { message } : {}) });
const failed = (code: string, message?: string): PatchPipelineStageResult => ({ status: "FAIL", code, ...(message ? { message } : {}) });
const notRun = (code = "NOT_RUN"): PatchPipelineStageResult => ({ status: "NOT_RUN", code });
const notApplicable = (code = "NOT_APPLICABLE"): PatchPipelineStageResult => ({ status: "NOT_APPLICABLE", code });

const initialStages = () => ({
  parse: notRun(),
  schemaValidation: notRun(),
  actionValidation: notRun(),
  patchConstruction: notRun()
});

const stripTerminalLineBreaks = (value: string): string => value.replace(/(?:\r?\n)+$/, "");
const stripOuterLineBreaks = (value: string): string => stripTerminalLineBreaks(value.replace(/^(?:\r?\n)+/, ""));

export const sha256Source = (content: string | Buffer): string => createHash("sha256").update(content).digest("hex");

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["'`][^"'`\r\n]{8,}["'`]/i
] as const;

const containsSecretShapedText = (value: string): boolean => SECRET_PATTERNS.some((pattern) => pattern.test(value));

function normalizePolicyPath(value: string): string {
  if (!value || value.includes("\0") || value.includes("\\") || /[\r\n\t]/.test(value) || /\s/.test(value)) throw new Error("Path contains unsupported characters");
  if (path.posix.isAbsolute(value) || value.split("/").includes("..")) throw new Error("Path escapes the bounded workspace");
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized.startsWith("../") || normalized !== value || value.startsWith("-")) throw new Error("Path is not canonical workspace-relative POSIX syntax");
  return normalized;
}

function normalizeHeaderPath(value: string, side: "old" | "new"): string {
  const withoutTimestamp = value.split("\t")[0];
  if (withoutTimestamp === "/dev/null") throw new Error("File creation and deletion headers are outside this experiment");
  const wrongPrefix = side === "old" ? "b/" : "a/";
  if (withoutTimestamp.startsWith(wrongPrefix)) throw new Error("Diff header uses the wrong side prefix");
  const expectedPrefix = side === "old" ? "a/" : "b/";
  return normalizePolicyPath(withoutTimestamp.startsWith(expectedPrefix) ? withoutTimestamp.slice(2) : withoutTimestamp);
}

function validatePolicyBasics(policy: PatchInterfacePolicy): string | null {
  if (!Number.isInteger(policy.maxChangedFiles) || policy.maxChangedFiles < 1) return "maxChangedFiles must be a positive integer";
  if (!Number.isInteger(policy.maxChangedLines) || policy.maxChangedLines < 1) return "maxChangedLines must be a positive integer";
  if (policy.allowedFiles.length === 0) return "At least one allowed file is required";
  if (policy.maxToolActions !== undefined && (!Number.isInteger(policy.maxToolActions) || policy.maxToolActions < 1 || policy.maxToolActions > 4)) return "maxToolActions must be an integer from 1 through 4";
  try {
    const normalized = policy.allowedFiles.map(normalizePolicyPath);
    if (new Set(normalized).size !== normalized.length) return "allowedFiles contains duplicate paths";
    for (const file of normalized) {
      const ranges = policy.allowedRanges?.[file];
      if (!ranges?.length) return `allowedRanges must register at least one range for ${file}`;
      for (const range of ranges) {
        if (!Number.isInteger(range.startLine) || !Number.isInteger(range.endLine) || range.startLine < 1 || range.startLine > range.endLine) return `allowedRanges contains an invalid range for ${file}`;
      }
    }
  } catch (error) { return error instanceof Error ? error.message : "Invalid allowed file"; }
  return null;
}

function sourceValidation(file: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy): { code: DiffPolicyErrorCode; error: string } | null {
  if (!Object.prototype.hasOwnProperty.call(sources, file)) return { code: "SOURCE_NOT_AVAILABLE", error: `Source is unavailable for ${file}` };
  const expected = policy.expectedSourceSha256[file]?.replace(/^sha256:/, "").toLowerCase();
  if (!expected) return { code: "SOURCE_HASH_EXPECTATION_MISSING", error: `Expected source hash is missing for ${file}` };
  if (!/^[0-9a-f]{64}$/.test(expected)) return { code: "SOURCE_HASH_EXPECTATION_MISSING", error: `Expected source hash is invalid for ${file}` };
  if (sha256Source(sources[file]) !== expected) return { code: "STALE_SOURCE", error: `Source hash is stale for ${file}` };
  return null;
}

interface ParsedHunkLine { kind: "context" | "add" | "delete"; text: string }
interface ParsedHunk { file: string; oldStart: number; oldCount: number; newStart: number; newCount: number; lines: ParsedHunkLine[] }
interface ParsedDiff { targets: string[]; changedLines: number; addedText: string; hunks: ParsedHunk[] }

const unsupportedMetadata = /^(?:rename from|rename to|copy from|copy to|new file mode|deleted file mode|old mode|new mode|GIT binary patch|Binary files )/;

function parseStrictUnifiedDiff(diffText: string): { parsed: ParsedDiff | null; code: DiffPolicyErrorCode | null; error: string | null } {
  const diff = stripTerminalLineBreaks(diffText);
  if (!diff.trim()) return { parsed: null, code: "EMPTY_DIFF", error: "Diff is empty" };
  const lines = diff.split(/\r?\n/);
  const targets = new Set<string>();
  const hunks: ParsedHunk[] = [];
  const filesWithHunks = new Set<string>();
  let currentTarget: string | null = null;
  let pendingDiffTarget: string | null = null;
  let changedLines = 0;
  const added: string[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line) { index += 1; continue; }
    if (unsupportedMetadata.test(line)) return { parsed: null, code: "UNSUPPORTED_DIFF_METADATA", error: "Diff contains unsupported file or mode metadata" };
    if (line.startsWith("diff --git ")) {
      if (pendingDiffTarget !== null) return { parsed: null, code: "MISSING_FILE_HEADER", error: "diff --git section is missing ---/+++ headers" };
      const match = line.match(/^diff --git a\/([^\s]+) b\/([^\s]+)$/);
      if (!match) return { parsed: null, code: "INVALID_DIFF_HEADER", error: "diff --git header is not a bounded unquoted path pair" };
      try {
        const oldPath = normalizePolicyPath(match[1]);
        const newPath = normalizePolicyPath(match[2]);
        if (oldPath !== newPath) return { parsed: null, code: "MISMATCHED_DIFF_PATHS", error: "Rename-like diff paths are not allowed" };
        pendingDiffTarget = oldPath;
      } catch (error) { return { parsed: null, code: "UNSAFE_PATH", error: error instanceof Error ? error.message : "Unsafe diff path" }; }
      currentTarget = null;
      index += 1;
      continue;
    }
    if (line.startsWith("index ")) { index += 1; continue; }
    if (line.startsWith("--- ")) {
      const next = lines[index + 1];
      if (!next?.startsWith("+++ ")) return { parsed: null, code: "MISSING_FILE_HEADER", error: "--- header is not followed by +++ header" };
      try {
        const oldPath = normalizeHeaderPath(line.slice(4), "old");
        const newPath = normalizeHeaderPath(next.slice(4), "new");
        if (oldPath !== newPath) return { parsed: null, code: "MISMATCHED_DIFF_PATHS", error: "Old and new diff paths differ" };
        if (pendingDiffTarget !== null && pendingDiffTarget !== oldPath) return { parsed: null, code: "MISMATCHED_DIFF_PATHS", error: "diff --git and file headers differ" };
        currentTarget = oldPath;
        pendingDiffTarget = null;
        targets.add(oldPath);
      } catch (error) { return { parsed: null, code: "UNSAFE_PATH", error: error instanceof Error ? error.message : "Unsafe file header" }; }
      index += 2;
      continue;
    }
    if (line.startsWith("+++ ")) return { parsed: null, code: "MISSING_FILE_HEADER", error: "+++ header is missing its --- pair" };
    if (line.startsWith("@@")) {
      if (!currentTarget) return { parsed: null, code: "MISSING_FILE_HEADER", error: "Hunk appears before bounded file headers" };
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/);
      if (!match) return { parsed: null, code: "INVALID_HUNK_HEADER", error: "Malformed unified-diff hunk header" };
      const oldStart = Number(match[1]); const oldCount = match[2] === undefined ? 1 : Number(match[2]);
      const newStart = Number(match[3]); const newCount = match[4] === undefined ? 1 : Number(match[4]);
      let oldSeen = 0; let newSeen = 0; const hunkLines: ParsedHunkLine[] = [];
      index += 1;
      while (index < lines.length && (oldSeen < oldCount || newSeen < newCount)) {
        const bodyLine = lines[index];
        if (bodyLine === "\\ No newline at end of file") { index += 1; continue; }
        const prefix = bodyLine[0];
        if (prefix === " ") { oldSeen += 1; newSeen += 1; hunkLines.push({ kind: "context", text: bodyLine.slice(1) }); }
        else if (prefix === "-") { oldSeen += 1; changedLines += 1; hunkLines.push({ kind: "delete", text: bodyLine.slice(1) }); }
        else if (prefix === "+") { newSeen += 1; changedLines += 1; added.push(bodyLine.slice(1)); hunkLines.push({ kind: "add", text: bodyLine.slice(1) }); }
        else return { parsed: null, code: "INVALID_HUNK_BODY", error: "Hunk body contains a line without a unified-diff prefix" };
        if (oldSeen > oldCount || newSeen > newCount) return { parsed: null, code: "HUNK_COUNT_MISMATCH", error: "Hunk body exceeds declared line counts" };
        index += 1;
      }
      while (lines[index] === "\\ No newline at end of file") index += 1;
      if (oldSeen !== oldCount || newSeen !== newCount) return { parsed: null, code: "HUNK_COUNT_MISMATCH", error: "Hunk body does not satisfy declared line counts" };
      hunks.push({ file: currentTarget, oldStart, oldCount, newStart, newCount, lines: hunkLines });
      filesWithHunks.add(currentTarget);
      continue;
    }
    return { parsed: null, code: "INVALID_DIFF_HEADER", error: "Diff contains text outside supported headers and hunks" };
  }
  if (pendingDiffTarget !== null) return { parsed: null, code: "MISSING_FILE_HEADER", error: "Final diff section is missing file headers" };
  if (targets.size === 0) return { parsed: null, code: "MISSING_FILE_HEADER", error: "Diff has no target file headers" };
  if (hunks.length === 0 || [...targets].some((target) => !filesWithHunks.has(target))) return { parsed: null, code: "MISSING_HUNK", error: "Every target file requires at least one hunk" };
  if (changedLines === 0) return { parsed: null, code: "NO_CHANGES", error: "Diff contains no changed lines" };
  return { parsed: { targets: [...targets], changedLines, addedText: added.join("\n"), hunks }, code: null, error: null };
}

export function validateCanonicalDiffPolicy(diff: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy): CanonicalDiffPolicyValidation {
  const policyError = validatePolicyBasics(policy);
  if (policyError) return { valid: false, targets: [], changedFiles: 0, changedLines: 0, errorCode: "INVALID_POLICY", error: policyError };
  const parsedResult = parseStrictUnifiedDiff(diff);
  if (!parsedResult.parsed) return { valid: false, targets: [], changedFiles: 0, changedLines: 0, errorCode: parsedResult.code, error: parsedResult.error };
  const parsed = parsedResult.parsed;
  let allowed: Set<string>;
  try { allowed = new Set(policy.allowedFiles.map(normalizePolicyPath)); }
  catch (error) { return { valid: false, targets: parsed.targets, changedFiles: parsed.targets.length, changedLines: parsed.changedLines, errorCode: "INVALID_POLICY", error: error instanceof Error ? error.message : "Invalid allowed file" }; }
  const wrong = parsed.targets.find((target) => !allowed.has(target));
  if (wrong) return { valid: false, targets: parsed.targets, changedFiles: parsed.targets.length, changedLines: parsed.changedLines, errorCode: "WRONG_FILE", error: `Diff targets a file outside the allowlist: ${wrong}` };
  if (parsed.targets.length > policy.maxChangedFiles) return { valid: false, targets: parsed.targets, changedFiles: parsed.targets.length, changedLines: parsed.changedLines, errorCode: "CHANGED_FILE_BUDGET_EXCEEDED", error: `Diff changes ${parsed.targets.length} files, exceeding ${policy.maxChangedFiles}` };
  if (parsed.changedLines > policy.maxChangedLines) return { valid: false, targets: parsed.targets, changedFiles: parsed.targets.length, changedLines: parsed.changedLines, errorCode: "CHANGED_LINE_BUDGET_EXCEEDED", error: `Diff changes ${parsed.changedLines} lines, exceeding ${policy.maxChangedLines}` };
  for (const target of parsed.targets) {
    const sourceError = sourceValidation(target, sources, policy);
    if (sourceError) return { valid: false, targets: parsed.targets, changedFiles: parsed.targets.length, changedLines: parsed.changedLines, errorCode: sourceError.code, error: sourceError.error };
  }
  const rangeError = validateHunksAgainstSourcesAndRanges(parsed, sources, policy);
  if (rangeError) return { valid: false, targets: parsed.targets, changedFiles: parsed.targets.length, changedLines: parsed.changedLines, errorCode: rangeError.code, error: rangeError.error };
  if (containsSecretShapedText(parsed.addedText)) return { valid: false, targets: parsed.targets, changedFiles: parsed.targets.length, changedLines: parsed.changedLines, errorCode: "SECRET_SHAPED_EDIT", error: "Diff adds secret-shaped content" };
  return { valid: true, targets: parsed.targets, changedFiles: parsed.targets.length, changedLines: parsed.changedLines, errorCode: null, error: null };
}

/**
 * Diff range semantics are expressed in original-source coordinates. Deletions
 * must be inside one registered inclusive range. Additions paired with deletions
 * inherit that replacement span. A pure insertion uses the boundary immediately
 * before the current original line; a range [s,e] authorizes boundaries s..e+1
 * (before s through immediately after e), and no other boundary.
 */
function validateHunksAgainstSourcesAndRanges(
  parsed: ParsedDiff,
  sources: Readonly<Record<string, string>>,
  policy: PatchInterfacePolicy
): { code: DiffPolicyErrorCode; error: string } | null {
  for (const hunk of parsed.hunks) {
    const source = splitLogicalFile(sources[hunk.file]);
    if (hunk.oldCount === 0) {
      if (hunk.oldStart < 0 || hunk.oldStart > source.lines.length) return { code: "SOURCE_CONTENT_MISMATCH", error: `Hunk insertion anchor is outside current source for ${hunk.file}` };
    } else if (hunk.oldStart < 1 || hunk.oldStart + hunk.oldCount - 1 > source.lines.length) {
      return { code: "SOURCE_CONTENT_MISMATCH", error: `Hunk old range is outside current source for ${hunk.file}` };
    }

    let oldIndex = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    let lineIndex = 0;
    while (lineIndex < hunk.lines.length) {
      const line = hunk.lines[lineIndex];
      if (line.kind === "context") {
        if (source.lines[oldIndex] !== line.text) return { code: "SOURCE_CONTENT_MISMATCH", error: `Hunk context does not match current source for ${hunk.file}` };
        oldIndex += 1;
        lineIndex += 1;
        continue;
      }

      const deletedLines: number[] = [];
      let additions = 0;
      while (lineIndex < hunk.lines.length && hunk.lines[lineIndex].kind !== "context") {
        const changed = hunk.lines[lineIndex];
        if (changed.kind === "delete") {
          if (source.lines[oldIndex] !== changed.text) return { code: "SOURCE_CONTENT_MISMATCH", error: `Hunk deletion does not match current source for ${hunk.file}` };
          deletedLines.push(oldIndex + 1);
          oldIndex += 1;
        } else {
          additions += 1;
        }
        lineIndex += 1;
      }

      if (deletedLines.length > 0) {
        const start = deletedLines[0];
        const end = deletedLines.at(-1)!;
        if (!allowedRange(hunk.file, start, end, policy)) return { code: "RANGE_OUTSIDE_ALLOWED_SCOPE", error: `Diff changes original lines ${start}-${end} outside the registered range for ${hunk.file}` };
      } else if (additions > 0) {
        const boundaryBeforeLine = oldIndex + 1;
        const ranges = policy.allowedRanges?.[hunk.file] ?? [];
        const authorized = ranges.some((range) => range.startLine <= boundaryBeforeLine && boundaryBeforeLine <= range.endLine + 1);
        if (!authorized) return { code: "RANGE_OUTSIDE_ALLOWED_SCOPE", error: `Diff inserts at original boundary ${boundaryBeforeLine} outside the registered range for ${hunk.file}` };
      }
    }
  }
  return null;
}

interface LogicalFile { lines: string[]; eol: "\n" | "\r\n"; finalNewline: boolean }

function splitLogicalFile(content: string): LogicalFile {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const normalized = content.replace(/\r\n/g, "\n");
  const finalNewline = normalized.endsWith("\n");
  if (!normalized) return { lines: [], eol, finalNewline: false };
  const lines = normalized.split("\n");
  if (finalNewline) lines.pop();
  return { lines, eol, finalNewline };
}

function replacementLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, "\n");
  if (!normalized) return [];
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) lines.pop();
  return lines;
}

function joinLogicalFile(file: LogicalFile, lines: string[]): string {
  if (lines.length === 0) return "";
  return `${lines.join(file.eol)}${file.finalNewline ? file.eol : ""}`;
}

type DiffOperation = { kind: "context" | "add" | "delete"; text: string; oldLine: number; newLine: number };
const MAX_DIFF_MATRIX_CELLS = 4_000_000;

function lineOperations(before: string[], after: string[]): DiffOperation[] {
  if ((before.length + 1) * (after.length + 1) > MAX_DIFF_MATRIX_CELLS) throw new Error("Source is too large for bounded deterministic line diff");
  const table = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
  for (let left = before.length - 1; left >= 0; left -= 1) for (let right = after.length - 1; right >= 0; right -= 1)
    table[left][right] = before[left] === after[right] ? table[left + 1][right + 1] + 1 : Math.max(table[left + 1][right], table[left][right + 1]);
  const raw: Array<{ kind: DiffOperation["kind"]; text: string }> = [];
  let left = 0; let right = 0;
  while (left < before.length || right < after.length) {
    if (left < before.length && right < after.length && before[left] === after[right]) { raw.push({ kind: "context", text: before[left] }); left += 1; right += 1; }
    else if (left < before.length && (right >= after.length || table[left + 1][right] >= table[left][right + 1])) { raw.push({ kind: "delete", text: before[left] }); left += 1; }
    else { raw.push({ kind: "add", text: after[right] }); right += 1; }
  }
  let oldLine = 1; let newLine = 1;
  return raw.map((operation) => {
    const result = { ...operation, oldLine, newLine };
    if (operation.kind !== "add") oldLine += 1;
    if (operation.kind !== "delete") newLine += 1;
    return result;
  });
}

function hunkRanges(operations: DiffOperation[], context = 3): Array<{ start: number; end: number }> {
  const changed = operations.map((operation, index) => operation.kind === "context" ? -1 : index).filter((index) => index >= 0);
  if (changed.length === 0) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  for (const index of changed) {
    const next = { start: Math.max(0, index - context), end: Math.min(operations.length, index + context + 1) };
    const previous = ranges.at(-1);
    if (previous && next.start <= previous.end) previous.end = Math.max(previous.end, next.end);
    else ranges.push(next);
  }
  return ranges;
}

export function buildCanonicalUnifiedDiff(file: string, beforeContent: string, afterContent: string): string | null {
  const boundedFile = normalizePolicyPath(file);
  const before = splitLogicalFile(beforeContent);
  const after = splitLogicalFile(afterContent);
  const operations = lineOperations(before.lines, after.lines);
  const ranges = hunkRanges(operations);
  if (ranges.length === 0) return null;
  const output = [`diff --git a/${boundedFile} b/${boundedFile}`, `--- a/${boundedFile}`, `+++ b/${boundedFile}`];
  for (const range of ranges) {
    const hunk = operations.slice(range.start, range.end);
    const oldCount = hunk.filter((operation) => operation.kind !== "add").length;
    const newCount = hunk.filter((operation) => operation.kind !== "delete").length;
    const first = hunk[0];
    const oldStart = oldCount === 0 ? Math.max(0, first.oldLine - 1) : first.oldLine;
    const newStart = newCount === 0 ? Math.max(0, first.newLine - 1) : first.newLine;
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const operation of hunk) output.push(`${operation.kind === "context" ? " " : operation.kind === "add" ? "+" : "-"}${operation.text}`);
  }
  return `${output.join("\n")}\n`;
}

function allowedRange(file: string, startLine: number, endLine: number, policy: PatchInterfacePolicy): boolean {
  const ranges = policy.allowedRanges?.[file];
  return Boolean(ranges?.some((range) => Number.isInteger(range.startLine) && Number.isInteger(range.endLine) && range.startLine >= 1 && range.startLine <= startLine && endLine <= range.endLine));
}

function validateStructuredTarget(fileValue: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy): { file: string | null; error: string | null; code: string | null } {
  let file: string;
  try { file = normalizePolicyPath(fileValue); }
  catch (error) { return { file: null, error: error instanceof Error ? error.message : "Unsafe path", code: "UNSAFE_PATH" }; }
  let allowed: Set<string>;
  try { allowed = new Set(policy.allowedFiles.map(normalizePolicyPath)); }
  catch (error) { return { file: null, error: error instanceof Error ? error.message : "Invalid policy path", code: "INVALID_POLICY" }; }
  if (!allowed.has(file)) return { file, error: `Action targets a file outside the allowlist: ${file}`, code: "WRONG_FILE" };
  const sourceError = sourceValidation(file, sources, policy);
  return sourceError ? { file, error: sourceError.error, code: sourceError.code } : { file, error: null, code: null };
}

function resultFailure(input: {
  classification: PatchOutputClassification;
  jsonParsed: boolean;
  schemaValidated: boolean;
  stages: PatchInterfaceNormalizationResult["stages"];
  parsedAction?: unknown;
  error: string;
  targets?: string[];
  changedLines?: number;
}): PatchInterfaceNormalizationResult {
  return {
    canonicalDiff: null,
    classification: input.classification,
    jsonParsed: input.jsonParsed,
    schemaValidated: input.schemaValidated,
    stages: input.stages,
    targets: input.targets ?? [],
    changedFiles: input.targets?.length ?? 0,
    changedLines: input.changedLines ?? 0,
    parsedAction: input.parsedAction ?? null,
    error: input.error
  };
}

function classifyDiffFailure(code: DiffPolicyErrorCode | null): PatchOutputClassification {
  if (["UNSAFE_PATH", "WRONG_FILE", "CHANGED_FILE_BUDGET_EXCEEDED", "CHANGED_LINE_BUDGET_EXCEEDED", "RANGE_OUTSIDE_ALLOWED_SCOPE", "SOURCE_NOT_AVAILABLE", "SOURCE_HASH_EXPECTATION_MISSING", "STALE_SOURCE", "SECRET_SHAPED_EDIT", "INVALID_POLICY"].includes(code ?? "")) return "UNSAFE_EDIT";
  if (["EMPTY_DIFF", "UNSUPPORTED_DIFF_METADATA", "INVALID_DIFF_HEADER", "MISMATCHED_DIFF_PATHS", "MISSING_FILE_HEADER", "MISSING_HUNK", "INVALID_HUNK_HEADER", "INVALID_HUNK_BODY", "HUNK_COUNT_MISMATCH", "SOURCE_CONTENT_MISMATCH", "NO_CHANGES"].includes(code ?? "")) return "SYNTACTICALLY_INVALID_EDIT";
  return "OTHER";
}

function successfulResult(input: { diff: string; jsonParsed: boolean; schemaValidated: boolean; stages: PatchInterfaceNormalizationResult["stages"]; parsedAction: unknown; validation: CanonicalDiffPolicyValidation }): PatchInterfaceNormalizationResult {
  return {
    canonicalDiff: input.diff.endsWith("\n") ? input.diff : `${input.diff}\n`,
    classification: "VALID_EDIT",
    jsonParsed: input.jsonParsed,
    schemaValidated: input.schemaValidated,
    stages: input.stages,
    targets: input.validation.targets,
    changedFiles: input.validation.changedFiles,
    changedLines: input.validation.changedLines,
    parsedAction: input.parsedAction,
    error: null
  };
}

function canonicalizeParsedDiff(parsed: ParsedDiff, sources: Readonly<Record<string, string>>): string {
  const hunksByFile = new Map<string, ParsedHunk[]>();
  for (const hunk of parsed.hunks) {
    const hunks = hunksByFile.get(hunk.file) ?? [];
    hunks.push(hunk);
    hunksByFile.set(hunk.file, hunks);
  }
  const diffs: string[] = [];
  for (const file of [...parsed.targets].sort((left, right) => left.localeCompare(right))) {
    const logical = splitLogicalFile(sources[file]);
    const candidate: string[] = [];
    let originalCursor = 0;
    let previousPureInsertion = -1;
    for (const hunk of hunksByFile.get(file) ?? []) {
      const hunkStart = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
      if (hunkStart < originalCursor || (hunk.oldCount === 0 && hunkStart === previousPureInsertion)) throw new Error(`Diff hunks overlap or are out of order for ${file}`);
      candidate.push(...logical.lines.slice(originalCursor, hunkStart));
      let consumed = 0;
      for (const line of hunk.lines) {
        if (line.kind === "context") { candidate.push(line.text); consumed += 1; }
        else if (line.kind === "delete") consumed += 1;
        else candidate.push(line.text);
      }
      if (consumed !== hunk.oldCount) throw new Error(`Diff hunk consumption is inconsistent for ${file}`);
      originalCursor = hunkStart + hunk.oldCount;
      previousPureInsertion = hunk.oldCount === 0 ? hunkStart : -1;
    }
    candidate.push(...logical.lines.slice(originalCursor));
    const canonical = buildCanonicalUnifiedDiff(file, sources[file], joinLogicalFile(logical, candidate));
    if (!canonical) throw new Error(`Diff canonicalization produced no changes for ${file}`);
    diffs.push(stripTerminalLineBreaks(canonical));
  }
  return `${diffs.join("\n")}\n`;
}

function validateAndFinish(diff: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy, base: { jsonParsed: boolean; schemaValidated: boolean; stages: PatchInterfaceNormalizationResult["stages"]; parsedAction: unknown }): PatchInterfaceNormalizationResult {
  const submittedValidation = validateCanonicalDiffPolicy(diff, sources, policy);
  if (!submittedValidation.valid) {
    base.stages.patchConstruction = failed(submittedValidation.errorCode ?? "PATCH_VALIDATION_FAILED", submittedValidation.error ?? undefined);
    return resultFailure({ classification: classifyDiffFailure(submittedValidation.errorCode), jsonParsed: base.jsonParsed, schemaValidated: base.schemaValidated, stages: base.stages, parsedAction: base.parsedAction, error: submittedValidation.error ?? "Patch validation failed", targets: submittedValidation.targets, changedLines: submittedValidation.changedLines });
  }
  const parsed = parseStrictUnifiedDiff(diff).parsed!;
  let canonical: string;
  try { canonical = canonicalizeParsedDiff(parsed, sources); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Patch canonicalization failed";
    base.stages.patchConstruction = failed("PATCH_CANONICALIZATION_FAILED", message);
    return resultFailure({ classification: "SYNTACTICALLY_INVALID_EDIT", jsonParsed: base.jsonParsed, schemaValidated: base.schemaValidated, stages: base.stages, parsedAction: base.parsedAction, error: message, targets: submittedValidation.targets, changedLines: submittedValidation.changedLines });
  }
  const canonicalValidation = validateCanonicalDiffPolicy(canonical, sources, policy);
  if (!canonicalValidation.valid) {
    base.stages.patchConstruction = failed(canonicalValidation.errorCode ?? "CANONICAL_PATCH_VALIDATION_FAILED", canonicalValidation.error ?? undefined);
    return resultFailure({ classification: classifyDiffFailure(canonicalValidation.errorCode), jsonParsed: base.jsonParsed, schemaValidated: base.schemaValidated, stages: base.stages, parsedAction: base.parsedAction, error: canonicalValidation.error ?? "Canonical patch validation failed", targets: canonicalValidation.targets, changedLines: canonicalValidation.changedLines });
  }
  base.stages.patchConstruction = passed("CANONICAL_DIFF_READY");
  return successfulResult({ diff: canonical, ...base, validation: canonicalValidation });
}

function normalizeP0(rawOutput: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy): PatchInterfaceNormalizationResult {
  const stages = initialStages();
  let parsed: unknown;
  try { parsed = JSON.parse(rawOutput.trim()); stages.parse = passed("JSON_PARSED"); }
  catch { stages.parse = failed("INVALID_JSON"); return resultFailure({ classification: "MALFORMED_SCHEMA", jsonParsed: false, schemaValidated: false, stages, error: "P0 output is not valid JSON" }); }
  const valid = validators.P0(parsed);
  if (!valid) {
    stages.schemaValidation = failed("SCHEMA_VALIDATION_FAILED", ajv.errorsText(validators.P0.errors, { separator: "; " }));
    return resultFailure({ classification: "MALFORMED_SCHEMA", jsonParsed: true, schemaValidated: false, stages, parsedAction: parsed, error: stages.schemaValidation.message ?? "P0 schema validation failed" });
  }
  stages.schemaValidation = passed("SCHEMA_VALIDATED");
  const action = parsed as P0Action;
  if (action.status === "REPORT_ONLY" || action.status === "BLOCKED_MISSING_ORACLE") {
    stages.actionValidation = passed("VALID_NON_MUTATION_ACTION");
    stages.patchConstruction = notApplicable("NO_PATCH_FOR_NON_MUTATION_ACTION");
    return resultFailure({ classification: action.status, jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: action.status });
  }
  if (!action.unified_diff.trim()) {
    stages.actionValidation = failed("EMPTY_PATCH_ACTION");
    return resultFailure({ classification: "SYNTACTICALLY_INVALID_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "PATCH_PROPOSAL contains an empty diff" });
  }
  let declaredTargets: string[];
  try { declaredTargets = action.target_paths.map(normalizePolicyPath); }
  catch (error) {
    stages.actionValidation = failed("UNSAFE_DECLARED_TARGET", error instanceof Error ? error.message : "Unsafe declared target");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: stages.actionValidation.message ?? "P0 target_paths contains an unsafe path" });
  }
  const parsedDiff = parseStrictUnifiedDiff(action.unified_diff);
  if (parsedDiff.parsed) {
    const actual = [...parsedDiff.parsed.targets].sort();
    const declared = [...new Set(declaredTargets)].sort();
    if (declared.length !== declaredTargets.length || actual.length !== declared.length || actual.some((target, index) => target !== declared[index])) {
      stages.actionValidation = failed("DECLARED_TARGET_MISMATCH");
      return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P0 target_paths must exactly match every unified-diff target", targets: actual });
    }
  }
  stages.actionValidation = passed("PATCH_ACTION_ACCEPTED");
  return validateAndFinish(stripTerminalLineBreaks(action.unified_diff), sources, policy, { jsonParsed: true, schemaValidated: true, stages, parsedAction: action });
}

function extractP1Diff(rawOutput: string): { diff: string | null; classification: PatchOutputClassification | null; error: string | null } {
  const trimmed = stripOuterLineBreaks(rawOutput);
  if (!trimmed) return { diff: null, classification: "EMPTY_RESPONSE", error: "P1 output is empty" };
  if (/^(?:REPORT_ONLY|BLOCKED_MISSING_ORACLE)(?:\b|$)/i.test(trimmed)) return { diff: null, classification: trimmed.toUpperCase().startsWith("BLOCKED") ? "BLOCKED_MISSING_ORACLE" : "REPORT_ONLY", error: "P1 returned an explicit refusal" };
  if (/^GENERATION_FAILURE(?:\b|$)/i.test(trimmed)) return { diff: null, classification: "GENERATION_FAILURE", error: "P1 returned generation failure" };
  const fenced = trimmed.match(/^```(?:diff|patch)?\s*\n([\s\S]*?)\n```$/i);
  const candidate = stripOuterLineBreaks(fenced?.[1] ?? trimmed);
  if (candidate.startsWith("diff --git ") || candidate.startsWith("--- ")) return { diff: candidate, classification: null, error: null };
  if (/(?:^|\n)(?:diff --git |--- (?:a\/|\/dev\/null))/.test(candidate)) return { diff: null, classification: "SYNTACTICALLY_INVALID_EDIT", error: "P1 output contains prose or unsupported content before the diff" };
  return { diff: null, classification: "TEXTUAL_EXPLANATION_WITHOUT_ACTION", error: "P1 output contains no unified diff action" };
}

function normalizeP1(rawOutput: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy): PatchInterfaceNormalizationResult {
  const stages = initialStages();
  stages.schemaValidation = notApplicable("FREE_FORM_DIFF_HAS_NO_JSON_SCHEMA");
  const extracted = extractP1Diff(rawOutput);
  if (!extracted.diff) {
    stages.parse = failed(extracted.classification ?? "P1_PARSE_FAILED", extracted.error ?? undefined);
    return resultFailure({ classification: extracted.classification ?? "OTHER", jsonParsed: false, schemaValidated: false, stages, error: extracted.error ?? "P1 parse failed" });
  }
  stages.parse = passed("UNIFIED_DIFF_EXTRACTED");
  stages.actionValidation = passed("PATCH_ACTION_ACCEPTED");
  return validateAndFinish(stripTerminalLineBreaks(extracted.diff), sources, policy, { jsonParsed: false, schemaValidated: false, stages, parsedAction: extracted.diff });
}

function parseStructured(interfaceId: "P2" | "P3" | "P4", rawOutput: string): { parsed: unknown | null; stages: PatchInterfaceNormalizationResult["stages"]; failure: PatchInterfaceNormalizationResult | null } {
  const stages = initialStages();
  let parsed: unknown;
  try { parsed = JSON.parse(rawOutput.trim()); stages.parse = passed("JSON_PARSED"); }
  catch { stages.parse = failed("INVALID_JSON"); return { parsed: null, stages, failure: resultFailure({ classification: "MALFORMED_SCHEMA", jsonParsed: false, schemaValidated: false, stages, error: `${interfaceId} output is not valid JSON` }) }; }
  const validator = validators[interfaceId];
  if (!validator(parsed)) {
    stages.schemaValidation = failed("SCHEMA_VALIDATION_FAILED", ajv.errorsText(validator.errors, { separator: "; " }));
    return { parsed, stages, failure: resultFailure({ classification: "MALFORMED_SCHEMA", jsonParsed: true, schemaValidated: false, stages, parsedAction: parsed, error: stages.schemaValidation.message ?? `${interfaceId} schema validation failed` }) };
  }
  stages.schemaValidation = passed("SCHEMA_VALIDATED");
  return { parsed, stages, failure: null };
}

function normalizeP2(rawOutput: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy): PatchInterfaceNormalizationResult {
  const parsedResult = parseStructured("P2", rawOutput);
  if (parsedResult.failure) return parsedResult.failure;
  const action = parsedResult.parsed as P2Action; const stages = parsedResult.stages;
  const target = validateStructuredTarget(action.file, sources, policy);
  if (!target.file || target.error) {
    stages.actionValidation = failed(target.code ?? "INVALID_TARGET", target.error ?? undefined);
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: target.error ?? "P2 target is invalid", targets: target.file ? [target.file] : [] });
  }
  const source = splitLogicalFile(sources[target.file]);
  if (action.start_line > action.end_line || action.end_line > source.lines.length || !allowedRange(target.file, action.start_line, action.end_line, policy)) {
    stages.actionValidation = failed("RANGE_OUTSIDE_ALLOWED_SCOPE");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P2 range is invalid or outside the registered range", targets: [target.file] });
  }
  if (containsSecretShapedText(action.replacement)) {
    stages.actionValidation = failed("SECRET_SHAPED_EDIT");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P2 replacement contains secret-shaped content", targets: [target.file] });
  }
  stages.actionValidation = passed("RANGE_EDIT_ACCEPTED");
  try {
    const nextLines = [...source.lines.slice(0, action.start_line - 1), ...replacementLines(action.replacement), ...source.lines.slice(action.end_line)];
    const diff = buildCanonicalUnifiedDiff(target.file, sources[target.file], joinLogicalFile(source, nextLines));
    if (!diff) { stages.patchConstruction = failed("NO_CHANGES"); return resultFailure({ classification: "OTHER", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P2 edit produces no changes", targets: [target.file] }); }
    return validateAndFinish(diff, sources, policy, { jsonParsed: true, schemaValidated: true, stages, parsedAction: action });
  } catch (error) {
    stages.patchConstruction = failed("PATCH_CONSTRUCTION_FAILED");
    return resultFailure({ classification: "OTHER", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: error instanceof Error ? error.message : "P2 patch construction failed", targets: [target.file] });
  }
}

const definitionTypes = ["function_declaration", "generator_function_declaration", "method_definition"];

function parserForExtension(extension: string): Parser {
  const parser = new Parser();
  parser.setLanguage(extension === ".tsx" || extension === ".jsx" ? TypeScript.tsx : TypeScript.typescript);
  return parser;
}

function symbolBodyNodes(source: string, extension: string, symbol: string): SyntaxNode[] {
  const parser = parserForExtension(extension);
  const sourceBytes = Buffer.byteLength(source, "utf8");
  if (sourceBytes > 8 * 1024 * 1024) throw new Error("Source exceeds the Tree-sitter experiment budget");
  const tree = parser.parse(source, undefined, { bufferSize: Math.max(64 * 1024, sourceBytes + 1) });
  if (tree.rootNode.hasError) throw new Error("Current source does not parse cleanly");
  const bodies: SyntaxNode[] = [];
  for (const node of tree.rootNode.descendantsOfType(definitionTypes)) {
    if (node.childForFieldName("name")?.text !== symbol) continue;
    const body = node.childForFieldName("body");
    if (body?.type === "statement_block") bodies.push(body);
  }
  for (const node of tree.rootNode.descendantsOfType("variable_declarator")) {
    if (node.childForFieldName("name")?.text !== symbol) continue;
    const value = node.childForFieldName("value");
    if (!value || !["arrow_function", "function_expression"].includes(value.type)) continue;
    const body = value.childForFieldName("body");
    if (body?.type === "statement_block") bodies.push(body);
  }
  return bodies;
}

function validatedReplacementBody(value: string, extension: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) throw new Error("P3 replacement_body must contain a statement block");
  const block = trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed : `{${normalized}}`;
  const synthetic = `function __dca_replacement__() ${block}`;
  const parser = parserForExtension(extension);
  const tree = parser.parse(synthetic);
  const declaration = tree.rootNode.namedChild(0);
  const body = declaration?.childForFieldName("body");
  if (
    tree.rootNode.hasError ||
    tree.rootNode.namedChildCount !== 1 ||
    declaration?.type !== "function_declaration" ||
    declaration.startIndex !== 0 ||
    declaration.endIndex !== synthetic.length ||
    body?.type !== "statement_block" ||
    body.text !== block
  ) throw new Error("P3 replacement_body must resolve to exactly one complete statement block");
  return block;
}

function normalizeP3(rawOutput: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy): PatchInterfaceNormalizationResult {
  const parsedResult = parseStructured("P3", rawOutput);
  if (parsedResult.failure) return parsedResult.failure;
  const action = parsedResult.parsed as P3Action; const stages = parsedResult.stages;
  const target = validateStructuredTarget(action.file, sources, policy);
  if (!target.file || target.error) {
    stages.actionValidation = failed(target.code ?? "INVALID_TARGET", target.error ?? undefined);
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: target.error ?? "P3 target is invalid", targets: target.file ? [target.file] : [] });
  }
  const extension = path.posix.extname(target.file).toLowerCase();
  if (!new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]).has(extension)) {
    stages.actionValidation = failed("UNSUPPORTED_SYMBOL_LANGUAGE");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P3 supports bounded JavaScript and TypeScript files only", targets: [target.file] });
  }
  const allowedSymbols = policy.allowedSymbols?.[target.file];
  if (!allowedSymbols?.includes(action.symbol)) {
    stages.actionValidation = failed("SYMBOL_OUTSIDE_ALLOWED_SCOPE");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P3 symbol is outside the registered symbol allowlist", targets: [target.file] });
  }
  if (containsSecretShapedText(action.replacement_body)) {
    stages.actionValidation = failed("SECRET_SHAPED_EDIT");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P3 replacement contains secret-shaped content", targets: [target.file] });
  }
  let bodies: SyntaxNode[];
  try { bodies = symbolBodyNodes(sources[target.file], extension, action.symbol); }
  catch (error) {
    stages.actionValidation = failed("SYMBOL_RESOLUTION_FAILED");
    return resultFailure({ classification: "OTHER", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: error instanceof Error ? error.message : "P3 symbol resolution failed", targets: [target.file] });
  }
  if (bodies.length !== 1) {
    stages.actionValidation = failed(bodies.length === 0 ? "SYMBOL_NOT_FOUND" : "AMBIGUOUS_SYMBOL");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: bodies.length === 0 ? "P3 symbol body was not found" : "P3 symbol is ambiguous in the exact file", targets: [target.file] });
  }
  const body = bodies[0];
  const bodyStartLine = body.startPosition.row + 1; const bodyEndLine = body.endPosition.row + 1;
  if (policy.allowedRanges?.[target.file] && !allowedRange(target.file, bodyStartLine, bodyEndLine, policy)) {
    stages.actionValidation = failed("SYMBOL_BODY_OUTSIDE_ALLOWED_RANGE");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "Resolved P3 body is outside the registered line range", targets: [target.file] });
  }
  let replacementBlock: string;
  try { replacementBlock = validatedReplacementBody(action.replacement_body, extension); }
  catch (error) {
    stages.actionValidation = failed("INVALID_REPLACEMENT_BODY", error instanceof Error ? error.message : "Invalid P3 replacement body");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: stages.actionValidation.message ?? "P3 replacement body is invalid", targets: [target.file] });
  }
  stages.actionValidation = passed("UNIQUE_SYMBOL_BODY_RESOLVED");
  try {
    const logical = splitLogicalFile(sources[target.file]);
    const replacementBody = replacementBlock.replace(/\n/g, logical.eol);
    const currentSource = sources[target.file];
    const candidate = `${currentSource.slice(0, body.startIndex)}${replacementBody}${currentSource.slice(body.endIndex)}`;
    const candidateBodies = symbolBodyNodes(candidate, extension, action.symbol);
    if (candidateBodies.length !== 1 || candidateBodies[0].text !== replacementBody) throw new Error("P3 candidate no longer contains exactly the resolved replacement body");
    const diff = buildCanonicalUnifiedDiff(target.file, sources[target.file], candidate);
    if (!diff) { stages.patchConstruction = failed("NO_CHANGES"); return resultFailure({ classification: "OTHER", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P3 edit produces no changes", targets: [target.file] }); }
    return validateAndFinish(diff, sources, policy, { jsonParsed: true, schemaValidated: true, stages, parsedAction: action });
  } catch (error) {
    stages.patchConstruction = failed("PATCH_CONSTRUCTION_FAILED");
    return resultFailure({ classification: "SYNTACTICALLY_INVALID_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: error instanceof Error ? error.message : "P3 patch construction failed", targets: [target.file] });
  }
}

interface IndexedEdit { action: P4ToolAction; startIndex: number; endIndex: number; replacement: string[]; boundary: number | null; startLine: number; endLine: number }

function indexedToolEdit(action: P4ToolAction, source: LogicalFile): IndexedEdit | null {
  if (action.tool === "replace_range" || action.tool === "delete_range") {
    if (action.start_line > action.end_line || action.end_line > source.lines.length) return null;
    return { action, startIndex: action.start_line - 1, endIndex: action.end_line, replacement: action.tool === "replace_range" ? replacementLines(action.text) : [], boundary: null, startLine: action.start_line, endLine: action.end_line };
  }
  if (action.start_line !== action.end_line || action.start_line > source.lines.length) return null;
  const before = action.tool === "insert_before";
  return { action, startIndex: before ? action.start_line - 1 : action.start_line, endIndex: before ? action.start_line - 1 : action.start_line, replacement: replacementLines(action.text), boundary: before ? action.start_line * 2 - 1 : action.start_line * 2 + 1, startLine: action.start_line, endLine: action.end_line };
}

function editsOverlap(left: IndexedEdit, right: IndexedEdit): boolean {
  if (left.boundary !== null && right.boundary !== null) return left.boundary === right.boundary;
  if (left.boundary === null && right.boundary === null) return left.startLine <= right.endLine && right.startLine <= left.endLine;
  const insertion = left.boundary !== null ? left : right;
  const range = left.boundary === null ? left : right;
  const rangeStartBoundary = range.startLine * 2 - 1;
  const rangeEndBoundary = range.endLine * 2 + 1;
  return insertion.boundary! > rangeStartBoundary && insertion.boundary! < rangeEndBoundary;
}

function normalizeP4(rawOutput: string, sources: Readonly<Record<string, string>>, policy: PatchInterfacePolicy): PatchInterfaceNormalizationResult {
  const parsedResult = parseStructured("P4", rawOutput);
  if (parsedResult.failure) return parsedResult.failure;
  const action = parsedResult.parsed as P4Action; const stages = parsedResult.stages;
  const maximum = policy.maxToolActions ?? 4;
  if (action.actions.length > maximum) {
    stages.actionValidation = failed("TOOL_ACTION_BUDGET_EXCEEDED");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: `P4 has ${action.actions.length} actions, exceeding ${maximum}` });
  }
  const byFile = new Map<string, { source: LogicalFile; edits: IndexedEdit[] }>();
  for (const toolAction of action.actions) {
    const target = validateStructuredTarget(toolAction.file, sources, policy);
    if (!target.file || target.error) {
      stages.actionValidation = failed(target.code ?? "INVALID_TARGET", target.error ?? undefined);
      return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: target.error ?? "P4 target is invalid", targets: target.file ? [target.file] : [] });
    }
    if (toolAction.tool === "delete_range" && toolAction.text !== "") {
      stages.actionValidation = failed("DELETE_RANGE_TEXT_MUST_BE_EMPTY");
      return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P4 delete_range requires an empty text field", targets: [target.file] });
    }
    if ((toolAction.tool === "insert_before" || toolAction.tool === "insert_after") && toolAction.start_line !== toolAction.end_line) {
      stages.actionValidation = failed("INSERTION_REQUIRES_SINGLE_LINE_ANCHOR");
      return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P4 insertion requires start_line to equal end_line", targets: [target.file] });
    }
    if (containsSecretShapedText(toolAction.text)) {
      stages.actionValidation = failed("SECRET_SHAPED_EDIT");
      return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P4 action contains secret-shaped content", targets: [target.file] });
    }
    const state = byFile.get(target.file) ?? { source: splitLogicalFile(sources[target.file]), edits: [] };
    const indexed = indexedToolEdit(toolAction, state.source);
    if (!indexed || !allowedRange(target.file, indexed.startLine, indexed.endLine, policy)) {
      stages.actionValidation = failed("RANGE_OUTSIDE_ALLOWED_SCOPE");
      return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P4 action range is invalid or outside the registered range", targets: [target.file] });
    }
    state.edits.push(indexed); byFile.set(target.file, state);
  }
  if (byFile.size > policy.maxChangedFiles) {
    stages.actionValidation = failed("CHANGED_FILE_BUDGET_EXCEEDED");
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: `P4 targets ${byFile.size} files, exceeding ${policy.maxChangedFiles}`, targets: [...byFile.keys()] });
  }
  for (const [file, state] of byFile) for (let left = 0; left < state.edits.length; left += 1) for (let right = left + 1; right < state.edits.length; right += 1)
    if (editsOverlap(state.edits[left], state.edits[right])) {
      stages.actionValidation = failed("OVERLAPPING_OR_AMBIGUOUS_ACTIONS");
      return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: `P4 actions overlap in original coordinates for ${file}`, targets: [...byFile.keys()] });
    }
  stages.actionValidation = passed("BOUNDED_TOOL_ACTIONS_ACCEPTED");
  try {
    const diffs: string[] = [];
    for (const [file, state] of [...byFile].sort(([left], [right]) => left.localeCompare(right))) {
      const next = [...state.source.lines];
      for (const edit of [...state.edits].sort((left, right) => right.startIndex - left.startIndex || right.endIndex - left.endIndex)) next.splice(edit.startIndex, edit.endIndex - edit.startIndex, ...edit.replacement);
      const diff = buildCanonicalUnifiedDiff(file, sources[file], joinLogicalFile(state.source, next));
      if (diff) diffs.push(stripTerminalLineBreaks(diff));
    }
    if (diffs.length === 0) { stages.patchConstruction = failed("NO_CHANGES"); return resultFailure({ classification: "OTHER", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: "P4 actions produce no changes", targets: [...byFile.keys()] }); }
    return validateAndFinish(diffs.join("\n"), sources, policy, { jsonParsed: true, schemaValidated: true, stages, parsedAction: action });
  } catch (error) {
    stages.patchConstruction = failed("PATCH_CONSTRUCTION_FAILED");
    return resultFailure({ classification: "OTHER", jsonParsed: true, schemaValidated: true, stages, parsedAction: action, error: error instanceof Error ? error.message : "P4 patch construction failed", targets: [...byFile.keys()] });
  }
}

export function normalizePatchInterfaceOutput(input: NormalizePatchInterfaceInput): PatchInterfaceNormalizationResult {
  if (!input.rawOutput.trim()) {
    const stages = initialStages(); stages.parse = failed("EMPTY_RESPONSE");
    return resultFailure({ classification: "EMPTY_RESPONSE", jsonParsed: false, schemaValidated: false, stages, error: `${input.interfaceId} output is empty` });
  }
  const policyError = validatePolicyBasics(input.policy);
  if (policyError) {
    const stages = initialStages(); stages.actionValidation = failed("INVALID_POLICY", policyError);
    return resultFailure({ classification: "UNSAFE_EDIT", jsonParsed: false, schemaValidated: false, stages, error: policyError });
  }
  switch (input.interfaceId) {
    case "P0": return normalizeP0(input.rawOutput, input.sources, input.policy);
    case "P1": return normalizeP1(input.rawOutput, input.sources, input.policy);
    case "P2": return normalizeP2(input.rawOutput, input.sources, input.policy);
    case "P3": return normalizeP3(input.rawOutput, input.sources, input.policy);
    case "P4": return normalizeP4(input.rawOutput, input.sources, input.policy);
  }
}
