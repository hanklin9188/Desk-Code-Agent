export type CapturePresetId = "hero-workspace" | "research-dashboard" | "task-workflow" | "safety-verification" | "architecture-evidence";

export interface CapturePreset {
  id: CapturePresetId;
  view: string;
  filename: string;
  width: 1440;
  height: 900;
  eventCount: number;
  repositoryOpen: boolean;
  inspectorOpen: boolean;
  hideComposer: boolean;
  task: string;
  reducedMotion: boolean;
}

const base = { width: 1440 as const, height: 900 as const, reducedMotion: false };

export const capturePresets: Record<CapturePresetId, CapturePreset> = {
  "hero-workspace": { ...base, id: "hero-workspace", view: "Flow", filename: "01-hero-workspace.png", eventCount: 19, repositoryOpen: true, inspectorOpen: true, hideComposer: false, task: "Trace the runtime safety boundary and show the evidence behind the bounded proposal." },
  "research-dashboard": { ...base, id: "research-dashboard", view: "Research Dashboard", filename: "02-research-dashboard.png", eventCount: 0, repositoryOpen: false, inspectorOpen: false, hideComposer: true, task: "Present the sealed capability and benchmark evidence." },
  "task-workflow": { ...base, id: "task-workflow", view: "Workspace", filename: "03-task-workflow.png", eventCount: 10, repositoryOpen: true, inspectorOpen: true, hideComposer: false, task: "Diagnose the routing risk, preview the bounded change, and verify every required stage." },
  "safety-verification": { ...base, id: "safety-verification", view: "Safety", filename: "04-safety-verification.png", eventCount: 20, repositoryOpen: false, inspectorOpen: false, hideComposer: false, task: "Reject any action that exceeds the exact approved scope and preserve rollback evidence." },
  "architecture-evidence": { ...base, id: "architecture-evidence", view: "Architecture Evidence", filename: "05-architecture-evidence.png", eventCount: 0, repositoryOpen: false, inspectorOpen: false, hideComposer: true, task: "Explain the evidence-gated architecture and privacy-safe observability boundary." }
};

export function resolveCapturePreset(search: string): CapturePreset | null {
  const params = new URLSearchParams(search);
  const id = params.get("capture") as CapturePresetId | null;
  if (!id || !Object.prototype.hasOwnProperty.call(capturePresets, id)) return null;
  return { ...capturePresets[id], reducedMotion: params.get("motion") === "reduced" };
}

