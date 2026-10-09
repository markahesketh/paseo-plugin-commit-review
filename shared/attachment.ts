import type { ReviewComment, ReviewContextLine, ReviewSide } from "./review";

// Paseo's own review attachment. The daemon renders it into the prompt and the
// chat shows it as the native Review pill. Paseo has no commit mode, so a
// commit is a "base" review of the range `<sha>^..<sha>`.
export interface ReviewAttachment {
  type: "review";
  mimeType: "application/paseo-review";
  cwd: string;
  mode: "base";
  baseRef: string;
  comments: Array<{
    filePath: string;
    side: ReviewSide;
    lineNumber: number;
    body: string;
    context: { hunkHeader: string; targetLine: ReviewContextLine; lines: ReviewContextLine[] };
  }>;
}

// One attachment per commit, in the order the commits were first commented on.
export function buildReviewAttachments(input: {
  cwd: string;
  comments: readonly ReviewComment[];
}): ReviewAttachment[] {
  const bySha = new Map<string, ReviewAttachment>();
  for (const comment of input.comments) {
    let attachment = bySha.get(comment.sha);
    if (!attachment) {
      attachment = {
        type: "review",
        mimeType: "application/paseo-review",
        cwd: input.cwd,
        mode: "base",
        baseRef: `${comment.shortSha}^..${comment.shortSha}`,
        comments: [],
      };
      bySha.set(comment.sha, attachment);
    }
    attachment.comments.push({
      filePath: comment.filePath,
      side: comment.side,
      lineNumber: comment.lineNumber,
      body: comment.body,
      context: {
        hunkHeader: comment.hunkHeader,
        targetLine: comment.contextLines[comment.targetIndex],
        lines: comment.contextLines,
      },
    });
  }
  return [...bySha.values()];
}
