import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const outputRoot = path.join(root, "benchmarks/patch-interface");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

type JsonObject = Record<string, unknown>;
type Artifact<T> = { value: T; path: string; sha256: string };
type Range1Based = {
  start_line: number;
  end_line: number;
  semantics: "FULL_SYMBOL_DEFINITION_INCLUSIVE";
};

type VisibleFile = { path: string; content: string };
type LegacyManifest = { tasks: JsonObject[] };
type LegacyOracle = { rows: JsonObject[] };
type LegacySelection = { phases: { patchOnly: { taskCount: number; taskIds: string[]; taskIdsSha256: string } } };

type NewTaskSpec = {
  name: string;
  symbol: string;
  parameters: string;
  prompt: string;
  contract: string;
  beforeBody: string[];
  fixedBody: string[];
  visibleAssertions: string[];
  hiddenAssertions: string[];
  rootCause: string;
  behavioralRequirement: string;
};

async function verifiedJson<T>(relativePath: string): Promise<Artifact<T>> {
  const target = path.join(root, relativePath);
  const bytes = await readFile(target);
  const sidecar = (await readFile(`${target}.sha256`, "utf8")).trim().split(/\s+/)[0];
  const actual = sha256(bytes);
  if (sidecar !== actual) throw new Error(`${relativePath} checksum mismatch: expected ${sidecar}, got ${actual}`);
  return { value: JSON.parse(bytes.toString("utf8")) as T, path: relativePath, sha256: actual };
}

function requiredString(value: JsonObject, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field) throw new Error(`Expected non-empty string field ${key}`);
  return field;
}

function visibleFiles(task: JsonObject): VisibleFile[] {
  const files = task.visible_files;
  if (!Array.isArray(files)) throw new Error(`Task ${requiredString(task, "task_id")} has no visible_files`);
  return files.map((file) => {
    if (!file || typeof file !== "object") throw new Error("Visible file must be an object");
    const row = file as JsonObject;
    return { path: requiredString(row, "path"), content: requiredString(row, "content") };
  });
}

function exactFunctionRange(source: string, symbol: string): Range1Based {
  const lines = source.split("\n");
  const declaration = new RegExp(`^\\s*export\\s+function\\s+${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`);
  const startIndex = lines.findIndex((line) => declaration.test(line));
  if (startIndex < 0) throw new Error(`Cannot find exported function ${symbol}`);

  let depth = 0;
  let opened = false;
  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    for (const character of lines[lineIndex]) {
      if (character === "{") { depth += 1; opened = true; }
      if (character === "}") depth -= 1;
      if (opened && depth === 0) return { start_line: startIndex + 1, end_line: lineIndex + 1, semantics: "FULL_SYMBOL_DEFINITION_INCLUSIVE" };
      if (depth < 0) throw new Error(`Unbalanced function source for ${symbol}`);
    }
  }
  throw new Error(`Cannot find the closing brace for ${symbol}`);
}

function rangeText(source: string, range: Range1Based): string {
  return source.split("\n").slice(range.start_line - 1, range.end_line).join("\n");
}

function moduleSource(spec: NewTaskSpec, body: string[]): string {
  return [
    `export const FIXTURE_ID = ${JSON.stringify(`patch-interface-${spec.name}`)};`,
    "",
    "// This adjacent export is intentionally outside the mutation target.",
    `export function ${spec.symbol}Contract() {`,
    `  return ${JSON.stringify(spec.contract)};`,
    "}",
    "",
    `// PATCH_INTERFACE_TARGET ${spec.symbol} START`,
    `export function ${spec.symbol}(${spec.parameters}) {`,
    ...body.map((line) => `  ${line}`),
    "}",
    `// PATCH_INTERFACE_TARGET ${spec.symbol} END`,
    "",
    "// A bounded edit must leave this neighboring module surface unchanged.",
    `export function ${spec.symbol}FixtureLabel() {`,
    `  return ${JSON.stringify(spec.name)};`,
    "}",
    ""
  ].join("\n");
}

function testSource(spec: NewTaskSpec, sourcePath: string, kind: "visible" | "hidden", assertions: string[]): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    `import { ${spec.symbol}, ${spec.symbol}Contract, ${spec.symbol}FixtureLabel } from '../${sourcePath}';`,
    "",
    `test(${JSON.stringify(`${kind} behavior`)}, () => {`,
    ...assertions.map((line) => `  ${line}`),
    `  assert.equal(${spec.symbol}Contract(), ${JSON.stringify(spec.contract)});`,
    `  assert.equal(${spec.symbol}FixtureLabel(), ${JSON.stringify(spec.name)});`,
    "});",
    ""
  ].join("\n");
}

const [legacyManifestArtifact, legacyOracleArtifact, legacySelectionArtifact] = await Promise.all([
  verifiedJson<LegacyManifest>("benchmarks/g4-development/G4_DEVELOPMENT_MANIFEST.v2.json"),
  verifiedJson<LegacyOracle>("benchmarks/g4-development/G4_DEVELOPMENT_ORACLE.v2.sealed.json"),
  verifiedJson<LegacySelection>("benchmarks/model-specialization/MODEL_COMPARISON_DEVELOPMENT_MANIFEST.json")
]);

const legacyIds = legacySelectionArtifact.value.phases.patchOnly.taskIds;
if (legacySelectionArtifact.value.phases.patchOnly.taskCount !== 25 || legacyIds.length !== 25 || new Set(legacyIds).size !== 25) {
  throw new Error("The immutable model-specialization patch-only selection must contain exactly 25 unique tasks");
}
if (sha256(`${legacyIds.join("\n")}\n`) !== legacySelectionArtifact.value.phases.patchOnly.taskIdsSha256) {
  throw new Error("The immutable model-specialization patch-only task ID payload hash does not match");
}

const legacyTaskById = new Map(legacyManifestArtifact.value.tasks.map((task) => [requiredString(task, "task_id"), task]));
const legacyOracleById = new Map(legacyOracleArtifact.value.rows.map((row) => [requiredString(row, "task_id"), row]));
const mutationRuntimeControls = [
  "isolated worktree",
  "single-file allowlist",
  "path and symlink policy",
  "changed-file and changed-line budgets",
  "trusted command registry with shell false",
  "timeout and cancellation",
  "visible and hidden behavioral verification",
  "rollback"
];

