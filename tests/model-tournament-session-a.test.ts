// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  TOURNAMENT_CANDIDATES,
  validateTournamentSessionAContract
} from "../services/model-tournament-runtime/src/index";

describe("practical local model tournament Session A", () => {
  it("pins the three intended official repositories and immutable revisions", () => {
    expect(TOURNAMENT_CANDIDATES.map(({ modelId, revision }) => ({ modelId, revision }))).toEqual([
      {
        modelId: "Qwen/Qwen2.5-Coder-7B-Instruct",
        revision: "c03e6d358207e414f1eca0bb1891e29f1db0e242"
      },
      {
        modelId: "TIGER-Lab/FIM-7B",
        revision: "5a1d4294185e4fa0bbd40750c87d0beab7e67a3a"
      },
      {
        modelId: "SWE-bench/SWE-agent-LM-7B",
        revision: "a44fce0216647696a7437126e82fc1eaa34008d7"
      }
    ]);
  });

  it("accepts only a zero-call, 95-task, matched-FP8 Session-A contract", () => {
    expect(() => validateTournamentSessionAContract({
      state: "SEALED_BEFORE_CANDIDATE_INFERENCE",
      candidateCount: 3,
      mutationTasks: 95,
      policyOnlyTasks: 25,
      tournamentModelCalls: 0,
      acquisitionAuthorized: false,
      weightsDownloaded: false,
      precisionCategory: "MATCHED_PRECISION",
      precisionProfile: "VLLM_ONLINE_FP8_PER_TENSOR_W8A8",
      productMutationDecision: "KEEP_MUTATION_DISABLED",
      eEditStatus: "RESEARCH_ONLY_MUTATION_INTERFACE"
    })).not.toThrow();
  });

  it("fails closed on calls, acquisition, task drift, or product-policy drift", () => {
    const valid = {
      state: "SEALED_BEFORE_CANDIDATE_INFERENCE" as const,
      candidateCount: 3,
      mutationTasks: 95,
      policyOnlyTasks: 25,
      tournamentModelCalls: 0,
      acquisitionAuthorized: false,
      weightsDownloaded: false,
      precisionCategory: "MATCHED_PRECISION" as const,
      precisionProfile: "VLLM_ONLINE_FP8_PER_TENSOR_W8A8" as const,
      productMutationDecision: "KEEP_MUTATION_DISABLED" as const,
      eEditStatus: "RESEARCH_ONLY_MUTATION_INTERFACE" as const
    };
    expect(() => validateTournamentSessionAContract({ ...valid, tournamentModelCalls: 1 })).toThrow(/model calls/i);
    expect(() => validateTournamentSessionAContract({ ...valid, acquisitionAuthorized: true })).toThrow(/acquisition/i);
    expect(() => validateTournamentSessionAContract({ ...valid, mutationTasks: 94 })).toThrow(/task/i);
    expect(() => validateTournamentSessionAContract({ ...valid, productMutationDecision: "ENABLED" as never })).toThrow(/product/i);
  });
});
