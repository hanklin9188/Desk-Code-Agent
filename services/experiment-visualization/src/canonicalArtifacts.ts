import capabilityRouting from "../../../docs/experiments/g4-capability/CAPABILITY_ROUTING_EVALUATION.json";
import modelMatrix from "../../../docs/experiments/model-specialization/MODEL_CAPABILITY_MATRIX.v6.json";
import tournament from "../../../docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_D.v2.json";
import tournamentReport from "../../../docs/experiments/model-specialization/MODEL_TOURNAMENT_FINAL_REPORT.v1.json";
import semanticFailure from "../../../docs/experiments/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_SESSION_B.v1.json";
import observability from "../../../docs/productization/PRIVACY_SAFE_OBSERVABILITY_PUBLIC_PROJECTION.v1.json";
import codeFormation from "../../../docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_RESULTS_INDEX.v6.json";

export interface RawArtifact {
  path: string;
  data: unknown;
}

export interface CanonicalArtifactBundle {
  capabilityRouting: RawArtifact;
  modelMatrix: RawArtifact;
  tournament: RawArtifact;
  tournamentReport: RawArtifact;
  semanticFailure: RawArtifact;
  observability: RawArtifact;
  codeFormation: RawArtifact;
}

/** Raw loading only. Validation and interpretation belong in index.ts. */
export const canonicalArtifacts: CanonicalArtifactBundle = {
  capabilityRouting: { path: "docs/experiments/g4-capability/CAPABILITY_ROUTING_EVALUATION.json", data: capabilityRouting },
  modelMatrix: { path: "docs/experiments/model-specialization/MODEL_CAPABILITY_MATRIX.v6.json", data: modelMatrix },
  tournament: { path: "docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_D.v2.json", data: tournament },
  tournamentReport: { path: "docs/experiments/model-specialization/MODEL_TOURNAMENT_FINAL_REPORT.v1.json", data: tournamentReport },
  semanticFailure: { path: "docs/experiments/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_SESSION_B.v1.json", data: semanticFailure },
  observability: { path: "docs/productization/PRIVACY_SAFE_OBSERVABILITY_PUBLIC_PROJECTION.v1.json", data: observability },
  codeFormation: { path: "docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_RESULTS_INDEX.v6.json", data: codeFormation }
};

/** Resolve only bundled evidence. Windows separators are accepted, while absolute and traversing paths fail closed. */
export function resolveCanonicalArtifact(requestedPath: string): RawArtifact | undefined {
  if (!requestedPath || requestedPath.includes("\0") || /^[A-Za-z]:[\\/]/.test(requestedPath)) return undefined;
  const normalized = requestedPath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) return undefined;
  return Object.values(canonicalArtifacts).find((artifact) => artifact.path === normalized);
}
