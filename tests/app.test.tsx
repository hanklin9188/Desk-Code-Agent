import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../apps/desktop/src/app/App";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe("desktop workspace", () => {
  it("starts empty, keeps task surfaces unavailable, and labels demo-only verification", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "Start with a repository" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Run$/ })).toBeDisabled();
    for (const name of [/Workspace \(Ctrl\+3\)/, /Changes \(Ctrl\+4\)/, /Verify \(Ctrl\+5\)/, /Report \(Ctrl\+6\)/, /History \(Ctrl\+8\)/]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.queryByText("desk-code-agent", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("0c49a85", { exact: true })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    expect(screen.getByRole("status", { name: "Guided demo mode" })).toHaveTextContent("DEMO DATA · NO REPOSITORY ACCESSED · ZERO MODEL CALLS");
    const task = screen.getByRole("textbox", { name: "Task" });
    const fixedScenario = (task as HTMLTextAreaElement).value;
    expect(task).toHaveAttribute("readonly");
    expect(screen.getByText("FIXED DEMO SCENARIO")).toBeInTheDocument();
    await user.type(task, " Replace this with another task");
    expect(task).toHaveValue(fixedScenario);
    await user.click(screen.getByRole("button", { name: /Verify \(Ctrl\+5\)/ }));
    expect(screen.getByRole("heading", { name: "Verify" })).toBeInTheDocument();
    expect(screen.getAllByText("NOT RUN").length).toBeGreaterThan(0);
    expect(screen.getByText(/Model prose cannot mark a stage PASS/)).toBeInTheDocument();
  });

  it("keeps primary navigation focused and separates sealed research from live activity", async () => {
    const user = userEvent.setup();
    render(<App />);

    const primaryNavigation = screen.getByRole("navigation");
    for (const name of ["Start", "Repository", "Workspace", "Changes", "Verify", "Report", "Research", "History"]) {
      expect(primaryNavigation).toHaveTextContent(name);
    }
    expect(primaryNavigation).not.toHaveTextContent("Runtime");
    expect(primaryNavigation).not.toHaveTextContent("Approvals");
    expect(screen.getByText("Offline · no request")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Repository \(Ctrl\+2\)/ }));
    expect(screen.getByRole("button", { name: "Choose local folder" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Research \(Ctrl\+7\)/ }));
    expect(screen.getByRole("heading", { name: "Engineering intelligence you can inspect." })).toBeInTheDocument();
    expect(screen.getByText(/separate archive presents what the sealed evidence supports/)).toBeInTheDocument();
  });

  it("starts and cancels a run with visible semantic status", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    await user.click(screen.getByRole("button", { name: /^Run$/ }));
    expect(screen.getByRole("button", { name: /^Stop$/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Stop$/ }));
    expect(screen.getByText("Cancelled", { selector: ".run-state" })).toBeInTheDocument();
    expect(screen.getByText(/partial evidence retained/, { selector: ".run-copy" })).toBeInTheDocument();
  });

  it("labels the deterministic diff control as the explanation it actually provides", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    await user.click(screen.getByRole("button", { name: /Changes \(Ctrl\+4\)/ }));
    expect(screen.queryByRole("button", { name: "Reset preview" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Explain preview" }));
    expect(screen.getByText("This deterministic demo preview is read-only; nothing was changed.")).toBeInTheDocument();
  });

  it("shows exact protected-action scope and supports denial", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    await user.click(screen.getByRole("button", { name: /Replay demo/ }));
    expect(screen.getByRole("region", { name: "Approval required" })).toHaveTextContent("sha256:8f3c41d9e7a2");
    expect(screen.getByRole("region", { name: "Approval required" })).toHaveTextContent("3 files · +54 −2");
    await user.click(screen.getByRole("button", { name: "Deny" }));
    expect(screen.queryByRole("region", { name: "Approval required" })).not.toBeInTheDocument();
    expect(screen.getByText("Protected action denied", { selector: ".run-copy" })).toBeInTheDocument();
  });

  it("navigates labelled demo evidence provenance without presenting it as repository data", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    const evidenceButton = screen.getAllByRole("button", { name: /router\.test\.ts/ }).find((button) => button.classList.contains("evidence-row"));
    expect(evidenceButton).toBeDefined();
    await user.click(evidenceButton!);
    expect(screen.getByText("E-21")).toBeInTheDocument();
    expect(screen.getByText("9e041cb7")).toBeInTheDocument();
    expect(screen.getByText("✓ Demo fixture")).toBeInTheDocument();
    expect(screen.getByText("fixture replay")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Guided demo mode" })).toHaveTextContent("NO REPOSITORY ACCESSED");
  });
});
