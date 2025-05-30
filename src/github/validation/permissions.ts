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

  // For Gitea compatibility, check if we're in a non-GitHub environment
  const isGitea =
    process.env.GITEA_API_URL &&
    !process.env.GITEA_API_URL.includes("api.github.com");

  if (isGitea) {
    core.info(`Detected Gitea environment, assuming actor has permissions`);
    return true;
  }

  try {
    core.info(`Checking permissions for actor: ${actor}`);

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
