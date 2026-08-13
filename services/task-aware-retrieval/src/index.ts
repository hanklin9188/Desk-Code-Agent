import { createHash } from "node:crypto";

export type AtomicEvidenceClass = "SYMBOL" | "TEST" | "DOCUMENTATION" | "METADATA" | "BUILD" | "ARCHITECTURE" | "GIT";
export type EvidenceNeed = AtomicEvidenceClass | "MIXED";
export type RetrievalPolicy = "R0_EMIN_V2_SYMBOL_TOP_2" | "R1_TASK_AWARE_FIXED" | "R2_TASK_AWARE_ONE_FALLBACK" | "R3_TASK_AWARE_HYBRID";

export interface EvidenceRequest {
  schemaVersion: 1;
  primary: AtomicEvidenceClass;
  classes: AtomicEvidenceClass[];
  kind: EvidenceNeed;
  declaredSymbols: string[];
  maxPrimaryItems: number;
  maxFallbackRounds: 1;
  maxTotalItems: number;
  reasons: string[];
}

export interface TaskAwareCandidate {
  id: string;
  path: string;
  content: string;
  evidenceClass: AtomicEvidenceClass;
  symbols?: string[];
  centrality?: number;
  relatedPaths?: string[];
}

export interface SelectedEvidence extends TaskAwareCandidate {
  rank: number;
  score: number;
  stage: "PRIMARY" | "FALLBACK";
  family: AtomicEvidenceClass | "HYBRID";
  reasons: string[];
  estimatedTokens: number;
}

export interface EvidenceCoverageItem {
  evidenceClass: AtomicEvidenceClass;
  satisfied: boolean;
  selectedPaths: string[];
}

export interface EvidenceCoverage {
  schemaVersion: 1;
  requested: AtomicEvidenceClass[];
  items: EvidenceCoverageItem[];
  complete: boolean;
  missing: AtomicEvidenceClass[];
  ratio: number;
}

export interface RetrievalResult {
  schemaVersion: 1;
  policy: Exclude<RetrievalPolicy, "R0_EMIN_V2_SYMBOL_TOP_2">;
  request: EvidenceRequest;
  primary: SelectedEvidence[];
  fallback: SelectedEvidence[];
  selected: SelectedEvidence[];
  coverageBeforeFallback: EvidenceCoverage;
  coverage: EvidenceCoverage;
  fallbackRounds: 0 | 1;
  stoppedBecause: "COMPLETE" | "FALLBACK_EXHAUSTED" | "PRIMARY_ONLY_POLICY";
  latencyMs: number;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "do", "does", "explain", "find", "for", "from", "how", "i", "identify", "in", "is", "it", "locate", "of", "on", "or", "project", "repository", "repo", "the", "this", "to", "use", "what", "where", "which", "why", "with"
]);

const CLASS_PATTERNS: Record<AtomicEvidenceClass, readonly RegExp[]> = {
  TEST: [/\btests?\b/i, /\bspecs?\b/i, /\bfailing\b/i, /\bpytest\b/i, /\bjest\b/i, /\bvitest\b/i, /\bava\b/i, /\btest runner\b/i, /\bcoverage\b/i],
  DOCUMENTATION: [/\breadme\b/i, /\bdocs?\b/i, /\bdocumentation\b/i, /\busage\b/i, /\bonboard/i, /\bgetting started\b/i, /\bcontribut/i, /\bhow (?:do|can|to)\b/i, /\bproject purpose\b/i],
  METADATA: [/\blicen[cs]e\b/i, /\bcopying\b/i, /\bnotice\b/i, /\bcopyright\b/i, /\bversion\b/i, /\bpackage metadata\b/i, /\bmanifest\b/i, /\bdependencies\b/i, /\bdependency version\b/i],
  BUILD: [/\bbuild\b/i, /\bci\b/i, /\bworkflow\b/i, /\bdocker\b/i, /\bcompose\b/i, /\bmakefile\b/i, /\bcmake\b/i, /\binstall\b/i, /\brun (?:the )?(?:app|service|project|repo)\b/i, /\bscript\b/i, /\benvironment\b/i, /\bcompile\b/i],
  ARCHITECTURE: [/\barchitecture\b/i, /\bentry ?point\b/i, /\bdependency graph\b/i, /\bcentral module\b/i, /\bmodule (?:flow|boundary|relationship)\b/i, /\bcross[- ]module\b/i, /\brequest flow\b/i, /\bmultiple source files\b/i],
  GIT: [/\bgit\b/i, /\bcommit\b/i, /\bhistory\b/i, /\bblame\b/i, /\bintroduced\b/i, /\bregression commit\b/i],
  SYMBOL: [/\bfunction\b/i, /\bclass\b/i, /\bmethod\b/i, /\bcaller\b/i, /\bcallee\b/i, /\bimplementation\b/i, /\bdefined\b/i, /\bfix\b/i, /\bhandler\b/i, /\bhelper\b/i]
};