function enrichLegacyPair(taskId: string): { task: JsonObject; oracle: JsonObject } {
  const task = legacyTaskById.get(taskId);
  const oracle = legacyOracleById.get(taskId);
  if (!task || !oracle) throw new Error(`Missing immutable G4 task/oracle pair ${taskId}`);
  if (task.dataset_role !== "DEVELOPMENT_ONLY" || task.expected_outcome !== "PATCH_PROPOSAL") {
    throw new Error(`Legacy task ${taskId} is not an executable development-only patch task`);
  }
  const sourcePath = requiredString(oracle, "exact_relevant_file");
  const symbol = requiredString(oracle, "exact_relevant_symbol");
  const source = visibleFiles(task).find((file) => file.path === sourcePath)?.content;
  if (source === undefined) throw new Error(`Legacy task ${taskId} is missing exact source ${sourcePath}`);
  const range = exactFunctionRange(source, symbol);
  const originalSourceSha256 = sha256(source);

  return {
    task: {
      ...task,
      mutation_certification: "SAFE_MUTATION_REQUIRED",
      relevant_range_1_based: range,
      patch_interface_source_provenance: {
        kind: "METADATA_ONLY_ENRICHMENT_FROM_IMMUTABLE_G4_V2",
        source_manifest_sha256: legacyManifestArtifact.sha256,
        source_task_payload_sha256: sha256(JSON.stringify(task)),
        unchanged_behavioral_fields: [
          "task_id", "prompt", "allowed_files", "visible_files", "trusted_visible_command", "changed_line_budget"
        ]
      }
    },
    oracle: {
      ...oracle,
      exact_relevant_range_1_based: range,
      original_source_sha256: originalSourceSha256,
      relevant_range_source_sha256: sha256(rangeText(source, range)),
      mutation_certification: {
        classification: "SAFE_MUTATION_REQUIRED",
        certified: true,
        reason: "The sealed G4 oracle requires one bounded source mutation and supplies independent visible and hidden behavior checks.",
        deterministic_runtime_controls: mutationRuntimeControls
      },
      patch_interface_source_provenance: {
        kind: "METADATA_ONLY_ENRICHMENT_FROM_IMMUTABLE_G4_V2",
        source_oracle_sha256: legacyOracleArtifact.sha256,
        source_oracle_row_payload_sha256: sha256(JSON.stringify(oracle)),
        unchanged_behavioral_fields: [
          "task_id", "exact_relevant_file", "exact_relevant_symbol", "root_cause", "behavioral_requirement",
          "reference_fixed_source", "fixed_source_sha256", "hidden_files", "trusted_hidden_command", "success_requires"
        ]
      }
    }
  };
}

