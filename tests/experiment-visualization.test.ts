import { describe, expect, it } from "vitest";
import { canonicalArtifacts } from "../services/experiment-visualization/src/canonicalArtifacts";
import { buildVisualizationState } from "../services/experiment-visualization/src/index";

describe("experiment visualization data layer", () => {
  it("normalizes the sealed artifacts into every required chart", () => {
    const state = buildVisualizationState(canonicalArtifacts);
    expect(state.status).toBe("READY");
    if (state.status !== "READY") throw new Error("canonical artifacts did not load");

    expect(Object.keys(state.dashboard.charts)).toEqual([
      "capabilityMatrix", "timeline", "failureDecomposition", "interventionComparison",
      "verificationFunnel", "observability", "modelComparison", "runtime", "transitions"
    ]);
    expect(state.dashboard.product.mutation).toBe("KEEP_MUTATION_DISABLED");
    expect(state.dashboard.charts.observability.metrics.find((item) => item.key === "semantic")?.l1).toBe(15);
    expect(state.dashboard.charts.transitions.links.reduce((sum, item) => sum + item.value, 0)).toBe(44);
  });

  it("rejects impossible count relationships instead of drawing them", () => {
    const broken = structuredClone(canonicalArtifacts);
    const matrix = broken.modelMatrix.data as { rows: Array<{ strictBehavioral?: number; threshold?: { denominator?: number } }> };
    matrix.rows[0].strictBehavioral = 96;
    matrix.rows[0].threshold = { denominator: 95 };
    const state = buildVisualizationState(broken);
    expect(state.status).toBe("ERROR");
    if (state.status === "ERROR") expect(state.issues.join(" ")).toMatch(/strict behavioral.*denominator/i);
  });

  it("returns an explicit error when a required artifact is absent", () => {
    const missing = structuredClone(canonicalArtifacts);
    delete (missing as Partial<typeof missing>).observability;
    const state = buildVisualizationState(missing);
    expect(state.status).toBe("ERROR");
    if (state.status === "ERROR") expect(state.issues).toContain("Missing required artifact: observability");
  });
});
