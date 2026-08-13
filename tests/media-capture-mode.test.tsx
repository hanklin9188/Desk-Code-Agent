import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../apps/desktop/src/app/App";
import { capturePresets, resolveCapturePreset } from "../apps/desktop/src/app/captureMode";
import { fileTree } from "../apps/desktop/src/app/demo";
import { resolveCanonicalArtifact } from "../services/experiment-visualization/src/canonicalArtifacts";
import captureManifest from "../docs/media/CAPTURE_MANIFEST.json";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});
beforeEach(() => window.localStorage.clear());

describe("deterministic media capture mode", () => {
  it("defines five stable, unique capture presets", () => {
    expect(Object.keys(capturePresets)).toEqual(["hero-workspace", "research-dashboard", "task-workflow", "safety-verification", "architecture-evidence"]);
    expect(new Set(Object.values(capturePresets).map((preset) => preset.filename)).size).toBe(5);
    expect(Object.values(capturePresets).every((preset) => preset.width === 1440 && preset.height === 900)).toBe(true);
    expect(captureManifest.screenshots.map((item) => item.route)).toEqual(Object.keys(capturePresets).map((id) => `/?capture=${id}`));
    expect(captureManifest.screenshots.map((item) => item.eventPrefixCount)).toEqual(Object.values(capturePresets).map((preset) => preset.eventCount));
  });

  it("resolves exact presets and reduced motion without accepting unknown values", () => {
    const result = resolveCapturePreset("?capture=safety-verification&motion=reduced");
    expect(result?.id).toBe("safety-verification");
    expect(result?.reducedMotion).toBe(true);
    expect(result?.eventCount).toBeGreaterThan(0);
    expect(resolveCapturePreset("?capture=unknown")).toBeNull();
  });

  it("keeps the repository-to-evidence GIF target in the deterministic tree", () => {
    expect(fileTree.some((item) => item.name === "router.test.ts")).toBe(true);
  });

  it("boots directly into the deterministic research capture surface", () => {
    window.history.replaceState({}, "", "/?capture=research-dashboard");
    render(<App />);
    expect(screen.getByText("DETERMINISTIC CAPTURE")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Research Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Capability admission matrix" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Strongest-candidate verification funnel" })).toBeInTheDocument();
    expect(screen.getByText(/Fixture replay · zero model calls/)).toBeInTheDocument();
  });

  it("opens chart evidence in the in-app read-only artifact viewer", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", { name: "Start with a repository" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Research \(Ctrl\+7\)/ }));
    await user.click(screen.getByRole("button", { name: "View experiment evidence" }));
    const sourceButton = screen.getAllByRole("button", { name: /Open source: Privacy-safe public projection/ })[0];
    await user.click(sourceButton);
    const dialog = screen.getByRole("dialog", { name: "Canonical artifact" });
    expect(dialog).toHaveTextContent("PRIVACY_SAFE_OBSERVABILITY_PUBLIC_PROJECTION.v1.json");
    expect(dialog).toHaveTextContent("READ-ONLY BUNDLED EVIDENCE");

    const closeButton = screen.getByRole("button", { name: "Close artifact" });
    expect(closeButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Canonical artifact" })).not.toBeInTheDocument();
    expect(sourceButton).toHaveFocus();
  });

  it("normalizes safe Windows artifact separators without allowing arbitrary files", () => {
    const path = "docs/productization/PRIVACY_SAFE_OBSERVABILITY_PUBLIC_PROJECTION.v1.json";
    expect(resolveCanonicalArtifact(path)?.path).toBe(path);
    expect(resolveCanonicalArtifact(path.replaceAll("/", "\\"))?.path).toBe(path);
    expect(resolveCanonicalArtifact("docs\\evidence\\Report With Spaces.json")).toBeUndefined();
    expect(resolveCanonicalArtifact(`docs/evidence/${"nested/".repeat(45)}report.json`)).toBeUndefined();
    expect(resolveCanonicalArtifact("C:\\Users\\Public\\secret.txt")).toBeUndefined();
    expect(resolveCanonicalArtifact("..\\private\\secret.txt")).toBeUndefined();
    expect(resolveCanonicalArtifact("/etc/passwd")).toBeUndefined();
  });
});
