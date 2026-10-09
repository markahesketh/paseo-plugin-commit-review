import { randomUUID } from "node:crypto";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type {
  ReviewComment,
  addCommentRpc,
  listCommentsRpc,
  removeCommentsRpc,
  updateCommentRpc,
} from "../shared/review";

// Draft comments live in the plugin subprocess. They survive closing the panel
// but not a plugin reload or a daemon restart.
export function createCommentStore() {
  const comments = new Map<string, ReviewComment>();

  return {
    list({ workspaceId }: RpcInput<typeof listCommentsRpc>): RpcOutput<typeof listCommentsRpc> {
      return {
        comments: [...comments.values()].filter((comment) => comment.workspaceId === workspaceId),
      };
    },

    add(input: RpcInput<typeof addCommentRpc>): RpcOutput<typeof addCommentRpc> {
      const now = new Date().toISOString();
      const comment: ReviewComment = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
      comments.set(comment.id, comment);
      return { comment };
    },

    update({ id, body }: RpcInput<typeof updateCommentRpc>): RpcOutput<typeof updateCommentRpc> {
      const existing = comments.get(id);
      if (!existing) return { comment: null };
      const comment = { ...existing, body, updatedAt: new Date().toISOString() };
      comments.set(id, comment);
      return { comment };
    },

    // Removes only the given IDs, so a comment added while a review is sending stays.
    remove({ ids }: RpcInput<typeof removeCommentsRpc>): RpcOutput<typeof removeCommentsRpc> {
      return { removed: ids.filter((id) => comments.delete(id)).length };
    },

    removeWorkspace(workspaceId: string): void {
      for (const [id, comment] of comments) {
        if (comment.workspaceId === workspaceId) comments.delete(id);
      }
    },
  };
}