const CLASS_PRIORITY: readonly AtomicEvidenceClass[] = ["METADATA", "DOCUMENTATION", "BUILD", "TEST", "ARCHITECTURE", "GIT", "SYMBOL"];

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function tokenize(value: string): string[] {
  return unique(value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .map((item) => item.replace(/^[-_.]+|[-_.]+$/g, ""))
    .filter((item) => item.length > 1 && !STOP_WORDS.has(item)));
}

function inferredSymbols(task: string): string[] {
  const codeLike = task.match(/\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?\b/g) ?? [];
  return unique(codeLike.filter((item) => (
    item.includes("_") || item.includes(".") || /[a-z][A-Z]/.test(item)
  ) && !item.includes(".md") && !item.includes(".json") && !item.includes(".toml"))).slice(0, 8);
}

/** Deterministic and bounded. It never reads candidate or oracle contents. */
export function classifyEvidenceNeed(input: { task: string; declaredSymbols?: string[] }): EvidenceRequest {
  const declaredSymbols = unique([...(input.declaredSymbols ?? []), ...inferredSymbols(input.task)]).slice(0, 8);
  const matched = CLASS_PRIORITY.filter((evidenceClass) => CLASS_PATTERNS[evidenceClass].some((pattern) => pattern.test(input.task)));
  // Symbols narrow a family query; they do not by themselves prove that source evidence is required.
  if (matched.length === 0) matched.push("SYMBOL");

  // Running/installing normally needs both human instructions and an executable build contract.
  if (/\b(?:install|run|start|getting started|onboard)\b/i.test(input.task)) {
    if (!matched.includes("DOCUMENTATION")) matched.unshift("DOCUMENTATION");
    if (!matched.includes("BUILD")) matched.push("BUILD");
  }
  // A failing CI task is incomplete without both the workflow/build seam and the test signal.
  if (/\bci\b/i.test(input.task) && /\b(?:fail|test|check)\w*\b/i.test(input.task)) {
    if (!matched.includes("BUILD")) matched.unshift("BUILD");
    if (!matched.includes("TEST")) matched.push("TEST");
  }
  // A requested source/test mapping is explicitly a two-class evidence need.
  if (/\b(?:source.?test|test.?source|corresponding test|associated test)\b/i.test(input.task)) {
    if (!matched.includes("SYMBOL")) matched.unshift("SYMBOL");
    if (!matched.includes("TEST")) matched.push("TEST");
  }

  let classes = unique(matched).slice(0, 3);
  if (classes.includes("SYMBOL") && /\b(?:fix|repair|implement|implementation|function|class|method|caller|callee)\b/i.test(input.task)) {
    classes = ["SYMBOL", ...classes.filter((item) => item !== "SYMBOL")];
  } else if (classes.includes("BUILD") && /\bci\b/i.test(input.task)) {
    classes = ["BUILD", ...classes.filter((item) => item !== "BUILD")];
  }
  const reasons = classes.map((evidenceClass) => `${evidenceClass}:task-pattern`);
  if (declaredSymbols.length > 0) reasons.push("SYMBOL:declared-or-code-like-identifier");
  return {
    schemaVersion: 1,
    primary: classes[0],
    classes,
    kind: classes.length > 1 ? "MIXED" : classes[0],
    declaredSymbols,
    maxPrimaryItems: 2,
    maxFallbackRounds: 1,
    maxTotalItems: 3,
    reasons
  };
}

