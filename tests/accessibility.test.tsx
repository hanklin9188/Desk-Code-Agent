import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { App } from "../apps/desktop/src/app/App";
import "../apps/desktop/src/styles.css";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe("desktop accessibility baseline", () => {
  it("has no automatically detectable serious WCAG violations on honest first run", async () => {
    const { container } = render(<App />);
    expect(screen.getByRole("heading", { name: "Start with a repository" })).toBeInTheDocument();
    const result = await axe.run(container);
    const critical = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(critical, critical.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
  });

  it("has no automatically detectable serious WCAG violations in explicitly labelled demo mode", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    expect(screen.getByRole("status", { name: "Guided demo mode" })).toHaveTextContent("NO REPOSITORY ACCESSED");
    const result = await axe.run(container);
    const critical = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(critical, critical.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
  });
});
