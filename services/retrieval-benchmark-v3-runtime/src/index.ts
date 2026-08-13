import { createHash } from "node:crypto";
import type { AtomicEvidenceClass, TaskAwareCandidate } from "../../task-aware-retrieval/src/index";

export type BenchmarkEvidenceRequirement = Exclude<AtomicEvidenceClass, "GIT"> | "MIXED";
export type BenchmarkAnswer = "A" | "B" | "C";
export type BenchmarkDifficulty = "L1" | "L2" | "L3";
export type BenchmarkTaskCategory = "Coding" | "Diagnosis" | "Navigation" | "Analysis";

export interface RetrievalBenchmarkTask {
  id: string;
  suiteId: string;
  classification: "DEVELOPMENT_TUNING_NOT_HOLDOUT";
  evidenceRequirement: BenchmarkEvidenceRequirement;
  requestedEvidenceClasses: AtomicEvidenceClass[];
  taskCategory: BenchmarkTaskCategory;
  difficulty: BenchmarkDifficulty;
  task: string;
  declaredSymbols: string[];
  candidates: TaskAwareCandidate[];
  options: Record<BenchmarkAnswer, string>;
}

export interface RetrievalBenchmarkOracle {
  taskId: string;
  expected: BenchmarkAnswer;
  requiredEvidenceSet: string[];
  requiredEvidenceClasses: AtomicEvidenceClass[];
  rationale: string;
}

const ANSWERS = ["A", "B", "C"] as const;
const TOKENS = ["amber", "birch", "cobalt", "delta", "ember", "fjord", "granite", "harbor", "indigo", "juniper", "kepler", "lumen", "marble", "nebula", "onyx", "prairie"] as const;
const SYMBOLS = ["load_config", "mergeLedger", "SessionClock", "route_packet", "QuotaWindow", "parseEnvelope", "normalize_claim", "AuditTrail"] as const;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const rotateOptions = (index: number, correct: string, wrongOne: string, wrongTwo: string): { options: Record<BenchmarkAnswer, string>; expected: BenchmarkAnswer } => {
  const expected = ANSWERS[index % ANSWERS.length];
  const ordered = expected === "A" ? [correct, wrongOne, wrongTwo] : expected === "B" ? [wrongOne, correct, wrongTwo] : [wrongOne, wrongTwo, correct];
  return { options: { A: ordered[0], B: ordered[1], C: ordered[2] }, expected };
};

function baseCandidates(index: number, symbol: string, correct: string, required: readonly AtomicEvidenceClass[]): TaskAwareCandidate[] {
  const token = TOKENS[index % TOKENS.length];
  const decision = (evidenceClass: AtomicEvidenceClass) => required.includes(evidenceClass) ? correct : `unsupported-${evidenceClass.toLowerCase()}-${token}`;
  return [
    { id: `${token}-legacy-source`, path: `src/legacy/${token}_handler.ts`, content: `// stale comment: ${symbol} is implemented here\nexport function legacy_${symbol}() { return "deprecated"; }`, evidenceClass: "SYMBOL", symbols: [`legacy_${symbol}`], centrality: 0.1 },
    { id: `${token}-utility-source`, path: `src/shared/${token}_helpers.ts`, content: `export const ${token}Helper = () => "unrelated"; // mentions ${symbol}`, evidenceClass: "SYMBOL", symbols: [`${token}Helper`], centrality: 0.25 },
    { id: `${token}-symbol`, path: `src/core/${symbol}.ts`, content: `export function ${symbol}(input: string) { return input.trim(); }\nBehavior decision: ${decision("SYMBOL")}.`, evidenceClass: "SYMBOL", symbols: [symbol], centrality: 0.72, relatedPaths: [`tests/core/${symbol}.test.ts`] },
    { id: `${token}-test`, path: `tests/core/${symbol}.test.ts`, content: `describe("${symbol}", () => { it("covers the boundary", () => expect(true).toBe(true)); });\nRequired test decision: ${decision("TEST")}.`, evidenceClass: "TEST", symbols: [symbol], relatedPaths: [`src/core/${symbol}.ts`] },
    { id: `${token}-readme`, path: "README.md", content: `# ${token} workspace\nCurrent usage decision: ${decision("DOCUMENTATION")}.\nThe legacy guide below is no longer authoritative.`, evidenceClass: "DOCUMENTATION" },
    { id: `${token}-legacy-doc`, path: "docs/legacy-usage.md", content: `Archived usage for ${symbol}. Old decision: obsolete-${token}.`, evidenceClass: "DOCUMENTATION" },
    { id: `${token}-license`, path: "LICENSE", content: `Authoritative package metadata decision: ${decision("METADATA")}.\nCopyright Example Authors.`, evidenceClass: "METADATA" },
    { id: `${token}-package-meta`, path: "package.json", content: `{"name":"${token}-workspace","version":"0.${index + 1}.0","description":"metadata distractor for ${symbol}"}`, evidenceClass: "METADATA" },
    { id: `${token}-build`, path: ".github/workflows/verify.yml", content: `name: verify\n# Active build decision: ${decision("BUILD")}\nsteps:\n  - run: npm run verify:${token}`, evidenceClass: "BUILD" },
    { id: `${token}-docker-old`, path: "Dockerfile.legacy", content: `# obsolete build for ${symbol}\nRUN echo obsolete-${token}`, evidenceClass: "BUILD" },
    { id: `${token}-entry`, path: "src/main.ts", content: `import { ${symbol} } from "./core/${symbol}";\nexport const architectureDecision = "${decision("ARCHITECTURE")}";\nexport function main() { return ${symbol}(architectureDecision); }`, evidenceClass: "ARCHITECTURE", symbols: ["main", symbol], centrality: 0.98, relatedPaths: [`src/core/${symbol}.ts`] },
    { id: `${token}-architecture-old`, path: "docs/architecture-old.md", content: `Stale architecture diagram routes through obsolete-${token}.`, evidenceClass: "ARCHITECTURE", centrality: 0.05 }
  ];
}

