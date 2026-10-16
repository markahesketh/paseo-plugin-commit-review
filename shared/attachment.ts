import type { ReviewComment, ReviewCommentContext, ReviewSide } from "./review";

// Paseo's own review attachment. The daemon renders it into the prompt and the
// chat shows it as the native Review pill. Paseo has no commit mode, so a
// commit is a "base" review of the range `<parent>..<sha>`.
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
    context: ReviewCommentContext;
  }>;
}

// One attachment per commit, in the order the commits were first commented on.
export function buildReviewAttachments(input: {
  cwd: string;
  comments: readonly ReviewComment[];
}): ReviewAttachment[] {
  const bySha = new Map<string, ReviewAttachment>();
  for (const { sha, baseRef, filePath, side, lineNumber, body, context } of input.comments) {
    let attachment = bySha.get(sha);
    if (!attachment) {
      attachment = { type: "review", mimeType: "application/paseo-review", cwd: input.cwd, mode: "base", baseRef, comments: [] };
      bySha.set(sha, attachment);
    }
    attachment.comments.push({ filePath, side, lineNumber, body, context });
  }
  return [...bySha.values()];
}
