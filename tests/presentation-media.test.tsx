import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../apps/desktop/src/app/App";
import {
  presentationPresets,
  presentationRepository,
  resolvePresentationPreset
} from "../apps/desktop/src/app/presentationMode";
import manifest from "../docs/media/releases/v0.2.0/CAPTURE_MANIFEST.json";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

beforeEach(() => window.localStorage.clear());

describe("v0.2.0 presentation media", () => {
  it("defines five isolated, reduced-motion presentation states", () => {
    expect(Object.keys(presentationPresets)).toEqual([
      "onboarding",
      "repository-ready",
      "guided-demo",
      "appearance",
      "research"
    ]);
    expect(Object.values(presentationPresets).every((preset) => preset.reducedMotion)).toBe(true);
    expect(resolvePresentationPreset("?presentation=unknown")).toBeNull();
    expect(manifest.screenshots.map((item) => item.route)).toEqual(
      Object.keys(presentationPresets).map((id) => `/?presentation=${id}`)
    );
    expect(manifest.invariants.targetModelCalls).toBe(0);
    expect(manifest.invariants.legacyV0_1_0MediaModified).toBe(false);
  });

  it("cannot synthesize repository state when the production gate is closed", () => {
    expect(resolvePresentationPreset("?presentation=repository-ready", false)).toBeNull();
  });

  it.each([
    ["onboarding", "Start with a repository"],
    ["repository-ready", "Read-only repository connected"],
    ["guided-demo", "Flow"],
    ["appearance", "Make the workspace comfortable"],
    ["research", "Engineering intelligence you can inspect."]
  ] as const)("renders the %s presentation with an explicit label", (preset, heading) => {
    window.history.replaceState({}, "", `/?presentation=${preset}`);
    render(<App />);
    expect(screen.getByText("DETERMINISTIC PRESENTATION")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("uses only a sanitized repository fixture", () => {
    expect(presentationRepository.root).toBe("PRESENTATION_FIXTURE_NOT_A_REAL_PATH");
    expect(JSON.stringify(presentationRepository)).not.toMatch(/(?:[A-Z]:\\|\/home\/|Users\\)/);
  });
});
