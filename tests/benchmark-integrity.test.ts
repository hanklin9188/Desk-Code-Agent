// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BENCHMARK_CATEGORIES,
  REQUIRED_SUBCATEGORIES,
  buildExpandedBenchmarkManifest,
  buildHarnessBenchmarkTasks,
  validateBenchmarkIntegrity
} from "../services/benchmark-runtime/src/index";

describe("expanded harness benchmark integrity", () => {
  it("contains 100+ unique, nontrivial tasks across every required family", () => {
    const tasks = buildHarnessBenchmarkTasks();
    const integrity = validateBenchmarkIntegrity(tasks);
    expect(integrity).toMatchObject({ status: "PASS", taskCount: 108, preferredTargetMet: true, uniqueFingerprints: 108 });
    expect(Object.keys(integrity.categoryCounts)).toEqual([...BENCHMARK_CATEGORIES]);
    expect(Object.values(integrity.difficultyCounts).every((count) => count > 0)).toBe(true);
    for (const [category, subcategories] of Object.entries(REQUIRED_SUBCATEGORIES)) {
      for (const subcategory of subcategories) expect(tasks.filter((task) => task.category === category && task.subcategory === subcategory)).toHaveLength(3);
    }
  });

  it("publishes hidden-oracle metadata without answer keys", () => {
    const manifest = buildExpandedBenchmarkManifest();
    expect(manifest.tasks).toHaveLength(108);
    expect(manifest.integrity.hiddenOracleTasks).toBeGreaterThan(50);
    expect(JSON.stringify(manifest.tasks)).not.toContain("expectedAction");
    expect(JSON.stringify(manifest.tasks)).not.toContain('"expected"');
  });

  it("rejects duplicate fixtures and undersized suites", () => {
    const tasks = buildHarnessBenchmarkTasks();
    const invalid = validateBenchmarkIntegrity([...tasks.slice(0, 20), tasks[0]]);
    expect(invalid.status).toBe("FAIL");
    expect(invalid.errors.join(" ")).toMatch(/at least 50|unique/);
  });
});
