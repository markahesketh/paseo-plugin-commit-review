import { describe, expect, it } from "vitest";
import { buildReviewAttachments } from "./attachment";
import type { ReviewComment } from "./review";

const A = "a".repeat(40);
const B = "b".repeat(40);

function comment(sha: string, body: string): ReviewComment {
  return {
    id: body,
    workspaceId: "workspace",
    sha,
    baseRef: `${sha.replace(/./g, "0")}..${sha}`,
    filePath: "src/total.ts",
    side: "new",
    lineNumber: 12,
    body,
    context: {
      hunkHeader: "@@ -10,3 +10,3 @@",
      targetLine: { type: "add", content: "b", oldLineNumber: null, newLineNumber: 12 },
      lines: [
        { type: "context", content: "a", oldLineNumber: 11, newLineNumber: 11 },
        { type: "add", content: "b", oldLineNumber: null, newLineNumber: 12 },
      ],
    },
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };
}

describe("buildReviewAttachments", () => {
  it("makes one native base review per commit over the commit's range", () => {
    const attachments = buildReviewAttachments({
      cwd: "/repo",
      comments: [comment(A, "one"), comment(B, "two"), comment(A, "three")],
    });

    expect(attachments.map((a) => [a.baseRef, a.comments.map((c) => c.body)])).toEqual([
      [`${"0".repeat(40)}..${A}`, ["one", "three"]],
      [`${"0".repeat(40)}..${B}`, ["two"]],
    ]);
    expect(attachments[0]).toMatchObject({ type: "review", mimeType: "application/paseo-review", mode: "base", cwd: "/repo" });
    expect(attachments[0].comments[0]).toEqual({
      filePath: "src/total.ts",
      side: "new",
      lineNumber: 12,
      body: "one",
      context: comment(A, "one").context,
    });
  });
});
