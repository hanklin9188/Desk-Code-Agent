import { describe, expect, it } from "vitest";
import { deriveL1Features, makeL0Evidence, validateL1Evidence } from "../services/semantic-observability/src/index";

const key = Buffer.alloc(32, 7);
const base = { taskId: "privacy-task-001", repositoryRevision: `sha256:${"a".repeat(64)}`, physicalCallId: "future-call-001", selectedFile: "src/handler.ts", startLine: 1, endLine: 1, targetSymbol: { name: "handleSecretValue", kind: "function" }, hashKey: key, verification: { stage: "VISIBLE_TEST" as const, status: "FAIL" as const, code: "ASSERTION_FAILED", diagnosticSha256: "b".repeat(64) }, visibleBehavioralEffect: { status: "FAIL" as const, category: "RETURN_VALUE_MISMATCH", diagnosticSha256: "c".repeat(64) } };

describe("privacy-safe semantic observability", () => {
  it("derives deterministic features without retaining canary content", () => {
    const beforeSource = `export function handleSecretValue(input:string){ return input; }`;
    const replacementText = `export function handleSecretValue(input:string){ const password="pw-Canary-991"; const email="person-Canary@example.test"; const apiKey="sk-CanaryKey123456789012345"; // UNIQUE_COMMENT_CANARY\n return input.trim()+password+email+apiKey; }`;
    const first = deriveL1Features({ ...base, beforeSource, afterSource: replacementText, replacementText });
    const second = deriveL1Features({ ...base, beforeSource, afterSource: replacementText, replacementText });
    expect(second).toEqual(first); expect(validateL1Evidence(first)).toBe(true);
    const persisted = JSON.stringify(first);
    for (const canary of ["handleSecretValue", "password", "pw-Canary-991", "person-Canary@example.test", "sk-CanaryKey123456789012345", "UNIQUE_COMMENT_CANARY", "input.trim"]) expect(persisted).not.toContain(canary);
    expect(first.privacy).toEqual({ rawPromptStored: false, rawModelOutputStored: false, rawEditBodyStored: false, rawIdentifiersStored: false, rawLiteralsStored: false, commentsStored: false, sourceStored: false });
  });
  it("changes keyed digests when the privacy key changes", () => {
    const args = { ...base, beforeSource: "export const f=(x:number)=>x+1;", afterSource: "export const f=(x:number)=>x-2;", replacementText: "export const f=(x:number)=>x-2;" };
    const a = deriveL1Features(args), b = deriveL1Features({ ...args, hashKey: Buffer.alloc(32, 8) });
    expect(a.hashKeyId).not.toBe(b.hashKeyId); expect(a.literalChanges).not.toEqual(b.literalChanges);
  });
  it("fails closed on unsafe paths, parse errors and unexpected fields without echoing inputs", () => {
    const valid = { ...base, beforeSource: "export const f=1;", afterSource: "export const f=2;", replacementText: "export const f=2;" };
    expect(() => deriveL1Features({ ...valid, selectedFile: "../secret.ts" })).toThrow("Invalid selected file");
    expect(() => deriveL1Features({ ...valid, afterSource: "export const" })).toThrow("Source parse failed");
    expect(() => deriveL1Features({ ...valid, extra: "raw" } as any)).toThrow("Invalid derive input shape");
  });
  it("freezes L0 as hash and bounded execution metadata only", () => {
    const row = makeL0Evidence({ taskId: "privacy-task-001", repositoryRevision: `sha256:${"a".repeat(64)}`, physicalCallId: "future-call-001", actionIdentitySha256: "d".repeat(64), retrieval: { selectedPathSha256: [], includedPathSha256: [], contextSha256: "e".repeat(64) }, verification: base.verification, safety: "PASS", rollback: "PASS" });
    expect(row).toMatchObject({ level: "L0_HASH_ONLY", rawPromptStored: false, rawModelOutputStored: false, rawEditBodyStored: false });
  });
});
