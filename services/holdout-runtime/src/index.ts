import { createHash } from "node:crypto";
import { buildHarnessBenchmarkTasks } from "../../benchmark-runtime/src/index";
import {
  HOLDOUT_CATEGORY_COUNTS, HOLDOUT_CATEGORY_DIFFICULTIES, HOLDOUT_SUBCATEGORIES, buildFreshHoldoutTasks, holdoutFingerprint,
  jaccard, publicHoldoutTask, taskSimilarityText, tokenSet, type HoldoutAnswer, type HoldoutCategory, type HoldoutDifficulty,
  type HoldoutProvenance, type HoldoutTask
} from "./task-catalog";

export * from "./task-catalog";
export interface HoldoutIntegrityReport {
  status: "PASS" | "FAIL"; taskCount: number; uniqueFingerprints: number; categoryCounts: Record<HoldoutCategory, number>;
  difficultyCounts: Record<HoldoutDifficulty, number>; answerCounts: Record<HoldoutAnswer, number>; provenanceCounts: Record<HoldoutProvenance, number>;
  maximumWithinHoldoutJaccard: number; maximumDevelopmentJaccard: number; maximumPair: [string, string] | null; errors: string[];
}

export function validateFreshHoldoutIntegrity(tasks: HoldoutTask[]): HoldoutIntegrityReport {
  const errors: string[] = []; const fingerprints = tasks.map(holdoutFingerprint);
  const categoryCounts = Object.fromEntries((Object.keys(HOLDOUT_CATEGORY_COUNTS) as HoldoutCategory[]).map((category) => [category, tasks.filter((task) => task.category === category).length])) as Record<HoldoutCategory, number>;
  const difficultyCounts = Object.fromEntries((["L1", "L2", "L3", "L4"] as HoldoutDifficulty[]).map((difficulty) => [difficulty, tasks.filter((task) => task.difficulty === difficulty).length])) as Record<HoldoutDifficulty, number>;
  const answerCounts = Object.fromEntries((["A", "B", "C"] as HoldoutAnswer[]).map((answer) => [answer, tasks.filter((task) => task.expected === answer).length])) as Record<HoldoutAnswer, number>;
  const provenanceValues: HoldoutProvenance[] = ["INDEPENDENT_AUTHORED_ARCHETYPE", "HISTORICAL_BUG_PATTERN_ABSTRACTED", "FAILING_TEST_PATTERN_ABSTRACTED", "HELD_OUT_TEMPLATE_STRUCTURE", "REAL_REPOSITORY_PATTERN_ABSTRACTED"];
  const provenanceCounts = Object.fromEntries(provenanceValues.map((source) => [source, tasks.filter((task) => task.provenance.source === source).length])) as Record<HoldoutProvenance, number>;
  if (tasks.length !== 150) errors.push(`holdout task count must equal preregistered 150, got ${tasks.length}`);
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) errors.push("holdout task IDs must be unique");
  if (new Set(fingerprints).size !== tasks.length) errors.push("holdout public fingerprints must be unique");
  for (const category of Object.keys(HOLDOUT_CATEGORY_COUNTS) as HoldoutCategory[]) {
    if (categoryCounts[category] !== HOLDOUT_CATEGORY_COUNTS[category]) errors.push(`${category} count does not match preregistration`);
    for (const subcategory of HOLDOUT_SUBCATEGORIES[category]) if (!tasks.some((task) => task.category === category && task.subcategory === subcategory)) errors.push(`${category}/${subcategory} is absent`);
    for (const difficulty of ["L1", "L2", "L3", "L4"] as HoldoutDifficulty[]) {
      const actual = tasks.filter((task) => task.category === category && task.difficulty === difficulty).length;
      if (actual !== HOLDOUT_CATEGORY_DIFFICULTIES[category][difficulty]) errors.push(`${category}/${difficulty} count ${actual} does not match preregistration`);
    }
  }
  if (JSON.stringify(difficultyCounts) !== JSON.stringify({ L1: 24, L2: 42, L3: 66, L4: 18 })) errors.push("global difficulty distribution does not match preregistration");
  if (Object.values(answerCounts).some((count) => count !== 50)) errors.push("hidden answer positions must be balanced 50/50/50");
  if (Object.values(provenanceCounts).some((count) => count === 0)) errors.push("all preregistered provenance sources must be represented");
  for (const task of tasks) {
    if (new Set(Object.values(task.options)).size !== 3) errors.push(`${task.id} options are not distinct`);
    if (!task.candidates.some((candidate) => candidate.relevant) || !task.candidates.some((candidate) => !candidate.relevant)) errors.push(`${task.id} lacks relevant evidence or distractor`);
    if (task.provenance.developmentTaskReuse || !task.provenance.authoredAfterPreregistration) errors.push(`${task.id} violates provenance freshness`);
    if (task.difficulty === "L4" && task.expectedMode !== "REPORT_ONLY") errors.push(`${task.id} L4 task is not REPORT_ONLY`);
  }
  const holdoutSets = tasks.map((task) => tokenSet(taskSimilarityText(task))); let maximumWithinHoldoutJaccard = 0; let maximumDevelopmentJaccard = 0; let maximumPair: [string, string] | null = null;
  for (let left = 0; left < tasks.length; left += 1) for (let right = left + 1; right < tasks.length; right += 1) {
    const similarity = jaccard(holdoutSets[left], holdoutSets[right]);
    if (similarity > maximumWithinHoldoutJaccard) { maximumWithinHoldoutJaccard = similarity; maximumPair = [tasks[left].id, tasks[right].id]; }
  }
  const developmentSets = buildHarnessBenchmarkTasks().map((task) => tokenSet([task.task, ...Object.values(task.options), ...task.candidates.map((candidate) => candidate.content)].join(" ")));
  for (const holdout of holdoutSets) for (const development of developmentSets) maximumDevelopmentJaccard = Math.max(maximumDevelopmentJaccard, jaccard(holdout, development));
  if (maximumWithinHoldoutJaccard >= 0.72) errors.push(`within-holdout near-duplicate threshold failed at ${maximumWithinHoldoutJaccard}`);
  if (maximumDevelopmentJaccard >= 0.72) errors.push(`development overlap threshold failed at ${maximumDevelopmentJaccard}`);
  return { status: errors.length === 0 ? "PASS" : "FAIL", taskCount: tasks.length, uniqueFingerprints: new Set(fingerprints).size, categoryCounts, difficultyCounts, answerCounts, provenanceCounts, maximumWithinHoldoutJaccard, maximumDevelopmentJaccard, maximumPair, errors };
}

