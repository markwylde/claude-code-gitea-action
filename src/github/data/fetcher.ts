import { execSync } from "child_process";
import type {
  GitHubPullRequest,
  GitHubIssue,
  GitHubComment,
  GitHubFile,
  GitHubReview,
} from "../types";
import type { GitHubClient } from "../api/client";
import { downloadCommentImages } from "../utils/image-downloader";
import type { CommentWithImages } from "../utils/image-downloader";

type FetchDataParams = {
  client: GitHubClient;
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
  client,
  repository,
  prNumber,
  isPR,
}: FetchDataParams): Promise<FetchDataResult> {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository format. Expected 'owner/repo'.");
  }

  let contextData: GitHubPullRequest | GitHubIssue | null = null;
  let comments: GitHubComment[] = [];
  let changedFiles: GitHubFile[] = [];
  let reviewData: { nodes: GitHubReview[] } | null = null;

  try {
    // Use REST API for all requests (works with both GitHub and Gitea)
    if (isPR) {
      console.log(`Fetching PR #${prNumber} data using REST API`);
      const prResponse = await client.api.getPullRequest(owner, repo, parseInt(prNumber));

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
        const commentsResponse = await client.api.listIssueComments(
          owner,
          repo,
          parseInt(prNumber)
        );
        comments = commentsResponse.data.map((comment: any) => ({
          id: comment.id.toString(),
          databaseId: comment.id.toString(),
          body: comment.body || "",
          author: { login: comment.user?.login || "" },
          createdAt: comment.created_at,
        }));
      } catch (error) {
        console.warn("Failed to fetch PR comments:", error);
        comments = []; // Ensure we have an empty array
      }

      // Try to fetch files
      try {
        const filesResponse = await client.api.listPullRequestFiles(
          owner,
          repo,
          parseInt(prNumber)
        );
        changedFiles = filesResponse.data.map((file: any) => ({
          path: file.filename,
          additions: file.additions || 0,
          deletions: file.deletions || 0,
          changeType: file.status || "modified",
        }));
      } catch (error) {
        console.warn("Failed to fetch PR files:", error);
        changedFiles = []; // Ensure we have an empty array
      }

      reviewData = { nodes: [] }; // Simplified for Gitea
    } else {
      console.log(`Fetching issue #${prNumber} data using REST API`);
      const issueResponse = await client.api.getIssue(owner, repo, parseInt(prNumber));

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
        const commentsResponse = await client.api.listIssueComments(
          owner,
          repo,
          parseInt(prNumber)
        );
        comments = commentsResponse.data.map((comment: any) => ({
          id: comment.id.toString(),
          databaseId: comment.id.toString(),
          body: comment.body || "",
          author: { login: comment.user?.login || "" },
          createdAt: comment.created_at,
        }));
      } catch (error) {
        console.warn("Failed to fetch issue comments:", error);
        comments = []; // Ensure we have an empty array
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
    client,
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
