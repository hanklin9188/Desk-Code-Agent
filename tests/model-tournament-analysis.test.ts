import { describe, expect, it } from "vitest";
import { exactMcNemar, failureProfile, pairedAnalysis, thresholdClassification, type TournamentObservation } from "../services/model-tournament-analysis/src/index.js";

function rows(successes: number, repository = "repo") {
  return Array.from({ length: 95 }, (_, index): TournamentObservation => ({
    taskId: `task-${index}`,
    repositoryId: `${repository}-${Math.floor(index / 8)}`,
    retrieval: { exactSourceIncluded: true },
    execution: { syntax: index < successes ? "PASS" : "FAIL", visible: index < successes ? "PASS" : "NOT_RUN", hidden: index < successes ? "PASS" : "NOT_RUN" },
    outcome: { behavioralSuccess: index < successes, firstFailureStage: index < successes ? "SUCCESS" : "SYNTAX_TYPE" },
  }));
}

describe("model tournament analysis", () => {
  it("computes exact paired cells, deterministic intervals, and McNemar", () => {
    const left = rows(23), right = rows(29);
    const result = pairedAnalysis(left, right, "strictBehavioral", "4B", "M2");
    expect(result).toMatchObject({ bothPass: 23, leftOnly: 0, rightOnly: 6, bothFail: 66, leftSuccesses: 23, rightSuccesses: 29 });
    expect(result.absoluteDifferencePercentagePoints).toBeCloseTo(6.315789473684211);
    expect(result.statistics.mcnemarExactTwoSidedP).toBe(0.03125);
    expect(result.statistics.taskPairedBootstrap95PercentCI).toHaveLength(2);
    expect(pairedAnalysis(left, right, "strictBehavioral", "4B", "M2").statistics).toEqual(result.statistics);
  });

  it("overrides the runtime stage with retrieval and normalizes COMPLETE", () => {
    const sample = rows(1).slice(0, 2);
    sample[0].outcome.firstFailureStage = "COMPLETE";
    sample[1].retrieval.exactSourceIncluded = false;
    expect(failureProfile(sample)).toMatchObject({ SUCCESS: 1, RETRIEVAL: 1 });
  });

  it("applies the frozen thresholds without rounding", () => {
    expect(thresholdClassification(28).highestClassification).toBe("BELOW_ASSISTED");
    expect(thresholdClassification(29).highestClassification).toBe("ASSISTED_FLOOR");
    expect(thresholdClassification(33).highestClassification).toBe("RESEARCH_THRESHOLD");
    expect(thresholdClassification(40).highestClassification).toBe("STRONG_CANDIDATE");
    expect(thresholdClassification(57).highestClassification).toBe("PRODUCT_THRESHOLD");
  });
});
