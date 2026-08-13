import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import Parser, { type SyntaxNode } from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const digest = (key: Buffer, kind: string, value: string) => createHmac("sha256", key).update(`${kind}\0${value}`).digest("hex");
const SECRET_SHAPED = /(hf_[A-Za-z0-9]{12,}|sk-[A-Za-z0-9]{12,}|api[_-]?key|password|secret|token)/i;
const CONTROL_FLOW = new Set(["if_statement", "switch_statement", "for_statement", "for_in_statement", "while_statement", "do_statement", "try_statement", "throw_statement", "return_statement", "break_statement", "continue_statement", "await_expression"]);
const EXPRESSION_TYPES = new Set(["binary_expression", "unary_expression", "ternary_expression", "assignment_expression", "call_expression", "member_expression", "subscript_expression", "new_expression", "array", "object"]);
const OPERATORS = ["===", "!==", "==", "!=", ">=", "<=", "&&", "||", "??", "=>", "+=", "-=", "*=", "/=", "++", "--", "+", "-", "*", "/", "%", ">", "<", "!", "?"] as const;

type CountRow = { kind: string; before: number; after: number; delta: number };
type DigestDelta = { digest: string; before: number; after: number; delta: number };
export type VerificationSummary = { stage: "RETRIEVAL" | "ACTION_VALIDATION" | "PATCH_CONSTRUCTION" | "SYNTAX_TYPE" | "VISIBLE_TEST" | "HIDDEN_TEST" | "SUCCESS" | "TOOL_INFRASTRUCTURE"; status: "PASS" | "FAIL" | "NOT_RUN"; code: string; diagnosticSha256: string | null };

export type L0Evidence = {
  schemaVersion: 1; level: "L0_HASH_ONLY"; taskId: string; repositoryRevision: string; physicalCallId: string;
  actionIdentitySha256: string; retrieval: { selectedPathSha256: string[]; includedPathSha256: string[]; contextSha256: string };
  verification: VerificationSummary; safety: "PASS" | "FAIL"; rollback: "PASS" | "FAIL"; rawPromptStored: false; rawModelOutputStored: false; rawEditBodyStored: false;
};

export type L1Evidence = {
  schemaVersion: 1; level: "L1_STRUCTURED_DERIVED_EDIT_FEATURES"; taskId: string; repositoryRevision: string; physicalCallId: string;
  selectedFile: string; range: { startLine: number; endLine: number }; targetSymbol: { digest: string; kind: string } | null;
  replacement: { bytes: number; characters: number; lines: number };
  astNodeChanges: CountRow[]; expressionChanges: CountRow[]; controlFlowChanges: CountRow[]; operatorChanges: CountRow[];
  identifierChanges: DigestDelta[]; literalChanges: Array<DigestDelta & { literalType: string; length: number }>;
  apiCallChanges: DigestDelta[]; importChanges: DigestDelta[]; canonicalEditSha256: string; hashKeyId: string;
  verification: VerificationSummary; visibleBehavioralEffect: { status: "PASS" | "FAIL" | "NOT_RUN"; category: string; diagnosticSha256: string | null };
  privacy: { rawPromptStored: false; rawModelOutputStored: false; rawEditBodyStored: false; rawIdentifiersStored: false; rawLiteralsStored: false; commentsStored: false; sourceStored: false };
};

export type DeriveL1Input = {
  taskId: string; repositoryRevision: string; physicalCallId: string; selectedFile: string; startLine: number; endLine: number; targetSymbol?: { name: string; kind: string };
  beforeSource: string; afterSource: string; replacementText: string; hashKey: Buffer; verification: VerificationSummary;
  visibleBehavioralEffect: L1Evidence["visibleBehavioralEffect"];
};

