#!/usr/bin/env bun

import { $ } from "bun";

/**
 * Check if a branch exists locally using git commands
 */
export async function branchExists(branchName: string): Promise<boolean> {
  try {
    await $`git show-ref --verify --quiet refs/heads/${branchName}`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a remote branch exists using git commands
 */
export async function remoteBranchExists(branchName: string): Promise<boolean> {
  try {
    await $`git show-ref --verify --quiet refs/remotes/origin/${branchName}`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the SHA of a branch using git commands
 */
export async function getBranchSha(branchName: string): Promise<string | null> {
  try {
    // Try local branch first
    if (await branchExists(branchName)) {
      const result = await $`git rev-parse refs/heads/${branchName}`;
      return result.text().trim();
    }

    // Try remote branch if local doesn't exist
    if (await remoteBranchExists(branchName)) {
      const result = await $`git rev-parse refs/remotes/origin/${branchName}`;
      return result.text().trim();
    }

    return null;
  } catch (error) {
    console.error(`Error getting SHA for branch ${branchName}:`, error);
    return null;
  }
}

/**
 * Check if a branch has commits different from base branch
 */
export async function branchHasChanges(
  branchName: string,
  baseBranch: string,
): Promise<{
  hasChanges: boolean;
  branchSha: string | null;
  baseSha: string | null;
}> {
  try {
    const branchSha = await getBranchSha(branchName);
    const baseSha = await getBranchSha(baseBranch);

    if (!branchSha || !baseSha) {
      return { hasChanges: false, branchSha, baseSha };
    }

    const hasChanges = branchSha !== baseSha;
    return { hasChanges, branchSha, baseSha };
  } catch (error) {
    console.error(
      `Error comparing branches ${branchName} and ${baseBranch}:`,
      error,
    );
    return { hasChanges: false, branchSha: null, baseSha: null };
  }
}

/**
 * Fetch latest changes from remote to ensure we have up-to-date branch info
 */
export async function fetchBranch(branchName: string): Promise<boolean> {
  try {
    await $`git fetch origin --depth=1 ${branchName}`;
    return true;
  } catch (error) {
    console.log(
      `Could not fetch branch ${branchName} from remote (may not exist yet)`,
    );
    return false;
  }
}
