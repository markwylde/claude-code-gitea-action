// Derive API URL from server URL for Gitea instances
function deriveApiUrl(serverUrl: string): string {
  if (serverUrl.includes("github.com")) {
    return "https://api.github.com";
  }
  // For Gitea, add /api/v1 to the server URL to get the API URL
  return `${serverUrl}/api/v1`;
}

// Get the appropriate server URL, prioritizing GITEA_SERVER_URL for custom Gitea instances
function getServerUrl(): string {
  // First check for GITEA_SERVER_URL (can be set by user)
  const giteaServerUrl = process.env.GITEA_SERVER_URL;
  if (giteaServerUrl && giteaServerUrl !== "") {
    return giteaServerUrl;
  }

  // Fall back to GITHUB_SERVER_URL (set by Gitea/GitHub Actions environment)
  const githubServerUrl = process.env.GITHUB_SERVER_URL;
  if (githubServerUrl && githubServerUrl !== "") {
    return githubServerUrl;
  }

  // Default fallback
  return "https://github.com";
}

export const GITEA_SERVER_URL = getServerUrl();

export const GITEA_API_URL =
  process.env.GITEA_API_URL || deriveApiUrl(GITEA_SERVER_URL);

// Backwards-compatible aliases for legacy GitHub-specific naming
export const GITHUB_SERVER_URL = GITEA_SERVER_URL;
export const GITHUB_API_URL = GITEA_API_URL;