const newTaskSpecs: NewTaskSpec[] = [
  {
    name: "parse-content-length",
    symbol: "parseContentLength",
    parameters: "value",
    prompt: "Parse only canonical non-negative decimal Content-Length values without accepting partial or unsafe integers.",
    contract: "canonical-decimal-safe-integer-or-null",
    beforeBody: [
      "const parsed = Number.parseInt(value, 10);",
      "return Number.isFinite(parsed) ? parsed : null;"
    ],
    fixedBody: [
      "if (typeof value !== \"string\" || !/^(0|[1-9][0-9]*)$/.test(value)) return null;",
      "const parsed = Number(value);",
      "return Number.isSafeInteger(parsed) ? parsed : null;"
    ],
    visibleAssertions: [
      "assert.equal(parseContentLength(\"42\"), 42);",
      "assert.equal(parseContentLength(\"12px\"), null);"
    ],
    hiddenAssertions: [
      "assert.equal(parseContentLength(\"0\"), 0);",
      "assert.equal(parseContentLength(\"01\"), null);",
      "assert.equal(parseContentLength(\"9007199254740992\"), null);"
    ],
    rootCause: "Number.parseInt accepts partial and non-canonical strings and the result is not constrained to safe integers",
    behavioralRequirement: "accept only zero or non-zero-leading decimal strings whose numeric value is a safe non-negative integer; otherwise return null"
  },
  {
    name: "normalize-locale-tag",
    symbol: "normalizeLocaleTag",
    parameters: "value",
    prompt: "Normalize a simple language-region locale tag while rejecting unsupported shapes.",
    contract: "language-lower-region-upper-or-null",
    beforeBody: [
      "return value.replace(\"_\", \"-\").toLowerCase();"
    ],
    fixedBody: [
      "if (typeof value !== \"string\") return null;",
      "const parts = value.trim().replace(/_/g, \"-\").split(\"-\");",
      "if (!/^[A-Za-z]{2,3}$/.test(parts[0] ?? \"\")) return null;",
      "if (parts.length > 2 || (parts[1] && !/^[A-Za-z]{2}$/.test(parts[1]))) return null;",
      "return parts.length === 2 ? parts[0].toLowerCase() + \"-\" + parts[1].toUpperCase() : parts[0].toLowerCase();"
    ],
    visibleAssertions: [
      "assert.equal(normalizeLocaleTag(\"en_us\"), \"en-US\");",
      "assert.equal(normalizeLocaleTag(\"FR\"), \"fr\");"
    ],
    hiddenAssertions: [
      "assert.equal(normalizeLocaleTag(\"ZH-tw\"), \"zh-TW\");",
      "assert.equal(normalizeLocaleTag(\"english\"), null);",
      "assert.equal(normalizeLocaleTag(\"en-US-extra\"), null);"
    ],
    rootCause: "the implementation lowercases the entire tag and replaces only the first underscore without validating its shape",
    behavioralRequirement: "normalize a two-to-three-letter language to lowercase and an optional two-letter region to uppercase; invalid shapes return null"
  },
  {
    name: "merge-intervals",
    symbol: "mergeIntervals",
    parameters: "intervals",
    prompt: "Merge overlapping or adjacent inclusive numeric intervals without mutating the input.",
    contract: "sorted-inclusive-merged-copy",
    beforeBody: [
      "return intervals.sort((left, right) => left[0] - right[0]);"
    ],
    fixedBody: [
      "const ordered = intervals.map(([start, end]) => [start, end]).sort((left, right) => left[0] - right[0]);",
      "const merged = [];",
      "for (const [start, end] of ordered) {",
      "  const previous = merged[merged.length - 1];",
      "  if (!previous || start > previous[1] + 1) merged.push([start, end]);",
      "  else previous[1] = Math.max(previous[1], end);",
      "}",
      "return merged;"
    ],
    visibleAssertions: [
      "const input = [[5, 7], [1, 2], [2, 4]];",
      "assert.deepEqual(mergeIntervals(input), [[1, 7]]);",
      "assert.deepEqual(input, [[5, 7], [1, 2], [2, 4]]);"
    ],
    hiddenAssertions: [
      "assert.deepEqual(mergeIntervals([[1, 1], [3, 4]]), [[1, 1], [3, 4]]);",
      "assert.deepEqual(mergeIntervals([]), []);"
    ],
    rootCause: "the implementation only sorts the caller-owned array, mutating it and never coalescing overlapping or adjacent intervals",
    behavioralRequirement: "return a new ascending array that merges inclusive intervals when they overlap or touch and leave every input array unchanged"
  },
  {
    name: "split-universal-lines",
    symbol: "splitUniversalLines",
    parameters: "text",
    prompt: "Split text across LF, CRLF, or CR line endings without returning a phantom final line.",
    contract: "universal-newlines-no-terminal-phantom",
    beforeBody: [
      "return text.split(\"\\n\");"
    ],
    fixedBody: [
      "if (text === \"\") return [];",
      "const lines = text.replace(/\\r\\n?/g, \"\\n\").split(\"\\n\");",
      "if (lines[lines.length - 1] === \"\") lines.pop();",
      "return lines;"
    ],
    visibleAssertions: [
      "assert.deepEqual(splitUniversalLines(\"a\\r\\nb\"), [\"a\", \"b\"]);",
      "assert.deepEqual(splitUniversalLines(\"a\\nb\\n\"), [\"a\", \"b\"]);"
    ],
    hiddenAssertions: [
      "assert.deepEqual(splitUniversalLines(\"a\\rb\"), [\"a\", \"b\"]);",
      "assert.deepEqual(splitUniversalLines(\"\"), []);",
      "assert.deepEqual(splitUniversalLines(\"a\\n\\nb\"), [\"a\", \"\", \"b\"]);"
    ],
    rootCause: "splitting only on LF preserves carriage returns and creates an unwanted trailing empty item",
    behavioralRequirement: "recognize CRLF, lone CR, and LF separators, retain intentional interior blank lines, and omit one terminal phantom line"
  },
  {
    name: "redact-token",
    symbol: "redactToken",
    parameters: "token",
    prompt: "Redact a token while retaining only its final four characters when it is long enough.",
    contract: "same-length-last-four-visible",
    beforeBody: [
      "return token.slice(0, 4) + \"*\".repeat(Math.max(0, token.length - 4));"
    ],
    fixedBody: [
      "if (token.length <= 4) return \"*\".repeat(token.length);",
      "return \"*\".repeat(token.length - 4) + token.slice(-4);"
    ],
    visibleAssertions: [
      "assert.equal(redactToken(\"abcdefgh\"), \"****efgh\");"
    ],
    hiddenAssertions: [
      "assert.equal(redactToken(\"abc\"), \"***\");",
      "assert.equal(redactToken(\"\"), \"\");",
      "assert.equal(redactToken(\"12345\"), \"*2345\");"
    ],
    rootCause: "the implementation exposes the first four characters instead of the final four and does not fully mask short tokens",
    behavioralRequirement: "preserve token length, expose only the last four characters for lengths above four, and fully mask shorter tokens"
  },
  {
    name: "zip-longest",
    symbol: "zipLongest",
    parameters: "left, right",
    prompt: "Zip two arrays through the longer input, filling a missing side with undefined.",
    contract: "max-length-pairs-with-undefined",
    beforeBody: [
      "return left.map((value, index) => [value, right[index]]);"
    ],
    fixedBody: [
      "const length = Math.max(left.length, right.length);",
      "return Array.from({ length }, (_, index) => [left[index], right[index]]);"
    ],
    visibleAssertions: [
      "assert.deepEqual(zipLongest([1], [\"a\", \"b\"]), [[1, \"a\"], [undefined, \"b\"]]);"
    ],
    hiddenAssertions: [
      "assert.deepEqual(zipLongest([1, 2], [\"a\"]), [[1, \"a\"], [2, undefined]]);",
      "assert.deepEqual(zipLongest([], []), []);"
    ],
    rootCause: "mapping only the left input truncates values when the right input is longer",
    behavioralRequirement: "produce one pair per index through the maximum input length and use undefined for either missing member"
  },
  {
    name: "partition-values",
    symbol: "partitionValues",
    parameters: "values, predicate",
    prompt: "Partition values stably into matching and non-matching groups while evaluating the predicate once per item.",
    contract: "stable-two-way-single-evaluation",
    beforeBody: [
      "return [values.filter(predicate), values.filter(predicate)];"
    ],
    fixedBody: [
      "const matching = [];",
      "const rejected = [];",
      "values.forEach((value, index) => {",
      "  (predicate(value, index) ? matching : rejected).push(value);",
      "});",
      "return [matching, rejected];"
    ],
    visibleAssertions: [
      "assert.deepEqual(partitionValues([1, 2, 3, 4], (value) => value % 2 === 0), [[2, 4], [1, 3]]);"
    ],
    hiddenAssertions: [
      "let calls = 0;",
      "assert.deepEqual(partitionValues([\"a\", \"bb\"], (value, index) => { calls += 1; return value.length === index + 1; }), [[\"a\", \"bb\"], []]);",
      "assert.equal(calls, 2);"
    ],
    rootCause: "the predicate is applied twice to construct two identical matching groups, so rejected values are lost",
    behavioralRequirement: "call the predicate exactly once per value and preserve order in separate matching and rejected arrays"
  },
  {
    name: "parse-duration-ms",
    symbol: "parseDurationMs",
    parameters: "value",
    prompt: "Parse an unsigned integer duration carrying an explicit ms, s, or m suffix.",
    contract: "integer-duration-to-milliseconds-or-null",
    beforeBody: [
      "return Number.parseInt(value, 10) * 1000;"
    ],
    fixedBody: [
      "const match = /^([0-9]+)(ms|s|m)$/.exec(value);",
      "if (!match) return null;",
      "const amount = Number(match[1]);",
      "const multiplier = match[2] === \"m\" ? 60000 : match[2] === \"s\" ? 1000 : 1;",
      "const milliseconds = amount * multiplier;",
      "return Number.isSafeInteger(milliseconds) ? milliseconds : null;"
    ],
    visibleAssertions: [
      "assert.equal(parseDurationMs(\"1500ms\"), 1500);",
      "assert.equal(parseDurationMs(\"2s\"), 2000);"
    ],
    hiddenAssertions: [
      "assert.equal(parseDurationMs(\"3m\"), 180000);",
      "assert.equal(parseDurationMs(\"1.5s\"), null);",
      "assert.equal(parseDurationMs(\"-1s\"), null);"
    ],
    rootCause: "the implementation ignores the unit suffix and accepts partial numeric prefixes as seconds",
    behavioralRequirement: "accept an unsigned integer followed by ms, s, or m, convert it safely to milliseconds, and return null for every other form"
  },
  {
    name: "encode-html",
    symbol: "encodeHtml",
    parameters: "value",
    prompt: "Escape the five HTML-sensitive text characters without double-escaping newly introduced entities.",
    contract: "escape-amp-angle-and-quotes",
    beforeBody: [
      "return value.replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\");"
    ],
    fixedBody: [
      "return value",
      "  .replace(/&/g, \"&amp;\")",
      "  .replace(/</g, \"&lt;\")",
      "  .replace(/>/g, \"&gt;\")",
      "  .replace(/\"/g, \"&quot;\")",
      "  .replace(/'/g, \"&#39;\");"
    ],
    visibleAssertions: [
      "assert.equal(encodeHtml('<a title=\"x\">&'), '&lt;a title=&quot;x&quot;&gt;&amp;');"
    ],
    hiddenAssertions: [
      "assert.equal(encodeHtml(\"Tom's\"), \"Tom&#39;s\");",
      "assert.equal(encodeHtml(\"plain\"), \"plain\");"
    ],
    rootCause: "only angle brackets are escaped, leaving ampersands and both quote characters unsafe",
    behavioralRequirement: "escape ampersand first, followed by less-than, greater-than, double quote, and apostrophe exactly once per source character"
  },
  {
    name: "parse-ipv4",
    symbol: "parseIpv4",
    parameters: "value",
    prompt: "Parse only canonical dotted-decimal IPv4 addresses into four numeric octets.",
    contract: "four-canonical-octets-or-null",
    beforeBody: [
      "return value.split(\".\").map(Number);"
    ],
    fixedBody: [
      "if (typeof value !== \"string\") return null;",
      "const parts = value.split(\".\");",
      "if (parts.length !== 4) return null;",
      "if (!parts.every((part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)) return null;",
      "return parts.map(Number);"
    ],
    visibleAssertions: [
      "assert.deepEqual(parseIpv4(\"192.168.0.1\"), [192, 168, 0, 1]);",
      "assert.equal(parseIpv4(\"256.1.1.1\"), null);"
    ],
    hiddenAssertions: [
      "assert.equal(parseIpv4(\"01.2.3.4\"), null);",
      "assert.equal(parseIpv4(\"1.2.3\"), null);",
      "assert.deepEqual(parseIpv4(\"0.0.0.0\"), [0, 0, 0, 0]);"
    ],
    rootCause: "blind splitting and numeric coercion do not enforce four components, canonical spelling, or the octet range",
    behavioralRequirement: "return four numbers only for exactly four canonical decimal octets in the inclusive range zero through 255; otherwise return null"
  },
  {
    name: "compare-semver",
    symbol: "compareSemver",
    parameters: "left, right",
    prompt: "Compare canonical three-component semantic versions numerically rather than lexically.",
    contract: "numeric-major-minor-patch-comparison",
    beforeBody: [
      "return left.localeCompare(right);"
    ],
    fixedBody: [
      "const pattern = /^[0-9]+\\.[0-9]+\\.[0-9]+$/;",
      "if (!pattern.test(left) || !pattern.test(right)) throw new TypeError(\"semver\");",
      "const leftParts = left.split(\".\").map(Number);",
      "const rightParts = right.split(\".\").map(Number);",
      "for (let index = 0; index < 3; index += 1) {",
      "  if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;",
      "}",
      "return 0;"
    ],
    visibleAssertions: [
      "assert.equal(compareSemver(\"1.10.0\", \"1.2.0\"), 1);",
      "assert.equal(compareSemver(\"1.2.0\", \"1.2.0\"), 0);"
    ],
    hiddenAssertions: [
      "assert.equal(compareSemver(\"2.0.0\", \"10.0.0\"), -1);",
      "assert.equal(compareSemver(\"1.2.3\", \"1.2.4\"), -1);",
      "assert.throws(() => compareSemver(\"1.0\", \"1.0.0\"), TypeError);"
    ],
    rootCause: "locale string comparison orders digit characters rather than semantic-version numeric components",
    behavioralRequirement: "validate major.minor.patch decimal form, compare each numeric component in order, return minus one, zero, or one, and reject invalid forms"
  },
  {
    name: "parse-json-object",
    symbol: "parseJsonObject",
    parameters: "value",
    prompt: "Parse JSON defensively and accept only non-null object records, not arrays or primitives.",
    contract: "json-record-or-null-no-throw",
    beforeBody: [
      "return JSON.parse(value);"
    ],
    fixedBody: [
      "try {",
      "  const parsed = JSON.parse(value);",
      "  return parsed !== null && typeof parsed === \"object\" && !Array.isArray(parsed) ? parsed : null;",
      "} catch {",
      "  return null;",
      "}"
    ],
    visibleAssertions: [
      "assert.deepEqual(parseJsonObject('{\"a\":1}'), { a: 1 });",
      "assert.equal(parseJsonObject('[1,2]'), null);"
    ],
    hiddenAssertions: [
      "assert.equal(parseJsonObject(\"null\"), null);",
      "assert.equal(parseJsonObject(\"not json\"), null);",
      "assert.deepEqual(parseJsonObject(\"{}\"), {});"
    ],
    rootCause: "raw JSON.parse throws on malformed input and returns arrays, null, and primitives even though the API promises a record",
    behavioralRequirement: "return a parsed non-null non-array object for valid object JSON and return null without throwing for every other input"
  },
  {
    name: "take-last-items",
    symbol: "takeLastItems",
    parameters: "values, count",
    prompt: "Return a copied suffix of an array and treat non-positive or non-integer counts as empty.",
    contract: "bounded-suffix-copy",
    beforeBody: [
      "return values.slice(-count);"
    ],
    fixedBody: [
      "if (!Number.isInteger(count) || count <= 0) return [];",
      "return values.slice(-count);"
    ],
    visibleAssertions: [
      "assert.deepEqual(takeLastItems([1, 2, 3], 2), [2, 3]);",
      "assert.deepEqual(takeLastItems([1, 2, 3], 0), []);"
    ],
    hiddenAssertions: [
      "const input = [1, 2];",
      "assert.deepEqual(takeLastItems(input, 5), [1, 2]);",
      "assert.notEqual(takeLastItems(input, 5), input);",
      "assert.deepEqual(takeLastItems(input, -1), []);"
    ],
    rootCause: "Array.slice with negative zero returns the entire array and negative counts select an unrelated prefix boundary",
    behavioralRequirement: "return an empty array unless count is a positive integer; otherwise return a copied suffix containing at most count values"
  },
  {
    name: "move-list-item",
    symbol: "moveListItem",
    parameters: "values, from, to",
    prompt: "Move one array item to a target index without mutating the caller's array.",
    contract: "immutable-indexed-move",
    beforeBody: [
      "const [item] = values.splice(from, 1);",
      "values.splice(to, 0, item);",
      "return values;"
    ],
    fixedBody: [
      "const copy = [...values];",
      "if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;",
      "const [item] = copy.splice(from, 1);",
      "copy.splice(to, 0, item);",
      "return copy;"
    ],
    visibleAssertions: [
      "const input = [\"a\", \"b\", \"c\"];",
      "assert.deepEqual(moveListItem(input, 0, 2), [\"b\", \"c\", \"a\"]);",
      "assert.deepEqual(input, [\"a\", \"b\", \"c\"]);"
    ],
    hiddenAssertions: [
      "assert.deepEqual(moveListItem([1, 2, 3], 2, 0), [3, 1, 2]);",
      "assert.deepEqual(moveListItem([1, 2], -1, 1), [1, 2]);"
    ],
    rootCause: "splice is applied directly to the input array, violating the immutable result contract",
    behavioralRequirement: "return a copied array with one valid indexed move applied, leave the input untouched, and return an unchanged copy for invalid indices"
  },
  {
    name: "weighted-average",
    symbol: "weightedAverage",
    parameters: "values, weights",
    prompt: "Compute a weighted average using the sum of weights and reject empty, mismatched, or zero-weight inputs.",
    contract: "weighted-sum-over-weight-sum-or-null",
    beforeBody: [
      "return values.reduce((sum, value, index) => sum + value * weights[index], 0) / values.length;"
    ],
    fixedBody: [
      "if (values.length === 0 || values.length !== weights.length) return null;",
      "const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);",
      "if (totalWeight === 0) return null;",
      "const weightedSum = values.reduce((sum, value, index) => sum + value * weights[index], 0);",
      "return weightedSum / totalWeight;"
    ],
    visibleAssertions: [
      "assert.equal(weightedAverage([10, 20], [1, 3]), 17.5);"
    ],
    hiddenAssertions: [
      "assert.equal(weightedAverage([], []), null);",
      "assert.equal(weightedAverage([1, 2], [0, 0]), null);",
      "assert.equal(weightedAverage([1], [1, 2]), null);"
    ],
    rootCause: "the weighted sum is divided by the number of values instead of the sum of weights and invalid domains are not handled",
    behavioralRequirement: "divide the weighted sum by total weight and return null for empty inputs, length mismatch, or zero total weight"
  },
  {
    name: "rolling-average",
    symbol: "rollingAverage",
    parameters: "values, size",
    prompt: "Return every complete rolling average window, including the final valid window.",
    contract: "all-complete-windows-positive-size",
    beforeBody: [
      "const output = [];",
      "for (let index = 0; index + size < values.length; index += 1) {",
      "  output.push(values.slice(index, index + size).reduce((sum, value) => sum + value, 0) / size);",
      "}",
      "return output;"
    ],
    fixedBody: [
      "if (!Number.isInteger(size) || size <= 0 || size > values.length) return [];",
      "const output = [];",
      "for (let index = 0; index + size <= values.length; index += 1) {",
      "  output.push(values.slice(index, index + size).reduce((sum, value) => sum + value, 0) / size);",
      "}",
      "return output;"
    ],
    visibleAssertions: [
      "assert.deepEqual(rollingAverage([1, 3, 5], 2), [2, 4]);"
    ],
    hiddenAssertions: [
      "assert.deepEqual(rollingAverage([2, 4], 2), [3]);",
      "assert.deepEqual(rollingAverage([1, 2], 0), []);",
      "assert.deepEqual(rollingAverage([1, 2], 3), []);"
    ],
    rootCause: "the loop uses a strict end boundary, dropping the final complete window, and accepts invalid window sizes",
    behavioralRequirement: "emit each full size-wide average through the inclusive final starting index and return empty for invalid or oversized windows"
  },
  {
    name: "parse-env-assignment",
    symbol: "parseEnvAssignment",
    parameters: "line",
    prompt: "Parse one environment assignment at its first equals sign while validating the key and preserving the remaining value.",
    contract: "validated-key-first-equals-split",
    beforeBody: [
      "const [key, value] = line.split(\"=\");",
      "return { key, value };"
    ],
    fixedBody: [
      "const separator = line.indexOf(\"=\");",
      "if (separator < 1) return null;",
      "const key = line.slice(0, separator);",
      "if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;",
      "return { key, value: line.slice(separator + 1) };"
    ],
    visibleAssertions: [
      "assert.deepEqual(parseEnvAssignment(\"TOKEN=a=b\"), { key: \"TOKEN\", value: \"a=b\" });",
      "assert.equal(parseEnvAssignment(\"BAD KEY=x\"), null);"
    ],
    hiddenAssertions: [
      "assert.deepEqual(parseEnvAssignment(\"EMPTY=\"), { key: \"EMPTY\", value: \"\" });",
      "assert.equal(parseEnvAssignment(\"=missing\"), null);",
      "assert.equal(parseEnvAssignment(\"NO_EQUALS\"), null);"
    ],
    rootCause: "splitting on every equals sign truncates values and no environment-key validation is performed",
    behavioralRequirement: "split at the first equals sign, require a shell-style identifier key, preserve all remaining value characters, and return null for invalid assignments"
  },
  {
    name: "get-path-value",
    symbol: "getPathValue",
    parameters: "value, dottedPath",
    prompt: "Read a dotted own-property path safely without throwing or traversing prototype-sensitive keys.",
    contract: "own-properties-only-undefined-on-miss",
    beforeBody: [
      "return dottedPath.split(\".\").reduce((current, key) => current[key], value);"
    ],
    fixedBody: [
      "let current = value;",
      "for (const key of dottedPath.split(\".\")) {",
      "  if (!key || key === \"__proto__\" || key === \"prototype\" || key === \"constructor\") return undefined;",
      "  if (current === null || (typeof current !== \"object\" && typeof current !== \"function\")) return undefined;",
      "  if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;",
      "  current = current[key];",
      "}",
      "return current;"
    ],
    visibleAssertions: [
      "assert.equal(getPathValue({ user: { name: \"Ada\" } }, \"user.name\"), \"Ada\");",
      "assert.equal(getPathValue({ user: null }, \"user.name\"), undefined);"
    ],
    hiddenAssertions: [
      "assert.equal(getPathValue(Object.create({ inherited: 1 }), \"inherited\"), undefined);",
      "assert.equal(getPathValue({}, \"__proto__.polluted\"), undefined);",
      "assert.equal(getPathValue({ a: { b: 0 } }, \"a.b\"), 0);"
    ],
    rootCause: "blind property reduction throws on missing intermediates and permits inherited or prototype-sensitive traversal",
    behavioralRequirement: "walk non-empty dotted segments through own properties only, reject prototype-sensitive keys, and return undefined for any missing or unsafe segment"
  },
  {
    name: "apply-defaults",
    symbol: "applyDefaults",
    parameters: "defaults, value",
    prompt: "Apply defaults only when an incoming property is undefined while preserving null and other falsy values.",
    contract: "undefined-does-not-overwrite-default",
    beforeBody: [
      "return { ...defaults, ...value };"
    ],
    fixedBody: [
      "const output = { ...defaults };",
      "for (const [key, item] of Object.entries(value)) {",
      "  if (item !== undefined) output[key] = item;",
      "}",
      "return output;"
    ],
    visibleAssertions: [
      "assert.deepEqual(applyDefaults({ retries: 3, enabled: true }, { retries: undefined, enabled: false }), { retries: 3, enabled: false });"
    ],
    hiddenAssertions: [
      "assert.deepEqual(applyDefaults({ label: \"x\" }, { label: null }), { label: null });",
      "const defaults = { count: 1 }; const value = { count: 0 }; applyDefaults(defaults, value); assert.deepEqual(defaults, { count: 1 }); assert.deepEqual(value, { count: 0 });"
    ],
    rootCause: "object spread lets an explicitly undefined input erase a defined default",
    behavioralRequirement: "copy defaults, overlay every incoming value except undefined, preserve null and falsy values, and mutate neither input"
  },
  {
    name: "serialize-query",
    symbol: "serializeQuery",
    parameters: "value",
    prompt: "Serialize query fields deterministically with sorted keys, repeated array entries, and omitted nullish values.",
    contract: "sorted-repeated-url-search-params",
    beforeBody: [
      "return new URLSearchParams(value).toString();"
    ],
    fixedBody: [
      "const parameters = new URLSearchParams();",
      "for (const key of Object.keys(value).sort()) {",
      "  const items = Array.isArray(value[key]) ? value[key] : [value[key]];",
      "  for (const item of items) {",
      "    if (item !== null && item !== undefined) parameters.append(key, String(item));",
      "  }",
      "}",
      "return parameters.toString();"
    ],
    visibleAssertions: [
      "assert.equal(serializeQuery({ tag: [\"b\", \"a\"], q: \"hello world\" }), \"q=hello+world&tag=b&tag=a\");"
    ],
    hiddenAssertions: [
      "assert.equal(serializeQuery({ z: null, a: 0, b: false }), \"a=0&b=false\");",
      "assert.equal(serializeQuery({}), \"\");"
    ],
    rootCause: "passing an object directly to URLSearchParams preserves insertion order, comma-coerces arrays, and serializes nullish fields",
    behavioralRequirement: "sort keys, append one encoded entry per scalar or array member in array order, omit null and undefined, and use URLSearchParams encoding"
  },
  {
    name: "match-etag-list",
    symbol: "matchEtagList",
    parameters: "header, current",
    prompt: "Match an If-None-Match list using wildcard and weak ETag comparison semantics.",
    contract: "comma-list-wildcard-weak-comparison",
    beforeBody: [
      "return header === current;"
    ],
    fixedBody: [
      "const candidates = header.split(\",\").map((value) => value.trim()).filter(Boolean);",
      "if (candidates.includes(\"*\")) return true;",
      "const normalize = (value) => value.replace(/^W\\//, \"\");",
      "const expected = normalize(current.trim());",
      "return candidates.some((candidate) => normalize(candidate) === expected);"
    ],
    visibleAssertions: [
      "assert.equal(matchEtagList('\"old\", W/\"abc\"', '\"abc\"'), true);",
      "assert.equal(matchEtagList('\"old\"', '\"abc\"'), false);"
    ],
    hiddenAssertions: [
      "assert.equal(matchEtagList(\"*\", '\"anything\"'), true);",
      "assert.equal(matchEtagList('W/\"v1\"', 'W/\"v1\"'), true);"
    ],
    rootCause: "direct string equality ignores comma-separated candidates, optional whitespace, wildcard matching, and weak validators",
    behavioralRequirement: "split and trim the candidate list, match wildcard universally, and otherwise compare tags after removing an optional weak prefix"
  },
  {
    name: "choose-language",
    symbol: "chooseLanguage",
    parameters: "header, supported",
    prompt: "Select the highest-quality exactly supported language from an Accept-Language header.",
    contract: "quality-ranked-case-insensitive-selection",
    beforeBody: [
      "return header.split(\",\")[0].trim();"
    ],
    fixedBody: [
      "const ranked = header.split(\",\").map((entry, index) => {",
      "  const [tag, ...parameters] = entry.trim().split(\";\");",
      "  const qualityText = parameters.map((item) => item.trim()).find((item) => item.startsWith(\"q=\"));",
      "  const quality = qualityText ? Number(qualityText.slice(2)) : 1;",
      "  return { tag, quality: Number.isFinite(quality) ? quality : 0, index };",
      "}).filter((item) => item.tag && item.quality > 0).sort((left, right) => right.quality - left.quality || left.index - right.index);",
      "for (const item of ranked) {",
      "  if (item.tag === \"*\") return supported[0] ?? null;",
      "  const match = supported.find((language) => language.toLowerCase() === item.tag.toLowerCase());",
      "  if (match) return match;",
      "}",
      "return null;"
    ],
    visibleAssertions: [
      "assert.equal(chooseLanguage(\"fr;q=0.4, en;q=0.9\", [\"fr\", \"en\"]), \"en\");"
    ],
    hiddenAssertions: [
      "assert.equal(chooseLanguage(\"DE, en;q=0.5\", [\"de\", \"en\"]), \"de\");",
      "assert.equal(chooseLanguage(\"es;q=0, *;q=0.5\", [\"en\"]), \"en\");",
      "assert.equal(chooseLanguage(\"es\", [\"en\"]), null);"
    ],
    rootCause: "the first comma-separated token is returned without parsing quality values or checking the supported set",
    behavioralRequirement: "rank positive-quality entries stably, match supported languages case-insensitively, honor wildcard as the first supported language, and return null when nothing matches"
  },
  {
    name: "seconds-to-clock",
    symbol: "secondsToClock",
    parameters: "totalSeconds",
    prompt: "Format a non-negative integer duration as unbounded hours plus two-digit minutes and seconds.",
    contract: "hours-colon-two-digit-minute-second",
    beforeBody: [
      "const minutes = Math.floor(totalSeconds / 60);",
      "const seconds = totalSeconds % 60;",
      "return \"0:\" + String(minutes).padStart(2, \"0\") + \":\" + String(seconds).padStart(2, \"0\");"
    ],
    fixedBody: [
      "if (!Number.isInteger(totalSeconds) || totalSeconds < 0) return null;",
      "const hours = Math.floor(totalSeconds / 3600);",
      "const minutes = Math.floor(totalSeconds / 60) % 60;",
      "const seconds = totalSeconds % 60;",
      "return String(hours) + \":\" + String(minutes).padStart(2, \"0\") + \":\" + String(seconds).padStart(2, \"0\");"
    ],
    visibleAssertions: [
      "assert.equal(secondsToClock(3661), \"1:01:01\");"
    ],
    hiddenAssertions: [
      "assert.equal(secondsToClock(59), \"0:00:59\");",
      "assert.equal(secondsToClock(36000), \"10:00:00\");",
      "assert.equal(secondsToClock(-1), null);"
    ],
    rootCause: "all elapsed minutes are emitted under a hard-coded zero hour instead of separating hours and modulo-60 minutes",
    behavioralRequirement: "reject negative or fractional input and format floor-free integer seconds as H:MM:SS with unbounded hours"
  },
  {
    name: "intersect-ranges",
    symbol: "intersectRanges",
    parameters: "left, right",
    prompt: "Return the inclusive intersection of two closed numeric ranges, including a single shared endpoint.",
    contract: "closed-range-intersection-or-null",
    beforeBody: [
      "const start = Math.max(left[0], right[0]);",
      "const end = Math.min(left[1], right[1]);",
      "return start < end ? [start, end] : null;"
    ],
    fixedBody: [
      "const start = Math.max(left[0], right[0]);",
      "const end = Math.min(left[1], right[1]);",
      "return start <= end ? [start, end] : null;"
    ],
    visibleAssertions: [
      "assert.deepEqual(intersectRanges([1, 3], [3, 5]), [3, 3]);"
    ],
    hiddenAssertions: [
      "assert.deepEqual(intersectRanges([1, 5], [2, 4]), [2, 4]);",
      "assert.equal(intersectRanges([1, 2], [3, 4]), null);"
    ],
    rootCause: "a strict comparison treats one shared endpoint as empty even though both ranges are closed and inclusive",
    behavioralRequirement: "compute max start and min end, returning both when start is less than or equal to end and null only for a true gap"
  },
  {
    name: "parse-byte-range",
    symbol: "parseByteRange",
    parameters: "value, size",
    prompt: "Parse one closed HTTP byte range, clamp its end to resource size, and reject malformed or unsatisfiable ranges.",
    contract: "single-closed-byte-range-or-null",
    beforeBody: [
      "const [start, end] = value.replace(\"bytes=\", \"\").split(\"-\").map(Number);",
      "return { start, end };"
    ],
    fixedBody: [
      "if (!Number.isInteger(size) || size <= 0) return null;",
      "const match = /^bytes=([0-9]+)-([0-9]+)$/.exec(value);",
      "if (!match) return null;",
      "const start = Number(match[1]);",
      "const requestedEnd = Number(match[2]);",
      "if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start > requestedEnd || start >= size) return null;",
      "return { start, end: Math.min(requestedEnd, size - 1) };"
    ],
    visibleAssertions: [
      "assert.deepEqual(parseByteRange(\"bytes=2-5\", 10), { start: 2, end: 5 });",
      "assert.deepEqual(parseByteRange(\"bytes=8-20\", 10), { start: 8, end: 9 });"
    ],
    hiddenAssertions: [
      "assert.equal(parseByteRange(\"bytes=5-2\", 10), null);",
      "assert.equal(parseByteRange(\"items=1-2\", 10), null);",
      "assert.equal(parseByteRange(\"bytes=10-12\", 10), null);"
    ],
    rootCause: "prefix replacement and numeric coercion accept malformed, reversed, and out-of-bounds ranges without validation or clamping",
    behavioralRequirement: "accept exactly bytes=start-end with safe inclusive integers, reject reversed or unsatisfiable starts, clamp end to size minus one, and return null for invalid input"
  }
];