const CANONICAL_PATHS: Record<AtomicEvidenceClass, readonly RegExp[]> = {
  SYMBOL: [/\b(?:src|lib|app|packages?)\//i, /\.(?:ts|tsx|js|jsx|py|rs|go|java|c|cc|cpp|h)$/i],
  TEST: [/(?:^|\/)(?:tests?|__tests__|spec)(?:\/|$)/i, /(?:test|spec)\.[^.]+$/i, /pytest\.ini$/i],
  DOCUMENTATION: [/(?:^|\/)readme(?:\.[^/]+)?$/i, /(?:^|\/)docs?\//i, /(?:^|\/)contributing(?:\.[^/]+)?$/i],
  METADATA: [/(?:^|\/)(?:license|copying|notice)(?:\.[^/]+)?$/i, /(?:^|\/)(?:package\.json|pyproject\.toml|cargo\.toml|setup\.cfg)$/i],
  BUILD: [/(?:^|\/)(?:makefile|cmakelists\.txt|dockerfile)$/i, /(?:^|\/)(?:docker-)?compose[^/]*\.ya?ml$/i, /(?:^|\/)\.github\/workflows\//i, /(?:^|\/)(?:package\.json|pyproject\.toml|cargo\.toml|vite\.config\.[^/]+|vitest\.config\.[^/]+|tox\.ini)$/i],
  ARCHITECTURE: [/(?:^|\/)(?:main|index|app|server|cli)\.[^/]+$/i, /(?:^|\/)docs?\/(?:architecture|design)/i],
  GIT: [/(?:^|\/)\.git(?:\/|$)/i, /(?:^|\/)(?:changelog|changes)(?:\.[^/]+)?$/i]
};

function familyScore(candidate: TaskAwareCandidate, evidenceClass: AtomicEvidenceClass, taskTokens: string[], symbols: string[]): { score: number; reasons: string[] } {
  const pathValue = candidate.path.toLowerCase();
  const contentValue = candidate.content.toLowerCase();
  const reasons: string[] = [];
  let score = candidate.evidenceClass === evidenceClass ? 7 : -5;
  if (candidate.evidenceClass === evidenceClass) reasons.push("evidence-class");
  const canonicalHits = CANONICAL_PATHS[evidenceClass].filter((pattern) => pattern.test(candidate.path)).length;
  if (canonicalHits) { score += canonicalHits * 7; reasons.push("canonical-path"); }
  const pathHits = taskTokens.filter((token) => pathValue.includes(token)).length;
  const contentHits = taskTokens.filter((token) => contentValue.includes(token)).length;
  if (pathHits) { score += pathHits * 3; reasons.push("path-match"); }
  if (contentHits) { score += Math.min(8, contentHits * 1.25); reasons.push("lexical-match"); }
  const candidateSymbols = unique([...(candidate.symbols ?? []), ...symbols]);
  const exactSymbolHits = symbols.filter((symbol) => {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (candidate.symbols ?? []).includes(symbol) || new RegExp(`\\b${escaped}\\b`, "i").test(candidate.content);
  }).length;
  if (evidenceClass === "SYMBOL" && exactSymbolHits) { score += exactSymbolHits * 12; reasons.push("exact-symbol"); }
  if (evidenceClass === "SYMBOL") {
    const indexedDefinitions = symbols.filter((symbol) => (candidate.symbols ?? []).includes(symbol)).length;
    const syntacticDefinitions = symbols.filter((symbol) => {
      const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b(?:function|class|const|let|var)\\s+${escaped}\\b|\\b${escaped}\\s*\\(`, "i").test(candidate.content);
    }).length;
    if (indexedDefinitions) { score += indexedDefinitions * 10; reasons.push("indexed-definition"); }
    if (syntacticDefinitions) { score += syntacticDefinitions * 6; reasons.push("syntactic-definition"); }
  }
  if (evidenceClass === "TEST" && symbols.some((symbol) => pathValue.includes(symbol.toLowerCase()) || contentValue.includes(symbol.toLowerCase()))) {
    score += 8; reasons.push("source-test-affinity");
  }
  if (evidenceClass === "ARCHITECTURE" && candidate.centrality !== undefined) {
    score += Math.max(0, Math.min(1, candidate.centrality)) * 6; reasons.push("graph-centrality");
  }
  if (candidate.relatedPaths?.some((related) => taskTokens.some((token) => related.toLowerCase().includes(token)))) {
    score += 4; reasons.push("graph-proximity");
  }
  const taskRequestsCurrent = taskTokens.some((token) => ["active", "current", "authoritative", "non-archived"].includes(token));
  const explicitlyStale = /(?:legacy|archive|obsolete|stale|old)/i.test(candidate.path)
    || /^\s*(?:#|\/\/)?\s*(?:legacy|archived|obsolete|stale|old)\b/im.test(candidate.content);
  if (taskRequestsCurrent && explicitlyStale) {
    score -= 14; reasons.push("stale-evidence-penalty");
  }
  if (candidateSymbols.length === 0 && taskTokens.length === 0) score -= 1;
  return { score, reasons };
}

function rankFamily(input: { evidenceClass: AtomicEvidenceClass; task: string; symbols: string[]; candidates: TaskAwareCandidate[]; limit: number; stage: "PRIMARY" | "FALLBACK" }): SelectedEvidence[] {
  const taskTokens = tokenize(input.task);
  return input.candidates
    .filter((candidate) => candidate.evidenceClass === input.evidenceClass)
    .map((candidate, index) => ({ candidate, index, ...familyScore(candidate, input.evidenceClass, taskTokens, input.symbols) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index || a.candidate.path.localeCompare(b.candidate.path))
    .slice(0, input.limit)
    .map((item, index) => ({
      ...item.candidate,
      rank: index + 1,
      score: Number(item.score.toFixed(4)),
      stage: input.stage,
      family: input.evidenceClass,
      reasons: item.reasons,
      estimatedTokens: Math.max(1, Math.ceil(item.candidate.content.length / 4))
    }));
}

function deduplicate(items: SelectedEvidence[], maxItems: number): SelectedEvidence[] {
  const seen = new Set<string>();
  const result: SelectedEvidence[] = [];
  for (const item of items) {
    const fingerprint = `${item.path}\0${createHash("sha256").update(item.content).digest("hex")}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push({ ...item, rank: result.length + 1 });
    if (result.length >= maxItems) break;
  }
  return result;
}

export function scoreEvidenceCoverage(requested: readonly AtomicEvidenceClass[], selected: readonly TaskAwareCandidate[]): EvidenceCoverage {
  const items = requested.map((evidenceClass) => ({
    evidenceClass,
    satisfied: selected.some((item) => item.evidenceClass === evidenceClass),
    selectedPaths: selected.filter((item) => item.evidenceClass === evidenceClass).map((item) => item.path)
  }));
  const missing = items.filter((item) => !item.satisfied).map((item) => item.evidenceClass);
  return {
    schemaVersion: 1,
    requested: [...requested],
    items,
    complete: missing.length === 0,
    missing,
    ratio: items.length === 0 ? 1 : (items.length - missing.length) / items.length
  };
}

function retrieveFixed(request: EvidenceRequest, task: string, candidates: TaskAwareCandidate[]): SelectedEvidence[] {
  const selections: SelectedEvidence[] = [];
  // Round-robin gives every requested evidence class one chance before any second item.
  for (const evidenceClass of request.classes) {
    const best = rankFamily({ evidenceClass, task, symbols: request.declaredSymbols, candidates, limit: 1, stage: "PRIMARY" })[0];
    if (best) selections.push(best);
    if (selections.length === request.maxPrimaryItems) break;
  }
  // A single evidence need gets one best item. Top-2 is a ceiling, not a quota.
  return deduplicate(selections, request.maxPrimaryItems);
}

function retrieveHybrid(request: EvidenceRequest, task: string, candidates: TaskAwareCandidate[]): SelectedEvidence[] {
  const pools = request.classes.flatMap((evidenceClass) => rankFamily({ evidenceClass, task, symbols: request.declaredSymbols, candidates, limit: 3, stage: "PRIMARY" }));
  const classDiversity = new Set<AtomicEvidenceClass>();
  const ordered = [...pools].sort((a, b) => b.score - a.score || request.classes.indexOf(a.evidenceClass) - request.classes.indexOf(b.evidenceClass) || a.path.localeCompare(b.path));
  const diverse: SelectedEvidence[] = [];
  for (const item of ordered) {
    if (classDiversity.has(item.evidenceClass) && classDiversity.size < request.classes.length) continue;
    classDiversity.add(item.evidenceClass);
    diverse.push({ ...item, family: "HYBRID" });
    if (diverse.length === request.maxPrimaryItems) break;
  }
  return deduplicate(diverse, request.maxPrimaryItems);
}

export function retrieveTaskAware(input: { policy: "R1_TASK_AWARE_FIXED" | "R2_TASK_AWARE_ONE_FALLBACK" | "R3_TASK_AWARE_HYBRID"; task: string; declaredSymbols?: string[]; candidates: TaskAwareCandidate[] }): RetrievalResult {
  const started = performance.now();
  const request = classifyEvidenceNeed({ task: input.task, declaredSymbols: input.declaredSymbols });
  const primary = input.policy === "R3_TASK_AWARE_HYBRID" ? retrieveHybrid(request, input.task, input.candidates) : retrieveFixed(request, input.task, input.candidates);
  const coverageBeforeFallback = scoreEvidenceCoverage(request.classes, primary);
  const fallback: SelectedEvidence[] = [];
  const permitsFallback = input.policy !== "R1_TASK_AWARE_FIXED";
  if (permitsFallback && !coverageBeforeFallback.complete) {
    const missingClass = coverageBeforeFallback.missing[0];
    const candidate = rankFamily({ evidenceClass: missingClass, task: input.task, symbols: request.declaredSymbols, candidates: input.candidates.filter((item) => !primary.some((selected) => selected.path === item.path)), limit: 1, stage: "FALLBACK" })[0];
    if (candidate) fallback.push(candidate);
  }
  const selected = deduplicate([...primary, ...fallback], request.maxTotalItems);
  const coverage = scoreEvidenceCoverage(request.classes, selected);
  return {
    schemaVersion: 1,
    policy: input.policy,
    request,
    primary,
    fallback,
    selected,
    coverageBeforeFallback,
    coverage,
    fallbackRounds: fallback.length > 0 ? 1 : 0,
    stoppedBecause: !permitsFallback ? "PRIMARY_ONLY_POLICY" : coverage.complete ? "COMPLETE" : "FALLBACK_EXHAUSTED",
    latencyMs: performance.now() - started
  };
}

function redactUntrusted(value: string): string {
  return value
    .replace(/(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]");
}

export interface MinimalContextPackage {
  schemaVersion: 1;
  variant: "C1" | "C1_PLUS";
  content: string;
  includedPaths: string[];
  omittedPaths: string[];
  estimatedTokens: number;
  primaryEvidenceTokens: number;
  supportingEvidenceTokens: number;
}

export function packageMinimalContext(input: { task: string; evidence: SelectedEvidence[]; hardTokenCap: number }): MinimalContextPackage {
  if (!Number.isInteger(input.hardTokenCap) || input.hardTokenCap < 128) throw new Error("Context hard token cap must be an integer >= 128");
  const evidence = deduplicate(input.evidence, input.evidence.length);
  const isPlus = new Set(evidence.map((item) => item.evidenceClass)).size > 1;
  let content = `TASK\n${input.task}`;
  const included: SelectedEvidence[] = [];
  const hardCharacterCap = input.hardTokenCap * 4;
  const fixedOverhead = content.length + evidence.length * 96;
  const perItemContentCap = evidence.length === 0 ? 0 : Math.max(32, Math.floor((hardCharacterCap - fixedOverhead) / evidence.length));
  for (const item of evidence) {
    const label = included.length === 0 ? "PRIMARY EVIDENCE" : "SUPPORTING EVIDENCE";
    const redacted = redactUntrusted(item.content);
    const excerpt = redacted.length > perItemContentCap ? `${redacted.slice(0, Math.max(0, perItemContentCap - 22))}\n[TRUNCATED BY BUDGET]` : redacted;
    const section = `${label}\n[${item.path}:1-${Math.max(1, excerpt.split(/\r?\n/).length)}]\n${excerpt}`;
    const next = `${content}\n\n${section}`;
    if (Math.ceil(next.length / 4) > input.hardTokenCap) continue;
    content = next;
    included.push(item);
  }
  const tokens = (value: string) => value.length === 0 ? 0 : Math.max(1, Math.ceil(value.length / 4));
  return {
    schemaVersion: 1,
    variant: isPlus ? "C1_PLUS" : "C1",
    content,
    includedPaths: included.map((item) => item.path),
    omittedPaths: evidence.filter((item) => !included.includes(item)).map((item) => item.path),
    estimatedTokens: tokens(content),
    primaryEvidenceTokens: tokens(included[0]?.content ?? ""),
    supportingEvidenceTokens: tokens(included.slice(1).map((item) => item.content).join("\n"))
  };
}
