import * as core from "@actions/core";
import * as github from "@actions/github";
import type {
  IssuesEvent,
  IssuesAssignedEvent,
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
  PullRequestReviewCommentEvent,
} from "@octokit/webhooks-types";
import type { ModeName } from "../modes/types";
import { DEFAULT_MODE, isValidMode } from "../modes/registry";

// Gitea review payloads use `review.content` instead of `review.body`, and
// `sender` instead of nested user objects. These types extend the GitHub base
// types to make both fields available without `as any` casts.
export type GiteaPullRequestReviewEvent = PullRequestReviewEvent & {
  review?: { content?: string };
  sender?: { login: string };
};

export type GiteaPullRequestReviewCommentEvent =
  PullRequestReviewCommentEvent & {
    review?: { type: string; content: string };
    sender?: { login: string };
  };

export type ParsedGitHubContext = {
  runId: string;
  eventName: string;
  eventAction?: string;
  repository: {
    owner: string;
    repo: string;
    full_name: string;
  };
  actor: string;
  payload:
    | IssuesEvent
    | IssueCommentEvent
    | PullRequestEvent
    | GiteaPullRequestReviewEvent
    | GiteaPullRequestReviewCommentEvent;
  entityNumber: number;
  isPR: boolean;
  inputs: {
    mode: ModeName;
    triggerPhrase: string;
    assigneeTrigger: string;
    labelTrigger: string;
    allowedTools: string[];
    disallowedTools: string[];
    customInstructions: string;
    directPrompt: string;
    overridePrompt: string;
    baseBranch?: string;
    branchPrefix: string;
    useStickyComment: boolean;
    additionalPermissions: Map<string, string>;
    useCommitSigning: boolean;
  };
};

export function parseGitHubContext(): ParsedGitHubContext {
  const context = github.context;

  const modeInput = core.getInput("mode") || DEFAULT_MODE;
  if (!isValidMode(modeInput)) {
    throw new Error(`Invalid mode: ${modeInput}.`);
  }

  const commonFields = {
    runId: process.env.GITHUB_RUN_ID!,
    eventName: context.eventName,
    eventAction: context.payload.action,
    repository: {
      owner: context.repo.owner,
      repo: context.repo.repo,
      full_name: `${context.repo.owner}/${context.repo.repo}`,
    },
    actor: context.actor,
    inputs: {
      mode: modeInput as ModeName,
      triggerPhrase: core.getInput("trigger_phrase") || "@claude",
      assigneeTrigger: core.getInput("assignee_trigger"),
      labelTrigger: core.getInput("label_trigger") || "claude",
      allowedTools: parseMultilineInput(core.getInput("allowed_tools")),
      disallowedTools: parseMultilineInput(core.getInput("disallowed_tools")),
      customInstructions: core.getInput("custom_instructions"),
      directPrompt: core.getInput("direct_prompt"),
      overridePrompt: core.getInput("override_prompt"),
      baseBranch: core.getInput("base_branch") || undefined,
      branchPrefix: core.getInput("branch_prefix") || "claude/",
      useStickyComment: process.env.USE_STICKY_COMMENT === "true",
      additionalPermissions: parseAdditionalPermissions(
        core.getInput("additional_permissions"),
      ),
      useCommitSigning: process.env.USE_COMMIT_SIGNING === "true",
    },
  };

  switch (context.eventName) {
    case "issues": {
      return {
        ...commonFields,
        payload: context.payload as IssuesEvent,
        entityNumber: (context.payload as IssuesEvent).issue.number,
        isPR: false,
      };
    }
    case "issue_comment": {
      return {
        ...commonFields,
        payload: context.payload as IssueCommentEvent,
        entityNumber: (context.payload as IssueCommentEvent).issue.number,
        isPR: Boolean(
          (context.payload as IssueCommentEvent).issue.pull_request,
        ),
      };
    }
    case "pull_request": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestEvent,
        entityNumber: (context.payload as PullRequestEvent).pull_request.number,
        isPR: true,
      };
    }
    case "pull_request_review": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestReviewEvent,
        entityNumber: (context.payload as PullRequestReviewEvent).pull_request
          .number,
        isPR: true,
      };
    }
    case "pull_request_review_comment": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestReviewCommentEvent,
        entityNumber: (context.payload as PullRequestReviewCommentEvent)
          .pull_request.number,
        isPR: true,
      };
    }
    default:
      throw new Error(`Unsupported event type: ${context.eventName}`);
  }
}

export function parseMultilineInput(s: string): string[] {
  return s
    .split(/,|[\n\r]+/)
    .map((tool) => tool.replace(/#.+$/, ""))
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0);
}

export function parseAdditionalPermissions(s: string): Map<string, string> {
  const permissions = new Map<string, string>();
  if (!s || !s.trim()) {
    return permissions;
  }

  const lines = s.trim().split("\n");
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      const [key, value] = trimmedLine.split(":").map((part) => part.trim());
      if (key && value) {
        permissions.set(key, value);
      }
    }
  }
  return permissions;
}

export function isIssuesEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: IssuesEvent } {
  return context.eventName === "issues";
}

export function isIssueCommentEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: IssueCommentEvent } {
  return context.eventName === "issue_comment";
}

export function isPullRequestEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestEvent } {
  return context.eventName === "pull_request";
}

export function isPullRequestReviewEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: GiteaPullRequestReviewEvent } {
  return context.eventName === "pull_request_review";
}

export function isPullRequestReviewCommentEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & {
  payload: GiteaPullRequestReviewCommentEvent;
} {
  return context.eventName === "pull_request_review_comment";
}

export function isIssuesAssignedEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: IssuesAssignedEvent } {
  return isIssuesEvent(context) && context.eventAction === "assigned";
}