export function buildFreshHoldoutManifest() {
  const tasks = buildFreshHoldoutTasks(); const integrity = validateFreshHoldoutIntegrity(tasks);
  if (integrity.status !== "PASS") throw new Error(`Fresh holdout integrity failed: ${integrity.errors.join("; ")}`);
  const publicTasks = tasks.map(publicHoldoutTask); const manifestHash = createHash("sha256").update(JSON.stringify(publicTasks)).digest("hex");
  const rows = tasks.map((task) => ({ task_id: task.id, expected: task.expected, hidden_oracle: task.hiddenOracle, fingerprint: holdoutFingerprint(task) }));
  const oracleHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  return {
    manifest: { schema_version: 1, suite_id: "dca-fresh-holdout-g1", classification: "FRESH_UNTOUCHED_HOLDOUT_GENERATION_1", preregistration: "benchmarks/holdout/HOLDOUT_PREREGISTRATION.json", preregistration_sha256: "b0945095c1de4eec00355e05654defa7ff038463b7144d5103c92b404f31ba6d", frozen_candidate_sha256: "74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd", manifest_hash: manifestHash, oracle_hash: oracleHash, integrity, tasks: publicTasks },
    oracle: { schema_version: 1, suite_id: "dca-fresh-holdout-g1", manifest_hash: manifestHash, oracle_hash: oracleHash, model_prompt_visibility: "NEVER", rows }
  };
}
