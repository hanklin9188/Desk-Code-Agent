export const TOURNAMENT_CANDIDATES = Object.freeze([
  {
    candidateId: "M1",
    modelId: "Qwen/Qwen2.5-Coder-7B-Instruct",
    revision: "c03e6d358207e414f1eca0bb1891e29f1db0e242",
    role: "GENERIC_CODER_CONTROL"
  },
  {
    candidateId: "M2",
    modelId: "TIGER-Lab/FIM-7B",
    revision: "5a1d4294185e4fa0bbd40750c87d0beab7e67a3a",
    role: "FIM_AGENTIC_CANDIDATE"
  },
  {
    candidateId: "M3",
    modelId: "SWE-bench/SWE-agent-LM-7B",
    revision: "a44fce0216647696a7437126e82fc1eaa34008d7",
    role: "SWE_TRAJECTORY_CANDIDATE"
  }
] as const);

export type TournamentSessionAContract = {
  state: "SEALED_BEFORE_CANDIDATE_INFERENCE";
  candidateCount: number;
  mutationTasks: number;
  policyOnlyTasks: number;
  tournamentModelCalls: number;
  acquisitionAuthorized: boolean;
  weightsDownloaded: boolean;
  precisionCategory: "MATCHED_PRECISION";
  precisionProfile: "VLLM_ONLINE_FP8_PER_TENSOR_W8A8";
  productMutationDecision: "KEEP_MUTATION_DISABLED";
  eEditStatus: "RESEARCH_ONLY_MUTATION_INTERFACE";
};

export function validateTournamentSessionAContract(contract: TournamentSessionAContract): void {
  if (contract.state !== "SEALED_BEFORE_CANDIDATE_INFERENCE") throw new Error("Session A state is not sealed before candidate inference");
  if (contract.candidateCount !== TOURNAMENT_CANDIDATES.length) throw new Error("Candidate set drift");
  if (contract.mutationTasks !== 95 || contract.policyOnlyTasks !== 25) throw new Error("Primary task set drift");
  if (contract.tournamentModelCalls !== 0) throw new Error("Session A must have zero tournament model calls");
  if (contract.acquisitionAuthorized || contract.weightsDownloaded) throw new Error("Session A cannot authorize or perform acquisition");
  if (contract.precisionCategory !== "MATCHED_PRECISION" || contract.precisionProfile !== "VLLM_ONLINE_FP8_PER_TENSOR_W8A8") throw new Error("Precision profile drift");
  if (contract.productMutationDecision !== "KEEP_MUTATION_DISABLED") throw new Error("Product mutation decision drift");
  if (contract.eEditStatus !== "RESEARCH_ONLY_MUTATION_INTERFACE") throw new Error("E-EDIT status drift");
}
