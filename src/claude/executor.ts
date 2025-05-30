#!/usr/bin/env bun

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import { spawn } from "child_process";
import { promisify } from "util";

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

interface MCPServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
}

export class ClaudeExecutor {
  private config: ClaudeExecutorConfig;

  constructor(config: ClaudeExecutorConfig) {
    this.config = config;
  }

  private async readPrompt(): Promise<string> {
    console.log("[CLAUDE-EXECUTOR] Reading prompt...");
    
    if (this.config.prompt) {
      console.log("[CLAUDE-EXECUTOR] Using direct prompt");
      return this.config.prompt;
    }

    if (this.config.promptFile) {
      console.log(`[CLAUDE-EXECUTOR] Using prompt file: ${this.config.promptFile}`);
      if (!fs.existsSync(this.config.promptFile)) {
        console.error(`[CLAUDE-EXECUTOR] Prompt file not found: ${this.config.promptFile}`);
        throw new Error(`Prompt file not found: ${this.config.promptFile}`);
      }
      const content = fs.readFileSync(this.config.promptFile, "utf-8");
      console.log(`[CLAUDE-EXECUTOR] Prompt file size: ${content.length} bytes`);
      return content;
    }

    console.error("[CLAUDE-EXECUTOR] Neither prompt nor promptFile provided");
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

  private async setupMCPConfig(): Promise<string | null> {
    if (!this.config.mcpConfig) {
      console.log("[CLAUDE-EXECUTOR] No MCP config provided");
      return null;
    }

    try {
      const mcpConfig: MCPConfig = JSON.parse(this.config.mcpConfig);
      const configFile = "/tmp/mcp-config.json";
      
      console.log("[CLAUDE-EXECUTOR] Setting up MCP configuration...");
      console.log("[CLAUDE-EXECUTOR] MCP servers:", Object.keys(mcpConfig.mcpServers));
      
      fs.writeFileSync(configFile, JSON.stringify(mcpConfig, null, 2));
      
      console.log("[CLAUDE-EXECUTOR] MCP config written to:", configFile);
      return configFile;
    } catch (error) {
      console.error("[CLAUDE-EXECUTOR] Failed to parse MCP config:", error);
      return null;
    }
  }

  async execute(): Promise<ClaudeExecutorResult> {
    try {
      const prompt = await this.readPrompt();
      const tools = this.parseTools();

      console.log(`[CLAUDE-EXECUTOR] Prompt length: ${prompt.length} characters`);
      console.log(
        `[CLAUDE-EXECUTOR] Executing Claude with model: ${this.config.model || "claude-3-7-sonnet-20250219"}`,
      );
      console.log(`[CLAUDE-EXECUTOR] Allowed tools: ${tools.allowed.join(", ") || "none"}`);
      console.log(`[CLAUDE-EXECUTOR] Disallowed tools: ${tools.disallowed.join(", ") || "none"}`);

      // Setup MCP configuration if provided
      const mcpConfigFile = await this.setupMCPConfig();
      
      if (mcpConfigFile) {
        console.log("[CLAUDE-EXECUTOR] Using Claude Code with MCP configuration");
        return await this.executeWithMCP(prompt, mcpConfigFile, tools);
      } else {
        console.log("[CLAUDE-EXECUTOR] No MCP config provided, falling back to basic API");
        return await this.executeBasicAPI(prompt);
      }
    } catch (error) {
      console.error("[CLAUDE-EXECUTOR] Claude execution failed:", error);

      const executionFile = this.createExecutionLog(null, String(error));

      return {
        conclusion: "failure",
        executionFile,
        error: String(error),
      };
    }
  }

  private async executeWithMCP(
    prompt: string,
    mcpConfigFile: string,
    tools: { allowed: string[]; disallowed: string[] }
  ): Promise<ClaudeExecutorResult> {
    console.log("[CLAUDE-EXECUTOR] Starting Claude Code with MCP support...");
    
    if (!this.config.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    // Write prompt to a temporary file
    const promptFile = "/tmp/claude-prompt.txt";
    fs.writeFileSync(promptFile, prompt);

    // Build Claude Code command arguments
    const args = [
      "--file", promptFile,
      "--mcp-config", mcpConfigFile,
      "--model", this.config.model || "claude-3-7-sonnet-20250219"
    ];

    // Add allowed tools if specified
    if (tools.allowed.length > 0) {
      args.push("--allowed-tools", tools.allowed.join(","));
    }

    // Add disallowed tools if specified  
    if (tools.disallowed.length > 0) {
      args.push("--disallowed-tools", tools.disallowed.join(","));
    }

    console.log("[CLAUDE-EXECUTOR] Claude Code command:", "claude", args.join(" "));

    return new Promise((resolve) => {
      const claude = spawn("claude", args, {
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: this.config.apiKey,
        },
      });

      let stdout = "";
      let stderr = "";

      claude.stdout?.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        console.log("[CLAUDE-STDOUT]", chunk.trim());
      });

      claude.stderr?.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.log("[CLAUDE-STDERR]", chunk.trim());
      });

      claude.on("close", (code) => {
        console.log(`[CLAUDE-EXECUTOR] Claude Code process exited with code ${code}`);
        
        const result = {
          stdout,
          stderr,
          exitCode: code,
          success: code === 0,
        };

        const executionFile = this.createExecutionLog(result, code !== 0 ? `Process exited with code ${code}` : undefined);

        resolve({
          conclusion: code === 0 ? "success" : "failure",
          executionFile,
          error: code !== 0 ? `Claude Code exited with code ${code}: ${stderr}` : undefined,
        });
      });

      claude.on("error", (error) => {
        console.error("[CLAUDE-EXECUTOR] Failed to spawn Claude Code process:", error);
        const executionFile = this.createExecutionLog(null, String(error));
        resolve({
          conclusion: "failure",
          executionFile,
          error: String(error),
        });
      });
    });
  }

  private async executeBasicAPI(prompt: string): Promise<ClaudeExecutorResult> {
    console.log("[CLAUDE-EXECUTOR] WARNING: Using simple Anthropic API - MCP tools not supported in this implementation");
    console.log("[CLAUDE-EXECUTOR] This explains why Claude cannot use mcp__local_git_ops tools");

    if (!this.config.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    const anthropic = new Anthropic({
      apiKey: this.config.apiKey,
    });

    console.log("[CLAUDE-EXECUTOR] Starting simple Anthropic API call...");
    console.log("[CLAUDE-EXECUTOR] Prompt preview:", prompt.substring(0, 500) + "...");

    // Create a simple message request  
    const response = await anthropic.messages.create({
      model: this.config.model || "claude-3-7-sonnet-20250219",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    console.log("[CLAUDE-EXECUTOR] Claude response received successfully");
    console.log("[CLAUDE-EXECUTOR] Response type:", response.content[0]?.type);
    
    if (response.content[0]?.type === "text") {
      console.log("[CLAUDE-EXECUTOR] Response preview:", response.content[0].text.substring(0, 500) + "...");
    }

    const executionFile = this.createExecutionLog(response);

    return {
      conclusion: "success",
      executionFile,
    };
  }
}

export async function runClaude(
  config: ClaudeExecutorConfig,
): Promise<ClaudeExecutorResult> {
  const executor = new ClaudeExecutor(config);
  return await executor.execute();
}
