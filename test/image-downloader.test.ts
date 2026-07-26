import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import {
  downloadCommentImages,
  type CommentWithImages,
} from "../src/github/utils/image-downloader";

const noopClient = { api: {} } as any;

describe("downloadCommentImages", () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test("returns empty map and logs disabled message", async () => {
    const result = await downloadCommentImages(
      noopClient,
      "owner",
      "repo",
      [] as CommentWithImages[],
    );

    expect(result.size).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Image downloading temporarily disabled during Octokit migration",
    );
  });

  test("ignores provided comments while feature disabled", async () => {
    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: "![img](https://example.com/image.png)",
      },
    ];

    const result = await downloadCommentImages(
      noopClient,
      "owner",
      "repo",
      comments,
    );

    expect(result.size).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
