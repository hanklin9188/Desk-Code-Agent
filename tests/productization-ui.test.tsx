import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../apps/desktop/src/app/App";
import { VisualizationBoundary } from "../apps/desktop/src/components/visualization/Charts";

afterEach(cleanup);

describe("productization surfaces", () => {
  it("stacks the workflow grid before the native 200 percent viewport overflows", () => {
    const styles = readFileSync(path.join(process.cwd(), "apps/desktop/src/styles.css"), "utf8");
    expect(styles).toMatch(/@media \(max-width:1300px\)[\s\S]*\.workflow-layout \{ grid-template-columns:minmax\(0,1fr\); \}/);
  });

  it("renders visible loading, empty, and validation error states", () => {
    const { rerender } = render(<VisualizationBoundary state={{ status: "LOADING" }}>{() => null}</VisualizationBoundary>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading sealed experiment evidence");
    rerender(<VisualizationBoundary state={{ status: "EMPTY", message: "No rows" }}>{() => null}</VisualizationBoundary>);
    expect(screen.getByText("No experiment evidence")).toBeInTheDocument();
    rerender(<VisualizationBoundary state={{ status: "ERROR", issues: ["broken denominator"] }}>{() => null}</VisualizationBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("broken denominator");
  });

  it("navigates the evidence dashboard and exposes all core experiment charts", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", { name: "Engineering intelligence you can inspect." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Experiments" }));
    for (const title of ["Evidence-to-decision timeline", "L0 failure decomposition", "Bounded retry intervention", "Strongest-candidate verification funnel", "L0 vs L1 observability", "Practical local model comparison", "Measured candidate runtime", "Paired semantic transition flow"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("keeps autonomous mutation visibly disabled on capability and safety pages", async () => {
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole("button", { name: "Capabilities" }));
    expect(screen.getAllByText("Autonomous mutation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DISABLED").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Safety" }));
    expect(screen.getByText(/Autonomous mutation is not a production capability/)).toBeInTheDocument();
    expect(screen.getByText(/Final formation study primary calls: 0/)).toBeInTheDocument();
  });
});
