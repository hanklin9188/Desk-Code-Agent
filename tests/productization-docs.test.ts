import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const docs = [
  "README.md", "BENCHMARKS.md", "docs/README.md",
  "docs/architecture/PRODUCT_ARCHITECTURE.md",
  "docs/productization/CAPABILITY_STATUS.md",
  "docs/productization/VISUALIZATION_DASHBOARD.md",
  "docs/productization/DEMO_PLAN.md",
  "docs/productization/P5_MEDIA_SPEC.md",
  "docs/productization/GITHUB_PRESENTATION_AUDIT.md",
  "docs/media/README.md",
  "docs/media/CAPTURE_INSTRUCTIONS.md",
  "docs/media/VISUAL_REGRESSION_MATRIX.md",
  "docs/media/screenshots/README.md",
  "docs/media/gifs/README.md",
  "docs/media/video/PORTFOLIO_VIDEO_STORYBOARD.md"
];

describe("productization documentation", () => {
  it("keeps local Markdown links resolvable", () => {
    const missing: string[] = [];
    for (const relative of docs) {
      const absolute = path.join(root, relative);
      const markdown = fs.readFileSync(absolute, "utf8");
      for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1].split("#")[0];
        if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
        const resolved = path.resolve(path.dirname(absolute), decodeURIComponent(target));
        if (!fs.existsSync(resolved)) missing.push(`${relative} -> ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("ships the three required Mermaid sources", () => {
    const diagrams = ["end-to-end-product-architecture.mmd", "evidence-gated-capability-admission.mmd", "privacy-safe-observability.mmd"];
    for (const diagram of diagrams) {
      const source = fs.readFileSync(path.join(root, "docs/architecture/diagrams", diagram), "utf8");
      expect(source).toMatch(/^flowchart /);
      expect(source.length).toBeGreaterThan(300);
    }
  });

  it("uses the frozen research and mutation statuses consistently", () => {
    for (const relative of ["README.md", "BENCHMARKS.md", "docs/productization/CAPABILITY_STATUS.md", "docs/exec-plans/active/MASTER_EXECUTION_PLAN.md"]) {
      const text = fs.readFileSync(path.join(root, relative), "utf8");
      expect(text, relative).toContain("RESEARCH_COMPLETE_INCONCLUSIVE_FORMATION_RESULT");
      expect(text, relative).toContain("KEEP_MUTATION_DISABLED");
    }
  });
});
