import fetch from "node-fetch";
import { GITEA_API_URL } from "./config";

export interface GiteaApiResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface GiteaApiError extends Error {
  status: number;
  response?: {
    data: any;
    status: number;
    headers: Record<string, string>;
  };
}

export class GiteaApiClient {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl: string = GITEA_API_URL) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/+$/, ""); // Remove trailing slashes
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T = any>(
    method: string,
    endpoint: string,
    body?: any,
  ): Promise<GiteaApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`Making ${method} request to: ${url}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `token ${this.token}`,
    };

    const options: any = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      let responseData: any = null;
      const contentType = response.headers.get("content-type");

      // Only try to parse JSON if the response has JSON content type
      if (contentType && contentType.includes("application/json")) {
        try {
          responseData = await response.json();
        } catch (parseError) {
          console.warn(`Failed to parse JSON response: ${parseError}`);
          responseData = await response.text();
        }
      } else {
        responseData = await response.text();
      }

      if (!response.ok) {
        const errorMessage =
          typeof responseData === "object" && responseData.message
            ? responseData.message
            : responseData || response.statusText;

        const error = new Error(
          `HTTP ${response.status}: ${errorMessage}`,
        ) as GiteaApiError;
        error.status = response.status;
        error.response = {
          data: responseData,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
        };
        throw error;
      }

      return {
        status: response.status,
        data: responseData as T,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        throw error;
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  // Repository operations
  async getRepo(owner: string, repo: string) {
    return this.request("GET", `/api/v1/repos/${owner}/${repo}`);
  }

  // Simple test endpoint to verify API connectivity
  async testConnection() {
    return this.request("GET", "/api/v1/version");
  }

  async getBranch(owner: string, repo: string, branch: string) {
    return this.request(
      "GET",
      `/api/v1/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    );
  }

  async createBranch(
    owner: string,
    repo: string,
    newBranch: string,
    fromBranch: string,
  ) {
    return this.request("POST", `/api/v1/repos/${owner}/${repo}/branches`, {
      new_branch_name: newBranch,
      old_branch_name: fromBranch,
    });
  }

  async listBranches(owner: string, repo: string) {
    return this.request("GET", `/api/v1/repos/${owner}/${repo}/branches`);
  }

  // Issue operations
  async getIssue(owner: string, repo: string, issueNumber: number) {
    return this.request(
      "GET",
      `/api/v1/repos/${owner}/${repo}/issues/${issueNumber}`,
    );
  }

  async listIssueComments(owner: string, repo: string, issueNumber: number) {
    return this.request(
      "GET",
      `/api/v1/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    );
  }

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ) {
    return this.request(
      "POST",
      `/api/v1/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        body,
      },
    );
  }

  async updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ) {
    return this.request(
      "PATCH",
      `/api/v1/repos/${owner}/${repo}/issues/comments/${commentId}`,
      {
        body,
      },
    );
  }

  // Pull request operations
  async getPullRequest(owner: string, repo: string, prNumber: number) {
    return this.request(
      "GET",
      `/api/v1/repos/${owner}/${repo}/pulls/${prNumber}`,
    );
  }

  async listPullRequestFiles(owner: string, repo: string, prNumber: number) {
    return this.request(
      "GET",
      `/api/v1/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    );
  }

  async listPullRequestComments(owner: string, repo: string, prNumber: number) {
    return this.request(
      "GET",
      `/api/v1/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    );
  }

  async createPullRequestComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
  ) {
    return this.request(
      "POST",
      `/api/v1/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
      {
        body,
      },
    );
  }

  // File operations
  async getFileContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ) {
    let endpoint = `/api/v1/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    if (ref) {
      endpoint += `?ref=${encodeURIComponent(ref)}`;
    }
    return this.request("GET", endpoint);
  }

  async createFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string,
  ) {
    const body: any = {
      message,
      content: Buffer.from(content).toString("base64"),
    };

    if (branch) {
      body.branch = branch;
    }

    return this.request(
      "POST",
      `/api/v1/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      body,
    );
  }

  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha: string,
    branch?: string,
  ) {
    const body: any = {
      message,
      content: Buffer.from(content).toString("base64"),
      sha,
    };

    if (branch) {
      body.branch = branch;
    }

    return this.request(
      "PUT",
      `/api/v1/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      body,
    );
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch?: string,
  ) {
    const body: any = {
      message,
      sha,
    };

    if (branch) {
      body.branch = branch;
    }

    return this.request(
      "DELETE",
      `/api/v1/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      body,
    );
  }

  // Generic request method for other operations
  async customRequest<T = any>(
    method: string,
    endpoint: string,
    body?: any,
  ): Promise<GiteaApiResponse<T>> {
    return this.request<T>(method, endpoint, body);
  }
}

export function createGiteaClient(token: string): GiteaApiClient {
  return new GiteaApiClient(token);
}