if (newTaskSpecs.length !== 25 || new Set(newTaskSpecs.map((spec) => spec.name)).size !== 25 || new Set(newTaskSpecs.map((spec) => spec.symbol)).size !== 25) {
  throw new Error(`Expected 25 genuinely new tasks with unique names and symbols, got ${newTaskSpecs.length}`);
}

const legacyPairs = legacyIds.map(enrichLegacyPair);
const newTasks: JsonObject[] = [];
const newOracles: JsonObject[] = [];
for (const [index, spec] of newTaskSpecs.entries()) {
  const sourcePath = `src/${spec.name}.mjs`;
  const visibleTestPath = `test/${spec.name}.visible.test.mjs`;
  const hiddenTestPath = `test/${spec.name}.hidden.test.mjs`;
  const before = moduleSource(spec, spec.beforeBody);
  const fixed = moduleSource(spec, spec.fixedBody);
  const range = exactFunctionRange(before, spec.symbol);
  const fixedRange = exactFunctionRange(fixed, spec.symbol);
  if (before === fixed || rangeText(before, range) === rangeText(fixed, fixedRange)) {
    throw new Error(`New fixture ${spec.name} has no behavioral source mutation`);
  }
  const taskId = `patch-interface-dev-new-${String(index + 1).padStart(2, "0")}-${spec.name}-${sha256(`${spec.name}:patch-interface-development-v1`).slice(0, 10)}`;
  const visible = testSource(spec, sourcePath, "visible", spec.visibleAssertions);
  const hidden = testSource(spec, sourcePath, "hidden", spec.hiddenAssertions);

  newTasks.push({
    task_id: taskId,
    dataset_role: "DEVELOPMENT_ONLY",
    repository_id: `patch-interface-fixture-${spec.name}`,
    repository_commit: sha256(before),
    ecosystem: "node-esm-no-dependencies",
    category: "behavioral_patch",
    task_family: spec.name,
    difficulty: index % 4 === 0 ? "L3" : "L2",
    prompt: spec.prompt,
    expected_outcome: "PATCH_PROPOSAL",
    allowed_files: [sourcePath],
    visible_files: [{ path: sourcePath, content: before }, { path: visibleTestPath, content: visible }],
    trusted_visible_command: ["/usr/bin/node", "--test", visibleTestPath],
    changed_line_budget: 32,
    mutation_certification: "SAFE_MUTATION_REQUIRED",
    relevant_range_1_based: range,
    provenance: "independently authored executable patch-interface development microrepository with visible and hidden behavioral oracles",
    patch_interface_source_provenance: {
      kind: "INDEPENDENTLY_AUTHORED_FOR_PATCH_INTERFACE_DEVELOPMENT_V1",
      derived_from_g3_or_holdout: false,
      future_holdout_eligible: false,
      authoring_basis: "new dependency-free Node ESM behavior fixture; not transformed from G3, holdout, or historical patch content"
    }
  });
  newOracles.push({
    task_id: taskId,
    exact_relevant_file: sourcePath,
    exact_relevant_symbol: spec.symbol,
    exact_relevant_range_1_based: range,
    root_cause: spec.rootCause,
    behavioral_requirement: spec.behavioralRequirement,
    original_source_sha256: sha256(before),
    relevant_range_source_sha256: sha256(rangeText(before, range)),
    fixed_source_sha256: sha256(fixed),
    reference_fixed_source: fixed,
    reference_fixed_range_1_based: fixedRange,
    hidden_files: [{ path: hiddenTestPath, content: hidden }],
    trusted_hidden_command: ["/usr/bin/node", "--test", hiddenTestPath],
    mutation_certification: {
      classification: "SAFE_MUTATION_REQUIRED",
      certified: true,
      reason: "This synthetic development fixture has one allowlisted source, a known behavioral defect, and independent visible and hidden local oracles.",
      deterministic_runtime_controls: mutationRuntimeControls
    },
    patch_interface_source_provenance: {
      kind: "INDEPENDENTLY_AUTHORED_FOR_PATCH_INTERFACE_DEVELOPMENT_V1",
      derived_from_g3_or_holdout: false,
      future_holdout_eligible: false
    },
    success_requires: [
      "bounded edit accepted in isolated worktree",
      "syntax check PASS",
      "visible test PASS",
      "hidden behavioral test PASS",
      "no forbidden or wrong-file edit",
      "no unrelated neighboring-surface regression",
      "clean rollback"
    ]
  });
}

