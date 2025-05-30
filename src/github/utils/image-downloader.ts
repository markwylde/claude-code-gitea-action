import fs from "fs/promises";
import path from "path";
import type { Octokits } from "../api/client";
import { GITHUB_SERVER_URL } from "../api/config";

const IMAGE_REGEX = new RegExp(
  `!\\[[^\\]]*\\]\\((${GITHUB_SERVER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/user-attachments\\/assets\\/[^)]+)\\)`,
  "g",
);

type IssueComment = {
  type: "issue_comment";
  id: string;
  body: string;
};

type ReviewComment = {
  type: "review_comment";
  id: string;
  body: string;
};

type ReviewBody = {
  type: "review_body";
  id: string;
  pullNumber: string;
  body: string;
};

type IssueBody = {
  type: "issue_body";
  issueNumber: string;
  body: string;
};

type PullRequestBody = {
  type: "pr_body";
  pullNumber: string;
  body: string;
};

export type CommentWithImages =
  | IssueComment
  | ReviewComment
  | ReviewBody
  | IssueBody
  | PullRequestBody;

export async function downloadCommentImages(
  octokits: Octokits,
  owner: string,
  repo: string,
  comments: CommentWithImages[],
): Promise<Map<string, string>> {
  const urlToPathMap = new Map<string, string>();
  const downloadsDir = "/tmp/github-images";

  await fs.mkdir(downloadsDir, { recursive: true });

  const commentsWithImages: Array<{
    comment: CommentWithImages;
    urls: string[];
  }> = [];

  for (const comment of comments) {
    const imageMatches = [...comment.body.matchAll(IMAGE_REGEX)];
    const urls = imageMatches.map((match) => match[1] as string);

    if (urls.length > 0) {
      commentsWithImages.push({ comment, urls });
      const id =
        comment.type === "issue_body"
          ? comment.issueNumber
          : comment.type === "pr_body"
            ? comment.pullNumber
            : comment.id;
      console.log(`Found ${urls.length} image(s) in ${comment.type} ${id}`);
    }
  }

  // Process each comment with images
  for (const { comment, urls } of commentsWithImages) {
    try {
      let bodyHtml: string | undefined;

      // Get the HTML version based on comment type
      // Try with full+json mediaType first (GitHub), fallback to regular API (Gitea)
      switch (comment.type) {
        case "issue_comment": {
          try {
            const response = await octokits.rest.issues.getComment({
              owner,
              repo,
              comment_id: parseInt(comment.id),
              mediaType: {
                format: "full+json",
              },
            });
            bodyHtml = response.data.body_html;
          } catch (error: any) {
            console.log(
              "Full+json format not supported, trying regular API for issue comment",
            );
            // Fallback for Gitea - use regular API without mediaType
            const response = await octokits.rest.issues.getComment({
              owner,
              repo,
              comment_id: parseInt(comment.id),
            });
            // Gitea might not have body_html, use body instead
            bodyHtml = (response.data as any).body_html || response.data.body;
          }
          break;
        }
        case "review_comment": {
          try {
            const response = await octokits.rest.pulls.getReviewComment({
              owner,
              repo,
              comment_id: parseInt(comment.id),
              mediaType: {
                format: "full+json",
              },
            });
            bodyHtml = response.data.body_html;
          } catch (error: any) {
            console.log(
              "Full+json format not supported, trying regular API for review comment",
            );
            // Fallback for Gitea
            const response = await octokits.rest.pulls.getReviewComment({
              owner,
              repo,
              comment_id: parseInt(comment.id),
            });
            bodyHtml = (response.data as any).body_html || response.data.body;
          }
          break;
        }
        case "review_body": {
          try {
            const response = await octokits.rest.pulls.getReview({
              owner,
              repo,
              pull_number: parseInt(comment.pullNumber),
              review_id: parseInt(comment.id),
              mediaType: {
                format: "full+json",
              },
            });
            bodyHtml = response.data.body_html;
          } catch (error: any) {
            console.log(
              "Full+json format not supported, trying regular API for review",
            );
            // Fallback for Gitea
            const response = await octokits.rest.pulls.getReview({
              owner,
              repo,
              pull_number: parseInt(comment.pullNumber),
              review_id: parseInt(comment.id),
            });
            bodyHtml = (response.data as any).body_html || response.data.body;
          }
          break;
        }
        case "issue_body": {
          try {
            const response = await octokits.rest.issues.get({
              owner,
              repo,
              issue_number: parseInt(comment.issueNumber),
              mediaType: {
                format: "full+json",
              },
            });
            bodyHtml = response.data.body_html;
          } catch (error: any) {
            console.log(
              "Full+json format not supported, trying regular API for issue",
            );
            // Fallback for Gitea
            const response = await octokits.rest.issues.get({
              owner,
              repo,
              issue_number: parseInt(comment.issueNumber),
            });
            bodyHtml = (response.data as any).body_html || response.data.body;
          }
          break;
        }
        case "pr_body": {
          try {
            const response = await octokits.rest.pulls.get({
              owner,
              repo,
              pull_number: parseInt(comment.pullNumber),
              mediaType: {
                format: "full+json",
              },
            });
            // Type here seems to be wrong
            bodyHtml = (response.data as any).body_html;
          } catch (error: any) {
            console.log(
              "Full+json format not supported, trying regular API for PR",
            );
            // Fallback for Gitea
            const response = await octokits.rest.pulls.get({
              owner,
              repo,
              pull_number: parseInt(comment.pullNumber),
            });
            bodyHtml = (response.data as any).body_html || response.data.body;
          }
          break;
        }
      }
      if (!bodyHtml) {
        const id =
          comment.type === "issue_body"
            ? comment.issueNumber
            : comment.type === "pr_body"
              ? comment.pullNumber
              : comment.id;
        console.warn(`No HTML body found for ${comment.type} ${id}`);
        continue;
      }

      // Extract signed URLs from HTML
      const signedUrlRegex =
        /https:\/\/private-user-images\.githubusercontent\.com\/[^"]+\?jwt=[^"]+/g;
      const signedUrls = bodyHtml.match(signedUrlRegex) || [];

      // Download each image
      for (let i = 0; i < Math.min(signedUrls.length, urls.length); i++) {
        const signedUrl = signedUrls[i];
        const originalUrl = urls[i];

        if (!signedUrl || !originalUrl) {
          continue;
        }

        // Check if we've already downloaded this URL
        if (urlToPathMap.has(originalUrl)) {
          continue;
        }

        const fileExtension = getImageExtension(originalUrl);
        const filename = `image-${Date.now()}-${i}${fileExtension}`;
        const localPath = path.join(downloadsDir, filename);

        try {
          console.log(`Downloading ${originalUrl}...`);

          const imageResponse = await fetch(signedUrl);
          if (!imageResponse.ok) {
            throw new Error(
              `HTTP ${imageResponse.status}: ${imageResponse.statusText}`,
            );
          }

          const arrayBuffer = await imageResponse.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          await fs.writeFile(localPath, buffer);
          console.log(`✓ Saved: ${localPath}`);

          urlToPathMap.set(originalUrl, localPath);
        } catch (error) {
          console.error(`✗ Failed to download ${originalUrl}:`, error);
        }
      }
    } catch (error) {
      const id =
        comment.type === "issue_body"
          ? comment.issueNumber
          : comment.type === "pr_body"
            ? comment.pullNumber
            : comment.id;
      console.error(
        `Failed to process images for ${comment.type} ${id}:`,
        error,
      );
    }
  }

  return urlToPathMap;
}

function getImageExtension(url: string): string {
  const urlParts = url.split("/");
  const filename = urlParts[urlParts.length - 1];
  if (!filename) {
    throw new Error("Invalid URL: No filename found");
  }

  const match = filename.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  return match ? match[0] : ".png";
}
