import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface ClaudeCredentialsInput {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
  };
}

export async function setupOAuthCredentials(credentialsJson: string) {
  try {
    // Parse the credentials JSON
    const parsedCredentials: ClaudeCredentialsInput =
      JSON.parse(credentialsJson);

    if (!parsedCredentials.claudeAiOauth) {
      throw new Error("Invalid credentials format: missing claudeAiOauth");
    }

    const { accessToken, refreshToken, expiresAt } =
      parsedCredentials.claudeAiOauth;

    if (!accessToken || !refreshToken || !expiresAt) {
      throw new Error(
        "Invalid credentials format: missing required OAuth fields",
      );
    }

    const claudeDir = join(homedir(), ".claude");
    const credentialsPath = join(claudeDir, ".credentials.json");

    // Create the .claude directory if it doesn't exist
    await mkdir(claudeDir, { recursive: true });

    // Create the credentials JSON structure
    const credentialsData = {
      claudeAiOauth: {
        accessToken,
        refreshToken,
        expiresAt,
        scopes: ["user:inference", "user:profile"],
      },
    };

    // Write the credentials file
    await writeFile(credentialsPath, JSON.stringify(credentialsData, null, 2));

    console.log(`OAuth credentials written to ${credentialsPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to setup OAuth credentials: ${errorMessage}`);
  }
}
