#!/usr/bin/env bun

/**
 * Update the initial tracking comment with branch link
 * This happens after the branch is created for issues
 */

import {
  createJobRunLink,
  createBranchLink,
  createCommentBody,
} from "./common";
import { type GitHubClient } from "../../api/client";
import {
  isPullRequestReviewCommentEvent,
  type ParsedGitHubContext,
} from "../../context";

export async function updateTrackingComment(
  client: GitHubClient,
  context: ParsedGitHubContext,
  commentId: number,
  branch?: string,
) {
  const { owner, repo } = context.repository;

  const jobRunLink = createJobRunLink(owner, repo, context.runId);

  // Add branch link for issues (not PRs)
  let branchLink = "";
  if (branch && !context.isPR) {
    branchLink = createBranchLink(owner, repo, branch);
  }

  const updatedBody = createCommentBody(jobRunLink, branchLink);

  // Update the existing comment with the branch link
  try {
    if (isPullRequestReviewCommentEvent(context)) {
      // For PR review comments (inline comments), use the pulls API
      await client.api.customRequest(
        "PATCH",
        `/api/v1/repos/${owner}/${repo}/pulls/comments/${commentId}`,
        {
          body: updatedBody,
        },
      );
      console.log(`✅ Updated PR review comment ${commentId} with branch link`);
    } else {
      // For all other comments, use the issues API
      await client.api.updateIssueComment(owner, repo, commentId, updatedBody);
      console.log(`✅ Updated issue comment ${commentId} with branch link`);
    }
  } catch (error) {
    console.error("Error updating comment with branch link:", error);
    throw error;
  }
}
