#!/usr/bin/env node
// Gitea API Operations MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// Get configuration from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const BRANCH_NAME = process.env.BRANCH_NAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITEA_API_URL = process.env.GITEA_API_URL || "https://api.github.com";

console.log(`[GITEA-MCP] Starting Gitea API Operations MCP Server`);
console.log(`[GITEA-MCP] REPO_OWNER: ${REPO_OWNER}`);
console.log(`[GITEA-MCP] REPO_NAME: ${REPO_NAME}`);
console.log(`[GITEA-MCP] BRANCH_NAME: ${BRANCH_NAME}`);
console.log(`[GITEA-MCP] GITEA_API_URL: ${GITEA_API_URL}`);
console.log(`[GITEA-MCP] GITHUB_TOKEN: ${GITHUB_TOKEN ? "***" : "undefined"}`);

if (!REPO_OWNER || !REPO_NAME || !GITHUB_TOKEN) {
  console.error(
    "[GITEA-MCP] Error: REPO_OWNER, REPO_NAME, and GITHUB_TOKEN environment variables are required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "Gitea API Operations Server",
  version: "0.0.1",
});

// Helper function to make authenticated requests to Gitea API
async function giteaRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
): Promise<any> {
  const url = `${GITEA_API_URL}${endpoint}`;
  console.log(`[GITEA-MCP] Making ${method} request to: ${url}`);

  const headers: Record<string, string> = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  console.log(`[GITEA-MCP] Response status: ${response.status}`);
  console.log(`[GITEA-MCP] Response: ${responseText.substring(0, 500)}...`);

  if (!response.ok) {
    throw new Error(
      `Gitea API request failed: ${response.status} ${responseText}`,
    );
  }

  return responseText ? JSON.parse(responseText) : null;
}