const tasks = [...legacyPairs.map((pair) => pair.task), ...newTasks];
const oracleRows = [...legacyPairs.map((pair) => pair.oracle), ...newOracles];
const taskIds = tasks.map((task) => requiredString(task, "task_id"));
const oracleIds = oracleRows.map((row) => requiredString(row, "task_id"));
if (tasks.length !== 50 || oracleRows.length !== 50 || new Set(taskIds).size !== 50) {
  throw new Error(`Patch-interface corpus integrity failure: tasks=${tasks.length}, oracles=${oracleRows.length}, unique=${new Set(taskIds).size}`);
}
if (JSON.stringify(taskIds) !== JSON.stringify(oracleIds)) throw new Error("Task and oracle order/identity mismatch");
if (taskIds.slice(0, 25).some((taskId, index) => taskId !== legacyIds[index])) throw new Error("Legacy task IDs or ordering changed");
if (taskIds.slice(25).some((taskId) => taskId.includes("g3") || taskId.includes("holdout"))) throw new Error("New development IDs may not claim G3 or holdout provenance");

for (let index = 0; index < 25; index += 1) {
  const originalTask = legacyTaskById.get(legacyIds[index])!;
  const originalOracle = legacyOracleById.get(legacyIds[index])!;
  const enrichedTask = { ...tasks[index] };
  const enrichedOracle = { ...oracleRows[index] };
  delete enrichedTask.mutation_certification;
  delete enrichedTask.relevant_range_1_based;
  delete enrichedTask.patch_interface_source_provenance;
  delete enrichedOracle.exact_relevant_range_1_based;
  delete enrichedOracle.original_source_sha256;
  delete enrichedOracle.relevant_range_source_sha256;
  delete enrichedOracle.mutation_certification;
  delete enrichedOracle.patch_interface_source_provenance;
  if (JSON.stringify(enrichedTask) !== JSON.stringify(originalTask) || JSON.stringify(enrichedOracle) !== JSON.stringify(originalOracle)) {
    throw new Error(`Legacy metadata enrichment changed immutable behavioral content for ${legacyIds[index]}`);
  }
}

