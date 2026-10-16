import type { ReviewComment } from "../shared/review";

// A comment is sent only when its commit is still in the current history.
export function splitSendable(comments: readonly ReviewComment[], reachable: ReadonlySet<string>) {
  const sendable: ReviewComment[] = [];
  const stale: ReviewComment[] = [];
  for (const comment of comments) (reachable.has(comment.sha) ? sendable : stale).push(comment);
  return { sendable, stale };
}

export function countComments(count: number): string {
  return `${count} comment${count === 1 ? "" : "s"}`;
}
