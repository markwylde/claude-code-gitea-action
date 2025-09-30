import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../github/context";

export type PrepareMcpConfigOptions = {
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  allowedTools?: string[];
  context?: ParsedGitHubContext;
  overrideConfig?: string;
  additionalMcpConfig?: string;
};

export async function prepareMcpConfig({
  githubToken,
  owner,
  repo,
  branch,
}: PrepareMcpConfigOptions): Promise<string> {
  console.log("[MCP-INSTALL] Preparing MCP configuration...");
  console.log(`[MCP-INSTALL] Owner: ${owner}`);
  console.log(`[MCP-INSTALL] Repo: ${repo}`);
  console.log(`[MCP-INSTALL] Branch: ${branch}`);
  console.log(
    `[MCP-INSTALL] GitHub token: ${githubToken ? "***" : "undefined"}`,
  );
  console.log(
    `[MCP-INSTALL] GITHUB_ACTION_PATH: ${process.env.GITHUB_ACTION_PATH}`,
  );
  console.log(
    `[MCP-INSTALL] GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE}`,
  );

  try {
    const mcpConfig = {
      mcpServers: {
        gitea: {
          command: "bun",
          args: [
            "run",
            `${process.env.GITHUB_ACTION_PATH}/src/mcp/gitea-mcp-server.ts`,
          ],
          env: {
            GITHUB_TOKEN: githubToken,
            REPO_OWNER: owner,
            REPO_NAME: repo,
            BRANCH_NAME: branch,
            REPO_DIR: process.env.GITHUB_WORKSPACE || process.cwd(),
            GITEA_API_URL:
              process.env.GITEA_API_URL || "https://api.github.com",
          },
        },
        local_git_ops: {
          command: "bun",
          args: [
            "run",
            `${process.env.GITHUB_ACTION_PATH}/src/mcp/local-git-ops-server.ts`,
          ],
          env: {
            GITHUB_TOKEN: githubToken,
            REPO_OWNER: owner,
            REPO_NAME: repo,
            BRANCH_NAME: branch,
            REPO_DIR: process.env.GITHUB_WORKSPACE || process.cwd(),
            GITEA_API_URL:
              process.env.GITEA_API_URL || "https://api.github.com",
          },
        },
      },
    };

    const configString = JSON.stringify(mcpConfig, null, 2);
    console.log("[MCP-INSTALL] Generated MCP configuration:");
    console.log(configString);
    console.log("[MCP-INSTALL] MCP config generation completed successfully");

    return configString;
  } catch (error) {
    console.error("[MCP-INSTALL] MCP config generation failed:", error);
    core.setFailed(`Install MCP server failed with error: ${error}`);
    process.exit(1);
  }
}