await mkdir(outputRoot, { recursive: true });
async function writeImmutable(name: string, value: object): Promise<{ path: string; sha256: string }> {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(outputRoot, name);
  await writeFile(target, body, { flag: "wx" });
  await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
  return { path: `benchmarks/patch-interface/${name}`, sha256: sha256(body) };
}

const sourceProvenance = {
  legacySelection: { path: legacySelectionArtifact.path, sha256: legacySelectionArtifact.sha256, taskIdsSha256: legacySelectionArtifact.value.phases.patchOnly.taskIdsSha256 },
  legacyManifest: { path: legacyManifestArtifact.path, sha256: legacyManifestArtifact.sha256 },
  legacyOracle: { path: legacyOracleArtifact.path, sha256: legacyOracleArtifact.sha256 },
  legacyReuse: {
    tasks: 25,
    policy: "METADATA_ONLY_ENRICHMENT_FROM_IMMUTABLE_G4_V2",
    unchanged: "IDs, prompts, sources, visible tests, hidden tests, commands, budgets, diagnoses, requirements, and reference fixes",
    addedMetadata: ["mutation certification", "exact 1-based symbol range", "original source hash", "relevant-range hash", "provenance"]
  },
  newTaskAuthoring: {
    tasks: 25,
    policy: "INDEPENDENT_PATCH_INTERFACE_DEVELOPMENT_AUTHORING",
    dependencyPolicy: "NODE_ESM_STANDARD_LIBRARY_ONLY",
    derivedFromG3: false,
    derivedFromHoldout: false,
    derivedFromHistoricalPatch: false
  }
};

