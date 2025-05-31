import { GITEA_SERVER_URL } from "../../api/config";
import { readFileSync } from "fs";
import { join } from "path";

function getSpinnerHtml(): string {
  try {
    const spinnerPath = join(__dirname, "../../../assets/spinner.gif");
    const spinnerBuffer = readFileSync(spinnerPath);
    const base64Data = spinnerBuffer.toString("base64");
    return `<img src="data:image/gif;base64,${base64Data}" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />`;
  } catch (error) {
    console.warn("Could not load spinner image, using fallback");
    // Fallback to a simple text spinner
    return '<span style="margin-left: 4px;">⏳</span>';
  }
}

export const SPINNER_HTML = getSpinnerHtml();

export function createJobRunLink(
  owner: string,
  repo: string,
  runId: string,
): string {
  const jobRunUrl = `${GITEA_SERVER_URL}/${owner}/${repo}/actions/runs/${runId}`;
  return `[View job run](${jobRunUrl})`;
}

export function createBranchLink(
  owner: string,
  repo: string,
  branchName: string,
): string {
  const branchUrl = `${GITEA_SERVER_URL}/${owner}/${repo}/src/branch/${branchName}/`;
  return `\n[View branch](${branchUrl})`;
}

export function createCommentBody(
  jobRunLink: string,
  branchLink: string = "",
): string {
  return `Claude Code is working… ${SPINNER_HTML}

I'll analyze this and get back to you.

${jobRunLink}${branchLink}`;
}
