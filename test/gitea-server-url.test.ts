import { describe, it, expect, beforeEach, afterEach } from "bun:test";

describe("GITEA_SERVER_URL configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.GITEA_SERVER_URL;
    delete process.env.GITHUB_SERVER_URL;
    
    // Clear module cache to force re-evaluation
    delete require.cache[require.resolve("../src/github/api/config")];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should prioritize GITEA_SERVER_URL over GITHUB_SERVER_URL", async () => {
    process.env.GITEA_SERVER_URL = "https://gitea.example.com";
    process.env.GITHUB_SERVER_URL = "http://gitea:3000";

    const { GITEA_SERVER_URL } = await import("../src/github/api/config");
    expect(GITEA_SERVER_URL).toBe("https://gitea.example.com");
  });

  it("should fall back to GITHUB_SERVER_URL when GITEA_SERVER_URL is not set", async () => {
    process.env.GITHUB_SERVER_URL = "http://gitea:3000";

    const { GITEA_SERVER_URL } = await import("../src/github/api/config");
    expect(GITEA_SERVER_URL).toBe("http://gitea:3000");
  });

  it("should use default when neither GITEA_SERVER_URL nor GITHUB_SERVER_URL is set", async () => {
    const { GITEA_SERVER_URL } = await import("../src/github/api/config");
    expect(GITEA_SERVER_URL).toBe("https://github.com");
  });

  it("should ignore empty GITEA_SERVER_URL and use GITHUB_SERVER_URL", async () => {
    process.env.GITEA_SERVER_URL = "";
    process.env.GITHUB_SERVER_URL = "http://gitea:3000";

    const { GITEA_SERVER_URL } = await import("../src/github/api/config");
    expect(GITEA_SERVER_URL).toBe("http://gitea:3000");
  });

  it("should derive correct API URL from custom GITEA_SERVER_URL", async () => {
    process.env.GITEA_SERVER_URL = "https://gitea.example.com";

    const { GITEA_API_URL } = await import("../src/github/api/config");
    expect(GITEA_API_URL).toBe("https://gitea.example.com/api/v1");
  });

  it("should handle GitHub.com URLs correctly", async () => {
    process.env.GITEA_SERVER_URL = "https://github.com";

    const { GITEA_API_URL } = await import("../src/github/api/config");
    expect(GITEA_API_URL).toBe("https://api.github.com");
  });

  it("should create correct job run links with custom GITEA_SERVER_URL", async () => {
    process.env.GITEA_SERVER_URL = "https://gitea.example.com";
    
    // Clear module cache and re-import
    delete require.cache[require.resolve("../src/github/operations/comments/common")];
    const { createJobRunLink } = await import("../src/github/operations/comments/common");
    
    const link = createJobRunLink("owner", "repo", "123");
    expect(link).toBe("[View job run](https://gitea.example.com/owner/repo/actions/runs/123)");
  });

  it("should create correct branch links with custom GITEA_SERVER_URL", async () => {
    process.env.GITEA_SERVER_URL = "https://gitea.example.com";
    
    // Clear module cache and re-import
    delete require.cache[require.resolve("../src/github/operations/comments/common")];
    const { createBranchLink } = await import("../src/github/operations/comments/common");
    
    const link = createBranchLink("owner", "repo", "feature-branch");
    expect(link).toBe("\n[View branch](https://gitea.example.com/owner/repo/src/branch/feature-branch/)");
  });
});
