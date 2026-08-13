import type { CanonicalArtifactBundle, RawArtifact } from "./canonicalArtifacts";

export type AdmissionState = "SUPPORTED" | "ASSISTED" | "RESEARCH_ONLY" | "REPORT_ONLY" | "DISABLED";
export interface SourceRef { path: string; label: string }
export interface ChartMeta { title: string; takeaway: string; source: SourceRef }
export interface ValuePoint { label: string; value: number; detail?: string }

export interface VisualizationDashboard {
  generatedFrom: "SEALED_REPOSITORY_ARTIFACTS";
  product: { research: string; mutation: string; modelSelection: string; primaryCallsInFinalStudy: number };
  highlights: Array<{ value: string; label: string; detail: string }>;
  charts: {
    capabilityMatrix: ChartMeta & { rows: Array<{ capability: string; state: AdmissionState; score: number | null; evidence: string }> };
    timeline: ChartMeta & { events: Array<{ date: string; label: string; decision: string; state: "PASS" | "STOP" | "LOCKED" }> };
    failureDecomposition: ChartMeta & { total: number; segments: Array<ValuePoint & { color: string }> };
    interventionComparison: ChartMeta & { groups: Array<{ label: string; oneShot: number; intervention: number; denominator: number }> };
    verificationFunnel: ChartMeta & { stages: ValuePoint[]; denominator: number };
    observability: ChartMeta & { denominator: number; metrics: Array<{ key: string; label: string; l0: number; l1: number; direction: "up" | "down" }> };
    modelComparison: ChartMeta & { rows: Array<{ model: string; value: number; denominator: number; status: string; scored: boolean }> };
    runtime: ChartMeta & { cards: Array<{ label: string; value: string; detail: string }> };
    transitions: ChartMeta & { links: Array<{ from: string; to: string; value: number }> };
  };
}

export type VisualizationState =
  | { status: "LOADING" }
  | { status: "EMPTY"; message: string }
  | { status: "ERROR"; issues: string[] }
  | { status: "READY"; dashboard: VisualizationDashboard; warnings: string[] };

type Obj = Record<string, unknown>;
const required = ["capabilityRouting", "modelMatrix", "tournament", "tournamentReport", "semanticFailure", "observability", "codeFormation"] as const;
const isObject = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const objectAt = (value: unknown, key: string, issues: string[], context: string): Obj => {
  if (!isObject(value) || !isObject(value[key])) { issues.push(`${context}.${key} must be an object`); return {}; }
  return value[key] as Obj;
};
const arrayAt = (value: unknown, key: string, issues: string[], context: string): unknown[] => {
  if (!isObject(value) || !Array.isArray(value[key])) { issues.push(`${context}.${key} must be an array`); return []; }
  return value[key] as unknown[];
};
const numberAt = (value: unknown, key: string, issues: string[], context: string): number => {
  const result = isObject(value) ? value[key] : undefined;
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) { issues.push(`${context}.${key} must be a non-negative finite number`); return 0; }
  return result;
};
const textAt = (value: unknown, key: string, issues: string[], context: string): string => {
  const result = isObject(value) ? value[key] : undefined;
  if (typeof result !== "string" || result.length === 0) { issues.push(`${context}.${key} must be a non-empty string`); return "UNKNOWN"; }
  return result;
};
const source = (artifact: RawArtifact, label: string): SourceRef => ({ path: artifact.path, label });

