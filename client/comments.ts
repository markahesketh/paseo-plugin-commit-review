import type { ReviewComment } from "../shared/review";

// The daemon's answer for a set of commits: which of them are in HEAD's history.
export interface Reachability {
  checked: ReadonlySet<string>;
  reachable: ReadonlySet<string>;
}

// A comment is sent only when its commit is still in the current history and
// discarded only when the daemon has said it is not. A comment on a commit
// the answer has not covered yet is neither.
export function splitSendable(comments: readonly ReviewComment[], reachability: Reachability | null) {
  const sendable: ReviewComment[] = [];
  const stale: ReviewComment[] = [];
  for (const comment of comments) {
    if (reachability?.reachable.has(comment.sha)) sendable.push(comment);
    else if (reachability?.checked.has(comment.sha)) stale.push(comment);
  }
  return { sendable, stale };
}

export function countComments(count: number): string {
  return `${count} comment${count === 1 ? "" : "s"}`;
}
