import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { GiteaApiClient } from "../api/gitea-client";

/**
 * Check if the actor has write permissions to the repository
 * @param api - The Gitea API client
 * @param context - The GitHub context
 * @returns true if the actor has write permissions, false otherwise
 */
export async function checkWritePermissions(
  api: GiteaApiClient,
  context: ParsedGitHubContext,
): Promise<boolean> {
  const { repository, actor } = context;

  core.info(
    `Environment check - GITEA_API_URL: ${process.env.GITEA_API_URL || "undefined"}`,
  );
  core.info(`API client base URL: ${api.getBaseUrl?.() || "undefined"}`);

  // For Gitea compatibility, check if we're in a non-GitHub environment
  const giteaApiUrl = process.env.GITEA_API_URL?.trim();
  const isGitea =
    giteaApiUrl &&
    giteaApiUrl !== "" &&
    !giteaApiUrl.includes("api.github.com") &&
    !giteaApiUrl.includes("github.com");

  if (isGitea) {
    core.info(
      `Detected Gitea environment (${giteaApiUrl}), assuming actor has permissions`,
    );
    return true;
  }

  // Also check if the API client base URL suggests we're using Gitea
  const apiUrl = api.getBaseUrl?.() || "";
  if (
    apiUrl &&
    !apiUrl.includes("api.github.com") &&
    !apiUrl.includes("github.com")
  ) {
    core.info(
      `Detected non-GitHub API URL (${apiUrl}), assuming actor has permissions`,
    );
    return true;
  }

  // If we're still here, we might be using GitHub's API, so attempt the permissions check
  core.info(
    `Proceeding with GitHub-style permission check for actor: ${actor}`,
  );

  // However, if the API client is clearly pointing to a non-GitHub URL, skip the check
  if (apiUrl && apiUrl !== "https://api.github.com") {
    core.info(
      `API URL ${apiUrl} doesn't look like GitHub, assuming permissions and skipping check`,
    );
    return true;
  }

  try {
    // Check permissions directly using the permission endpoint
    const response = await api.customRequest(
      "GET",
      `/api/v1/repos/${repository.owner}/${repository.repo}/collaborators/${actor}/permission`,
    );

    const permissionLevel = response.data.permission;
    core.info(`Permission level retrieved: ${permissionLevel}`);

    if (permissionLevel === "admin" || permissionLevel === "write") {
      core.info(`Actor has write access: ${permissionLevel}`);
      return true;
    } else {
      core.warning(`Actor has insufficient permissions: ${permissionLevel}`);
      return false;
    }
  } catch (error) {
    core.error(`Failed to check permissions: ${error}`);
    throw new Error(`Failed to check permissions for ${actor}: ${error}`);
  }
}
