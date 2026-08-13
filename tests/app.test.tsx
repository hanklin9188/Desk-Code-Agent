import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../apps/desktop/src/app/App";

afterEach(cleanup);

describe("desktop workspace", () => {
  it("navigates primary views and preserves explicit NOT RUN state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Verify \(Ctrl\+7\)/ }));
    expect(screen.getByRole("heading", { name: "Verify" })).toBeInTheDocument();
    expect(screen.getAllByText("NOT RUN").length).toBeGreaterThan(0);
    expect(screen.getByText(/Model prose cannot mark a stage PASS/)).toBeInTheDocument();
  });

  it("exposes repository import, findings, runtime telemetry, and approval center without fabricated live metrics", async () => {
    const user = userEvent.setup(); render(<App />);
    await user.click(screen.getByRole("button", { name: /Repository \(Ctrl\+1\)/ })); expect(screen.getByRole("button", { name: "Choose local folder" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Findings \(Ctrl\+8\)/ })); expect(screen.getByRole("heading", { name: /No findings/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Runtime" })); expect(screen.getByRole("heading", { name: /Offline/ })).toBeInTheDocument(); expect(screen.getByText("NOT RUN", { selector: ".metric-card strong" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approvals" })); expect(screen.getByRole("heading", { name: "No protected action is pending" })).toBeInTheDocument();
  });

  it("starts and cancels a run with visible semantic status", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Run$/ }));
    expect(screen.getByRole("button", { name: /^Stop$/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Stop$/ }));
    expect(screen.getByText("Cancelled", { selector: ".run-state" })).toBeInTheDocument();
    expect(screen.getByText(/partial evidence retained/, { selector: ".run-copy" })).toBeInTheDocument();
  });

  it("shows exact protected-action scope and supports denial", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Replay trace/ }));
    expect(screen.getByRole("region", { name: "Approval required" })).toHaveTextContent("sha256:8f3c41d9e7a2");
    expect(screen.getByRole("region", { name: "Approval required" })).toHaveTextContent("3 files · +54 −2");
    await user.click(screen.getByRole("button", { name: "Deny" }));
    expect(screen.queryByRole("region", { name: "Approval required" })).not.toBeInTheDocument();
    expect(screen.getByText("Protected action denied", { selector: ".run-copy" })).toBeInTheDocument();
  });

  it("navigates evidence provenance and reports observed runtime failures without inventing metrics", async () => {
    const user = userEvent.setup(); render(<App />);
    const evidenceButton = screen.getAllByRole("button", { name: /router\.test\.ts/ }).find((button) => button.classList.contains("evidence-row"));
    expect(evidenceButton).toBeDefined();
    await user.click(evidenceButton!);
    expect(screen.getByText("E-21")).toBeInTheDocument();
    expect(screen.getByText("9e041cb7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Runtime" }));
    expect(screen.getByRole("heading", { name: /Offline/ })).toBeInTheDocument();
    expect(screen.getByText("NOT RUN", { selector: ".metric-card strong" })).toBeInTheDocument();
  });
});
