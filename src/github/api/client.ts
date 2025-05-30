import { GiteaApiClient, createGiteaClient } from "./gitea-client";

export type GitHubClient = {
  api: GiteaApiClient;
};

export function createClient(token: string): GitHubClient {
  return {
    api: createGiteaClient(token),
  };
}
