#!/usr/bin/env node
// Local Git Operations MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { execSync } from "child_process";

// Get repository information from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const BRANCH_NAME = process.env.BRANCH_NAME;
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITEA_API_URL = process.env.GITEA_API_URL || "https://api.github.com";

if (!REPO_OWNER || !REPO_NAME || !BRANCH_NAME) {
  console.error(
    "Error: REPO_OWNER, REPO_NAME, and BRANCH_NAME environment variables are required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "Local Git Operations Server",
  version: "0.0.1",
});

// Helper function to run git commands
function runGitCommand(command: string): string {
  try {
    console.log(`Running git command: ${command}`);
    const result = execSync(command, {
      cwd: REPO_DIR,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
    });
    console.log(`Git command result: ${result.trim()}`);
    return result.trim();
  } catch (error: any) {
    console.error(`Git command failed: ${command}`);
    console.error(`Error: ${error.message}`);
    if (error.stdout) console.error(`Stdout: ${error.stdout}`);
    if (error.stderr) console.error(`Stderr: ${error.stderr}`);
    throw error;
  }
}

// Create branch tool
server.tool(
  "create_branch",
  "Create a new branch from a base branch using local git operations",
  {
    branch_name: z.string().describe("Name of the branch to create"),
    base_branch: z
      .string()
      .describe("Base branch to create from (e.g., 'main')"),
  },
  async ({ branch_name, base_branch }) => {
    try {
      // Ensure we're on the base branch and it's up to date
      runGitCommand(`git checkout ${base_branch}`);
      runGitCommand(`git pull origin ${base_branch}`);

      // Create and checkout the new branch
      runGitCommand(`git checkout -b ${branch_name}`);

      return {
        content: [
          {
            type: "text",
            text: `Successfully created and checked out branch: ${branch_name}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error creating branch: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Commit files tool
server.tool(
  "commit_files",
  "Commit one or more files to the current branch using local git operations",
  {
    files: z
      .array(z.string())
      .describe(
        'Array of file paths relative to repository root (e.g. ["src/main.js", "README.md"]). All files must exist locally.',
      ),
    message: z.string().describe("Commit message"),
  },
  async ({ files, message }) => {
    try {
      // Add the specified files
      for (const file of files) {
        const filePath = file.startsWith("/") ? file.slice(1) : file;
        runGitCommand(`git add "${filePath}"`);
      }

      // Commit the changes
      runGitCommand(`git commit -m "${message}"`);

      return {
        content: [
          {
            type: "text",
            text: `Successfully committed ${files.length} file(s): ${files.join(", ")}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error committing files: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Push branch tool
server.tool(
  "push_branch",
  "Push the current branch to remote origin",
  {
    force: z.boolean().optional().describe("Force push (use with caution)"),
  },
  async ({ force = false }) => {
    try {
      // Get current branch name
      const currentBranch = runGitCommand("git rev-parse --abbrev-ref HEAD");

      // Push the branch
      const pushCommand = force
        ? `git push -f origin ${currentBranch}`
        : `git push origin ${currentBranch}`;

      runGitCommand(pushCommand);

      return {
        content: [
          {
            type: "text",
            text: `Successfully pushed branch: ${currentBranch}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error pushing branch: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Create pull request tool (uses Gitea API)
server.tool(
  "create_pull_request",
  "Create a pull request using Gitea API",
  {
    title: z.string().describe("Pull request title"),
    body: z.string().describe("Pull request body/description"),
    base_branch: z.string().describe("Base branch (e.g., 'main')"),
    head_branch: z
      .string()
      .optional()
      .describe("Head branch (defaults to current branch)"),
  },
  async ({ title, body, base_branch, head_branch }) => {
    try {
      if (!GITHUB_TOKEN) {
        throw new Error(
          "GITHUB_TOKEN environment variable is required for PR creation",
        );
      }

      // Get current branch if head_branch not specified
      const currentBranch =
        head_branch || runGitCommand("git rev-parse --abbrev-ref HEAD");

      // Create PR using Gitea API
      const response = await fetch(
        `${GITEA_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
        {
          method: "POST",
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            body,
            base: base_branch,
            head: currentBranch,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create PR: ${response.status} ${errorText}`);
      }

      const prData = await response.json();

      return {
        content: [
          {
            type: "text",
            text: `Successfully created pull request #${prData.number}: ${prData.html_url}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error creating pull request: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Get git status tool
server.tool("git_status", "Get the current git status", {}, async () => {
  try {
    const status = runGitCommand("git status --porcelain");
    const currentBranch = runGitCommand("git rev-parse --abbrev-ref HEAD");

    return {
      content: [
        {
          type: "text",
          text: `Current branch: ${currentBranch}\nStatus:\n${status || "Working tree clean"}`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error getting git status: ${errorMessage}`,
        },
      ],
      error: errorMessage,
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

runServer().catch(console.error);
