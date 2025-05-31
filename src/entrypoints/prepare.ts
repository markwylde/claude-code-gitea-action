#!/usr/bin/env bun

/**
 * Prepare the Claude action by checking trigger conditions, verifying human actor,
 * and creating the initial tracking comment
 */

import * as core from "@actions/core";
import { setupGitHubToken } from "../github/token";
import { checkTriggerAction } from "../github/validation/trigger";
import { checkHumanActor } from "../github/validation/actor";
import { checkWritePermissions } from "../github/validation/permissions";
import { createInitialComment } from "../github/operations/comments/create-initial";
import { setupBranch } from "../github/operations/branch";
import { updateTrackingComment } from "../github/operations/comments/update-with-branch";
import { prepareMcpConfig } from "../mcp/install-mcp-server";
import { createPrompt } from "../create-prompt";
import { createClient } from "../github/api/client";
import { fetchGitHubData } from "../github/data/fetcher";
import { parseGitHubContext } from "../github/context";
import { setupOAuthCredentials } from "../claude/oauth-setup";

async function run() {
  try {
    // Step 1: Setup OAuth credentials if provided
    const claudeCredentials = process.env.CLAUDE_CREDENTIALS;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    if (claudeCredentials && anthropicApiKey === "use-oauth") {
      await setupOAuthCredentials(claudeCredentials);
      console.log("OAuth credentials configured for Claude AI Max subscription");
    }

    // Step 2: Setup GitHub token
    const githubToken = await setupGitHubToken();
    const client = createClient(githubToken);

    // Step 3: Parse GitHub context (once for all operations)
    const context = parseGitHubContext();

    // Step 4: Check write permissions
    const hasWritePermissions = await checkWritePermissions(
      client.api,
      context,
    );
    if (!hasWritePermissions) {
      throw new Error(
        "Actor does not have write permissions to the repository",
      );
    }

    // Step 5: Check trigger conditions
    const containsTrigger = await checkTriggerAction(context);

    // Set outputs that are always needed
    core.setOutput("contains_trigger", containsTrigger.toString());
    core.setOutput("GITHUB_TOKEN", githubToken);

    if (!containsTrigger) {
      console.log("No trigger found, skipping remaining steps");
      return;
    }

    // Step 6: Check if actor is human
    await checkHumanActor(client.api, context);

    // Step 7: Create initial tracking comment
    const commentId = await createInitialComment(client.api, context);
    core.setOutput("claude_comment_id", commentId.toString());

    // Step 8: Fetch GitHub data (once for both branch setup and prompt creation)
    const githubData = await fetchGitHubData({
      client: client,
      repository: `${context.repository.owner}/${context.repository.repo}`,
      prNumber: context.entityNumber.toString(),
      isPR: context.isPR,
    });

    // Step 9: Setup branch
    const branchInfo = await setupBranch(client, githubData, context);
    core.setOutput("BASE_BRANCH", branchInfo.baseBranch);
    if (branchInfo.claudeBranch) {
      core.setOutput("CLAUDE_BRANCH", branchInfo.claudeBranch);
    }

    // Step 10: Update initial comment with branch link (only if a claude branch was created)
    if (branchInfo.claudeBranch) {
      await updateTrackingComment(
        client,
        context,
        commentId,
        branchInfo.claudeBranch,
      );
    }

    // Step 11: Create prompt file
    await createPrompt(
      commentId,
      branchInfo.baseBranch,
      branchInfo.claudeBranch,
      githubData,
      context,
    );

    // Step 12: Get MCP configuration
    const mcpConfig = await prepareMcpConfig(
      githubToken,
      context.repository.owner,
      context.repository.repo,
      branchInfo.currentBranch,
    );
    core.setOutput("mcp_config", mcpConfig);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Prepare step failed with error: ${errorMessage}`);
    // Also output the clean error message for the action to capture
    core.setOutput("prepare_error", errorMessage);
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
