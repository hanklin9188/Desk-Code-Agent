import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const styles = readFileSync(path.join(process.cwd(), "apps/desktop/src/styles.css"), "utf8");

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function token(block: string, name: string) {
  return block.match(new RegExp(`${name}:(#[0-9a-fA-F]{6})`))?.[1] ?? "";
}

describe("desktop readability and theme contract", () => {
  it("uses the canonical readable type floor", () => {
    expect(styles).toMatch(/font-size:calc\(14px \* var\(--font-scale, 1\)\)/);
    expect(styles).toContain("--text-compact:calc(12px * var(--font-scale,1))");
    expect(styles).toContain("--text-body:calc(15px * var(--font-scale,1))");
    expect(styles).toContain("--text-code:calc(13px * var(--font-scale,1))");

    const undersized = [...styles.matchAll(/font(?:-size)?:?(?:calc\()?([0-9.]+)px/g)]
      .map((match) => Number(match[1]))
      .filter((size) => size < 12);
    expect(undersized).toEqual([]);

    const crampedPixelLines = [...styles.matchAll(/line-height:([0-9.]+)px/g)]
      .map((match) => Number(match[1]))
      .filter((height) => height < 17);
    expect(crampedPixelLines).toEqual([]);
  });

  it("applies 100, 110, and 125 percent scaling to every text category", () => {
    expect(styles).toMatch(/font-size:calc\(12px \* var\(--font-scale, 1\)\)/);
    expect(styles).toMatch(/font-size:calc\(14px \* var\(--font-scale, 1\)\)/);
    expect(styles).toMatch(/font-size:calc\(15px \* var\(--font-scale, 1\)\)/);
    expect(styles).toMatch(/font:calc\(12px \* var\(--font-scale, 1\)\)/);
    expect(styles).not.toMatch(/font-size:(?:12|13|14|15)px/);
    expect(styles).toMatch(/\.app \.portfolio-hero h2 \{ font-size:clamp\(34px,calc\(34px \* var\(--font-scale, 1\)\),42px\)/);
    expect(styles).toMatch(/\.app \.metric-card strong \{ font-size:clamp\(25px,calc\(25px \* var\(--font-scale, 1\)\),30px\)/);
  });

  it("defines semantic dark, light, and system-aware color tokens", () => {
    for (const token of [
      "--color-canvas",
      "--color-surface-raised",
      "--color-text",
      "--color-text-muted",
      "--color-border",
      "--color-accent",
      "--color-success",
      "--color-danger",
      "--color-focus"
    ]) expect(styles).toContain(token);

    expect(styles).toMatch(/\.app\[data-theme="dark"\]/);
    expect(styles).toMatch(/\.app\[data-theme="light"\]/);
    expect(styles).toMatch(/@media \(prefers-color-scheme:light\)/);

    const dark = styles.match(/^:root \{([\s\S]*?)^\}/m)?.[1] ?? "";
    const light = styles.match(/:root\[data-theme="light"\],[^{]+\{([\s\S]*?)^\}/m)?.[1] ?? "";
    expect(contrast(token(dark, "--color-text-muted"), token(dark, "--color-surface-raised"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(light, "--color-text-muted"), token(light, "--color-surface-raised"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(light, "--color-text-subtle"), token(light, "--color-canvas"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps shell and Research components theme-driven with contrasting text", () => {
    const research = styles.slice(styles.indexOf(".portfolio-page"), styles.indexOf("/* Readability"));
    const forbiddenDarkSurfaces = ["background:#111925", "background:#0f1721", "background:#101720", "background:#151f2f"];
    for (const surface of forbiddenDarkSurfaces) expect(research).not.toContain(surface);
    expect(styles).toMatch(/\.product-card \{[^}]*background:var\(--raised\)/);
    expect(styles).toMatch(/\.product-card dd \{[^}]*color:var\(--ink\)/);
    expect(styles).not.toMatch(/\.product-card dd \{[^}]*#34434a/);
    expect(styles).toMatch(/\.viz-card \{[^}]*background:var\(--raised\)/);
    expect(styles).toMatch(/\.runtime-cards article \{[^}]*background:var\(--color-surface-muted\)/);
    expect(styles).toMatch(/\.workflow-stages,\.workflow-preview \{[^}]*background:var\(--raised\)/);
    expect(styles).toMatch(/\.app \{[\s\S]*?--canvas:var\(--color-canvas\);[\s\S]*?--raised:var\(--color-surface-raised\);[\s\S]*?--ink:var\(--color-text\);/);
    expect(styles).toMatch(/\.app \.diff-toolbar small \{ color:var\(--green\); \}/);
    expect(styles).toMatch(/\.app \.patch-reason p,\.app \.stage-summary \{ color:var\(--muted\); \}/);
    expect(styles).toMatch(/\.app \.approval-bar small,\.app \.approval-bar em \{ color:var\(--ink\); \}/);

    const dark = styles.match(/^:root \{([\s\S]*?)^\}/m)?.[1] ?? "";
    const light = styles.match(/:root\[data-theme="light"\],[^{]+\{([\s\S]*?)^\}/m)?.[1] ?? "";
    expect(contrast(token(dark, "--color-text"), token(dark, "--color-surface-raised"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(light, "--color-text"), token(light, "--color-surface-raised"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps focus visible and removes motion when requested", () => {
    expect(styles).toMatch(/:where\(button,a,input,textarea,select,\[tabindex\]\):focus-visible \{ outline:3px solid var\(--color-focus\)/);
    expect(styles).toMatch(/\.segmented-control input:focus-visible\+span \{ outline:3px solid var\(--color-focus\)/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion:reduce\)[\s\S]*?\*,\*::before,\*::after \{[^}]*animation:none!important;transition:none!important;/);
    expect(styles).toMatch(/\.reduce-motion \*,\.reduce-motion \*::before,\.reduce-motion \*::after \{[^}]*animation:none!important;[^}]*transition:none!important;/);
  });

  it("reflows at native and 200 percent desktop widths without a root width lock", () => {
    expect(styles).not.toContain("min-width:980px");
    expect(styles).toMatch(/@media \(max-width:1200px\)/);
    expect(styles).toMatch(/@media \(max-width:980px\)/);
    expect(styles).toContain("--rail-width:88px");
    expect(styles).toMatch(/\.repository-panel \{ position:absolute;[^}]*width:min\(300px,calc\(100vw - var\(--rail-width\)\)\)/);
    expect(styles).toMatch(/\.inspector \{ width:min\(350px,calc\(100vw - var\(--rail-width\)\)\)/);
    expect(styles).not.toMatch(/\.inspector\s*\{\s*display:none/);
  });

  it("styles the first-run, repository-ready, and preference surfaces", () => {
    for (const selector of [
      ".demo-banner",
      ".onboarding-hero",
      ".onboarding-steps",
      ".task-examples",
      ".github-guidance",
      ".repository-ready-view",
      ".repository-boundary",
      ".unavailable-view",
      ".panel-heading",
      ".file-manifest-row",
      ".segmented-control",
      ".settings-section-current",
      ".immutable-settings"
    ]) expect(styles).toContain(selector);
  });
});
