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
    // Check if we're in a Gitea environment
    const isGitea =
      process.env.GITHUB_API_URL &&
      !process.env.GITHUB_API_URL.includes("api.github.com");

    if (isGitea) {
      // Gitea doesn't support the /compare endpoint, use direct SHA comparison
      console.log(
        "Detected Gitea environment, using SHA comparison for branch check",
      );

      try {
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
      } catch (error) {
        console.error("Error checking branch in Gitea:", error);
        // If we can't check, assume the branch has commits to be safe
        const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
        branchLink = `\n[View branch](${branchUrl})`;
      }
    } else {
      // GitHub environment - use the comparison API
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

        // Fallback to SHA comparison even on GitHub if API fails
        try {
          console.log(
            "GitHub comparison API failed, falling back to SHA comparison",
          );

          const branchResponse = await octokit.rest.repos.getBranch({
            owner,
            repo,
            branch: claudeBranch,
          });

          const baseResponse = await octokit.rest.repos.getBranch({
            owner,
            repo,
            branch: baseBranch,
          });

          const branchSha = branchResponse.data.commit.sha;
          const baseSha = baseResponse.data.commit.sha;

          if (branchSha !== baseSha) {
            const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
            branchLink = `\n[View branch](${branchUrl})`;
          } else {
            shouldDeleteBranch = true;
          }
        } catch (fallbackError) {
          console.error(
            "Fallback branch comparison also failed:",
            fallbackError,
          );
          // If all checks fail, assume the branch has commits to be safe
          const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
          branchLink = `\n[View branch](${branchUrl})`;
        }
      }
    }
  }

  // Delete the branch if it has no commits
  if (shouldDeleteBranch && claudeBranch) {
    // Check if we're in a Gitea environment for deletion too
    const isGitea =
      process.env.GITHUB_API_URL &&
      !process.env.GITHUB_API_URL.includes("api.github.com");

    if (isGitea) {
      console.log(
        `Skipping branch deletion for Gitea - not reliably supported: ${claudeBranch}`,
      );
      // Don't attempt deletion in Gitea as it's not reliably supported
    } else {
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
        // Continue even if deletion fails - this is not critical
      }
    }
  }

  return { shouldDeleteBranch, branchLink };
}
