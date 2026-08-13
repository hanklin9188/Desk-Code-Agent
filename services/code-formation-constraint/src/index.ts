import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import {
  normalizePatchInterfaceOutput,
  type PatchInterfaceNormalizationResult,
  type PatchInterfacePolicy
} from "../../patch-interface-runtime/src/index";

export const CODE_FORMATION_CONSTRAINT_ID = "P2_FORMATION_CONSTRAINT_V1" as const;

export const CODE_FORMATION_SYSTEM_SUFFIX = [
  "CODE_FORMATION_CONSTRAINT_V1:",
  "Return exactly one P2 JSON edit whose replacement is non-empty and forms a syntactically complete fragment at the registered source range.",
  "Keep the exact registered file and range, emit no Markdown fences, and do not introduce a top-level import or export when replacing an interior range.",
  "This constraint supplies no task semantics and does not authorize retries, repair, extra context, or any edit outside the existing P2 contract."
].join(" ");

export type FormationConstraintCode =
  | "ACCEPTED"
  | "BASE_P2_REJECTED"
  | "EMPTY_REPLACEMENT"
  | "WHITESPACE_ONLY_REPLACEMENT"
  | "MARKDOWN_FENCE"
  | "NUL_BYTE"
  | "INTERIOR_MODULE_DECLARATION"
  | "AFTER_SOURCE_PARSE_ERROR";

export interface FormationConstraintInput {
  rawOutput: string;
  sources: Readonly<Record<string, string>>;
  policy: PatchInterfacePolicy;
}

export interface FormationConstraintResult {
  constraintId: typeof CODE_FORMATION_CONSTRAINT_ID;
  accepted: boolean;
  code: FormationConstraintCode;
  normalization: PatchInterfaceNormalizationResult;
  replacementUnchanged: boolean;
  afterSource: string | null;
}

type P2Action = { file: string; start_line: number; end_line: number; replacement: string };

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

function isP2Action(value: unknown): value is P2Action {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<P2Action>;
  return typeof action.file === "string" && Number.isInteger(action.start_line) && Number.isInteger(action.end_line) && typeof action.replacement === "string";
}

function spliceInclusive(source: string, action: P2Action): string | null {
  const terminalNewline = source.endsWith("\n");
  const lines = source.split("\n");
  if (terminalNewline) lines.pop();
  if (action.start_line < 1 || action.end_line < action.start_line || action.end_line > lines.length) return null;
  const replacement = action.replacement.split("\n");
  lines.splice(action.start_line - 1, action.end_line - action.start_line + 1, ...replacement);
  return `${lines.join("\n")}${terminalNewline ? "\n" : ""}`;
}

function result(
  normalization: PatchInterfaceNormalizationResult,
  code: FormationConstraintCode,
  afterSource: string | null,
  replacementUnchanged = true
): FormationConstraintResult {
  return { constraintId: CODE_FORMATION_CONSTRAINT_ID, accepted: code === "ACCEPTED", code, normalization, replacementUnchanged, afterSource };
}

/**
 * A rejection-only pre-execution gate. It never changes the candidate replacement,
 * fills missing syntax, retries generation, or consults task/oracle semantics.
 */
export function applyCodeFormationConstraint(input: FormationConstraintInput): FormationConstraintResult {
  const normalization = normalizePatchInterfaceOutput({ interfaceId: "P2", ...input });
  if (normalization.classification !== "VALID_EDIT" || !isP2Action(normalization.parsedAction)) return result(normalization, "BASE_P2_REJECTED", null);
  const action = normalization.parsedAction;
  if (action.replacement.length === 0) return result(normalization, "EMPTY_REPLACEMENT", null);
  if (action.replacement.trim().length === 0) return result(normalization, "WHITESPACE_ONLY_REPLACEMENT", null);
  if (action.replacement.includes("```")) return result(normalization, "MARKDOWN_FENCE", null);
  if (action.replacement.includes("\0")) return result(normalization, "NUL_BYTE", null);

  const source = input.sources[action.file];
  if (source === undefined) return result(normalization, "BASE_P2_REJECTED", null);
  const sourceLineCount = source.endsWith("\n") ? source.split("\n").length - 1 : source.split("\n").length;
  const interiorRange = action.start_line > 1 || action.end_line < sourceLineCount;
  if (interiorRange && /^(?:\s*)(?:import\s|export\s)/m.test(action.replacement)) return result(normalization, "INTERIOR_MODULE_DECLARATION", null);

  const afterSource = spliceInclusive(source, action);
  if (afterSource === null || parser.parse(afterSource).rootNode.hasError) return result(normalization, "AFTER_SOURCE_PARSE_ERROR", afterSource);
  return result(normalization, "ACCEPTED", afterSource);
}
