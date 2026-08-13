import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface RepositorySummary {
  root: string;
  name: string;
  branch: string;
  headSha: string;
  workingTreeStatus: "NOT_CHECKED_SAFETY_BOUNDARY";
  readOnly: true;
  fileCount: number;
  manifestFiles: string[];
  files: string[];
}

export type RepositoryGatewayErrorCode =
  | "DESKTOP_APP_REQUIRED"
  | "NOT_GIT_REPOSITORY"
  | "UNSUPPORTED_GIT_INDIRECTION"
  | "REPOSITORY_ACCESS_DENIED"
  | "REPOSITORY_HEAD_UNAVAILABLE"
  | "REPOSITORY_FILE_BUDGET_EXCEEDED"
  | "REPOSITORY_PATH_ENCODING_UNSUPPORTED"
  | "REPOSITORY_VALIDATION_FAILED";

const KNOWN_ERROR_CODES = new Set<RepositoryGatewayErrorCode>([
  "DESKTOP_APP_REQUIRED",
  "NOT_GIT_REPOSITORY",
  "UNSUPPORTED_GIT_INDIRECTION",
  "REPOSITORY_ACCESS_DENIED",
  "REPOSITORY_HEAD_UNAVAILABLE",
  "REPOSITORY_FILE_BUDGET_EXCEEDED",
  "REPOSITORY_PATH_ENCODING_UNSUPPORTED",
  "REPOSITORY_VALIDATION_FAILED"
]);

export class RepositoryGatewayError extends Error {
  readonly code: RepositoryGatewayErrorCode;

  constructor(code: RepositoryGatewayErrorCode) {
    super(code);
    this.name = "RepositoryGatewayError";
    this.code = code;
  }
}

export interface RepositoryGateway {
  pickLocalDirectory(): Promise<string | null>;
  inspectLocalRepository(path: string): Promise<RepositorySummary>;
}

function asGatewayError(error: unknown): RepositoryGatewayError {
  if (error instanceof RepositoryGatewayError) return error;
  const candidate =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : null;
  if (candidate && KNOWN_ERROR_CODES.has(candidate as RepositoryGatewayErrorCode)) {
    return new RepositoryGatewayError(candidate as RepositoryGatewayErrorCode);
  }
  return new RepositoryGatewayError("REPOSITORY_VALIDATION_FAILED");
}

function requireDesktopRuntime(): void {
  if (!isTauri()) throw new RepositoryGatewayError("DESKTOP_APP_REQUIRED");
}

export const nativeRepositoryGateway: RepositoryGateway = {
  async pickLocalDirectory(): Promise<string | null> {
    requireDesktopRuntime();
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose a local Git repository"
      });
      return typeof selected === "string" ? selected : null;
    } catch (error) {
      throw asGatewayError(error);
    }
  },

  async inspectLocalRepository(path: string): Promise<RepositorySummary> {
    requireDesktopRuntime();
    try {
      return await invoke<RepositorySummary>("inspect_repository", { path });
    } catch (error) {
      throw asGatewayError(error);
    }
  }
};

export function friendlyRepositoryError(error: unknown): string {
  const code = asGatewayError(error).code;
  switch (code) {
    case "DESKTOP_APP_REQUIRED":
      return "Open the desktop app to choose a local repository.";
    case "NOT_GIT_REPOSITORY":
      return "That folder is not a Git repository. Choose the repository folder or one of its subfolders.";
    case "UNSUPPORTED_GIT_INDIRECTION":
      return "Linked worktrees and submodule checkouts are not supported in this build. Choose the primary repository checkout.";
    case "REPOSITORY_ACCESS_DENIED":
      return "Desk Code Agent cannot read that folder. Check its permissions, then try again.";
    case "REPOSITORY_HEAD_UNAVAILABLE":
      return "Desk could not find metadata for the repository-reported HEAD. For a new repository, create its first commit; otherwise choose or repair a branch that has a commit.";
    case "REPOSITORY_FILE_BUDGET_EXCEEDED":
      return "This repository is too large for the safe onboarding limit.";
    case "REPOSITORY_PATH_ENCODING_UNSUPPORTED":
      return "This repository contains a path or Git metadata value that cannot be represented safely.";
    default:
      return "Desk Code Agent could not validate that repository. Nothing was changed.";
  }
}

/** @deprecated Prefer the more explicit friendlyRepositoryError name. */
export const repositoryErrorMessage = friendlyRepositoryError;
