import type { ReviewComment } from "../shared/review";

export interface Reachability {
  head: string;
  checked: ReadonlySet<string>;
  reachable: ReadonlySet<string>;
}

export function splitSendable(comments: readonly ReviewComment[], reachability: Reachability | null) {
  const sendable: ReviewComment[] = [];
  const stale: ReviewComment[] = [];
  const pending: ReviewComment[] = [];
  for (const comment of comments) {
    if (reachability?.reachable.has(comment.sha)) sendable.push(comment);
    else if (reachability?.checked.has(comment.sha)) stale.push(comment);
    else pending.push(comment);
  }
  return { sendable, stale, pending };
}

export function countComments(count: number): string {
  return `${count} comment${count === 1 ? "" : "s"}`;
}