const manifestBody = {
  schemaVersion: 1,
  suiteId: "dca-patch-interface-development-v1",
  authoringRevision: 1,
  classification: "DEVELOPMENT_ONLY_NEVER_FUTURE_HOLDOUT",
  state: "IMMUTABLE_GENERATOR_OUTPUT",
  sourceProvenance,
  contaminationPolicy: {
    developmentOnly: true,
    mayTunePatchInterfaces: true,
    mayClaimUnseenGeneralization: false,
    mayEnterFutureHoldout: false,
    reusesG3Tasks: false,
    reusesHoldoutTasks: false,
    futureHoldoutMustBeCreatedOnlyAfterCandidateFreeze: true
  },
  corpus: {
    tasks: tasks.length,
    reusedG4PatchTasks: legacyPairs.length,
    newBehavioralMutationTasks: newTasks.length,
    ecosystems: { "node-esm-no-dependencies": tasks.length },
    allowedFilesPerTask: 1,
    visibleBehaviorOraclePerTask: 1,
    hiddenBehaviorOraclePerTask: 1,
    uniqueTaskIds: new Set(taskIds).size,
    uniqueNewSymbols: new Set(newTaskSpecs.map((spec) => spec.symbol)).size
  },
  safeMutationCertification: {
    classification: "SAFE_MUTATION_REQUIRED",
    taskIds,
    taskIdsSha256: sha256(JSON.stringify(taskIds)),
    basis: [
      "all tasks are development-only dependency-free local fixtures",
      "all tasks require one allowlisted source mutation",
      "all tasks have an exact source symbol and bounded line range",
      "all tasks have trusted visible and hidden behavioral commands",
      "deterministic runtime protections remain mandatory"
    ]
  },
  tasks,
  taskPayloadSha256: sha256(JSON.stringify(tasks))
};

