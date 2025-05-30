import type { GitHubClient } from "../api/client";

type IssueComment = {
  type: "issue_comment";
  id: string;
  body: string;
};

type ReviewComment = {
  type: "review_comment";
  id: string;
  body: string;
};

type ReviewBody = {
  type: "review_body";
  id: string;
  pullNumber: string;
  body: string;
};

type IssueBody = {
  type: "issue_body";
  issueNumber: string;
  body: string;
};

type PullRequestBody = {
  type: "pr_body";
  pullNumber: string;
  body: string;
};

export type CommentWithImages =
  | IssueComment
  | ReviewComment
  | ReviewBody
  | IssueBody
  | PullRequestBody;

export async function downloadCommentImages(
  _client: GitHubClient,
  _owner: string,
  _repo: string,
  _comments: CommentWithImages[],
): Promise<Map<string, string>> {
  // Temporarily simplified - return empty map to avoid Octokit dependencies
  // TODO: Implement image downloading with direct Gitea API calls if needed
  console.log(
    "Image downloading temporarily disabled during Octokit migration",
  );
  return new Map<string, string>();
}
