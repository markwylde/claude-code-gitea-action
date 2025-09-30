import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { checkAndDeleteEmptyBranch } from "../src/github/operations/branch-cleanup";
import type { GitHubClient } from "../src/github/api/client";
import { GITEA_SERVER_URL } from "../src/github/api/config";

describe("checkAndDeleteEmptyBranch", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    delete process.env.GITEA_API_URL; // ensure GitHub mode for predictable behaviour
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  const createMockClient = (
    options: { branchSha?: string; baseSha?: string; error?: Error } = {},
  ): GitHubClient => {
    const { branchSha = "branch-sha", baseSha = "base-sha", error } = options;
    return {
      api: {
        getBranch: async (_owner: string, _repo: string, branch: string) => {
          if (error) {
            throw error;
          }
          return {
            data: {
              commit: {
                sha: branch.includes("claude/") ? branchSha : baseSha,
              },
            },
          };
        },
      },
    } as unknown as GitHubClient;
  };

  test("returns defaults when no claude branch provided", async () => {
    const client = createMockClient();
    const result = await checkAndDeleteEmptyBranch(
      client,
      "owner",
      "repo",
      undefined,
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe("");
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test("marks branch for deletion when SHAs match", async () => {
    const client = createMockClient({ branchSha: "same", baseSha: "same" });
    const result = await checkAndDeleteEmptyBranch(
      client,
      "owner",
      "repo",
      "claude/issue-123",
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(true);
    expect(result.branchLink).toBe("");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Branch claude/issue-123 has same SHA as base, marking for deletion",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Skipping branch deletion - not reliably supported across all Git platforms: claude/issue-123",
    );
  });

  test("returns branch link when branch has commits", async () => {
    const client = createMockClient({ branchSha: "feature", baseSha: "main" });
    const result = await checkAndDeleteEmptyBranch(
      client,
      "owner",
      "repo",
      "claude/issue-123",
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe(
      `\n[View branch](${GITEA_SERVER_URL}/owner/repo/src/branch/claude/issue-123)`,
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Branch claude/issue-123 appears to have commits (different SHA from base)",
    );
  });

  test("falls back to branch link when API call fails", async () => {
    const client = createMockClient({ error: Object.assign(new Error("boom"), { status: 500 }) });
    const result = await checkAndDeleteEmptyBranch(
      client,
      "owner",
      "repo",
      "claude/issue-123",
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe(
      `\n[View branch](${GITEA_SERVER_URL}/owner/repo/src/branch/claude/issue-123)`,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error checking branch:",
      expect.any(Error),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Assuming branch exists due to non-404 error",
    );
  });
});