const manifest = await writeImmutable("PATCH_INTERFACE_DEVELOPMENT_MANIFEST.v1.json", manifestBody);
const oracle = await writeImmutable("PATCH_INTERFACE_DEVELOPMENT_ORACLE.v1.sealed.json", {
  schemaVersion: 1,
  suiteId: "dca-patch-interface-development-v1",
  authoringRevision: 1,
  classification: "DEVELOPMENT_ONLY_NEVER_FUTURE_HOLDOUT",
  visibility: "HIDDEN_FROM_MODEL_EXCEPT_EXPLICIT_ORACLE_CONDITIONS",
  manifestSha256: manifest.sha256,
  sourceProvenance,
  rows: oracleRows,
  oraclePayloadSha256: sha256(JSON.stringify(oracleRows))
});

process.stdout.write(`${JSON.stringify({
  status: "PASS_IMMUTABLE_DEVELOPMENT_CORPUS_WRITTEN",
  manifest,
  oracle,
  tasks: tasks.length,
  reusedG4PatchTasks: legacyPairs.length,
  newBehavioralMutationTasks: newTasks.length,
  futureHoldoutCreated: false,
  protectedActions: { modelCall: false, modelDownload: false, commit: false, remote: false, push: false, pullRequest: false, tag: false, signing: false, release: false }
}, null, 2)}\n`);
