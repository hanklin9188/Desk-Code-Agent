// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyCodeFormationConstraint, CODE_FORMATION_SYSTEM_SUFFIX } from "../services/code-formation-constraint/src/index";
import { sha256Source, type PatchInterfacePolicy } from "../services/patch-interface-runtime/src/index";

const file = "src/fixture.mjs";
const source = "export function format(value) {\n  const normalized = String(value);\n  return `[${normalized}]`;\n}\n";
const policy: PatchInterfacePolicy = {
  allowedFiles: [file],
  allowedRanges: { [file]: [{ startLine: 2, endLine: 3 }] },
  expectedSourceSha256: { [file]: sha256Source(source) },
  maxChangedFiles: 1,
  maxChangedLines: 12
};
const action = (replacement: string, overrides: Record<string, unknown> = {}) => JSON.stringify({ file, start_line: 2, end_line: 3, replacement, ...overrides });
const evaluate = (rawOutput: string) => applyCodeFormationConstraint({ rawOutput, sources: { [file]: source }, policy });

describe("P2 formation constraint v1", () => {
  it("accepts a valid replacement byte-for-byte and deterministically", () => {
    const raw = action("  const normalized = String(value).trim();\n  return `(${normalized})`;"), first = evaluate(raw), second = evaluate(raw);
    expect(first.accepted).toBe(true);
    expect(first.code).toBe("ACCEPTED");
    expect(first.replacementUnchanged).toBe(true);
    expect(first).toEqual(second);
    expect(first.afterSource).toContain("String(value).trim();\n");
  });

  it.each([
    ["malformed JSON", "{not-json", "BASE_P2_REJECTED"],
    ["empty replacement", action(""), "EMPTY_REPLACEMENT"],
    ["whitespace replacement", action("  \n\t"), "WHITESPACE_ONLY_REPLACEMENT"],
    ["Markdown fence", action("```js\nreturn value;\n```"), "MARKDOWN_FENCE"],
    ["NUL", action("  return value;\0"), "NUL_BYTE"],
    ["delimiter failure", action("  const normalized = (String(value);\n  return normalized;"), "AFTER_SOURCE_PARSE_ERROR"],
    ["incomplete expression", action("  const normalized = String(value);\n  return normalized +;"), "AFTER_SOURCE_PARSE_ERROR"],
    ["indentation-shaped incomplete object", action("  const normalized = {\n    value: String(value)\n    ok: true\n  };\n  return normalized;"), "AFTER_SOURCE_PARSE_ERROR"],
    ["interior export", action("export const escaped = value;\n  return escaped;"), "INTERIOR_MODULE_DECLARATION"],
    ["wrong file", action("  return value;", { file: "src/other.mjs" }), "BASE_P2_REJECTED"]
  ])("rejects %s without repair", (_label, raw, expected) => {
    const observed = evaluate(raw as string);
    expect(observed.accepted).toBe(false);
    expect(observed.code).toBe(expected);
    expect(observed.replacementUnchanged).toBe(true);
  });

  it.each([
    "  const normalized = /[(){}]/u.test(String(value)) ? String(value) : '';\n  return normalized;",
    "\tconst normalized = String(value)?.trim() ?? '';\n\treturn `${normalized}`;",
    "  const normalized = ({ value: String(value), ok: true });\n  return normalized.value;",
    "  const normalized = String.raw`\\${value}`;\n  return normalized;"
  ])("accepts supported parser edge case", (replacement) => {
    expect(evaluate(action(replacement)).code).toBe("ACCEPTED");
  });

  it("contains no task semantics, oracle, retry, or repair instruction", () => {
    expect(CODE_FORMATION_SYSTEM_SUFFIX).not.toMatch(/hidden test|reference fix|retry generation|repair the|task answer/i);
  });
});
