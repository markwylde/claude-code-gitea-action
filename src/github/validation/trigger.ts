#!/usr/bin/env bun

import * as core from "@actions/core";
import {
  isIssuesEvent,
  isIssueCommentEvent,
  isPullRequestEvent,
  isPullRequestReviewEvent,
  isPullRequestReviewCommentEvent,
} from "../context";
import type { IssuesLabeledEvent } from "@octokit/webhooks-types";
import type { ParsedGitHubContext } from "../context";

export function checkContainsTrigger(context: ParsedGitHubContext): boolean {
  const {
    inputs: { assigneeTrigger, triggerPhrase, directPrompt },
  } = context;

  console.log(
    `Checking trigger: event=${context.eventName}, action=${context.eventAction}, phrase='${triggerPhrase}', assignee='${assigneeTrigger}', direct='${directPrompt}'`,
  );

  // If direct prompt is provided, always trigger
  if (directPrompt) {
    console.log(`Direct prompt provided, triggering action`);
    return true;
  }

  // Check for assignee trigger
  if (isIssuesEvent(context) && context.eventAction === "assigned") {
    // Remove @ symbol from assignee_trigger if present
    let triggerUser = assigneeTrigger?.replace(/^@/, "") || "";
    const assigneeUsername = context.payload.issue.assignee?.login || "";

    console.log(
      `Checking assignee trigger: user='${triggerUser}', assignee='${assigneeUsername}'`,
    );

    if (triggerUser && assigneeUsername === triggerUser) {
      console.log(`Issue assigned to trigger user '${triggerUser}'`);
      return true;
    }
  }

  // Check for issue label trigger
  if (isIssuesEvent(context) && context.eventAction === "labeled") {
    const triggerLabel = context.inputs.labelTrigger?.trim();
    const appliedLabel = (context.payload as IssuesLabeledEvent).label?.name
      ?.trim();

    console.log(
      `Checking label trigger: expected='${triggerLabel}', applied='${appliedLabel}'`,
    );

    if (
      triggerLabel &&
      appliedLabel &&
      triggerLabel.localeCompare(appliedLabel, undefined, { sensitivity: "accent" }) === 0
    ) {
      console.log(`Issue labeled with trigger label '${triggerLabel}'`);
      return true;
    }
  }

  // Check for issue body and title trigger on issue creation
  if (isIssuesEvent(context) && context.eventAction === "opened") {
    const issueBody = context.payload.issue.body || "";
    const issueTitle = context.payload.issue.title || "";
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );

    // Check in body
    if (regex.test(issueBody)) {
      console.log(
        `Issue body contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }

    // Check in title
    if (regex.test(issueTitle)) {
      console.log(
        `Issue title contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }
  }

  // Check for pull request body and title trigger
  if (isPullRequestEvent(context)) {
    const prBody = context.payload.pull_request.body || "";
    const prTitle = context.payload.pull_request.title || "";
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );

    // Check in body
    if (regex.test(prBody)) {
      console.log(
        `Pull request body contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }

    // Check in title
    if (regex.test(prTitle)) {
      console.log(
        `Pull request title contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }

    // Check if trigger user is in requested reviewers (treat same as mention in text)
    const triggerUser = triggerPhrase.replace(/^@/, "");
    const requestedReviewers = context.payload.pull_request.requested_reviewers || [];
    const isReviewerRequested = requestedReviewers.some(reviewer => 
      'login' in reviewer && reviewer.login === triggerUser
    );

    if (isReviewerRequested) {
      console.log(
        `Pull request has '${triggerUser}' as requested reviewer (treating as trigger)`,
      );
      return true;
    }
  }

  // Check for pull request review body trigger
  if (
    isPullRequestReviewEvent(context) &&
    (context.eventAction === "submitted" || context.eventAction === "edited")
  ) {
    const reviewBody = context.payload.review.body || "";
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );
    if (regex.test(reviewBody)) {
      console.log(
        `Pull request review contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }
  }

  // Check for comment trigger
  if (
    isIssueCommentEvent(context) ||
    isPullRequestReviewCommentEvent(context)
  ) {
    const commentBody = isIssueCommentEvent(context)
      ? context.payload.comment.body
      : context.payload.comment.body;
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );
    if (regex.test(commentBody)) {
      console.log(`Comment contains exact trigger phrase '${triggerPhrase}'`);
      return true;
    }
  }

  console.log(`No trigger was met for ${triggerPhrase}`);

  return false;
}

export function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function checkTriggerAction(context: ParsedGitHubContext) {
  const containsTrigger = checkContainsTrigger(context);
  core.setOutput("contains_trigger", containsTrigger.toString());
  return containsTrigger;
}
