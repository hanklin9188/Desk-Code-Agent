import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveCompletedResponsePair, validateL1EvidenceV2, type CompletedResponseInput } from "../services/semantic-observability-v2/src/index";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const key = Buffer.alloc(32, 23);
const beforeSource = "export function transform(value:number){ return value + 1; }\n";
const base: Omit<CompletedResponseInput, "rawModelResponse" | "physicalCallId"> = {
  taskId: "observability-v2-totality", repositoryRevision: `sha256:${"a".repeat(64)}`, requestSha256: "b".repeat(64),
  selectedFile: "src/transform.ts", expectedStartLine: 1, expectedEndLine: 1, beforeSource,
  targetSymbol: { name: "transform", kind: "function" }, hashKey: key,
  retrieval: { selectedPathSha256: ["c".repeat(64)], includedPathSha256: ["c".repeat(64)], contextSha256: "d".repeat(64) },
  verification: { stage: "ACTION_VALIDATION", status: "FAIL", code: "SYNTHETIC", diagnosticSha256: null },
  visibleBehavioralEffect: { status: "NOT_RUN", category: "SYNTHETIC", diagnosticSha256: null }, safety: "PASS", rollback: "PASS",
};
const action = (replacement: string, overrides: Record<string, unknown> = {}) => JSON.stringify({ file: "src/transform.ts", start_line: 1, end_line: 1, replacement, ...overrides });
const derive = (rawModelResponse: string, index = 0) => deriveCompletedResponsePair({ ...base, physicalCallId: `synthetic-${index}`, rawModelResponse });

const malformedMatrix = [
  ["unclosed-parentheses", action("export function transform(value:number){ return (value + 1; }")],
  ["unclosed-bracket", action("export function transform(value:number){ return [value; }")],
  ["unclosed-brace", action("export function transform(value:number){ return value + 1;")],
  ["invalid-indentation", action("export function transform(value:number){\n  return value\n    + ;\n}")],
  ["unterminated-single", action("export function transform(){ return 'open; }")],
  ["unterminated-double", action('export function transform(){ return "open; }')],
  ["truncated-expression", action("export function transform(value:number){ return value + }")],
  ["incomplete-call", action("export function transform(value:number){ return Math.max(value, ); }")],
  ["invalid-return", action("export function transform(){ return return 1; }")],
  ["invalid-operator", action("export function transform(value:number){ return value +* 2; }")],
  ["unexpected-dedent", action("export function transform(value:number){ return value; }}")],
  ["json-parser-failure", "{not-json"],
  ["empty-response", ""],
  ["empty-replacement", action("")],
  ["whitespace-only", action(" \n\t")],
  ["invalid-schema", JSON.stringify({ file: "src/transform.ts", replacement: "x" })],
  ["missing-replacement", JSON.stringify({ file: "src/transform.ts", start_line: 1, end_line: 1 })],
  ["invalid-range", action("x", { start_line: -1 })],
  ["out-of-range", action("x", { start_line: 20, end_line: 20 })],
  ["wrong-file", action("x", { file: "src/other.ts" })],
  ["valid-control", action("export function transform(value:number){ return value - 1; }")],
] as const;

