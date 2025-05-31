#!/usr/bin/env bun

import * as core from "@actions/core";

export async function setupGitHubToken(): Promise<string> {
  try {
    // Check if GitHub token was provided as override
    const providedToken = process.env.OVERRIDE_GITHUB_TOKEN;

    if (providedToken) {
      console.log("Using provided GITHUB_TOKEN for authentication");
      core.setOutput("GITHUB_TOKEN", providedToken);
      return providedToken;
    }

    // Use the standard GITHUB_TOKEN from the workflow environment
    const workflowToken = process.env.GITHUB_TOKEN;

    if (workflowToken) {
      console.log("Using workflow GITHUB_TOKEN for authentication");
      core.setOutput("GITHUB_TOKEN", workflowToken);
      return workflowToken;
    }

    throw new Error(
      "No GitHub token available. Please provide a gitea_token input or ensure GITHUB_TOKEN is available in the workflow environment.",
    );
  } catch (error) {
    core.setFailed(
      `Failed to setup GitHub token: ${error}.\n\nPlease provide a \`gitea_token\` in the \`with\` section of the action in your workflow yml file, or ensure the workflow has access to the default GITHUB_TOKEN.`,
    );
    process.exit(1);
  }
}