function taskText(requirement: BenchmarkEvidenceRequirement, symbol: string, index: number, hard: boolean): string {
  const prefix = hard ? "The error trace names two plausible files and an archived comment contradicts the active configuration. " : "";
  const variants: Record<BenchmarkEvidenceRequirement, string[]> = {
    SYMBOL: [
      `Locate the implementation of function ${symbol} and choose its active behavior decision.`,
      `Which decision is implemented by method ${symbol}, not by its similarly named legacy helper?`,
      `Trace the caller to ${symbol} and identify the implementation decision.`
    ],
    TEST: [
      `Which decision is asserted by the associated test for ${symbol}?`,
      `Use failing test evidence for ${symbol} to choose the required boundary decision.`,
      `Find the source-test affinity for ${symbol} and report the test decision.`
    ],
    DOCUMENTATION: [
      "According to the current README usage documentation, which decision should a new contributor follow?",
      "Find the non-archived usage instructions and choose the documented decision.",
      "Which current documentation decision supersedes the stale guide?"
    ],
    METADATA: [
      "Which authoritative license metadata decision applies to this project?",
      "Inspect the canonical LICENSE evidence and select the package metadata decision.",
      "Which decision is established by the canonical copying/license file rather than a source comment?"
    ],
    BUILD: [
      "Which active CI build decision is executed by the verification workflow?",
      "Inspect the build workflow rather than the legacy Docker file and choose the active decision.",
      "Which environment/build decision controls the repository verification command?"
    ],
    ARCHITECTURE: [
      `Which architecture decision is used by the entry point that orchestrates ${symbol}?`,
      `Follow the dependency graph from the central entry point to ${symbol} and choose the active decision.`,
      "Which decision belongs to the high-centrality entry module rather than the stale architecture note?"
    ],
    MIXED: [
      `For function ${symbol}, combine its implementation and associated test evidence to choose the shared decision.`,
      "How do I run this repo? Combine current usage documentation with the active build workflow and choose their shared decision.",
      "Which license and README-described project decision agree across metadata and documentation?",
      `Why does the CI test check for ${symbol} fail? Combine build and test evidence to choose the shared decision.`,
      `Explain the architecture and implementation of ${symbol}; choose the decision shared by the entry point and source.`,
      "Combine architecture, current documentation, and build evidence; choose the only decision supported by all three."
    ]
  };
  const items = variants[requirement];
  return `${prefix}${items[index % items.length]}`;
}

function requiredClasses(requirement: BenchmarkEvidenceRequirement, index: number): AtomicEvidenceClass[] {
  if (requirement !== "MIXED") return [requirement];
  const combinations: AtomicEvidenceClass[][] = [
    ["SYMBOL", "TEST"],
    ["DOCUMENTATION", "BUILD"],
    ["METADATA", "DOCUMENTATION"],
    ["BUILD", "TEST"],
    ["ARCHITECTURE", "SYMBOL"],
    ["ARCHITECTURE", "DOCUMENTATION", "BUILD"]
  ];
  return combinations[index % combinations.length];
}

