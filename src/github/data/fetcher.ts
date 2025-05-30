import { execSync } from "child_process";
import type {
  GitHubPullRequest,
  GitHubIssue,
  GitHubComment,
  GitHubFile,
  GitHubReview,
  PullRequestQueryResponse,
  IssueQueryResponse,
} from "../types";
import { PR_QUERY, ISSUE_QUERY } from "../api/queries/github";
import type { Octokits } from "../api/client";
import { downloadCommentImages } from "../utils/image-downloader";
import type { CommentWithImages } from "../utils/image-downloader";

type FetchDataParams = {
  octokits: Octokits;
  repository: string;
  prNumber: string;
  isPR: boolean;
};

export type GitHubFileWithSHA = GitHubFile & {
  sha: string;
};

export type FetchDataResult = {
  contextData: GitHubPullRequest | GitHubIssue;
  comments: GitHubComment[];
  changedFiles: GitHubFile[];
  changedFilesWithSHA: GitHubFileWithSHA[];
  reviewData: { nodes: GitHubReview[] } | null;
  imageUrlMap: Map<string, string>;
};

export async function fetchGitHubData({
  octokits,
  repository,
  prNumber,
  isPR,
}: FetchDataParams): Promise<FetchDataResult> {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository format. Expected 'owner/repo'.");
  }

  // Check if we're in a Gitea environment (no GraphQL support)
  const isGitea = process.env.GITHUB_API_URL && !process.env.GITHUB_API_URL.includes('api.github.com');

  let contextData: GitHubPullRequest | GitHubIssue | null = null;
  let comments: GitHubComment[] = [];
  let changedFiles: GitHubFile[] = [];
  let reviewData: { nodes: GitHubReview[] } | null = null;

  try {
    if (isGitea) {
      // Use REST API for Gitea compatibility
      if (isPR) {
        console.log(`Fetching PR #${prNumber} data using REST API (Gitea mode)`);
        const prResponse = await octokits.rest.pulls.get({
          owner,
          repo,
          pull_number: parseInt(prNumber),
        });

        contextData = {
          title: prResponse.data.title,
          body: prResponse.data.body || "",
          author: { login: prResponse.data.user?.login || "" },
          baseRefName: prResponse.data.base.ref,
          headRefName: prResponse.data.head.ref,
          headRefOid: prResponse.data.head.sha,
          createdAt: prResponse.data.created_at,
          additions: prResponse.data.additions || 0,
          deletions: prResponse.data.deletions || 0,
          state: prResponse.data.state.toUpperCase(),
          commits: { totalCount: 0, nodes: [] },
          files: { nodes: [] },
          comments: { nodes: [] },
          reviews: { nodes: [] },
        };

        // Fetch comments separately
        try {
          const commentsResponse = await octokits.rest.issues.listComments({
            owner,
            repo,
            issue_number: parseInt(prNumber),
          });
          comments = commentsResponse.data.map(comment => ({
            id: comment.id.toString(),
            databaseId: comment.id.toString(),
            body: comment.body || "",
            author: { login: comment.user?.login || "" },
            createdAt: comment.created_at,
          }));
        } catch (error) {
          console.warn("Failed to fetch PR comments:", error);
        }

        // Try to fetch files
        try {
          const filesResponse = await octokits.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: parseInt(prNumber),
          });
          changedFiles = filesResponse.data.map(file => ({
            path: file.filename,
            additions: file.additions,
            deletions: file.deletions,
            changeType: file.status,
          }));
        } catch (error) {
          console.warn("Failed to fetch PR files:", error);
        }

        reviewData = { nodes: [] }; // Simplified for Gitea
      } else {
        console.log(`Fetching issue #${prNumber} data using REST API (Gitea mode)`);
        const issueResponse = await octokits.rest.issues.get({
          owner,
          repo,
          issue_number: parseInt(prNumber),
        });

        contextData = {
          title: issueResponse.data.title,
          body: issueResponse.data.body || "",
          author: { login: issueResponse.data.user?.login || "" },
          createdAt: issueResponse.data.created_at,
          state: issueResponse.data.state.toUpperCase(),
          comments: { nodes: [] },
        };

        // Fetch comments
        try {
          const commentsResponse = await octokits.rest.issues.listComments({
            owner,
            repo,
            issue_number: parseInt(prNumber),
          });
          comments = commentsResponse.data.map(comment => ({
            id: comment.id.toString(),
            databaseId: comment.id.toString(),
            body: comment.body || "",
            author: { login: comment.user?.login || "" },
            createdAt: comment.created_at,
          }));
        } catch (error) {
          console.warn("Failed to fetch issue comments:", error);
        }
      }
    } else {
      // Use GraphQL for GitHub
      if (isPR) {
        const prResult = await octokits.graphql<PullRequestQueryResponse>(
          PR_QUERY,
          {
            owner,
            repo,
            number: parseInt(prNumber),
          },
        );

        if (prResult.repository.pullRequest) {
          const pullRequest = prResult.repository.pullRequest;
          contextData = pullRequest;
          changedFiles = pullRequest.files.nodes || [];
          comments = pullRequest.comments?.nodes || [];
          reviewData = pullRequest.reviews || [];

          console.log(`Successfully fetched PR #${prNumber} data`);
        } else {
          throw new Error(`PR #${prNumber} not found`);
        }
      } else {
        const issueResult = await octokits.graphql<IssueQueryResponse>(
          ISSUE_QUERY,
          {
            owner,
            repo,
            number: parseInt(prNumber),
          },
        );

        if (issueResult.repository.issue) {
          contextData = issueResult.repository.issue;
          comments = contextData?.comments?.nodes || [];

          console.log(`Successfully fetched issue #${prNumber} data`);
        } else {
          throw new Error(`Issue #${prNumber} not found`);
        }
      }
    }
  } catch (error) {
    console.error(`Failed to fetch ${isPR ? "PR" : "issue"} data:`, error);
    throw new Error(`Failed to fetch ${isPR ? "PR" : "issue"} data`);
  }

  // Compute SHAs for changed files
  let changedFilesWithSHA: GitHubFileWithSHA[] = [];
  if (isPR && changedFiles.length > 0) {
    changedFilesWithSHA = changedFiles.map((file) => {
      try {
        // Use git hash-object to compute the SHA for the current file content
        const sha = execSync(`git hash-object "${file.path}"`, {
          encoding: "utf-8",
        }).trim();
        return {
          ...file,
          sha,
        };
      } catch (error) {
        console.warn(`Failed to compute SHA for ${file.path}:`, error);
        // Return original file without SHA if computation fails
        return {
          ...file,
          sha: "unknown",
        };
      }
    });
  }

  // Prepare all comments for image processing
  const issueComments: CommentWithImages[] = comments
    .filter((c) => c.body)
    .map((c) => ({
      type: "issue_comment" as const,
      id: c.databaseId,
      body: c.body,
    }));

  const reviewBodies: CommentWithImages[] =
    reviewData?.nodes
      ?.filter((r) => r.body)
      .map((r) => ({
        type: "review_body" as const,
        id: r.databaseId,
        pullNumber: prNumber,
        body: r.body,
      })) ?? [];

  const reviewComments: CommentWithImages[] =
    reviewData?.nodes
      ?.flatMap((r) => r.comments?.nodes ?? [])
      .filter((c) => c.body)
      .map((c) => ({
        type: "review_comment" as const,
        id: c.databaseId,
        body: c.body,
      })) ?? [];

  // Add the main issue/PR body if it has content
  const mainBody: CommentWithImages[] = contextData.body
    ? [
        {
          ...(isPR
            ? {
                type: "pr_body" as const,
                pullNumber: prNumber,
                body: contextData.body,
              }
            : {
                type: "issue_body" as const,
                issueNumber: prNumber,
                body: contextData.body,
              }),
        },
      ]
    : [];

  const allComments = [
    ...mainBody,
    ...issueComments,
    ...reviewBodies,
    ...reviewComments,
  ];

  const imageUrlMap = await downloadCommentImages(
    octokits,
    owner,
    repo,
    allComments,
  );

  return {
    contextData,
    comments,
    changedFiles,
    changedFilesWithSHA,
    reviewData,
    imageUrlMap,
  };
}
