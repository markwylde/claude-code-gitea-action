// Derive API URL from server URL for Gitea instances
function deriveApiUrl(serverUrl: string): string {
  if (serverUrl.includes("github.com")) {
    return "https://api.github.com";
  }
  // For Gitea, add /api/v1 to the server URL to get the API URL
  return `${serverUrl}/api/v1`;
}

export const GITEA_SERVER_URL =
  process.env.GITHUB_SERVER_URL || "https://github.com";

export const GITEA_API_URL =
  process.env.GITEA_API_URL || deriveApiUrl(GITEA_SERVER_URL);
