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
  const workspaces = new Map<string, Map<string, ReviewComment>>();

  return {
    list({ workspaceId }: RpcInput<typeof listCommentsRpc>): RpcOutput<typeof listCommentsRpc> {
      return { comments: [...(workspaces.get(workspaceId)?.values() ?? [])] };
    },

    add(input: RpcInput<typeof addCommentRpc>): RpcOutput<typeof addCommentRpc> {
      const now = new Date().toISOString();
      const comment: ReviewComment = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
      const comments = workspaces.get(comment.workspaceId) ?? new Map<string, ReviewComment>();
      comments.set(comment.id, comment);
      workspaces.set(comment.workspaceId, comments);
      return { comment };
    },

    update({ workspaceId, id, body }: RpcInput<typeof updateCommentRpc>): RpcOutput<typeof updateCommentRpc> {
      const comments = workspaces.get(workspaceId);
      const existing = comments?.get(id);
      if (!comments || !existing) return { comment: null };
      const comment = { ...existing, body, updatedAt: new Date().toISOString() };
      comments.set(id, comment);
      return { comment };
    },

    // Removes only the given IDs, so a comment added while a review is sending stays.
    remove({ workspaceId, ids }: RpcInput<typeof removeCommentsRpc>): RpcOutput<typeof removeCommentsRpc> {
      const comments = workspaces.get(workspaceId);
      return { removed: comments ? ids.filter((id) => comments.delete(id)).length : 0 };
    },

    removeWorkspace(workspaceId: string): void {
      workspaces.delete(workspaceId);
    },
  };
}
