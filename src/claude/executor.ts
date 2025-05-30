#!/usr/bin/env bun

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";

export interface ClaudeExecutorConfig {
  apiKey?: string;
  model?: string;
  promptFile?: string;
  prompt?: string;
  maxTurns?: number;
  timeoutMinutes?: number;
  mcpConfig?: string;
  allowedTools?: string;
  disallowedTools?: string;
  useBedrock?: boolean;
  useVertex?: boolean;
}

export interface ClaudeExecutorResult {
  conclusion: "success" | "failure";
  executionFile?: string;
  error?: string;
}

export class ClaudeExecutor {
  private config: ClaudeExecutorConfig;
  private anthropic?: Anthropic;

  constructor(config: ClaudeExecutorConfig) {
    this.config = config;
    this.initializeClient();
  }

  private initializeClient() {
    if (this.config.useBedrock || this.config.useVertex) {
      throw new Error(
        "Bedrock and Vertex AI not supported in simplified implementation",
      );
    }

    if (!this.config.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    this.anthropic = new Anthropic({
      apiKey: this.config.apiKey,
    });
  }

  private async readPrompt(): Promise<string> {
    if (this.config.prompt) {
      return this.config.prompt;
    }

    if (this.config.promptFile) {
      if (!fs.existsSync(this.config.promptFile)) {
        throw new Error(`Prompt file not found: ${this.config.promptFile}`);
      }
      return fs.readFileSync(this.config.promptFile, "utf-8");
    }

    throw new Error("Either prompt or promptFile must be provided");
  }

  private parseTools(): { allowed: string[]; disallowed: string[] } {
    const allowed = this.config.allowedTools
      ? this.config.allowedTools
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const disallowed = this.config.disallowedTools
      ? this.config.disallowedTools
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    return { allowed, disallowed };
  }

  private createExecutionLog(result: any, error?: string): string {
    const logData = {
      conclusion: error ? "failure" : "success",
      model: this.config.model || "claude-3-7-sonnet-20250219",
      timestamp: new Date().toISOString(),
      result,
      error,
    };

    const logFile = "/tmp/claude-execution.json";
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    return logFile;
  }

  async execute(): Promise<ClaudeExecutorResult> {
    try {
      const prompt = await this.readPrompt();
      const tools = this.parseTools();

      console.log(
        `Executing Claude with model: ${this.config.model || "claude-3-7-sonnet-20250219"}`,
      );
      console.log(`Allowed tools: ${tools.allowed.join(", ") || "none"}`);
      console.log(`Disallowed tools: ${tools.disallowed.join(", ") || "none"}`);

      if (!this.anthropic) {
        throw new Error("Anthropic client not initialized");
      }

      // Create a simple message request
      const response = await this.anthropic.messages.create({
        model: this.config.model || "claude-3-7-sonnet-20250219",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      console.log("Claude response received successfully");

      const executionFile = this.createExecutionLog(response);

      return {
        conclusion: "success",
        executionFile,
      };
    } catch (error) {
      console.error("Claude execution failed:", error);

      const executionFile = this.createExecutionLog(null, String(error));

      return {
        conclusion: "failure",
        executionFile,
        error: String(error),
      };
    }
  }
}

export async function runClaude(
  config: ClaudeExecutorConfig,
): Promise<ClaudeExecutorResult> {
  const executor = new ClaudeExecutor(config);
  return await executor.execute();
}
