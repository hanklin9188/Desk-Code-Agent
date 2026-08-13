import { buildMinimumHarnessPlan, type HarnessTaskSignals } from "../../harness-runtime/src/index";
import { packageMinimalContext, retrieveTaskAware, type MinimalContextPackage, type RetrievalResult, type TaskAwareCandidate } from "../../task-aware-retrieval/src/index";

export interface EminV3Plan {
  profile: "E-MIN-V3";
  agentMode: "SINGLE";
  modelCalls: 1;
  semanticReviewer: "OFF";
  multiAgent: "OFF";
  retrieval: RetrievalResult;
  context: MinimalContextPackage;
  deterministicSkills: string[];
  codeEnforcedPolicies: string[];
  baselinePlanProfile: "E-MIN";
}

/** Production seam for the generation-3 candidate. It does not mutate the E-MIN-V2 planner. */
export function buildEminV3Plan(input: { task: string; declaredSymbols?: string[]; candidates: TaskAwareCandidate[]; signals: HarnessTaskSignals; hardTokenCap?: number }): EminV3Plan {
  const baseline = buildMinimumHarnessPlan({ ...input.signals, specialistExperimentEnabled: false, semanticReviewExperimentEnabled: false });
  const retrieval = retrieveTaskAware({ policy: "R2_TASK_AWARE_ONE_FALLBACK", task: input.task, declaredSymbols: input.declaredSymbols, candidates: input.candidates });
  const context = packageMinimalContext({ task: input.task, evidence: retrieval.selected, hardTokenCap: input.hardTokenCap ?? 1_000 });
  return {
    profile: "E-MIN-V3",
    agentMode: "SINGLE",
    modelCalls: 1,
    semanticReviewer: "OFF",
    multiAgent: "OFF",
    retrieval,
    context,
    deterministicSkills: baseline.deterministicSkills,
    codeEnforcedPolicies: baseline.codeEnforcedPolicies,
    baselinePlanProfile: baseline.profile
  };
}
