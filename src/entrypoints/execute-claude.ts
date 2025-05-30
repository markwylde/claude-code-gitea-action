#!/usr/bin/env bun

import * as core from "@actions/core";
import { runClaude, type ClaudeExecutorConfig } from "../claude/executor";

async function main() {
  try {
    console.log("[EXECUTE-CLAUDE] Starting execute-claude.ts entry point...");
    console.log(`[EXECUTE-CLAUDE] ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '***' : 'undefined'}`);
    console.log(`[EXECUTE-CLAUDE] MODEL: ${process.env.MODEL || 'undefined'}`);
    console.log(`[EXECUTE-CLAUDE] ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL || 'undefined'}`);
    console.log(`[EXECUTE-CLAUDE] PROMPT_FILE: ${process.env.PROMPT_FILE || 'undefined'}`);
    console.log(`[EXECUTE-CLAUDE] ALLOWED_TOOLS: ${process.env.ALLOWED_TOOLS || 'undefined'}`);
    console.log(`[EXECUTE-CLAUDE] DISALLOWED_TOOLS: ${process.env.DISALLOWED_TOOLS || 'undefined'}`);
    console.log(`[EXECUTE-CLAUDE] MCP_CONFIG length: ${process.env.MCP_CONFIG?.length || 0}`);
    console.log(`[EXECUTE-CLAUDE] USE_BEDROCK: ${process.env.USE_BEDROCK}`);
    console.log(`[EXECUTE-CLAUDE] USE_VERTEX: ${process.env.USE_VERTEX}`);
    
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

    console.log("[EXECUTE-CLAUDE] Configuration prepared, starting Claude execution...");
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
