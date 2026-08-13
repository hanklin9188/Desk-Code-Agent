import type { RepositorySummary } from "./repositoryGateway";

export type PresentationPresetId =
  | "onboarding"
  | "repository-ready"
  | "guided-demo"
  | "appearance"
  | "research";

export interface PresentationPreset {
  id: PresentationPresetId;
  view: string;
  repositoryState: "EMPTY" | "READY_READ_ONLY" | "DEMO";
  repository: RepositorySummary | null;
  repositoryOpen: boolean;
  inspectorOpen: boolean;
  hideComposer: boolean;
  eventCount?: number;
  task: string;
  theme: "dark" | "light";
  textScale: "100" | "125";
  reducedMotion: boolean;
}

export const presentationRepository: RepositorySummary = {
  root: "PRESENTATION_FIXTURE_NOT_A_REAL_PATH",
  name: "sample-repository",
  branch: "main",
  headSha: "7b21c4a97e3008dd59a754db56c9984fcd28c8ab",
  workingTreeStatus: "NOT_CHECKED_SAFETY_BOUNDARY",
  readOnly: true,
  fileCount: 428,
  manifestFiles: ["Cargo.toml", "package.json"],
  files: [
    "Cargo.toml",
    "package.json",
    "src/app.ts",
    "src/repository/index.ts",
    "src/runtime/events.ts",
    "tests/repository.test.ts",
    "tests/runtime.test.ts"
  ]
};

const base = {
  repository: null,
  repositoryOpen: false,
  inspectorOpen: false,
  hideComposer: false,
  task: "",
  theme: "dark" as const,
  textScale: "100" as const,
  reducedMotion: true
};

export const presentationPresets: Record<PresentationPresetId, PresentationPreset> = {
  onboarding: {
    ...base,
    id: "onboarding",
    view: "Start",
    repositoryState: "EMPTY"
  },
  "repository-ready": {
    ...base,
    id: "repository-ready",
    view: "Repository",
    repositoryState: "READY_READ_ONLY",
    repository: presentationRepository,
    repositoryOpen: true
  },
  "guided-demo": {
    ...base,
    id: "guided-demo",
    view: "Flow",
    repositoryState: "DEMO",
    repositoryOpen: true,
    inspectorOpen: true,
    eventCount: 19,
    task: "Trace the runtime safety boundary and show the evidence behind the bounded proposal."
  },
  appearance: {
    ...base,
    id: "appearance",
    view: "Settings",
    repositoryState: "EMPTY",
    hideComposer: true,
    theme: "light",
    textScale: "125"
  },
  research: {
    ...base,
    id: "research",
    view: "Research",
    repositoryState: "EMPTY",
    hideComposer: true
  }
};

export function resolvePresentationPreset(
  search: string,
  enabled: boolean = import.meta.env.DEV
): PresentationPreset | null {
  if (!enabled) return null;
  const id = new URLSearchParams(search).get("presentation") as PresentationPresetId | null;
  if (!id || !Object.prototype.hasOwnProperty.call(presentationPresets, id)) return null;
  return presentationPresets[id];
}
