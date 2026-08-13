import type { VerificationStage, VerificationStatus } from "../../../packages/contracts/src/index";

export const TRUSTED_COMMANDS = {
  syntax: ["npm", "run", "typecheck"], targeted: ["npm", "test", "--", "--runInBand"],
  full: ["npm", "test"], build: ["npm", "run", "build"]
} as const;

export function verificationOutcome(stages: VerificationStage[]): VerificationStatus {
  if (stages.some((stage) => stage.status === "FAIL")) return "FAIL";
  if (stages.some((stage) => stage.status === "TIMED_OUT")) return "TIMED_OUT";
  if (stages.some((stage) => stage.status === "CANCELLED")) return "CANCELLED";
  if (stages.length === 0 || stages.some((stage) => stage.status === "NOT_RUN" || stage.status === "QUEUED" || stage.status === "RUNNING")) return "NOT_RUN";
  return stages.every((stage) => stage.status === "PASS") ? "PASS" : "NOT_RUN";
}

export const createVerificationPlan = (): VerificationStage[] => [
  { id: "preflight", label: "Preflight", trustedCommandId: "workspace.preflight", status: "PASS", summary: "Workspace policy loaded" },
  { id: "syntax", label: "Syntax / Types", trustedCommandId: "npm.typecheck", status: "PASS", summary: "No type errors" },
  { id: "targeted", label: "Targeted tests", trustedCommandId: "vitest.targeted", status: "PASS", summary: "12 / 12 passed" },
  { id: "related", label: "Related tests", trustedCommandId: "vitest.related", status: "PASS", summary: "34 / 34 passed" },
  { id: "full", label: "Full suite", trustedCommandId: "vitest.full", status: "RUNNING", summary: "86 / 112 completed" },
  { id: "build", label: "Production build", trustedCommandId: "vite.build", status: "NOT_RUN", summary: "Waiting for full suite" }
];
