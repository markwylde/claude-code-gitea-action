#!/usr/bin/env bun

import { createClient } from "../github/api/client";
import * as fs from "fs/promises";
import {
  updateCommentBody,
  type CommentUpdateInput,
} from "../github/operations/comment-logic";
import {
  parseGitHubContext,
  isPullRequestReviewCommentEvent,
} from "../github/context";
import { GITEA_SERVER_URL } from "../github/api/config";
import { checkAndDeleteEmptyBranch } from "../github/operations/branch-cleanup";
import {
  branchHasChanges,
  fetchBranch,
  branchExists,
  remoteBranchExists,
} from "../github/utils/local-git";

async function run() {
  try {
    const commentId = parseInt(process.env.CLAUDE_COMMENT_ID!);
    const githubToken = process.env.GITHUB_TOKEN!;
    const claudeBranch = process.env.CLAUDE_BRANCH;
    const baseBranch = process.env.BASE_BRANCH || "main";
    const triggerUsername = process.env.TRIGGER_USERNAME;

    const context = parseGitHubContext();
    const { owner, repo } = context.repository;
    const client = createClient(githubToken);

    const serverUrl = GITEA_SERVER_URL;
    const jobUrl = `${serverUrl}/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;

    let comment;
    let isPRReviewComment = false;

    try {
      // GitHub has separate ID namespaces for review comments and issue comments
      // We need to use the correct API based on the event type
      if (isPullRequestReviewCommentEvent(context)) {
        // For PR review comments, use the pulls API
        console.log(`Fetching PR review comment ${commentId}`);
        const response = await client.api.customRequest(
          "GET",
          `/api/v1/repos/${owner}/${repo}/pulls/comments/${commentId}`,
        );
        comment = response.data;
        isPRReviewComment = true;
        console.log("Successfully fetched as PR review comment");
      }

      // For all other event types, use the issues API
      if (!comment) {
        console.log(`Fetching issue comment ${commentId}`);
        const response = await client.api.customRequest(
          "GET",
          `/api/v1/repos/${owner}/${repo}/issues/comments/${commentId}`,
        );
        comment = response.data;
        isPRReviewComment = false;
        console.log("Successfully fetched as issue comment");
      }
    } catch (finalError) {
      // If all attempts fail, try to determine more information about the comment
      console.error("Failed to fetch comment. Debug info:");
      console.error(`Comment ID: ${commentId}`);
      console.error(`Event name: ${context.eventName}`);
      console.error(`Entity number: ${context.entityNumber}`);
      console.error(`Repository: ${context.repository.full_name}`);

      // Try to get the PR info to understand the comment structure
      try {
        const pr = await client.api.getPullRequest(
          owner,
          repo,
          context.entityNumber,
        );
        console.log(`PR state: ${pr.data.state}`);
        console.log(`PR comments count: ${pr.data.comments}`);
        console.log(`PR review comments count: ${pr.data.review_comments}`);
      } catch {
        console.error("Could not fetch PR info for debugging");
      }

      throw finalError;
    }

    const currentBody = comment.body ?? "";

    // Check if we need to add branch link for new branches
    const { shouldDeleteBranch, branchLink } = await checkAndDeleteEmptyBranch(
      client,
      owner,
      repo,
      claudeBranch,
      baseBranch,
    );

    // Check if we need to add PR URL when we have a new branch
    let prLink = "";
    // If claudeBranch is set, it means we created a new branch (for issues or closed/merged PRs)
    if (claudeBranch && !shouldDeleteBranch) {
      // Check if comment already contains a PR URL
      const serverUrlPattern = serverUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const prUrlPattern = new RegExp(
        `${serverUrlPattern}\\/.+\\/compare\\/${baseBranch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\.\\.`,
      );
      const containsPRUrl = currentBody.match(prUrlPattern);

      if (!containsPRUrl) {
        // Check if we're using Gitea or GitHub
        const giteaApiUrl = process.env.GITEA_API_URL?.trim();
        const isGitea =
          giteaApiUrl &&
          giteaApiUrl !== "" &&
          !giteaApiUrl.includes("api.github.com") &&
          !giteaApiUrl.includes("github.com");

        if (isGitea) {
          // Use local git commands for Gitea
          console.log(
            "Using local git commands for PR link check (Gitea mode)",
          );

          try {
            // Fetch latest changes from remote
            await fetchBranch(claudeBranch);
            await fetchBranch(baseBranch);

            // Check if branch exists and has changes
            const { hasChanges, branchSha, baseSha } = await branchHasChanges(
              claudeBranch,
              baseBranch,
            );

            if (branchSha && baseSha) {
              if (hasChanges) {
                console.log(
                  `Branch ${claudeBranch} appears to have changes (different SHA from base)`,
                );
                const entityType = context.isPR ? "PR" : "Issue";
                const prTitle = encodeURIComponent(
                  `${entityType} #${context.entityNumber}: Changes from Claude`,
                );
                const prBody = encodeURIComponent(
                  `This PR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
                );
                const prUrl = `${serverUrl}/${owner}/${repo}/compare/${baseBranch}...${claudeBranch}?quick_pull=1&title=${prTitle}&body=${prBody}`;
                prLink = `\n[Create a PR](${prUrl})`;
              } else {
                console.log(
                  `Branch ${claudeBranch} has same SHA as base, no PR link needed`,
                );
              }
            } else {
              // If we can't get SHAs, check if branch exists at all
              const localExists = await branchExists(claudeBranch);
              const remoteExists = await remoteBranchExists(claudeBranch);

              if (localExists || remoteExists) {
                console.log(
                  `Branch ${claudeBranch} exists but SHA comparison failed, adding PR link to be safe`,
                );
                const entityType = context.isPR ? "PR" : "Issue";
                const prTitle = encodeURIComponent(
                  `${entityType} #${context.entityNumber}: Changes from Claude`,
                );
                const prBody = encodeURIComponent(
                  `This PR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
                );
                const prUrl = `${serverUrl}/${owner}/${repo}/compare/${baseBranch}...${claudeBranch}?quick_pull=1&title=${prTitle}&body=${prBody}`;
                prLink = `\n[Create a PR](${prUrl})`;
              } else {
                console.log(
                  `Branch ${claudeBranch} does not exist yet - no PR link needed`,
                );
                prLink = "";
              }
            }
          } catch (error: any) {
            console.error("Error checking branch with git commands:", error);
            // For errors, add PR link to be safe
            console.log("Adding PR link as fallback due to git command error");
            const entityType = context.isPR ? "PR" : "Issue";
            const prTitle = encodeURIComponent(
              `${entityType} #${context.entityNumber}: Changes from Claude`,
            );
            const prBody = encodeURIComponent(
              `This PR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
            );
            const prUrl = `${serverUrl}/${owner}/${repo}/compare/${baseBranch}...${claudeBranch}?quick_pull=1&title=${prTitle}&body=${prBody}`;
            prLink = `\n[Create a PR](${prUrl})`;
          }
        } else {
          // Use API calls for GitHub
          console.log("Using API calls for PR link check (GitHub mode)");

          try {
            // Get the branch info to see if it exists and has commits
            const branchResponse = await client.api.getBranch(
              owner,
              repo,
              claudeBranch,
            );

            // Get base branch info for comparison
            const baseResponse = await client.api.getBranch(
              owner,
              repo,
              baseBranch,
            );

            const branchSha = branchResponse.data.commit.sha;
            const baseSha = baseResponse.data.commit.sha;

            // If SHAs are different, assume there are changes and add PR link
            if (branchSha !== baseSha) {
              console.log(
                `Branch ${claudeBranch} appears to have changes (different SHA from base)`,
              );
              const entityType = context.isPR ? "PR" : "Issue";
              const prTitle = encodeURIComponent(
                `${entityType} #${context.entityNumber}: Changes from Claude`,
              );
              const prBody = encodeURIComponent(
                `This PR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
              );
              const prUrl = `${serverUrl}/${owner}/${repo}/compare/${baseBranch}...${claudeBranch}?quick_pull=1&title=${prTitle}&body=${prBody}`;
              prLink = `\n[Create a PR](${prUrl})`;
            } else {
              console.log(
                `Branch ${claudeBranch} has same SHA as base, no PR link needed`,
              );
            }
          } catch (error: any) {
            console.error("Error checking branch:", error);

            // Handle 404 specifically - branch doesn't exist
            if (error.status === 404) {
              console.log(
                `Branch ${claudeBranch} does not exist yet - no PR link needed`,
              );
              // Don't add PR link since branch doesn't exist
              prLink = "";
            } else {
              // For other errors, add PR link to be safe
              console.log("Adding PR link as fallback due to non-404 error");
              const entityType = context.isPR ? "PR" : "Issue";
              const prTitle = encodeURIComponent(
                `${entityType} #${context.entityNumber}: Changes from Claude`,
              );
              const prBody = encodeURIComponent(
                `This PR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
              );
              const prUrl = `${serverUrl}/${owner}/${repo}/compare/${baseBranch}...${claudeBranch}?quick_pull=1&title=${prTitle}&body=${prBody}`;
              prLink = `\n[Create a PR](${prUrl})`;
            }
          }
        }
      }
    }

    // Check if action failed and read output file for execution details
    let executionDetails: {
      cost_usd?: number;
      duration_ms?: number;
      duration_api_ms?: number;
    } | null = null;
    let actionFailed = false;
    let errorDetails: string | undefined;

    // First check if prepare step failed
    const prepareSuccess = process.env.PREPARE_SUCCESS !== "false";
    const prepareError = process.env.PREPARE_ERROR;

    if (!prepareSuccess && prepareError) {
      actionFailed = true;
      errorDetails = prepareError;
    } else {
      // Check for existence of output file and parse it if available
      try {
        const outputFile = process.env.OUTPUT_FILE;
        if (outputFile) {
          const fileContent = await fs.readFile(outputFile, "utf8");
          const outputData = JSON.parse(fileContent);

          // Output file is an array, get the last element which contains execution details
          if (Array.isArray(outputData) && outputData.length > 0) {
            const lastElement = outputData[outputData.length - 1];
            if (
              lastElement.role === "system" &&
              "cost_usd" in lastElement &&
              "duration_ms" in lastElement
            ) {
              executionDetails = {
                cost_usd: lastElement.cost_usd,
                duration_ms: lastElement.duration_ms,
                duration_api_ms: lastElement.duration_api_ms,
              };
            }
          }
        }

        // Check if the Claude action failed
        const claudeSuccess = process.env.CLAUDE_SUCCESS !== "false";
        actionFailed = !claudeSuccess;
      } catch (error) {
        console.error("Error reading output file:", error);
        // If we can't read the file, check for any failure markers
        actionFailed = process.env.CLAUDE_SUCCESS === "false";
      }
    }

    // Prepare input for updateCommentBody function
    const commentInput: CommentUpdateInput = {
      currentBody,
      actionFailed,
      executionDetails,
      jobUrl,
      branchLink,
      prLink,
      branchName: shouldDeleteBranch ? undefined : claudeBranch,
      triggerUsername,
      errorDetails,
    };

    const updatedBody = updateCommentBody(commentInput);

    // Update the comment using the appropriate API
    try {
      if (isPRReviewComment) {
        await client.api.customRequest(
          "PATCH",
          `/api/v1/repos/${owner}/${repo}/pulls/comments/${commentId}`,
          {
            body: updatedBody,
          },
        );
      } else {
        await client.api.updateIssueComment(
          owner,
          repo,
          commentId,
          updatedBody,
        );
      }
      console.log(
        `✅ Updated ${isPRReviewComment ? "PR review" : "issue"} comment ${commentId} with job link`,
      );
    } catch (updateError) {
      console.error(
        `Failed to update ${isPRReviewComment ? "PR review" : "issue"} comment:`,
        updateError,
      );
      throw updateError;
    }

    process.exit(0);
  } catch (error) {
    console.error("Error updating comment with job link:", error);
    process.exit(1);
  }
}

run();
