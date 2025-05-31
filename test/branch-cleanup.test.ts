import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { checkAndDeleteEmptyBranch } from "../src/github/operations/branch-cleanup";
import type { Octokits } from "../src/github/api/client";
import { GITEA_SERVER_URL } from "../src/github/api/config";

describe("checkAndDeleteEmptyBranch", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  const createMockOctokit = (
    compareResponse?: any,
    deleteRefError?: Error,
  ): Octokits => {
    return {
      rest: {
        repos: {
          compareCommitsWithBasehead: async () => ({
            data: compareResponse || { total_commits: 0 },
          }),
        },
        git: {
          deleteRef: async () => {
            if (deleteRefError) {
              throw deleteRefError;
            }
            return { data: {} };
          },
        },
      },
    } as any as Octokits;
  };

  test("should return no branch link and not delete when branch is undefined", async () => {
    const mockOctokit = createMockOctokit();
    const result = await checkAndDeleteEmptyBranch(
      mockOctokit,
      "owner",
      "repo",
      undefined,
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe("");
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test("should delete branch and return no link when branch has no commits", async () => {
    const mockOctokit = createMockOctokit({ total_commits: 0 });
    const result = await checkAndDeleteEmptyBranch(
      mockOctokit,
      "owner",
      "repo",
      "claude/issue-123-20240101_123456",
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(true);
    expect(result.branchLink).toBe("");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Branch claude/issue-123-20240101_123456 has no commits from Claude, will delete it",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✅ Deleted empty branch: claude/issue-123-20240101_123456",
    );
  });

  test("should not delete branch and return link when branch has commits", async () => {
    const mockOctokit = createMockOctokit({ total_commits: 3 });
    const result = await checkAndDeleteEmptyBranch(
      mockOctokit,
      "owner",
      "repo",
      "claude/issue-123-20240101_123456",
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe(
      `\n[View branch](${GITEA_SERVER_URL}/owner/repo/src/branch/claude/issue-123-20240101_123456)`,
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("has no commits"),
    );
  });

  test("should handle branch comparison errors gracefully", async () => {
    const mockOctokit = {
      rest: {
        repos: {
          compareCommitsWithBasehead: async () => {
            throw new Error("API error");
          },
        },
        git: {
          deleteRef: async () => ({ data: {} }),
        },
      },
    } as any as Octokits;

    const result = await checkAndDeleteEmptyBranch(
      mockOctokit,
      "owner",
      "repo",
      "claude/issue-123-20240101_123456",
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe(
      `\n[View branch](${GITEA_SERVER_URL}/owner/repo/src/branch/claude/issue-123-20240101_123456)`,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error checking for commits on Claude branch:",
      expect.any(Error),
    );
  });

  test("should handle branch deletion errors gracefully", async () => {
    const deleteError = new Error("Delete failed");
    const mockOctokit = createMockOctokit({ total_commits: 0 }, deleteError);

    const result = await checkAndDeleteEmptyBranch(
      mockOctokit,
      "owner",
      "repo",
      "claude/issue-123-20240101_123456",
      "main",
    );

    expect(result.shouldDeleteBranch).toBe(true);
    expect(result.branchLink).toBe("");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to delete branch claude/issue-123-20240101_123456:",
      deleteError,
    );
  });
});
