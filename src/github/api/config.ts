export const GITEA_API_URL =
  process.env.GITEA_API_URL || "https://api.github.com";

// Derive server URL from API URL for Gitea instances
function deriveServerUrl(apiUrl: string): string {
  if (apiUrl.includes("api.github.com")) {
    return "https://github.com";
  }
  // For Gitea, remove /api/v1 from the API URL to get the server URL
  return apiUrl.replace(/\/api\/v1\/?$/, "");
}

export const GITEA_SERVER_URL =
  process.env.GITEA_SERVER_URL || deriveServerUrl(GITEA_API_URL);
