#!/usr/bin/env bun

/**
 * Unified entrypoint — orchestrates prepare, run-claude, and comment-update
 * in a single TypeScript process instead of separate composite action steps.
 */

import * as core from "@actions/core";
import { existsSync } from "fs";
import { appendFile } from "fs/promises";
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
import { getMode } from "../modes/registry";
import { validateEnvironmentVariables } from "../../base-action/src/validate-env";
import { setupClaudeCodeSettings } from "../../base-action/src/setup-claude-code-settings";
import { runClaude } from "../../base-action/src/run-claude";
import { updateCommentLink } from "./update-comment-link";

async function extractClaudeErrorMessage(
  executionFile?: string,
): Promise<string> {
  if (executionFile && existsSync(executionFile)) {
    try {
      const outputData = JSON.parse(await Bun.file(executionFile).text());
      const lastEntry = Array.isArray(outputData)
        ? outputData[outputData.length - 1]
        : undefined;
      if (lastEntry?.result) {
        return lastEntry.result;
      }
    } catch {
      // fall through to generic message below
    }
  }
  return "Claude Code execution failed";
}

async function run() {
  let githubToken: string | undefined;
  let commentId: number | undefined;
  let claudeBranch: string | undefined;
  let baseBranch: string | undefined;
  let executionFile: string | undefined;
  let claudeSuccess = false;
  let prepareSuccess = true;
  let prepareError: string | undefined;
  let prepareCompleted = false;

  try {
    // ── Phase 1: Prepare ──────────────────────────────────────────────────────
    const context = parseGitHubContext();
    githubToken = await setupGitHubToken();
    const client = createClient(githubToken);

    process.env.GITHUB_TOKEN = githubToken;

    await checkWritePermissions(client.api, context);

    const containsTrigger = await checkTriggerAction(context);
    if (!containsTrigger) {
      console.log("No trigger found, skipping");
      return;
    }

    await checkHumanActor(client.api, context);

    const mode = getMode(context.inputs.mode);

    if (mode.shouldCreateTrackingComment()) {
      commentId = await createInitialComment(client.api, context);
    }

    const githubData = await fetchGitHubData({
      client,
      repository: `${context.repository.owner}/${context.repository.repo}`,
      prNumber: context.entityNumber.toString(),
      isPR: context.isPR,
    });

    const branchInfo = await setupBranch(client, githubData, context);
    claudeBranch = branchInfo.claudeBranch;
    baseBranch = branchInfo.baseBranch;

    if (commentId && claudeBranch) {
      await updateTrackingComment(client, context, commentId, claudeBranch);
    }

    const modeContext = mode.prepareContext(context, {
      commentId,
      baseBranch,
      claudeBranch,
    });
    await createPrompt(mode, modeContext, githubData, context);

    const mcpConfig = await prepareMcpConfig({
      githubToken,
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: branchInfo.currentBranch,
      baseBranch,
      allowedTools: context.inputs.allowedTools,
      context,
    });

    prepareCompleted = true;

    // ── Phase 2: Run Claude ───────────────────────────────────────────────────
    validateEnvironmentVariables();
    await setupClaudeCodeSettings(process.env.INPUT_SETTINGS);

    const promptFile = `${process.env.RUNNER_TEMP}/claude-prompts/claude-prompt.txt`;
    const claudeExecutable =
      process.env.INPUT_PATH_TO_CLAUDE_CODE_EXECUTABLE || "claude";

    const result = await runClaude(promptFile, {
      // createPrompt exports ALLOWED_TOOLS / DISALLOWED_TOOLS via core.exportVariable
      // which also sets process.env, so they're available here
      allowedTools: process.env.ALLOWED_TOOLS,
      disallowedTools: process.env.DISALLOWED_TOOLS,
      maxTurns: process.env.INPUT_MAX_TURNS,
      mcpConfig,
      systemPrompt: process.env.INPUT_SYSTEM_PROMPT,
      appendSystemPrompt: process.env.INPUT_APPEND_SYSTEM_PROMPT,
      claudeEnv: process.env.INPUT_CLAUDE_ENV,
      fallbackModel: process.env.INPUT_FALLBACK_MODEL,
      model: process.env.ANTHROPIC_MODEL,
      pathToClaudeCodeExecutable: claudeExecutable,
    });

    claudeSuccess = result.conclusion === "success";
    executionFile = result.executionFile;

    core.setOutput("conclusion", result.conclusion);
    if (executionFile) core.setOutput("execution_file", executionFile);

    if (result.conclusion === "failure") {
      throw new Error(await extractClaudeErrorMessage(executionFile));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!prepareCompleted) {
      prepareSuccess = false;
      prepareError = message;
    }
    core.setFailed(`Action failed: ${message}`);
  } finally {
    // ── Phase 3: Update comment (always runs) ─────────────────────────────────
    if (commentId && githubToken) {
      process.env.CLAUDE_COMMENT_ID = String(commentId);
      process.env.GITHUB_TOKEN = githubToken;
      process.env.CLAUDE_BRANCH = claudeBranch ?? "";
      process.env.BASE_BRANCH = baseBranch ?? "main";
      process.env.CLAUDE_SUCCESS = claudeSuccess ? "true" : "false";
      process.env.OUTPUT_FILE = executionFile ?? "";
      process.env.PREPARE_SUCCESS = prepareSuccess ? "true" : "false";
      process.env.PREPARE_ERROR = prepareError ?? "";
      try {
        await updateCommentLink();
      } catch (error) {
        console.error("Error updating comment:", error);
      }
    }

    // ── Phase 4: Step summary ─────────────────────────────────────────────────
    if (executionFile && existsSync(executionFile)) {
      const summaryFile = process.env.GITHUB_STEP_SUMMARY;
      if (summaryFile) {
        await appendFile(
          summaryFile,
          `## Claude Code Report\n\`\`\`json\n${await Bun.file(executionFile).text()}\n\`\`\`\n`,
        );
      }
    }

    core.setOutput("branch_name", claudeBranch ?? "");
  }
}

if (import.meta.main) {
  run();
}
