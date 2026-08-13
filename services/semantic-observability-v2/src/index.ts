import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import {
  deriveL1Features,
  makeL0Evidence,
  type L0Evidence,
  type VerificationSummary,
} from "../../semantic-observability/src/index";

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer, kind: string, value: string) => createHmac("sha256", key).update(`${kind}\0${value}`).digest("hex");
const SECRET_VALUE_SHAPED = /(hf_[A-Za-z0-9]{12,}|sk-[A-Za-z0-9]{12,})/i;
const UNSAFE_PATH_SHAPED = /(api[_-]?key|password|secret|token)/i;
const IDENTIFIER = /[$A-Z_a-z][$\w]*/gu;
const LITERAL = /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:\d+(?:\.\d+)?|true|false|null)\b)/gu;
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/gu;
const OPERATORS = ["===", "!==", "==", "!=", ">=", "<=", "&&", "||", "??", "=>", "+=", "-=", "*=", "/=", "++", "--", "+", "-", "*", "/", "%", ">", "<", "!", "?"] as const;

export type ActionParseStatus = "JSON_OBJECT" | "JSON_INVALID" | "EMPTY_RESPONSE";
export type ActionValidationStatus = "PASS" | "NOT_APPLICABLE" | "MISSING_FIELD" | "EXTRA_FIELD" | "INVALID_FIELD_TYPE" | "FILE_NOT_ALLOWED" | "RANGE_INVALID" | "RANGE_OUT_OF_BOUNDS";
export type AfterSourceParseStatus = "PASS" | "FAIL" | "NOT_APPLICABLE";
export type ParserFailureCategory = "NONE" | "EMPTY_REPLACEMENT" | "WHITESPACE_ONLY_REPLACEMENT" | "TREE_SITTER_SYNTAX_ERROR" | "INVALID_ACTION_NO_AFTER_SOURCE";

type CountRow = { kind: string; count: number };
type DigestRow = { digest: string; count: number };
type ValidAstFeatures = {
  astNodeChanges: unknown[];
  expressionChanges: unknown[];
  controlFlowChanges: unknown[];
  operatorChanges: unknown[];
  identifierChanges: unknown[];
  literalChanges: unknown[];
  apiCallChanges: unknown[];
  importChanges: unknown[];
};

export type L1EvidenceV2 = {
  schemaVersion: 2;
  level: "L1_STRUCTURED_DERIVED_EDIT_FEATURES";
  taskId: string;
  repositoryRevision: string;
  physicalCallId: string;
  requestSha256: string;
  actionIdentitySha256: string;
  modelResponseStatus: "COMPLETED";
  actionParseStatus: ActionParseStatus;
  actionValidationStatus: ActionValidationStatus;
  replacementPresent: boolean;
  afterSourceParseStatus: AfterSourceParseStatus;
  astFeaturesAvailable: boolean;
  parserFailureCategory: ParserFailureCategory;
  selectedFile: string;
  range: { startLine: number; endLine: number } | null;
  targetSymbol: { digest: string; kind: string } | null;
  replacementShape: {
    bytes: number;
    characters: number;
    lines: number;
    newlines: number;
    whitespaceOnly: boolean;
    indentation: CountRow[];
    lexicalTokenKinds: CountRow[];
    operatorCategories: CountRow[];
    commentTokens: number;
    delimiterBalance: { parentheses: number; brackets: number; braces: number };
    identifierDigests: DigestRow[];
    literalDigests: DigestRow[];
  };
  astFeatures: ValidAstFeatures | null;
  canonicalEditSha256: string;
  hashKeyId: string;
  verification: VerificationSummary;
  visibleBehavioralEffect: { status: "PASS" | "FAIL" | "NOT_RUN"; category: string; diagnosticSha256: string | null };
  privacy: { rawPromptStored: false; rawModelOutputStored: false; rawEditBodyStored: false; rawIdentifiersStored: false; rawLiteralsStored: false; commentsStored: false; sourceStored: false; rawParserMessageStored: false; hashKeyStored: false };
};

