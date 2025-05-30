#!/usr/bin/env bun

/**
 * Create the initial tracking comment when Claude Code starts working
 * This comment shows the working status and includes a link to the job run
 */

import { appendFileSync } from "fs";
import { createJobRunLink, createCommentBody } from "./common";
import {
  isPullRequestReviewCommentEvent,
  type ParsedGitHubContext,
} from "../../context";
import type { GiteaApiClient } from "../../api/gitea-client";

export async function createInitialComment(
  api: GiteaApiClient,
  context: ParsedGitHubContext,
) {
  const { owner, repo } = context.repository;

  const jobRunLink = createJobRunLink(owner, repo, context.runId);
  const initialBody = createCommentBody(jobRunLink);

  try {
    let response;

    console.log(
      `Creating comment for ${context.isPR ? "PR" : "issue"} #${context.entityNumber}`,
    );
    console.log(`Repository: ${owner}/${repo}`);

    // Only use createReplyForReviewComment if it's a PR review comment AND we have a comment_id
    if (isPullRequestReviewCommentEvent(context)) {
      console.log(`Creating PR review comment reply`);
      response = await api.customRequest(
        "POST",
        `/api/v1/repos/${owner}/${repo}/pulls/${context.entityNumber}/comments/${context.payload.comment.id}/replies`,
        {
          body: initialBody,
        },
      );
    } else {
      // For all other cases (issues, issue comments, or missing comment_id)
      console.log(`Creating issue comment via API`);
      response = await api.createIssueComment(
        owner,
        repo,
        context.entityNumber,
        initialBody,
      );
    }

    // Output the comment ID for downstream steps using GITHUB_OUTPUT
    const githubOutput = process.env.GITHUB_OUTPUT!;
    appendFileSync(githubOutput, `claude_comment_id=${response.data.id}\n`);
    console.log(`✅ Created initial comment with ID: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    console.error("Error in initial comment:", error);

    // Always fall back to regular issue comment if anything fails
    try {
      const response = await api.createIssueComment(
        owner,
        repo,
        context.entityNumber,
        initialBody,
      );

      const githubOutput = process.env.GITHUB_OUTPUT!;
      appendFileSync(githubOutput, `claude_comment_id=${response.data.id}\n`);
      console.log(`✅ Created fallback comment with ID: ${response.data.id}`);
      return response.data.id;
    } catch (fallbackError) {
      console.error("Error creating fallback comment:", fallbackError);
      throw fallbackError;
    }
  }
}
