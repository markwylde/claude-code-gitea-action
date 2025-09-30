import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import * as core from "@actions/core";
import { checkWritePermissions } from "../src/github/validation/permissions";
import type { ParsedGitHubContext } from "../src/github/context";

const baseContext: ParsedGitHubContext = {
  runId: "123",
  eventName: "issue_comment",
  eventAction: "created",
  repository: {
    owner: "owner",
    repo: "repo",
    full_name: "owner/repo",
  },
  actor: "tester",
  payload: {
    action: "created",
    issue: { number: 1, body: "", title: "", user: { login: "owner" } },
    comment: { id: 1, body: "@claude ping", user: { login: "tester" } },
  } as any,
  entityNumber: 1,
  isPR: false,
  inputs: {
    mode: "tag",
    triggerPhrase: "@claude",
    assigneeTrigger: "",
    labelTrigger: "",
    allowedTools: [],
    disallowedTools: [],
    customInstructions: "",
    directPrompt: "",
    overridePrompt: "",
    branchPrefix: "claude/",
    useStickyComment: false,
    additionalPermissions: new Map(),
    useCommitSigning: false,
  },
};

describe("checkWritePermissions", () => {
  let infoSpy: any;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    infoSpy = spyOn(core, "info").mockImplementation(() => {});
    process.env.GITEA_API_URL = "https://gitea.example.com/api/v1";
  });

  afterEach(() => {
    infoSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  test("returns true immediately in Gitea environments", async () => {
    const client = { api: { getBaseUrl: () => "https://gitea.example.com/api/v1" } } as any;
    const result = await checkWritePermissions(client, baseContext);

    expect(result).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(
      "Detected Gitea environment (https://gitea.example.com/api/v1), assuming actor has permissions",
    );
  });
});
