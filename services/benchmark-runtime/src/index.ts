import { createHash } from "node:crypto";
import {
  BENCHMARK_CATEGORIES,
  buildHarnessBenchmarkTasks,
  evidenceRoleCounts,
  publicTaskManifest,
  taskFingerprint,
  type BenchmarkCategory,
  type HarnessBenchmarkTask,
  type TaskDifficulty
} from "./task-catalog";

export * from "./task-catalog";

export const REQUIRED_SUBCATEGORIES: Record<BenchmarkCategory, readonly string[]> = {
  Coding: ["syntax_repair", "type_compile_repair", "localized_logic_bug", "parser_config_edge_cases", "error_handling", "missing_validation", "unit_test_repair", "hidden_regression", "cross_file_bug", "small_feature", "localized_refactor"],
  Diagnosis: ["misleading_error", "wrong_first_hypothesis", "multiple_plausible_causes", "flaky_reproduction", "insufficient_evidence"],
  "Repository navigation": ["correct_file_not_named_in_task", "multiple_candidate_files", "misleading_lexical_match", "source_test_mapping", "dependency_traversal"],
  Review: ["correct_implementation_poor_standards", "standards_compliant_spec_failure", "scope_creep", "hidden_regression"],
  Analysis: ["repository_overview", "onboarding", "architecture", "technical_debt", "testing_analysis"],
  Safety: ["repository_prompt_injection", "forbidden_file_modification", "path_traversal", "secret_exposure", "excessive_patch_scope", "architecture_wide_report_only"]
};

export interface BenchmarkIntegrityReport {
  status: "PASS" | "FAIL";
  taskCount: number;
  preferredTargetMet: boolean;
  categoryCounts: Record<BenchmarkCategory, number>;
  difficultyCounts: Record<TaskDifficulty, number>;
  hiddenOracleTasks: number;
  uniqueFingerprints: number;
  evidenceRoleCounts: ReturnType<typeof evidenceRoleCounts>;
  errors: string[];
}

export function validateBenchmarkIntegrity(tasks: HarnessBenchmarkTask[]): BenchmarkIntegrityReport {
  const errors: string[] = [];
  const ids = new Set(tasks.map((task) => task.id));
  const fingerprints = new Set(tasks.map(taskFingerprint));
  if (tasks.length < 50) errors.push("benchmark requires at least 50 tasks");
  if (ids.size !== tasks.length) errors.push("task IDs must be unique");
  if (fingerprints.size !== tasks.length) errors.push("fixture fingerprints must be unique; trivial duplicates are forbidden");
  const categoryCounts = Object.fromEntries(BENCHMARK_CATEGORIES.map((category) => [category, tasks.filter((task) => task.category === category).length])) as Record<BenchmarkCategory, number>;
  const difficultyCounts = Object.fromEntries((["L1", "L2", "L3", "L4"] as TaskDifficulty[]).map((difficulty) => [difficulty, tasks.filter((task) => task.difficulty === difficulty).length])) as Record<TaskDifficulty, number>;
  for (const category of BENCHMARK_CATEGORIES) {
    if (categoryCounts[category] === 0) errors.push(`category ${category} is empty`);
    for (const subcategory of REQUIRED_SUBCATEGORIES[category]) {
      const matching = tasks.filter((task) => task.category === category && task.subcategory === subcategory);
      if (matching.length < 3) errors.push(`${category}/${subcategory} requires three distinct tasks`);
    }
  }
  for (const difficulty of ["L1", "L2", "L3", "L4"] as TaskDifficulty[]) if (difficultyCounts[difficulty] === 0) errors.push(`difficulty ${difficulty} is empty`);
  for (const task of tasks) {
    if (task.candidates.filter((candidate) => candidate.relevant).length === 0) errors.push(`${task.id} has no relevant evidence`);
    if (task.candidates.filter((candidate) => !candidate.relevant).length === 0) errors.push(`${task.id} has no retrieval distractor`);
    if (new Set(Object.values(task.options)).size !== 3) errors.push(`${task.id} options must be distinct`);
  }
  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    taskCount: tasks.length,
    preferredTargetMet: tasks.length >= 100,
    categoryCounts,
    difficultyCounts,
    hiddenOracleTasks: tasks.filter((task) => task.hiddenTestsAvailable || task.oracleKind !== "HIDDEN_REPORT_ASSERTION").length,
    uniqueFingerprints: fingerprints.size,
    evidenceRoleCounts: evidenceRoleCounts(tasks),
    errors
  };
}

export function buildExpandedBenchmarkManifest() {
  const tasks = buildHarnessBenchmarkTasks();
  const integrity = validateBenchmarkIntegrity(tasks);
  if (integrity.status !== "PASS") throw new Error(`Benchmark integrity failed: ${integrity.errors.join("; ")}`);
  const publicTasks = tasks.map(publicTaskManifest);
  const manifestHash = createHash("sha256").update(JSON.stringify(publicTasks)).digest("hex");
  return {
    schema_version: 2,
    suite_id: "dca-harness-recovery-v2",
    classification: "EXPANDED_BENCHMARK",
    intended_use: "paired harness regression diagnosis and minimum-effective-harness evaluation",
    immutable_baseline: "docs/experiments/runs/m9-e1-e7-2026-08-09T01-18-51-568Z/result.json",
    manifest_hash: manifestHash,
    integrity,
    tasks: publicTasks
  };
}
