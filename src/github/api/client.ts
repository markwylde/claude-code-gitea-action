import { GiteaApiClient, createGiteaClient } from "./gitea-client";

export type GitHubClient = {
  api: GiteaApiClient;
};

export function createClient(token: string): GitHubClient {
  // Use the GITEA_API_URL environment variable if provided
  const apiUrl = process.env.GITEA_API_URL;
  console.log(
    `Creating client with API URL: ${apiUrl || "default (https://api.github.com)"}`,
  );

  return {
    api: apiUrl ? new GiteaApiClient(token, apiUrl) : createGiteaClient(token),
  };
}