function pathForClass(evidenceClass: AtomicEvidenceClass, candidates: TaskAwareCandidate[]): string {
  const suffix: Record<AtomicEvidenceClass, string> = { SYMBOL: "-symbol", TEST: "-test", DOCUMENTATION: "-readme", METADATA: "-license", BUILD: "-build", ARCHITECTURE: "-entry", GIT: "-git" };
  const preferred = candidates.find((candidate) => candidate.evidenceClass === evidenceClass && candidate.id.endsWith(suffix[evidenceClass]));
  if (!preferred) throw new Error(`Missing candidate for ${evidenceClass}`);
  return preferred.path;
}

function buildSuite(input: { suiteId: string; perClass: number; hard: boolean }): { tasks: RetrievalBenchmarkTask[]; oracles: RetrievalBenchmarkOracle[] } {
  const requirements: BenchmarkEvidenceRequirement[] = ["SYMBOL", "TEST", "DOCUMENTATION", "METADATA", "BUILD", "ARCHITECTURE", "MIXED"];
  const tasks: RetrievalBenchmarkTask[] = [];
  const oracles: RetrievalBenchmarkOracle[] = [];
  for (const requirement of requirements) {
    for (let classIndex = 0; classIndex < input.perClass; classIndex += 1) {
      const index = tasks.length;
      const symbol = SYMBOLS[(index + classIndex) % SYMBOLS.length];
      const correct = `${TOKENS[(index + 3) % TOKENS.length]}-${100 + index}`;
      const answer = rotateOptions(index, correct, `legacy-${TOKENS[(index + 5) % TOKENS.length]}`, `experimental-${TOKENS[(index + 7) % TOKENS.length]}`);
      const classes = requiredClasses(requirement, classIndex);
      const candidates = baseCandidates(index + (input.hard ? 500 : 0), symbol, correct, classes);
      if (input.hard) {
        candidates.splice(2, 0,
          { id: `hard-ambiguous-${index}`, path: `packages/compat/${symbol}.ts`, content: `export function ${symbol}Compat() { return "${answer.options.A}"; } // incomplete error trace points here`, evidenceClass: "SYMBOL", symbols: [`${symbol}Compat`], centrality: 0.45 },
          { id: `hard-misleading-readme-${index}`, path: "docs/README-migration.md", content: `Migration draft decision: ${answer.options.B}. This file intentionally resembles the README.`, evidenceClass: "DOCUMENTATION" }
        );
      }
      const requiredEvidenceSet = classes.map((evidenceClass) => pathForClass(evidenceClass, candidates));
      const difficulty: BenchmarkDifficulty = input.hard ? "L3" : classIndex % 8 === 0 ? "L3" : classIndex % 3 === 0 ? "L2" : "L1";
      const taskCategory: BenchmarkTaskCategory = requirement === "SYMBOL" || requirement === "TEST" ? "Coding" : requirement === "BUILD" ? "Diagnosis" : requirement === "ARCHITECTURE" ? "Navigation" : "Analysis";
      const id = `${input.suiteId}-${requirement.toLowerCase()}-${String(classIndex + 1).padStart(3, "0")}-${sha256(`${symbol}:${correct}`).slice(0, 6)}`;
      tasks.push({
        id,
        suiteId: input.suiteId,
        classification: "DEVELOPMENT_TUNING_NOT_HOLDOUT",
        evidenceRequirement: requirement,
        requestedEvidenceClasses: classes,
        taskCategory,
        difficulty,
        task: taskText(requirement, symbol, classIndex, input.hard),
        declaredSymbols: classes.includes("SYMBOL") || classes.includes("TEST") ? [symbol] : [],
        candidates,
        options: answer.options
      });
      oracles.push({ taskId: id, expected: answer.expected, requiredEvidenceSet, requiredEvidenceClasses: classes, rationale: `The answer token is present only in the required ${classes.join("+")} evidence set; distractors carry different decisions.` });
    }
  }
  return { tasks, oracles };
}

export function buildRetrievalDevelopmentSuite() {
  return buildSuite({ suiteId: "dca-retrieval-v3-development-g1", perClass: 32, hard: false });
}

export function buildHardDevelopmentSuite() {
  return buildSuite({ suiteId: "dca-retrieval-v3-hard-development-g1", perClass: 20, hard: true });
}