// Get issue details
server.tool(
  "get_issue",
  "Get details of a specific issue",
  {
    issue_number: z.number().describe("The issue number to fetch"),
  },
  async ({ issue_number }) => {
    try {
      const issue = await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue_number}`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(issue, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error getting issue: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error getting issue: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Get issue comments
server.tool(
  "get_issue_comments",
  "Get all comments for a specific issue",
  {
    issue_number: z.number().describe("The issue number to fetch comments for"),
    since: z
      .string()
      .optional()
      .describe("Only show comments updated after this time (ISO 8601 format)"),
    before: z
      .string()
      .optional()
      .describe(
        "Only show comments updated before this time (ISO 8601 format)",
      ),
  },
  async ({ issue_number, since, before }) => {
    try {
      let endpoint = `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue_number}/comments`;
      const params = new URLSearchParams();

      if (since) params.append("since", since);
      if (before) params.append("before", before);

      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const comments = await giteaRequest(endpoint);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(comments, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[GITEA-MCP] Error getting issue comments: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Error getting issue comments: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Add a comment to an issue
server.tool(
  "add_issue_comment",
  "Add a new comment to an issue",
  {
    issue_number: z.number().describe("The issue number to comment on"),
    body: z.string().describe("The comment body content"),
  },
  async ({ issue_number, body }) => {
    try {
      const comment = await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue_number}/comments`,
        "POST",
        { body },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(comment, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error adding issue comment: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error adding issue comment: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Update (edit) an issue comment
server.tool(
  "update_issue_comment",
  "Update an existing issue comment",
  {
    comment_id: z.number().describe("The comment ID to update"),
    body: z.string().describe("The new comment body content"),
  },
  async ({ comment_id, body }) => {
    try {
      const comment = await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments/${comment_id}`,
        "PATCH",
        { body },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(comment, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[GITEA-MCP] Error updating issue comment: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Error updating issue comment: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Delete an issue comment
server.tool(
  "delete_issue_comment",
  "Delete an issue comment",
  {
    comment_id: z.number().describe("The comment ID to delete"),
  },
  async ({ comment_id }) => {
    try {
      await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments/${comment_id}`,
        "DELETE",
      );

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted comment ${comment_id}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[GITEA-MCP] Error deleting issue comment: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Error deleting issue comment: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Get a specific comment
server.tool(
  "get_comment",
  "Get details of a specific comment",
  {
    comment_id: z.number().describe("The comment ID to fetch"),
  },
  async ({ comment_id }) => {
    try {
      const comment = await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments/${comment_id}`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(comment, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error getting comment: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error getting comment: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// List issues
server.tool(
  "list_issues",
  "List issues in the repository",
  {
    state: z
      .enum(["open", "closed", "all"])
      .optional()
      .describe("Issue state filter"),
    labels: z
      .string()
      .optional()
      .describe("Comma-separated list of label names"),
    milestone: z.string().optional().describe("Milestone title to filter by"),
    assignee: z
      .string()
      .optional()
      .describe("Username to filter issues assigned to"),
    creator: z
      .string()
      .optional()
      .describe("Username to filter issues created by"),
    mentioned: z
      .string()
      .optional()
      .describe("Username to filter issues that mention"),
    page: z.number().optional().describe("Page number for pagination"),
    limit: z.number().optional().describe("Number of items per page"),
  },
  async ({
    state,
    labels,
    milestone,
    assignee,
    creator,
    mentioned,
    page,
    limit,
  }) => {
    try {
      let endpoint = `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues`;
      const params = new URLSearchParams();

      if (state) params.append("state", state);
      if (labels) params.append("labels", labels);
      if (milestone) params.append("milestone", milestone);
      if (assignee) params.append("assignee", assignee);
      if (creator) params.append("creator", creator);
      if (mentioned) params.append("mentioned", mentioned);
      if (page) params.append("page", page.toString());
      if (limit) params.append("limit", limit.toString());

      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const issues = await giteaRequest(endpoint);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(issues, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error listing issues: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error listing issues: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Create an issue
server.tool(
  "create_issue",
  "Create a new issue",
  {
    title: z.string().describe("Issue title"),
    body: z.string().optional().describe("Issue body content"),
    assignee: z.string().optional().describe("Username to assign the issue to"),
    assignees: z
      .array(z.string())
      .optional()
      .describe("Array of usernames to assign the issue to"),
    milestone: z
      .number()
      .optional()
      .describe("Milestone ID to associate with the issue"),
    labels: z
      .array(z.string())
      .optional()
      .describe("Array of label names to apply to the issue"),
  },
  async ({ title, body, assignee, assignees, milestone, labels }) => {
    try {
      const issueData: any = { title };

      if (body) issueData.body = body;
      if (assignee) issueData.assignee = assignee;
      if (assignees) issueData.assignees = assignees;
      if (milestone) issueData.milestone = milestone;
      if (labels) issueData.labels = labels;

      const issue = await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
        "POST",
        issueData,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(issue, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error creating issue: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error creating issue: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Update an issue
server.tool(
  "update_issue",
  "Update an existing issue",
  {
    issue_number: z.number().describe("The issue number to update"),
    title: z.string().optional().describe("New issue title"),
    body: z.string().optional().describe("New issue body content"),
    assignee: z.string().optional().describe("Username to assign the issue to"),
    assignees: z
      .array(z.string())
      .optional()
      .describe("Array of usernames to assign the issue to"),
    milestone: z
      .number()
      .optional()
      .describe("Milestone ID to associate with the issue"),
    labels: z
      .array(z.string())
      .optional()
      .describe("Array of label names to apply to the issue"),
    state: z.enum(["open", "closed"]).optional().describe("Issue state"),
  },
  async ({
    issue_number,
    title,
    body,
    assignee,
    assignees,
    milestone,
    labels,
    state,
  }) => {
    try {
      const updateData: any = {};

      if (title) updateData.title = title;
      if (body !== undefined) updateData.body = body;
      if (assignee) updateData.assignee = assignee;
      if (assignees) updateData.assignees = assignees;
      if (milestone) updateData.milestone = milestone;
      if (labels) updateData.labels = labels;
      if (state) updateData.state = state;

      const issue = await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue_number}`,
        "PATCH",
        updateData,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(issue, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error updating issue: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error updating issue: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Get repository information
server.tool("get_repository", "Get repository information", {}, async () => {
  try {
    const repo = await giteaRequest(`/api/v1/repos/${REPO_OWNER}/${REPO_NAME}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(repo, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GITEA-MCP] Error getting repository: ${errorMessage}`);
    return {
      content: [
        {
          type: "text",
          text: `Error getting repository: ${errorMessage}`,
        },
      ],
      error: errorMessage,
      isError: true,
    };
  }
});

// Get pull requests
server.tool(
  "list_pull_requests",
  "List pull requests in the repository",
  {
    state: z
      .enum(["open", "closed", "all"])
      .optional()
      .describe("Pull request state filter"),
    head: z.string().optional().describe("Head branch name"),
    base: z.string().optional().describe("Base branch name"),
    page: z.number().optional().describe("Page number for pagination"),
    limit: z.number().optional().describe("Number of items per page"),
  },
  async ({ state, head, base, page, limit }) => {
    try {
      let endpoint = `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/pulls`;
      const params = new URLSearchParams();

      if (state) params.append("state", state);
      if (head) params.append("head", head);
      if (base) params.append("base", base);
      if (page) params.append("page", page.toString());
      if (limit) params.append("limit", limit.toString());

      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const pulls = await giteaRequest(endpoint);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(pulls, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error listing pull requests: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error listing pull requests: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Get a specific pull request
server.tool(
  "get_pull_request",
  "Get details of a specific pull request",
  {
    pull_number: z.number().describe("The pull request number to fetch"),
  },
  async ({ pull_number }) => {
    try {
      const pull = await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pull_number}`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(pull, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error getting pull request: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error getting pull request: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Create a pull request
server.tool(
  "create_pull_request",
  "Create a new pull request",
  {
    title: z.string().describe("Pull request title"),
    body: z.string().optional().describe("Pull request body/description"),
    head: z.string().describe("Head branch name"),
    base: z.string().describe("Base branch name"),
    assignee: z
      .string()
      .optional()
      .describe("Username to assign the pull request to"),
    assignees: z
      .array(z.string())
      .optional()
      .describe("Array of usernames to assign the pull request to"),
    milestone: z
      .number()
      .optional()
      .describe("Milestone ID to associate with the pull request"),
    labels: z
      .array(z.string())
      .optional()
      .describe("Array of label names to apply to the pull request"),
  },
  async ({
    title,
    body,
    head,
    base,
    assignee,
    assignees,
    milestone,
    labels,
  }) => {
    try {
      const pullData: any = { title, head, base };

      if (body) pullData.body = body;
      if (assignee) pullData.assignee = assignee;
      if (assignees) pullData.assignees = assignees;
      if (milestone) pullData.milestone = milestone;
      if (labels) pullData.labels = labels;

      const pull = await giteaRequest(
        `/api/v1/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
        "POST",
        pullData,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(pull, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GITEA-MCP] Error creating pull request: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error creating pull request: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

async function runServer() {
  console.log(`[GITEA-MCP] Starting MCP server transport...`);
  const transport = new StdioServerTransport();
  console.log(`[GITEA-MCP] Connecting to transport...`);
  await server.connect(transport);
  console.log(`[GITEA-MCP] Gitea MCP server connected and ready!`);
  process.on("exit", () => {
    console.log(`[GITEA-MCP] Server shutting down...`);
    server.close();
  });
}

console.log(`[GITEA-MCP] Calling runServer()...`);
runServer().catch((error) => {
  console.error(`[GITEA-MCP] Server startup failed:`, error);
  process.exit(1);
});
