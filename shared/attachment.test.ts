import { describe, expect, it } from "vitest";
import { buildReviewAttachments } from "./attachment";
import type { ReviewComment } from "./review";

function comment(sha: string, body: string): ReviewComment {
  return {
    id: body,
    workspaceId: "workspace",
    sha: `${sha}def`,
    shortSha: sha,
    filePath: "src/total.ts",
    side: "new",
    lineNumber: 12,
    body,
    hunkHeader: "@@ -10,3 +10,3 @@",
    targetIndex: 1,
    contextLines: [
      { type: "context", content: "a", oldLineNumber: 11, newLineNumber: 11 },
      { type: "add", content: "b", oldLineNumber: null, newLineNumber: 12 },
    ],
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };
}

describe("buildReviewAttachments", () => {
  it("makes one native base review per commit with the commit as the range", () => {
    const attachments = buildReviewAttachments({
      cwd: "/repo",
      comments: [comment("abc1234", "one"), comment("fff0000", "two"), comment("abc1234", "three")],
    });

    expect(attachments.map((a) => [a.baseRef, a.comments.map((c) => c.body)])).toEqual([
      ["abc1234^..abc1234", ["one", "three"]],
      ["fff0000^..fff0000", ["two"]],
    ]);
    expect(attachments[0]).toMatchObject({ type: "review", mimeType: "application/paseo-review", mode: "base", cwd: "/repo" });
    expect(attachments[0].comments[0].context.targetLine).toEqual(comment("abc1234", "one").contextLines[1]);
  });
});
