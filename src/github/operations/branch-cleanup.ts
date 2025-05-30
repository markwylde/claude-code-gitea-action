import type { Octokits } from "../api/client";
import { GITHUB_SERVER_URL } from "../api/config";

export async function checkAndDeleteEmptyBranch(
  octokit: Octokits,
  owner: string,
  repo: string,
  claudeBranch: string | undefined,
  baseBranch: string,
): Promise<{ shouldDeleteBranch: boolean; branchLink: string }> {
  let branchLink = "";
  let shouldDeleteBranch = false;

  if (claudeBranch) {
    // Check if Claude made any commits to the branch
    try {
      const { data: comparison } =
        await octokit.rest.repos.compareCommitsWithBasehead({
          owner,
          repo,
          basehead: `${baseBranch}...${claudeBranch}`,
        });

      // If there are no commits, mark branch for deletion
      if (comparison.total_commits === 0) {
        console.log(
          `Branch ${claudeBranch} has no commits from Claude, will delete it`,
        );
        shouldDeleteBranch = true;
      } else {
        // Only add branch link if there are commits
        const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
        branchLink = `\n[View branch](${branchUrl})`;
      }
    } catch (error) {
      console.error("Error checking for commits on Claude branch:", error);

      // For Gitea compatibility, try alternative approach using branches endpoint
      try {
        console.log(
          "Trying alternative branch comparison for Gitea compatibility...",
        );

        // Get the branch info to see if it exists and has commits
        const branchResponse = await octokit.rest.repos.getBranch({
          owner,
          repo,
          branch: claudeBranch,
        });

        // Get base branch info for comparison
        const baseResponse = await octokit.rest.repos.getBranch({
          owner,
          repo,
          branch: baseBranch,
        });

        const branchSha = branchResponse.data.commit.sha;
        const baseSha = baseResponse.data.commit.sha;

        // If SHAs are different, assume there are commits
        if (branchSha !== baseSha) {
          console.log(
            `Branch ${claudeBranch} appears to have commits (different SHA from base)`,
          );
          const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
          branchLink = `\n[View branch](${branchUrl})`;
        } else {
          console.log(
            `Branch ${claudeBranch} has same SHA as base, marking for deletion`,
          );
          shouldDeleteBranch = true;
        }
      } catch (fallbackError) {
        console.error("Fallback branch comparison also failed:", fallbackError);
        // If all checks fail, assume the branch has commits to be safe
        const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
        branchLink = `\n[View branch](${branchUrl})`;
      }
    }
  }

  // Delete the branch if it has no commits
  if (shouldDeleteBranch && claudeBranch) {
    try {
      await octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${claudeBranch}`,
      });
      console.log(`✅ Deleted empty branch: ${claudeBranch}`);
    } catch (deleteError: any) {
      console.error(`Failed to delete branch ${claudeBranch}:`, deleteError);
      console.log(`Delete error status: ${deleteError.status}`);

      // For Gitea, branch deletion might not be supported via API
      if (deleteError.status === 405 || deleteError.status === 404) {
        console.log(
          "Branch deletion not supported or branch doesn't exist remotely - this is expected for Gitea",
        );
      }

      // Continue even if deletion fails - this is not critical
    }
  }

  return { shouldDeleteBranch, branchLink };
}
