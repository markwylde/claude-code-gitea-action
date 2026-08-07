import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as core from "@actions/core";
import { setupGitHubToken } from "../src/github/token";

describe("setupGitHubToken", () => {
  const originalEnv = { ...process.env };
  let setOutputSpy: ReturnType<typeof spyOn>;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    delete process.env.OVERRIDE_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    setOutputSpy.mockRestore();
    logSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  test("prefers the explicit Gitea token", async () => {
    process.env.OVERRIDE_GITHUB_TOKEN = "gitea-token";
    process.env.GITHUB_TOKEN = "workflow-token";

    expect(await setupGitHubToken()).toBe("gitea-token");
    expect(setOutputSpy).toHaveBeenCalledWith("GITHUB_TOKEN", "gitea-token");
  });

  test("falls back to the workflow token without requesting OIDC", async () => {
    process.env.GITHUB_TOKEN = "workflow-token";

    expect(await setupGitHubToken()).toBe("workflow-token");
    expect(setOutputSpy).toHaveBeenCalledWith("GITHUB_TOKEN", "workflow-token");
  });
});
