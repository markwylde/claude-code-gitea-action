#!/usr/bin/env bun

import * as core from "@actions/core";
import { runClaude, type ClaudeExecutorConfig } from "../claude/executor";

async function main() {
  try {
    const config: ClaudeExecutorConfig = {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || process.env.MODEL,
      promptFile: process.env.PROMPT_FILE,
      prompt: process.env.PROMPT,
      maxTurns: process.env.MAX_TURNS
        ? parseInt(process.env.MAX_TURNS)
        : undefined,
      timeoutMinutes: process.env.TIMEOUT_MINUTES
        ? parseInt(process.env.TIMEOUT_MINUTES)
        : 30,
      mcpConfig: process.env.MCP_CONFIG,
      allowedTools: process.env.ALLOWED_TOOLS,
      disallowedTools: process.env.DISALLOWED_TOOLS,
      useBedrock: process.env.USE_BEDROCK === "true",
      useVertex: process.env.USE_VERTEX === "true",
    };

    console.log("Starting Claude execution...");
    const result = await runClaude(config);

    // Set outputs for GitHub Actions
    core.setOutput("conclusion", result.conclusion);
    if (result.executionFile) {
      core.setOutput("execution_file", result.executionFile);
    }

    if (result.conclusion === "failure") {
      core.setFailed(result.error || "Claude execution failed");
    } else {
      console.log("Claude execution completed successfully");
    }
  } catch (error) {
    console.error("Failed to execute Claude:", error);
    core.setFailed(`Failed to execute Claude: ${error}`);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  core.setFailed(`Unhandled error: ${error}`);
  process.exit(1);
});
