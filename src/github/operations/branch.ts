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

  // Determine base branch - use baseBranch if provided, otherwise fetch default
  let sourceBranch: string;

  if (baseBranch) {
    // Use provided base branch for source
    sourceBranch = baseBranch;
  } else {
    // No base branch provided, fetch the default branch to use as source
    const repoResponse = await client.api.getRepo(owner, repo);
    sourceBranch = repoResponse.data.default_branch;
  }

  if (isPR) {
    const prData = githubData.contextData as GitHubPullRequest;
    const prState = prData.state;

    // Check if PR is closed or merged
    if (prState === "CLOSED" || prState === "MERGED") {
      console.log(
        `PR #${entityNumber} is ${prState}, will let Claude create a new branch when needed`,
      );

      // Check out the base branch and let Claude create branches as needed
      await $`git fetch origin ${sourceBranch}`;
      await $`git checkout ${sourceBranch}`;
      await $`git pull origin ${sourceBranch}`;

      return {
        baseBranch: sourceBranch,
        currentBranch: sourceBranch,
      };
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

  // For issues, check out the base branch and let Claude create branches as needed
  console.log(
    `Setting up base branch ${sourceBranch} for issue #${entityNumber}, Claude will create branch when needed...`,
  );

  try {
    // Ensure we're in the repository directory
    const repoDir = process.env.GITHUB_WORKSPACE || process.cwd();
    console.log(`Working in directory: ${repoDir}`);

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

    // Verify the branch was checked out
    const currentBranch = await $`git branch --show-current`;
    const branchName = currentBranch.text().trim();
    console.log(`Current branch: ${branchName}`);

    if (branchName === sourceBranch) {
      console.log(`✅ Successfully checked out base branch: ${sourceBranch}`);
    } else {
      throw new Error(
        `Branch checkout failed. Expected ${sourceBranch}, got ${branchName}`,
      );
    }

    console.log(
      `Branch setup completed, ready for Claude to create branches as needed`,
    );

    // Set outputs for GitHub Actions
    core.setOutput("BASE_BRANCH", sourceBranch);
    return {
      baseBranch: sourceBranch,
      currentBranch: sourceBranch,
    };
  } catch (error) {
    console.error("Error setting up branch:", error);
    process.exit(1);
  }
}
