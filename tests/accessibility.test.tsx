import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { App } from "../apps/desktop/src/app/App";

afterEach(cleanup);

describe("desktop accessibility baseline", () => {
  it("has no automatically detectable critical WCAG violations", async () => {
    const { container } = render(<App />);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    const critical = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(critical, critical.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
  });
});
