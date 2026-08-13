import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn()
}));

import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  friendlyRepositoryError,
  nativeRepositoryGateway,
  type RepositorySummary
} from "../apps/desktop/src/app/repositoryGateway";

const summary: RepositorySummary = {
  root: "C:\\work\\sample-repo",
  name: "sample-repo",
  branch: "main",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  workingTreeStatus: "NOT_CHECKED_SAFETY_BOUNDARY",
  readOnly: true,
  fileCount: 2,
  manifestFiles: ["package.json"],
  files: ["package.json", "src/index.ts"]
};

describe("native repository gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isTauri).mockReturnValue(false);
  });

  it("fails honestly without calling native APIs in a browser", async () => {
    await expect(nativeRepositoryGateway.pickLocalDirectory()).rejects.toMatchObject({
      code: "DESKTOP_APP_REQUIRED"
    });
    await expect(nativeRepositoryGateway.inspectLocalRepository("/repo")).rejects.toMatchObject({
      code: "DESKTOP_APP_REQUIRED"
    });
    expect(open).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("opens only a single directory and invokes read-only inspection", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(open).mockResolvedValue("C:\\work\\sample-repo");
    vi.mocked(invoke).mockResolvedValue(summary);

    await expect(nativeRepositoryGateway.pickLocalDirectory()).resolves.toBe(
      "C:\\work\\sample-repo"
    );
    await expect(
      nativeRepositoryGateway.inspectLocalRepository("C:\\work\\sample-repo")
    ).resolves.toEqual(summary);

    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Choose a local Git repository"
    });
    expect(invoke).toHaveBeenCalledWith("inspect_repository", {
      path: "C:\\work\\sample-repo"
    });
  });

  it("maps only stable error codes to user-facing messages", () => {
    expect(friendlyRepositoryError(new Error("NOT_GIT_REPOSITORY"))).toContain(
      "not a Git repository"
    );
    expect(friendlyRepositoryError(new Error("UNSUPPORTED_GIT_INDIRECTION"))).toContain(
      "Linked worktrees and submodule checkouts"
    );
    expect(friendlyRepositoryError(new Error("raw secret-looking stderr"))).toBe(
      "Desk Code Agent could not validate that repository. Nothing was changed."
    );
  });
});
