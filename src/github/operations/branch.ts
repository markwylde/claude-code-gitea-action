#!/usr/bin/env bun

/**
 * Setup the appropriate branch based on the event type:
 * - For PRs: Checkout the PR branch
 * - For Issues: Create a new branch
 */

import { $ } from "bun";
import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { GitHubPullRequest } from "../types";
import type { GitHubClient } from "../api/client";
import type { FetchDataResult } from "../data/fetcher";

export type BranchInfo = {
  baseBranch: string;
  claudeBranch?: string;
  currentBranch: string;
};

export async function setupBranch(
  client: GitHubClient,
  githubData: FetchDataResult,
  context: ParsedGitHubContext,
): Promise<BranchInfo> {
  const { owner, repo } = context.repository;
  const entityNumber = context.entityNumber;
  const { baseBranch } = context.inputs;
  const isPR = context.isPR;

  if (isPR) {
    const prData = githubData.contextData as GitHubPullRequest;
    const prState = prData.state;

    // Check if PR is closed or merged
    if (prState === "CLOSED" || prState === "MERGED") {
      console.log(
        `PR #${entityNumber} is ${prState}, creating new branch from source...`,
      );
      // Fall through to create a new branch like we do for issues
    } else {
      // Handle open PR: Checkout the PR branch
      console.log("This is an open PR, checking out PR branch...");

      const branchName = prData.headRefName;

      // Execute git commands to checkout PR branch (shallow fetch for performance)
      // Fetch the branch with a depth of 20 to avoid fetching too much history, while still allowing for some context
      await $`git fetch origin --depth=20 ${branchName}`;
      await $`git checkout ${branchName}`;

      console.log(`Successfully checked out PR branch for PR #${entityNumber}`);

      // For open PRs, we need to get the base branch of the PR
      const baseBranch = prData.baseRefName;

      return {
        baseBranch,
        currentBranch: branchName,
      };
    }
  }

  // Determine source branch - use baseBranch if provided, otherwise fetch default
  let sourceBranch: string;

  if (baseBranch) {
    // Use provided base branch for source
    sourceBranch = baseBranch;
  } else {
    // No base branch provided, fetch the default branch to use as source
    const repoResponse = await client.api.getRepo(owner, repo);
    sourceBranch = repoResponse.data.default_branch;
  }

  // Creating a new branch for either an issue or closed/merged PR
  const entityType = isPR ? "pr" : "issue";
  console.log(
    `Creating new branch for ${entityType} #${entityNumber} from source branch: ${sourceBranch}...`,
  );

  const timestamp = new Date()
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}Z/, "")
    .split("T")
    .join("_");

  const newBranch = `claude/${entityType}-${entityNumber}-${timestamp}`;

  try {
    // Use local git operations instead of API since Gitea's API is unreliable
    console.log(
      `Setting up local git branch: ${newBranch} from: ${sourceBranch}`,
    );

    // Ensure we're in the repository directory
    const repoDir = process.env.GITHUB_WORKSPACE || process.cwd();
    console.log(`Working in directory: ${repoDir}`);

    try {
      // Check if we're in a git repository
      console.log(`Checking if we're in a git repository...`);
      await $`git status`;

      // Ensure we have the latest version of the source branch
      console.log(`Fetching latest ${sourceBranch}...`);
      await $`git fetch origin ${sourceBranch}`;

      // Checkout the source branch
      console.log(`Checking out ${sourceBranch}...`);
      await $`git checkout ${sourceBranch}`;

      // Pull latest changes
      console.log(`Pulling latest changes for ${sourceBranch}...`);
      await $`git pull origin ${sourceBranch}`;

      // Create and checkout the new branch
      console.log(`Creating new branch: ${newBranch}`);
      await $`git checkout -b ${newBranch}`;

      // Verify the branch was created
      const currentBranch = await $`git branch --show-current`;
      const branchName = currentBranch.toString().trim();
      console.log(`Current branch after creation: ${branchName}`);

      if (branchName === newBranch) {
        console.log(
          `✅ Successfully created and checked out branch: ${newBranch}`,
        );
      } else {
        throw new Error(
          `Branch creation failed. Expected ${newBranch}, got ${branchName}`,
        );
      }
    } catch (gitError: any) {
      console.error(`❌ Git operations failed:`, gitError);
      console.error(`Error message: ${gitError.message || gitError}`);

      // This is a critical failure - the branch MUST be created for Claude to work
      throw new Error(
        `Failed to create branch ${newBranch}: ${gitError.message || gitError}`,
      );
    }

    console.log(`Branch setup completed for: ${newBranch}`);

    // Set outputs for GitHub Actions
    core.setOutput("CLAUDE_BRANCH", newBranch);
    core.setOutput("BASE_BRANCH", sourceBranch);
    return {
      baseBranch: sourceBranch,
      claudeBranch: newBranch,
      currentBranch: newBranch,
    };
  } catch (error) {
    console.error("Error setting up branch:", error);
    process.exit(1);
  }
}
