#!/usr/bin/env bun

/**
 * Check if the action trigger is from a human actor
 * Prevents automated tools or bots from triggering Claude
 */

import type { Octokit } from "@octokit/rest";
import type { ParsedGitHubContext } from "../context";

export async function checkHumanActor(
  octokit: Octokit,
  githubContext: ParsedGitHubContext,
) {
  // Check if we're in a Gitea environment
  const isGitea =
    process.env.GITHUB_API_URL &&
    !process.env.GITHUB_API_URL.includes("api.github.com");

  if (isGitea) {
    console.log(
      `Detected Gitea environment, skipping actor type validation for: ${githubContext.actor}`,
    );
    return;
  }

  try {
    // Fetch user information from GitHub API
    const { data: userData } = await octokit.users.getByUsername({
      username: githubContext.actor,
    });

    const actorType = userData.type;

    console.log(`Actor type: ${actorType}`);

    if (actorType !== "User") {
      throw new Error(
        `Workflow initiated by non-human actor: ${githubContext.actor} (type: ${actorType}).`,
      );
    }

    console.log(`Verified human actor: ${githubContext.actor}`);
  } catch (error) {
    console.warn(
      `Failed to check actor type for ${githubContext.actor}:`,
      error,
    );

    // For compatibility, assume human actor if API call fails
    console.log(
      `Assuming human actor due to API failure: ${githubContext.actor}`,
    );
  }
}