export type CompletedResponseInput = {
  taskId: string;
  repositoryRevision: string;
  physicalCallId: string;
  requestSha256: string;
  rawModelResponse: string;
  selectedFile: string;
  expectedStartLine: number;
  expectedEndLine: number;
  beforeSource: string;
  targetSymbol?: { name: string; kind: string };
  hashKey: Buffer;
  retrieval: L0Evidence["retrieval"];
  verification: VerificationSummary;
  visibleBehavioralEffect: L1EvidenceV2["visibleBehavioralEffect"];
  safety: "PASS" | "FAIL";
  rollback: "PASS" | "FAIL";
};

export type SameCallPairV2 = {
  schemaVersion: 2;
  pairing: "ONE_COMPLETED_CALL_ONE_L0_ONE_L1";
  identity: { taskId: string; repositoryRevision: string; physicalCallId: string; requestSha256: string; actionIdentitySha256: string };
  L0: L0Evidence;
  L1: L1EvidenceV2;
};

function safeId(value: string, label: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) throw new Error(`Invalid infrastructure ${label}`);
}
function safePath(value: string) {
  if (!value || path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..") || UNSAFE_PATH_SHAPED.test(value)) throw new Error("Invalid infrastructure selected file");
}
function countRows(values: Iterable<string>): CountRow[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([kind, count]) => ({ kind, count }));
}
function digestRows(values: Iterable<string>, key: Buffer, kind: string): DigestRow[] {
  const counts = new Map<string, number>();
  for (const value of values) { const digest = hmac(key, kind, value); counts.set(digest, (counts.get(digest) ?? 0) + 1); }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([digest, count]) => ({ digest, count }));
}
function matches(source: string, expression: RegExp) { return [...source.matchAll(expression)].map((match) => match[0]); }
function occurrences(source: string, needle: string) { return source.split(needle).length - 1; }
function lexicalKind(token: string) {
  if (/^['"`]/u.test(token)) return "STRING";
  if (/^(?:true|false)$/u.test(token)) return "BOOLEAN";
  if (token === "null") return "NULL";
  return "NUMBER";
}
function shape(replacement: string, key: Buffer): L1EvidenceV2["replacementShape"] {
  const identifiers = matches(replacement, IDENTIFIER);
  const literals = matches(replacement, LITERAL);
  const lines = replacement.split(/\r?\n/u);
  const indentation = lines.map((line) => String(line.match(/^[ \t]*/u)?.[0].replace(/\t/gu, "    ").length ?? 0));
  const operatorKinds: string[] = [];
  for (const operator of OPERATORS) for (let index = 0; index < occurrences(replacement, operator); index++) operatorKinds.push(operator);
  return {
    bytes: Buffer.byteLength(replacement), characters: replacement.length, lines: lines.length, newlines: matches(replacement, /\r?\n/gu).length,
    whitespaceOnly: replacement.trim().length === 0,
    indentation: countRows(indentation),
    lexicalTokenKinds: countRows([...identifiers.map(() => "IDENTIFIER"), ...literals.map(lexicalKind)]),
    operatorCategories: countRows(operatorKinds), commentTokens: matches(replacement, COMMENT).length,
    delimiterBalance: { parentheses: occurrences(replacement, "(") - occurrences(replacement, ")"), brackets: occurrences(replacement, "[") - occurrences(replacement, "]"), braces: occurrences(replacement, "{") - occurrences(replacement, "}") },
    identifierDigests: digestRows(identifiers, key, "identifier"), literalDigests: digestRows(literals, key, "literal"),
  };
}
function parseAction(raw: string): { status: ActionParseStatus; value: Record<string, unknown> | null } {
  if (!raw.trim()) return { status: "EMPTY_RESPONSE", value: null };
  try { const value: unknown = JSON.parse(raw); return value !== null && typeof value === "object" && !Array.isArray(value) ? { status: "JSON_OBJECT", value: value as Record<string, unknown> } : { status: "JSON_INVALID", value: null }; }
  catch { return { status: "JSON_INVALID", value: null }; }
}
function validateAction(value: Record<string, unknown> | null, expectedFile: string, sourceLines: number): ActionValidationStatus {
  if (!value) return "NOT_APPLICABLE";
  const required = ["file", "start_line", "end_line", "replacement"];
  if (required.some((key) => !Object.hasOwn(value, key))) return "MISSING_FIELD";
  if (Object.keys(value).some((key) => !required.includes(key))) return "EXTRA_FIELD";
  if (typeof value.file !== "string" || typeof value.start_line !== "number" || typeof value.end_line !== "number" || typeof value.replacement !== "string") return "INVALID_FIELD_TYPE";
  if (value.file !== expectedFile) return "FILE_NOT_ALLOWED";
  if (!Number.isInteger(value.start_line) || !Number.isInteger(value.end_line) || value.start_line < 1 || value.end_line < value.start_line) return "RANGE_INVALID";
  if (value.end_line > sourceLines) return "RANGE_OUT_OF_BOUNDS";
  return "PASS";
}
function applyReplacement(source: string, startLine: number, endLine: number, replacement: string) {
  const lines = source.split("\n");
  lines.splice(startLine - 1, endLine - startLine + 1, ...replacement.split("\n"));
  return lines.join("\n");
}

export function deriveCompletedResponsePair(input: CompletedResponseInput): SameCallPairV2 {
  safeId(input.taskId, "task id"); safeId(input.physicalCallId, "call id"); safePath(input.selectedFile);
  if (!/^sha256:[a-f0-9]{64}$/u.test(input.repositoryRevision) || !/^[a-f0-9]{64}$/u.test(input.requestSha256) || input.hashKey.length !== 32 || !Number.isInteger(input.expectedStartLine) || !Number.isInteger(input.expectedEndLine) || input.expectedStartLine < 1 || input.expectedEndLine < input.expectedStartLine) throw new Error("Invalid infrastructure derivation metadata");
  const actionIdentitySha256 = sha256(input.rawModelResponse);
  const parsed = parseAction(input.rawModelResponse);
  const actionValidationStatus = validateAction(parsed.value, input.selectedFile, input.beforeSource.split("\n").length);
  const replacement = typeof parsed.value?.replacement === "string" ? parsed.value.replacement : "";
  const replacementPresent = typeof parsed.value?.replacement === "string";
  const startLine = actionValidationStatus === "PASS" ? parsed.value!.start_line as number : input.expectedStartLine;
  const endLine = actionValidationStatus === "PASS" ? parsed.value!.end_line as number : input.expectedEndLine;
  const afterSource = actionValidationStatus === "PASS" ? applyReplacement(input.beforeSource, startLine, endLine, replacement) : null;
  let astFeatures: ValidAstFeatures | null = null;
  let afterSourceParseStatus: AfterSourceParseStatus = "NOT_APPLICABLE";
  let parserFailureCategory: ParserFailureCategory = "INVALID_ACTION_NO_AFTER_SOURCE";
  let canonicalEditSha256 = sha256(`${input.selectedFile}\0${startLine}\0${endLine}\0${actionIdentitySha256}`);
  if (afterSource !== null) {
    const afterTree = parser.parse(afterSource);
    afterSourceParseStatus = afterTree.rootNode.hasError ? "FAIL" : "PASS";
    parserFailureCategory = replacement.length === 0 ? "EMPTY_REPLACEMENT" : replacement.trim().length === 0 ? "WHITESPACE_ONLY_REPLACEMENT" : afterTree.rootNode.hasError ? "TREE_SITTER_SYNTAX_ERROR" : "NONE";
    if (!afterTree.rootNode.hasError) {
      try {
        const valid = deriveL1Features({ taskId: input.taskId, repositoryRevision: input.repositoryRevision, physicalCallId: input.physicalCallId, selectedFile: input.selectedFile, startLine, endLine, targetSymbol: input.targetSymbol, beforeSource: input.beforeSource, afterSource, replacementText: replacement, hashKey: input.hashKey, verification: input.verification, visibleBehavioralEffect: input.visibleBehavioralEffect });
        astFeatures = { astNodeChanges: valid.astNodeChanges, expressionChanges: valid.expressionChanges, controlFlowChanges: valid.controlFlowChanges, operatorChanges: valid.operatorChanges, identifierChanges: valid.identifierChanges, literalChanges: valid.literalChanges, apiCallChanges: valid.apiCallChanges, importChanges: valid.importChanges };
        canonicalEditSha256 = valid.canonicalEditSha256;
      } catch { afterSourceParseStatus = "FAIL"; parserFailureCategory = "TREE_SITTER_SYNTAX_ERROR"; astFeatures = null; }
    }
  }
  const L0 = makeL0Evidence({ taskId: input.taskId, repositoryRevision: input.repositoryRevision, physicalCallId: input.physicalCallId, actionIdentitySha256, retrieval: input.retrieval, verification: input.verification, safety: input.safety, rollback: input.rollback });
  const L1: L1EvidenceV2 = {
    schemaVersion: 2, level: "L1_STRUCTURED_DERIVED_EDIT_FEATURES", taskId: input.taskId, repositoryRevision: input.repositoryRevision, physicalCallId: input.physicalCallId, requestSha256: input.requestSha256, actionIdentitySha256,
    modelResponseStatus: "COMPLETED", actionParseStatus: parsed.status, actionValidationStatus, replacementPresent, afterSourceParseStatus, astFeaturesAvailable: astFeatures !== null, parserFailureCategory,
    selectedFile: input.selectedFile, range: actionValidationStatus === "PASS" ? { startLine, endLine } : null,
    targetSymbol: input.targetSymbol ? { digest: hmac(input.hashKey, "symbol", input.targetSymbol.name), kind: input.targetSymbol.kind } : null,
    replacementShape: shape(replacement, input.hashKey), astFeatures, canonicalEditSha256, hashKeyId: sha256(input.hashKey), verification: input.verification, visibleBehavioralEffect: input.visibleBehavioralEffect,
    privacy: { rawPromptStored: false, rawModelOutputStored: false, rawEditBodyStored: false, rawIdentifiersStored: false, rawLiteralsStored: false, commentsStored: false, sourceStored: false, rawParserMessageStored: false, hashKeyStored: false },
  };
  validateL1EvidenceV2(L1);
  return { schemaVersion: 2, pairing: "ONE_COMPLETED_CALL_ONE_L0_ONE_L1", identity: { taskId: input.taskId, repositoryRevision: input.repositoryRevision, physicalCallId: input.physicalCallId, requestSha256: input.requestSha256, actionIdentitySha256 }, L0, L1 };
}

export function validateL1EvidenceV2(value: L1EvidenceV2) {
  if (value.schemaVersion !== 2 || value.level !== "L1_STRUCTURED_DERIVED_EDIT_FEATURES" || value.modelResponseStatus !== "COMPLETED" || value.astFeaturesAvailable !== (value.astFeatures !== null) || !/^[a-f0-9]{64}$/u.test(value.actionIdentitySha256) || !/^[a-f0-9]{64}$/u.test(value.requestSha256) || !/^[a-f0-9]{64}$/u.test(value.canonicalEditSha256) || !/^[a-f0-9]{64}$/u.test(value.hashKeyId) || Object.values(value.privacy).some(Boolean)) throw new Error("Invalid V2 L1 evidence");
  if (value.afterSourceParseStatus === "PASS" && !value.astFeaturesAvailable || value.afterSourceParseStatus !== "PASS" && value.astFeaturesAvailable) throw new Error("Invalid V2 AST availability");
  const serialized = JSON.stringify(value);
  if (SECRET_VALUE_SHAPED.test(serialized)) throw new Error("Persisted V2 feature violates privacy policy");
  return true;
}
