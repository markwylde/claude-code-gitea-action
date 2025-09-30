import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { prepareMcpConfig } from "../src/mcp/install-mcp-server";

const originalEnv = { ...process.env };

describe("prepareMcpConfig", () => {
  beforeEach(() => {
    process.env.GITHUB_ACTION_PATH = "/action/path";
    process.env.GITHUB_WORKSPACE = "/workspace";
    process.env.GITEA_API_URL = "https://gitea.example.com/api/v1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns base gitea and local git MCP servers", async () => {
    const result = await prepareMcpConfig({
      githubToken: "token",
      owner: "owner",
      repo: "repo",
      branch: "branch",
    });

    const parsed = JSON.parse(result);
    expect(Object.keys(parsed.mcpServers)).toEqual(["gitea", "local_git_ops"]);

    expect(parsed.mcpServers.gitea).toEqual({
      command: "bun",
      args: ["run", "/action/path/src/mcp/gitea-mcp-server.ts"],
      env: {
        GITHUB_TOKEN: "token",
        REPO_OWNER: "owner",
        REPO_NAME: "repo",
        BRANCH_NAME: "branch",
        REPO_DIR: "/workspace",
        GITEA_API_URL: "https://gitea.example.com/api/v1",
      },
    });

    expect(parsed.mcpServers.local_git_ops.args[1]).toBe(
      "/action/path/src/mcp/local-git-ops-server.ts",
    );
  });

  test("falls back to process.cwd when workspace not provided", async () => {
    delete process.env.GITHUB_WORKSPACE;

    const result = await prepareMcpConfig({
      githubToken: "token",
      owner: "owner",
      repo: "repo",
      branch: "branch",
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.gitea.env.REPO_DIR).toBe(process.cwd());
  });
});
