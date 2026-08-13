import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../apps/desktop/src/app/App";
import type { RepositoryGateway, RepositorySummary } from "../apps/desktop/src/app/repositoryGateway";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

const repository: RepositorySummary = {
  root: "C:\\work\\sample-repo",
  name: "sample-repo",
  branch: "main",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  workingTreeStatus: "NOT_CHECKED_SAFETY_BOUNDARY",
  readOnly: true,
  fileCount: 3,
  manifestFiles: ["package.json"],
  files: ["package.json", "src/index.ts", "tests/index.test.ts"]
};

function gateway(overrides: Partial<RepositoryGateway> = {}): RepositoryGateway {
  return {
    pickLocalDirectory: vi.fn().mockResolvedValue(repository.root),
    inspectLocalRepository: vi.fn().mockResolvedValue(repository),
    ...overrides
  };
}

describe("repository onboarding", () => {
  it("starts empty with one clear path and no fabricated repository state", () => {
    render(<App repositoryGateway={gateway()} />);
    expect(screen.getByRole("heading", { name: "Start with a repository" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose local folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try guided demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Run$/ })).toBeDisabled();
    expect(screen.getByText(/Choose a Git repository folder already on this computer/)).toBeInTheDocument();
    expect(screen.queryByText("Index snapshot loaded")).not.toBeInTheDocument();
    expect(screen.queryByText("0c49a85")).not.toBeInTheDocument();
  });

  it("selects and validates a local repository through the injected native boundary", async () => {
    const adapter = gateway();
    const user = userEvent.setup();
    render(<App repositoryGateway={adapter} />);
    await user.click(screen.getByRole("button", { name: "Choose local folder" }));
    await waitFor(() => expect(adapter.pickLocalDirectory).toHaveBeenCalledOnce());
    await waitFor(() => expect(adapter.inspectLocalRepository).toHaveBeenCalledWith(repository.root));
    expect(await screen.findByText("sample-repo", { selector: ".repo-identity strong" })).toBeInTheDocument();
    expect(screen.getByText(/main · 0123456/)).toBeInTheDocument();
    expect(screen.getByText("Read-only repository connected")).toBeInTheDocument();
    expect(screen.getByText("Observed HEAD")).toBeInTheDocument();
    expect(screen.getByText(/untrusted metadata/)).toBeInTheDocument();
    expect(screen.getByText("Working tree status not inspected for safety")).toBeInTheDocument();
    expect(screen.getByText(/worktree not checked/)).toBeInTheDocument();
    expect(screen.queryByText(/Working tree clean|Working tree has local changes/)).not.toBeInTheDocument();
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    expect(screen.queryByText(repository.root)).not.toBeInTheDocument();
  });

  it("locks every visible repository acquisition entry point while selection and validation are pending", async () => {
    let resolvePick!: (path: string | null) => void;
    let resolveInspection!: (summary: RepositorySummary) => void;
    const pickLocalDirectory = vi.fn(() => new Promise<string | null>((resolve) => { resolvePick = resolve; }));
    const inspectLocalRepository = vi.fn(() => new Promise<RepositorySummary>((resolve) => { resolveInspection = resolve; }));
    const user = userEvent.setup();
    render(<App repositoryGateway={gateway({ pickLocalDirectory, inspectLocalRepository })} />);

    await user.click(screen.getByRole("button", { name: "Choose local folder" }));
    expect(screen.getByRole("button", { name: "Waiting for folder…" })).toBeDisabled();
    const topRepositoryButton = screen.getByRole("button", { name: "Choose local repository" });
    expect(topRepositoryButton).toBeDisabled();
    fireEvent.click(topRepositoryButton);
    expect(pickLocalDirectory).toHaveBeenCalledOnce();

    await act(async () => resolvePick(repository.root));
    expect(await screen.findByRole("button", { name: "Checking repository…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose local repository" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Choose local repository" }));
    expect(inspectLocalRepository).toHaveBeenCalledOnce();

    await act(async () => resolveInspection(repository));
    expect(await screen.findByText("Read-only repository connected")).toBeInTheDocument();
  });

  it("keeps cancellation neutral and presents validation failures with a retry action", async () => {
    const user = userEvent.setup();
    const cancelled = gateway({ pickLocalDirectory: vi.fn().mockResolvedValue(null) });
    const { rerender } = render(<App repositoryGateway={cancelled} />);
    await user.click(screen.getByRole("button", { name: "Choose local folder" }));
    expect(await screen.findByRole("heading", { name: "Start with a repository" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const failing = gateway({ inspectLocalRepository: vi.fn().mockRejectedValue(new Error("NOT_GIT_REPOSITORY")) });
    rerender(<App repositoryGateway={failing} />);
    await user.click(screen.getByRole("button", { name: "Choose local folder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a Git repository");
    expect(screen.getByRole("button", { name: "Choose another folder" })).toBeInTheDocument();
  });

  it("keeps the guided demo explicit and reversible", async () => {
    const user = userEvent.setup();
    render(<App repositoryGateway={gateway()} />);
    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    expect(screen.getByRole("status", { name: "Guided demo mode" })).toHaveTextContent("DEMO DATA · NO REPOSITORY ACCESSED");
    expect(screen.getByRole("button", { name: /^Run$/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Exit demo" }));
    expect(screen.getByRole("heading", { name: "Start with a repository" })).toBeInTheDocument();
  });

  it("treats picker cancellation from the guided demo as a neutral operation", async () => {
    let resolvePick!: (path: string | null) => void;
    const user = userEvent.setup();
    const adapter = gateway({
      pickLocalDirectory: vi.fn(() => new Promise<string | null>((resolve) => { resolvePick = resolve; }))
    });
    render(<App repositoryGateway={adapter} />);

    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    const task = screen.getByRole("textbox", { name: "Task" });
    const fixedScenario = task.getAttribute("value") ?? (task as HTMLTextAreaElement).value;
    expect(task).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "Replay demo" }));
    expect(screen.getByRole("region", { name: "Approval required" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open local repo" }));
    expect(screen.getByRole("status", { name: "Guided demo mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open local repo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guided demo repository" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exit demo" })).toBeDisabled();
    await act(async () => resolvePick(null));
    expect(adapter.inspectLocalRepository).not.toHaveBeenCalled();
    expect(await screen.findByRole("status", { name: "Guided demo mode" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue(fixedScenario);
    expect(screen.getByRole("region", { name: "Approval required" })).toBeInTheDocument();
  });

  it("drops all demo state before opening a user repository", async () => {
    const adapter = gateway();
    const user = userEvent.setup();
    render(<App repositoryGateway={adapter} />);

    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    expect(screen.getByRole("status", { name: "Guided demo mode" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Replay demo" }));
    expect(screen.getByRole("region", { name: "Approval required" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open local repo" }));
    expect(await screen.findByText("Read-only repository connected")).toBeInTheDocument();
    expect(adapter.inspectLocalRepository).toHaveBeenCalledWith(repository.root);
    expect(screen.queryByRole("status", { name: "Guided demo mode" })).not.toBeInTheDocument();
    expect(screen.queryByText("Demo snapshot")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Approval required" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Run$/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Task" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("");
  });

  it("fails closed to an explicit error screen when repository validation rejects from demo", async () => {
    const user = userEvent.setup();
    const adapter = gateway({
      inspectLocalRepository: vi.fn().mockRejectedValue(new Error("NOT_GIT_REPOSITORY"))
    });
    render(<App repositoryGateway={adapter} />);

    await user.click(screen.getByRole("button", { name: "Try guided demo" }));
    await user.click(screen.getByRole("button", { name: "Replay demo" }));
    expect(screen.getByRole("region", { name: "Approval required" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open local repo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a Git repository");
    expect(screen.getByRole("heading", { name: "Start with a repository" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Guided demo mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Approval required" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Agent flow")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Task" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("");
    expect(screen.getByRole("button", { name: /^Run$/ })).toBeDisabled();
  });

  it("keeps Settings available for a connected repository and makes Ctrl+P focus the file filter", async () => {
    const user = userEvent.setup();
    render(<App repositoryGateway={gateway()} />);
    await user.click(screen.getByRole("button", { name: "Choose local folder" }));
    expect(await screen.findByText("Read-only repository connected")).toBeInTheDocument();

    const filter = screen.getByRole("textbox", { name: "Filter repository files" });
    screen.getByRole("button", { name: "Open settings" }).focus();
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    expect(filter).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("heading", { name: "Make the workspace comfortable" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Appearance" })).not.toBeInTheDocument();
    expect(screen.getByText("Appearance")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("heading", { name: "Task runtime is not connected yet" })).not.toBeInTheDocument();
  });
});
