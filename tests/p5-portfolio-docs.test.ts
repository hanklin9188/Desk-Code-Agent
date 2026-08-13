import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("P5 portfolio documentation", () => {
  it("keeps the current first-run README hierarchy and historical media", () => {
    const readme = read("README.md");
    const headings = ["Start in three steps", "What works today", "A workspace, not a chat box", "Designed for visual comfort", "Safety by construction", "Install on Windows", "Research evidence", "Develop locally", "Documentation", "Known limitations", "License"];
    let prior = -1;
    for (const heading of headings) {
      const index = readme.indexOf(`## ${heading}`);
      expect(index, heading).toBeGreaterThan(prior);
      prior = index;
    }
    for (const filename of [
      "01-onboarding.png",
      "02-repository-ready.png",
      "03-guided-demo-workspace.png",
      "04-appearance-settings.png",
      "05-research-archive.png"
    ]) {
      const relative = `docs/media/releases/v0.2.0/screenshots/${filename}`;
      expect(readme).toContain(relative);
      expect(fs.existsSync(path.join(root, relative))).toBe(true);
    }
    expect(readme).not.toContain("docs/media/screenshots/");
    expect(fs.existsSync(path.join(root, "docs/media/readme/desk-code-agent-hero.svg"))).toBe(true);
  });

  it("defines all final media files and the complete 3:30 storyboard", () => {
    const manifest = JSON.parse(read("docs/media/CAPTURE_MANIFEST.json")) as { screenshots: { filename: string; validation: string }[]; gifs: { filename: string; validation: string }[]; video: { targetDurationSeconds: number }; targetModelCalls: number; benchmarkCalls: number; generatedMediaStatus: string };
    expect(manifest.screenshots).toHaveLength(5);
    expect(manifest.gifs).toHaveLength(3);
    expect(manifest.video.targetDurationSeconds).toBe(210);
    expect(manifest.targetModelCalls).toBe(0);
    expect(manifest.benchmarkCalls).toBe(0);
    expect(manifest.generatedMediaStatus).toBe("COMPLETE_5_PNG_3_GIF");
    for (const asset of [...manifest.screenshots, ...manifest.gifs]) {
      expect(asset.validation).toBe("PASS");
      expect(fs.statSync(path.join(root, "docs/media", asset.filename)).size).toBeGreaterThan(0);
    }
    const storyboard = read("docs/media/video/PORTFOLIO_VIDEO_STORYBOARD.md");
    for (const timecode of ["0:00–0:20", "0:20–0:50", "0:50–1:35", "1:35–2:05", "2:05–2:40", "2:40–3:10", "3:10–3:30"]) expect(storyboard).toContain(timecode);
  });

  it("records every required scale and preserves the capability lock", () => {
    const matrix = read("docs/media/VISUAL_REGRESSION_MATRIX.md");
    for (const scale of ["100%", "125%", "150%", "200%"] ) expect(matrix).toContain(scale);
    const capability = read("docs/productization/CAPABILITY_STATUS.md");
    for (const state of ["Production", "Assisted", "Research Only", "Disabled"]) expect(capability).toContain(state);
    expect(capability).toContain("preregistered product reliability threshold");
    expect(read("README.md")).toContain("KEEP_MUTATION_DISABLED");
  });

  it("declares the Windows bundle icon explicitly", () => {
    const config = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json")) as { bundle: { active: boolean; targets: string; icon: string[] } };
    expect(config.bundle.active).toBe(true);
    expect(config.bundle.targets).toBe("all");
    expect(config.bundle.icon).toContain("icons/icon.ico");
    expect(fs.existsSync(path.join(root, "apps/desktop/src-tauri/icons/icon.ico"))).toBe(true);
  });
});