export function buildVisualizationState(bundle: Partial<CanonicalArtifactBundle>): VisualizationState {
  const missing = required.filter((key) => !bundle[key]);
  if (missing.length) return { status: "ERROR", issues: missing.map((key) => `Missing required artifact: ${key}`) };
  const artifacts = bundle as CanonicalArtifactBundle;
  const issues: string[] = [];
  const warnings: string[] = [];

  const routing = artifacts.capabilityRouting.data;
  const routeRows = arrayAt(routing, "rows", issues, "capabilityRouting").filter(isObject);
  const matrix = artifacts.modelMatrix.data;
  const modelRows = arrayAt(matrix, "rows", issues, "modelMatrix").filter(isObject);
  const semantic = artifacts.semanticFailure.data;
  const primary = objectAt(semantic, "primaryCategoryCounts", issues, "semanticFailure");
  const failureCounts = objectAt(primary, "counts", issues, "semanticFailure.primaryCategoryCounts");
  const failureTotal = numberAt(primary, "total", issues, "semanticFailure.primaryCategoryCounts");
  const obs = artifacts.observability.data;
  const population = objectAt(obs, "population", issues, "observability");
  const pairedFailures = numberAt(population, "pairedFailures", issues, "observability.population");
  const comparison = objectAt(obs, "comparison", issues, "observability");
  const transitions = objectAt(objectAt(obs, "categoryUnlocks", issues, "observability"), "transitionMatrix", issues, "observability.categoryUnlocks");
  const privacy = objectAt(obs, "privacy", issues, "observability");
  const performance = objectAt(artifacts.tournamentReport.data, "performance", issues, "tournamentReport");
  const m2Performance = objectAt(performance, "M2", issues, "tournamentReport.performance");
  const code = artifacts.codeFormation.data;
  const accounting = objectAt(code, "accounting", issues, "codeFormation");

  for (const [index, row] of modelRows.entries()) {
    const value = numberAt(row, "strictBehavioral", issues, `modelMatrix.rows[${index}]`);
    const threshold = objectAt(row, "threshold", issues, `modelMatrix.rows[${index}]`);
    const denominator = typeof threshold.denominator === "number" ? threshold.denominator : undefined;
    if (denominator !== undefined && value > denominator) issues.push(`modelMatrix.rows[${index}] strict behavioral count exceeds denominator`);
  }
  for (const metricKey of ["semanticCoverage", "t14", "highMediumConfidence", "supportedNonT14"]) {
    const metric = objectAt(comparison, metricKey, issues, `observability.comparison`);
    for (const level of ["l0", "l1"]) {
      const point = objectAt(metric, level, issues, `observability.comparison.${metricKey}`);
      const denominator = numberAt(point, "denominator", issues, `observability.comparison.${metricKey}.${level}`);
      const count = numberAt(point, "count", issues, `observability.comparison.${metricKey}.${level}`);
      if (denominator !== pairedFailures) issues.push(`observability ${metricKey}.${level} denominator does not match paired population`);
      if (count > denominator) issues.push(`observability ${metricKey}.${level} count exceeds denominator`);
    }
  }
  for (const key of ["rawModelOutputsPersisted", "rawEditBodiesPersisted", "unauthorizedL2Records", "forbiddenLeakCount"]) {
    if (numberAt(privacy, key, issues, "observability.privacy") !== 0) issues.push(`observability privacy invariant failed: ${key} must remain zero`);
  }
  const mutation = textAt(code, "productStatus", issues, "codeFormation");
  if (mutation !== "KEEP_MUTATION_DISABLED") issues.push("codeFormation productStatus must keep mutation disabled");
  if (issues.length) return { status: "ERROR", issues: [...new Set(issues)] };
  if (!routeRows.length || !modelRows.length) return { status: "EMPTY", message: "Canonical artifacts contain no chartable rows." };

  const routeByClass = new Map<string, { route: AdmissionState; score: number | null }>();
  for (const row of routeRows) {
    const taskClass = String(row.taskClass ?? "unknown");
    const rawRoute = String(row.route ?? "REPORT_ONLY");
    const route: AdmissionState = rawRoute === "SUPPORTED" || rawRoute === "ASSISTED" ? rawRoute : "REPORT_ONLY";
    routeByClass.set(taskClass, { route, score: typeof row.benchmarkRate === "number" ? row.benchmarkRate : null });
  }
  const capabilityNames: Record<string, string> = {
    cross_file_planning: "Structured cross-file planning", navigation_with_complete_context: "Complete-context navigation",
    diagnosis: "Semantic diagnosis", behavioral_patch: "Behavioral patching", onboarding_synthesis: "Onboarding synthesis"
  };
  const capabilityRows = [...routeByClass].map(([key, item]) => ({ capability: capabilityNames[key] ?? key, state: item.route, score: item.score, evidence: item.score === null ? "No comparable score" : `${Math.round(item.score * 100)}% development success` }));
  capabilityRows.push({ capability: "Autonomous mutation", state: "DISABLED", score: 0, evidence: "No current task class qualifies" });
  capabilityRows.push({ capability: "FIM-7B assisted patch candidate", state: "RESEARCH_ONLY", score: 29 / 95, evidence: "29/95; product threshold not met" });

  const categoryColors: Record<string, string> = { T11_RETRIEVAL_FAILURE: "#5e8cff", T12_ACTION_OR_PATCH_REPRESENTATION: "#a88bff", T13_SYNTAX_CODE_FORMATION: "#f0b65a", T14_AMBIGUOUS_OR_INCONCLUSIVE: "#6b7280" };
  const segments = Object.entries(failureCounts).map(([label, value]) => ({ label: label.replace(/^T\d+_/, "").replaceAll("_", " "), value: Number(value), detail: `${value}/${failureTotal}`, color: categoryColors[label] ?? "#7c8a9e" }));
  const scoredRows = modelRows.filter((row) => String(row.scoringStatus) !== "INFRASTRUCTURE_BLOCKED_NOT_SCORED");
  const fim = modelRows.find((row) => String(row.model).startsWith("FIM-7B")) ?? {};
  const fimRetry = isObject(fim.maximumTwoCall) ? fim.maximumTwoCall : {};
  const funnel = [
    ["Mutation tasks", numberAt(fim, "mutationTasks", warnings, "FIM")], ["Exact source", numberAt(fim, "exactSourceSelected", warnings, "FIM")],
    ["Valid action", numberAt(fim, "validActions", warnings, "FIM")], ["Patch applied", numberAt(fim, "patchApplyPasses", warnings, "FIM")],
    ["Syntax passed", numberAt(fim, "syntaxPasses", warnings, "FIM")], ["Strict behavior", numberAt(fim, "strictBehavioral", warnings, "FIM")]
  ].map(([label, value]) => ({ label: String(label), value: Number(value) }));
  const obsMetric = (key: string, label: string, direction: "up" | "down") => {
    const metric = comparison[key] as Obj;
    const viewKey = key === "semanticCoverage" ? "semantic" : key;
    return { key: viewKey, label, l0: Number((metric.l0 as Obj).count), l1: Number((metric.l1 as Obj).count), direction };
  };
  const transitionLinks = Object.entries(transitions).map(([key, value]) => {
    const [from, to] = key.split(" -> "); return { from, to, value: Number(value) };
  });
  const transitionTotal = transitionLinks.reduce((sum, item) => sum + item.value, 0);
  if (transitionTotal !== pairedFailures) return { status: "ERROR", issues: ["observability transition total does not match paired population"] };

  const dashboard: VisualizationDashboard = {
    generatedFrom: "SEALED_REPOSITORY_ARTIFACTS",
    product: { research: textAt(code, "researchStatus", [], "codeFormation"), mutation, modelSelection: "NO_MODEL_PROMOTED", primaryCallsInFinalStudy: numberAt(accounting, "primaryCalls", [], "codeFormation.accounting") },
    highlights: [
      { value: "12 / 12", label: "Structured plans", detail: "Supported inside the machine-checkable G4 boundary" },
      { value: "29 / 95", label: "Best 7B strict behavior", detail: "Assisted floor only; no promotion" },
      { value: "+34.09 pp", label: "Semantic observability", detail: "L1 over paired L0 failures" },
      { value: "0", label: "Raw outputs retained", detail: "Privacy gate remained closed" }
    ],
    charts: {
      capabilityMatrix: { title: "Capability admission matrix", takeaway: "Only bounded structured planning is supported; mutation remains disabled.", source: source(artifacts.capabilityRouting, "G4 capability routing"), rows: capabilityRows },
      timeline: { title: "Evidence-to-decision timeline", takeaway: "Each research step tightened the claim boundary rather than widening autonomy.", source: source(artifacts.codeFormation, "Final research results index"), events: [
        { date: "Aug 09", label: "G3 generalization", decision: "Low naturalistic quality; retain bounded V2", state: "PASS" },
        { date: "Aug 09", label: "G4 capability routing", decision: "Planning supported; mutation report-only", state: "LOCKED" },
        { date: "Aug 11", label: "7B tournament", decision: "No model promoted", state: "STOP" },
        { date: "Aug 11", label: "Privacy observability V3", decision: "L1 justified with zero raw retention", state: "PASS" },
        { date: "Aug 12", label: "Formation recovery", decision: "Sanity gate fail; research closed", state: "STOP" }
      ] },
      failureDecomposition: { title: "L0 failure decomposition", takeaway: "80.3% remained inconclusive before privacy-safe structured features were added.", source: source(artifacts.semanticFailure, "Semantic decomposition Session B"), total: failureTotal, segments },
      interventionComparison: { title: "Bounded retry intervention", takeaway: "A second bounded call recovered only one additional strict success and was not admitted.", source: source(artifacts.modelMatrix, "Model capability matrix v6"), groups: [
        { label: "Strict success", oneShot: numberAt(fim, "strictBehavioral", [], "FIM"), intervention: numberAt(fimRetry, "successes", [], "FIM.maximumTwoCall"), denominator: 95 },
        { label: "Not successful", oneShot: 95 - numberAt(fim, "strictBehavioral", [], "FIM"), intervention: 95 - numberAt(fimRetry, "successes", [], "FIM.maximumTwoCall"), denominator: 95 }
      ] },
      verificationFunnel: { title: "Strongest-candidate verification funnel", takeaway: "Syntax reliability did not translate into enough strict behavioral success for admission.", source: source(artifacts.modelMatrix, "Model capability matrix v6"), stages: funnel, denominator: 95 },
      observability: { title: "L0 vs L1 observability", takeaway: "Structured privacy-safe features raised supported semantic and confidence coverage while reducing T14.", source: source(artifacts.observability, "Privacy-safe paired report"), denominator: pairedFailures, metrics: [
        obsMetric("semanticCoverage", "Semantic cause", "up"), obsMetric("supportedNonT14", "Supported non-T14", "up"), obsMetric("highMediumConfidence", "High / medium confidence", "up"), obsMetric("t14", "T14 inconclusive", "down")
      ] },
      modelComparison: { title: "Practical local model comparison", takeaway: "FIM-7B led scored candidates but reached only the assisted floor; no model was promoted.", source: source(artifacts.modelMatrix, "Model capability matrix v6"), rows: modelRows.map((row) => ({ model: String(row.model), value: Number(row.strictBehavioral ?? 0), denominator: Number((row.threshold as Obj)?.denominator ?? 95), status: String((row.threshold as Obj)?.highestClassification ?? row.scoringStatus), scored: String(row.scoringStatus) !== "INFRASTRUCTURE_BLOCKED_NOT_SCORED" })) },
      runtime: { title: "Measured candidate runtime", takeaway: "Runtime values are sealed tournament measurements, not live desktop telemetry.", source: source(artifacts.tournamentReport, "Tournament final report"), cards: [
        { label: "Generation throughput", value: `${numberAt(m2Performance, "generationThroughputTokensPerSecond", [], "M2").toFixed(1)} tok/s`, detail: "FIM-7B FP8" },
        { label: "Median latency", value: `${Math.round(numberAt(m2Performance, "medianLatencyMs", [], "M2"))} ms`, detail: "95 primary calls" },
        { label: "p95 latency", value: `${Math.round(numberAt(m2Performance, "p95LatencyMs", [], "M2"))} ms`, detail: "Sealed tournament" },
        { label: "Inference peak VRAM", value: `${numberAt(m2Performance, "inferencePeakVramMiB", [], "M2").toLocaleString()} MiB`, detail: "Measured, not estimated" }
      ] },
      transitions: { title: "Paired semantic transition flow", takeaway: "Fifteen L0-inconclusive failures became supported T1, T3, or T7 causes under L1.", source: source(artifacts.observability, "Privacy-safe paired report"), links: transitionLinks }
    }
  };
  return { status: "READY", dashboard, warnings: [...new Set(warnings)] };
}
