import type { GitHubClient } from "../api/client";
import { GITEA_SERVER_URL } from "../api/config";

export async function checkAndDeleteEmptyBranch(
  client: GitHubClient,
  owner: string,
  repo: string,
  claudeBranch: string | undefined,
  baseBranch: string,
): Promise<{ shouldDeleteBranch: boolean; branchLink: string }> {
  let branchLink = "";
  let shouldDeleteBranch = false;

  if (claudeBranch) {
    // Use direct SHA comparison for both GitHub and Gitea
    console.log("Using SHA comparison for branch check");

    try {
      // Get the branch info to see if it exists and has commits
      const branchResponse = await client.api.getBranch(
        owner,
        repo,
        claudeBranch,
      );

      // Get base branch info for comparison
      const baseResponse = await client.api.getBranch(owner, repo, baseBranch);

      const branchSha = branchResponse.data.commit.sha;
      const baseSha = baseResponse.data.commit.sha;

      // If SHAs are different, assume there are commits
      if (branchSha !== baseSha) {
        console.log(
          `Branch ${claudeBranch} appears to have commits (different SHA from base)`,
        );
        const branchUrl = `${GITEA_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
        branchLink = `\n[View branch](${branchUrl})`;
      } else {
        console.log(
          `Branch ${claudeBranch} has same SHA as base, marking for deletion`,
        );
        shouldDeleteBranch = true;
      }
    } catch (error: any) {
      console.error("Error checking branch:", error);

      // Handle 404 specifically - branch doesn't exist
      if (error.status === 404) {
        console.log(
          `Branch ${claudeBranch} does not exist yet - this is normal during workflow`,
        );
        // Don't add branch link since branch doesn't exist
        branchLink = "";
      } else {
        // For other errors, assume the branch has commits to be safe
        console.log("Assuming branch exists due to non-404 error");
        const branchUrl = `${GITEA_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
        branchLink = `\n[View branch](${branchUrl})`;
      }
    }
  }

  // Delete the branch if it has no commits
  if (shouldDeleteBranch && claudeBranch) {
    console.log(
      `Skipping branch deletion - not reliably supported across all Git platforms: ${claudeBranch}`,
    );
    // Skip deletion to avoid compatibility issues
  }

  return { shouldDeleteBranch, branchLink };
}
