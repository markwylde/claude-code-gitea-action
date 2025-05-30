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
import type { Octokits } from "../api/client";
import type { FetchDataResult } from "../data/fetcher";

export type BranchInfo = {
  baseBranch: string;
  claudeBranch?: string;
  currentBranch: string;
};

export async function setupBranch(
  octokits: Octokits,
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
    const repoResponse = await octokits.rest.repos.get({
      owner,
      repo,
    });
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
    // Get the SHA of the source branch
    // For Gitea, try using the branches endpoint instead of git/refs
    let currentSHA: string;

    try {
      // First try the GitHub-compatible git.getRef approach
      const sourceBranchRef = await octokits.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${sourceBranch}`,
      });
      currentSHA = sourceBranchRef.data.object.sha;
    } catch (gitRefError: any) {
      // If git/refs fails (like in Gitea), use the branches endpoint
      console.log(
        `git/refs failed, trying branches endpoint: ${gitRefError.message}`,
      );
      const branchResponse = await octokits.rest.repos.getBranch({
        owner,
        repo,
        branch: sourceBranch,
      });
      // GitHub and Gitea both use commit.sha
      currentSHA = branchResponse.data.commit.sha;
    }

    console.log(`Current SHA: ${currentSHA}`);

    // Check if we're in a Gitea environment
    const isGitea =
      process.env.GITHUB_API_URL &&
      !process.env.GITHUB_API_URL.includes("api.github.com");

    if (isGitea) {
      // Gitea doesn't reliably support git.createRef, skip it
      console.log(
        `Detected Gitea environment, skipping git.createRef for branch: ${newBranch}`,
      );
      console.log(
        `Branch ${newBranch} will be created when files are pushed via MCP server`,
      );
    } else {
      // GitHub environment - try to create branch via API
      try {
        await octokits.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${newBranch}`,
          sha: currentSHA,
        });

        console.log(`Successfully created branch via API: ${newBranch}`);
      } catch (createRefError: any) {
        // If creation fails on GitHub, log but continue
        console.log(
          `git createRef failed on GitHub: ${createRefError.message}`,
        );
        console.log(`Error status: ${createRefError.status}`);
        console.log(
          `Branch ${newBranch} will be created when files are pushed`,
        );
      }
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
    console.error("Error creating branch:", error);
    process.exit(1);
  }
}