function exactKeys(value: object, expected: readonly string[], label: string) { const keys = Object.keys(value).sort(), wanted = [...expected].sort(); if (JSON.stringify(keys) !== JSON.stringify(wanted)) throw new Error(`Invalid ${label} shape`); }
function safeId(value: string, label: string) { if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) throw new Error(`Invalid ${label}`); }
function safePath(value: string) { if (!value || path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..") || SECRET_SHAPED.test(value)) throw new Error("Invalid selected file"); return value; }
function walk(node: SyntaxNode, visit: (node: SyntaxNode) => void) { visit(node); for (const child of node.namedChildren) walk(child, visit); }
function countKinds(root: SyntaxNode, predicate: (kind: string) => boolean = () => true) { const result = new Map<string, number>(); walk(root, (node) => { if (predicate(node.type)) result.set(node.type, (result.get(node.type) ?? 0) + 1); }); return result; }
function deltas(before: Map<string, number>, after: Map<string, number>): CountRow[] { return [...new Set([...before.keys(), ...after.keys()])].sort().map((kind) => ({ kind, before: before.get(kind) ?? 0, after: after.get(kind) ?? 0, delta: (after.get(kind) ?? 0) - (before.get(kind) ?? 0) })).filter((row) => row.delta !== 0); }
function operatorCounts(source: string) { const result = new Map<string, number>(); for (const operator of OPERATORS) { const count = source.split(operator).length - 1; if (count) result.set(operator, count); } return result; }
function textMultiset(root: SyntaxNode, source: string, types: Set<string>, key: Buffer, prefix: string) { const result = new Map<string, number>(); walk(root, (node) => { if (!types.has(node.type)) return; const value = source.slice(node.startIndex, node.endIndex), keyValue = `${node.type}:${digest(key, prefix, value)}`; result.set(keyValue, (result.get(keyValue) ?? 0) + 1); }); return result; }
function digestDeltas(before: Map<string, number>, after: Map<string, number>): DigestDelta[] { return [...new Set([...before.keys(), ...after.keys()])].sort().map((entry) => { const digestValue = entry.slice(entry.indexOf(":") + 1); return { digest: digestValue, before: before.get(entry) ?? 0, after: after.get(entry) ?? 0, delta: (after.get(entry) ?? 0) - (before.get(entry) ?? 0) }; }).filter((row) => row.delta !== 0); }
function literalRows(root: SyntaxNode, source: string, key: Buffer) { const result = new Map<string, { count: number; literalType: string; length: number; digest: string }>(); const types = new Set(["string", "template_string", "number", "true", "false", "null", "regex"]); walk(root, (node) => { if (!types.has(node.type)) return; const value = source.slice(node.startIndex, node.endIndex), item = { count: 0, literalType: node.type, length: value.length, digest: digest(key, "literal", value) }, id = `${item.literalType}:${item.length}:${item.digest}`, prior = result.get(id); result.set(id, { ...item, count: (prior?.count ?? 0) + 1 }); }); return result; }
function literalDeltas(before: ReturnType<typeof literalRows>, after: ReturnType<typeof literalRows>): L1Evidence["literalChanges"] { return [...new Set([...before.keys(), ...after.keys()])].sort().map((id) => { const base = before.get(id) ?? after.get(id)!; const b = before.get(id)?.count ?? 0, a = after.get(id)?.count ?? 0; return { digest: base.digest, literalType: base.literalType, length: base.length, before: b, after: a, delta: a - b }; }).filter((row) => row.delta !== 0); }
function callMultiset(root: SyntaxNode, source: string, key: Buffer) { const result = new Map<string, number>(); walk(root, (node) => { if (node.type !== "call_expression") return; const callee = node.namedChildren[0]; if (!callee) return; const value = source.slice(callee.startIndex, callee.endIndex), id = `call:${digest(key, "callee", value)}`; result.set(id, (result.get(id) ?? 0) + 1); }); return result; }
function importMultiset(root: SyntaxNode, source: string, key: Buffer) { const result = new Map<string, number>(); walk(root, (node) => { if (node.type !== "import_statement") return; const module = node.namedChildren.find((child) => child.type === "string"); if (!module) return; const value = source.slice(module.startIndex, module.endIndex), id = `import:${digest(key, "module", value)}`; result.set(id, (result.get(id) ?? 0) + 1); }); return result; }

export function deriveL1Features(input: DeriveL1Input): L1Evidence {
  exactKeys(input, ["taskId", "repositoryRevision", "physicalCallId", "selectedFile", "startLine", "endLine", "targetSymbol", "beforeSource", "afterSource", "replacementText", "hashKey", "verification", "visibleBehavioralEffect"], "derive input");
  safeId(input.taskId, "task id"); safeId(input.physicalCallId, "call id");
  if (!/^sha256:[a-f0-9]{64}$/.test(input.repositoryRevision) || input.hashKey.length !== 32 || !Number.isInteger(input.startLine) || !Number.isInteger(input.endLine) || input.startLine < 1 || input.endLine < input.startLine) throw new Error("Invalid derivation metadata");
  const before = parser.parse(input.beforeSource), after = parser.parse(input.afterSource);
  if (before.rootNode.hasError || after.rootNode.hasError) throw new Error("Source parse failed");
  const identifiers = new Set(["identifier", "property_identifier", "shorthand_property_identifier_pattern"]);
  const feature: L1Evidence = {
    schemaVersion: 1, level: "L1_STRUCTURED_DERIVED_EDIT_FEATURES", taskId: input.taskId, repositoryRevision: input.repositoryRevision, physicalCallId: input.physicalCallId,
    selectedFile: safePath(input.selectedFile), range: { startLine: input.startLine, endLine: input.endLine }, targetSymbol: input.targetSymbol ? { digest: digest(input.hashKey, "symbol", input.targetSymbol.name), kind: input.targetSymbol.kind } : null,
    replacement: { bytes: Buffer.byteLength(input.replacementText), characters: input.replacementText.length, lines: input.replacementText.split(/\r?\n/).length },
    astNodeChanges: deltas(countKinds(before.rootNode), countKinds(after.rootNode)), expressionChanges: deltas(countKinds(before.rootNode, (kind) => EXPRESSION_TYPES.has(kind)), countKinds(after.rootNode, (kind) => EXPRESSION_TYPES.has(kind))), controlFlowChanges: deltas(countKinds(before.rootNode, (kind) => CONTROL_FLOW.has(kind)), countKinds(after.rootNode, (kind) => CONTROL_FLOW.has(kind))), operatorChanges: deltas(operatorCounts(input.beforeSource), operatorCounts(input.afterSource)),
    identifierChanges: digestDeltas(textMultiset(before.rootNode, input.beforeSource, identifiers, input.hashKey, "identifier"), textMultiset(after.rootNode, input.afterSource, identifiers, input.hashKey, "identifier")), literalChanges: literalDeltas(literalRows(before.rootNode, input.beforeSource, input.hashKey), literalRows(after.rootNode, input.afterSource, input.hashKey)), apiCallChanges: digestDeltas(callMultiset(before.rootNode, input.beforeSource, input.hashKey), callMultiset(after.rootNode, input.afterSource, input.hashKey)), importChanges: digestDeltas(importMultiset(before.rootNode, input.beforeSource, input.hashKey), importMultiset(after.rootNode, input.afterSource, input.hashKey)),
    canonicalEditSha256: sha256(`${input.selectedFile}\0${input.startLine}\0${input.endLine}\0${input.beforeSource}\0${input.afterSource}`), hashKeyId: sha256(input.hashKey), verification: input.verification, visibleBehavioralEffect: input.visibleBehavioralEffect,
    privacy: { rawPromptStored: false, rawModelOutputStored: false, rawEditBodyStored: false, rawIdentifiersStored: false, rawLiteralsStored: false, commentsStored: false, sourceStored: false },
  };
  validateL1Evidence(feature);
  return feature;
}

export function validateL1Evidence(value: L1Evidence) {
  exactKeys(value, ["schemaVersion", "level", "taskId", "repositoryRevision", "physicalCallId", "selectedFile", "range", "targetSymbol", "replacement", "astNodeChanges", "expressionChanges", "controlFlowChanges", "operatorChanges", "identifierChanges", "literalChanges", "apiCallChanges", "importChanges", "canonicalEditSha256", "hashKeyId", "verification", "visibleBehavioralEffect", "privacy"], "L1 evidence");
  if (value.schemaVersion !== 1 || value.level !== "L1_STRUCTURED_DERIVED_EDIT_FEATURES" || !/^[a-f0-9]{64}$/.test(value.canonicalEditSha256) || !/^[a-f0-9]{64}$/.test(value.hashKeyId) || Object.values(value.privacy).some(Boolean)) throw new Error("Invalid L1 evidence");
  const serialized = JSON.stringify(value); if (SECRET_SHAPED.test(serialized)) throw new Error("Persisted feature violates privacy policy");
  return true;
}

export function makeL0Evidence(input: Omit<L0Evidence, "schemaVersion" | "level" | "rawPromptStored" | "rawModelOutputStored" | "rawEditBodyStored">): L0Evidence {
  return { schemaVersion: 1, level: "L0_HASH_ONLY", ...input, rawPromptStored: false, rawModelOutputStored: false, rawEditBodyStored: false };
}
