#!/usr/bin/env node
// GitHub File Operations MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "fs/promises";
import { join } from "path";
import fetch from "node-fetch";
import { GITHUB_API_URL } from "../github/api/config";

type GitHubRef = {
  object: {
    sha: string;
  };
};

type GitHubCommit = {
  tree: {
    sha: string;
  };
};

type GitHubTree = {
  sha: string;
};

type GitHubNewCommit = {
  sha: string;
  message: string;
  author: {
    name: string;
    date: string;
  };
};

// Get repository information from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const BRANCH_NAME = process.env.BRANCH_NAME;
const REPO_DIR = process.env.REPO_DIR || process.cwd();

if (!REPO_OWNER || !REPO_NAME || !BRANCH_NAME) {
  console.error(
    "Error: REPO_OWNER, REPO_NAME, and BRANCH_NAME environment variables are required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "GitHub File Operations Server",
  version: "0.0.1",
});

// Commit files tool
server.tool(
  "commit_files",
  "Commit one or more files to a repository in a single commit (this will commit them atomically in the remote repository)",
  {
    files: z
      .array(z.string())
      .describe(
        'Array of file paths relative to repository root (e.g. ["src/main.js", "README.md"]). All files must exist locally.',
      ),
    message: z.string().describe("Commit message"),
  },
  async ({ files, message }) => {
    const owner = REPO_OWNER;
    const repo = REPO_NAME;
    const branch = BRANCH_NAME;
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      const processedFiles = files.map((filePath) => {
        if (filePath.startsWith("/")) {
          return filePath.slice(1);
        }
        return filePath;
      });

      // NOTE: Gitea does not support GitHub's low-level git API operations
      // (creating trees, commits, etc.). We need to use the contents API instead.
      // For now, throw an error indicating this functionality is not available.
      throw new Error(
        "Multi-file commits are not supported with Gitea. " +
        "Gitea does not provide the low-level git API operations (trees, commits) " +
        "that are required for atomic multi-file commits. " +
        "Please commit files individually using the contents API."
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(simplifiedResult, null, 2),
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
            text: `Error: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Delete files tool
server.tool(
  "delete_files",
  "Delete one or more files from a repository in a single commit",
  {
    paths: z
      .array(z.string())
      .describe(
        'Array of file paths to delete relative to repository root (e.g. ["src/old-file.js", "docs/deprecated.md"])',
      ),
    message: z.string().describe("Commit message"),
  },
  async ({ paths, message }) => {
    const owner = REPO_OWNER;
    const repo = REPO_NAME;
    const branch = BRANCH_NAME;
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      // Convert absolute paths to relative if they match CWD
      const cwd = process.cwd();
      const processedPaths = paths.map((filePath) => {
        if (filePath.startsWith("/")) {
          if (filePath.startsWith(cwd)) {
            // Strip CWD from absolute path
            return filePath.slice(cwd.length + 1);
          } else {
            throw new Error(
              `Path '${filePath}' must be relative to repository root or within current working directory`,
            );
          }
        }
        return filePath;
      });

      // NOTE: Gitea does not support GitHub's low-level git API operations
      // (creating trees, commits, etc.). We need to use the contents API instead.
      // For now, throw an error indicating this functionality is not available.
      throw new Error(
        "Multi-file deletions are not supported with Gitea. " +
        "Gitea does not provide the low-level git API operations (trees, commits) " +
        "that are required for atomic multi-file operations. " +
        "Please delete files individually using the contents API."
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(simplifiedResult, null, 2),
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
            text: `Error: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

runServer().catch(console.error);