describe("privacy-safe semantic observability V2 total extractor", () => {
  it("emits exactly one same-call L0/L1 pair for the complete malformed fixture matrix", () => {
    for (const [index, [label, raw]] of malformedMatrix.entries()) {
      const pair = derive(raw, index);
      expect(pair.pairing, label).toBe("ONE_COMPLETED_CALL_ONE_L0_ONE_L1");
      expect(pair.L0, label).toBeTruthy(); expect(pair.L1, label).toBeTruthy();
      expect(pair.identity.physicalCallId, label).toBe(pair.L0.physicalCallId);
      expect(pair.identity.physicalCallId, label).toBe(pair.L1.physicalCallId);
      expect(pair.identity.actionIdentitySha256, label).toBe(pair.L0.actionIdentitySha256);
      expect(pair.identity.actionIdentitySha256, label).toBe(pair.L1.actionIdentitySha256);
      expect(validateL1EvidenceV2(pair.L1), label).toBe(true);
    }
  });

  it("keeps AST fields available only for parseable after-source", () => {
    const valid = derive(action("export function transform(value:number){ return value - 1; }"), 30).L1;
    expect(valid).toMatchObject({ actionParseStatus: "JSON_OBJECT", actionValidationStatus: "PASS", afterSourceParseStatus: "PASS", astFeaturesAvailable: true, parserFailureCategory: "NONE" });
    expect(valid.astFeatures).not.toBeNull();
    const malformed = derive(action("export function transform(value:number){ return (value; }"), 31).L1;
    expect(malformed).toMatchObject({ actionValidationStatus: "PASS", afterSourceParseStatus: "FAIL", astFeaturesAvailable: false, parserFailureCategory: "TREE_SITTER_SYNTAX_ERROR" });
    expect(malformed.astFeatures).toBeNull();
    const invalid = derive("{bad", 32).L1;
    expect(invalid).toMatchObject({ actionParseStatus: "JSON_INVALID", actionValidationStatus: "NOT_APPLICABLE", afterSourceParseStatus: "NOT_APPLICABLE", astFeaturesAvailable: false });
  });

  it("persists no raw valid or malformed privacy canaries", () => {
    const canaries = ["sk-V2Canary123456789012345", "PassWord-V2-Unique", "person-v2@example.test", "UniqueIdentifierV2", "Literal-V2-884422", "COMMENT_CANARY_V2", "/private/v2/canary/path"];
    const replacement = `export function transform(value:number){ const UniqueIdentifierV2='Literal-V2-884422'; const credential='sk-V2Canary123456789012345'; const mail='person-v2@example.test'; // COMMENT_CANARY_V2 /private/v2/canary/path PassWord-V2-Unique\n return (value + credential.length + UniqueIdentifierV2.length; }`;
    const serialized = JSON.stringify(derive(action(replacement), 40));
    for (const canary of canaries) expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain(replacement);
  });

  it("is deterministic and total over 1000 bounded malformed and edge inputs", () => {
    let crashes = 0, missingL0 = 0, missingL1 = 0, schemaInvalid = 0, nondeterministic = 0, privacyLeaks = 0;
    const secret = "sk-FuzzCanary123456789012345";
    for (let index = 0; index < 1000; index++) {
      const operator = index % 10;
      const body = operator === 0 ? "" : operator === 1 ? "{" : operator === 2 ? action(" ") : operator === 3 ? action(`export function transform(){ const identifier${index}='${secret}-${index}'; return (`) : operator === 4 ? JSON.stringify({ file: "src/transform.ts" }) : operator === 5 ? action("x", { start_line: index + 2, end_line: index + 2 }) : operator === 6 ? action(`export function transform(value:number){ return value ${index % 2 ? "+" : "-"} ${index}; }`) : operator === 7 ? "[]" : operator === 8 ? action(`export function transform(){ return '${index}; }`) : action(`export function transform(value:number){ return value + ${index}; }`);
      try {
        const first = deriveCompletedResponsePair({ ...base, physicalCallId: `fuzz-${index}`, rawModelResponse: body });
        const second = deriveCompletedResponsePair({ ...base, physicalCallId: `fuzz-${index}`, rawModelResponse: body });
        if (!first.L0) missingL0++; if (!first.L1) missingL1++;
        try { validateL1EvidenceV2(first.L1); } catch { schemaInvalid++; }
        if (JSON.stringify(first) !== JSON.stringify(second)) nondeterministic++;
        if (JSON.stringify(first).includes(secret) || body.length > 64 && JSON.stringify(first).includes(body)) privacyLeaks++;
      } catch { crashes++; }
    }
    expect({ crashes, missingL0, missingL1, schemaInvalid, nondeterministic, privacyLeaks }).toEqual({ crashes: 0, missingL0: 0, missingL1: 0, schemaInvalid: 0, nondeterministic: 0, privacyLeaks: 0 });
  });

  it("binds raw actions by hash without persisting them", () => {
    const raw = action("export function transform(value:number){ return value * 2; }");
    const pair = derive(raw, 50);
    expect(pair.identity.actionIdentitySha256).toBe(sha256(raw));
    expect(JSON.stringify(pair)).not.toContain(raw);
  });
});
