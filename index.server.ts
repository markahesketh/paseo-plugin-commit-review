import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createCommentStore } from "./server/comments";
import { listCommits } from "./server/commits";
import { getCommitDiff } from "./server/diff";
import { workspaceDirectory } from "./server/workspace";
import {
  addCommentRpc,
  commitDiffRpc,
  listCommentsRpc,
  listCommitsRpc,
  removeCommentsRpc,
  updateCommentRpc,
} from "./shared/review";

export default function contribute(server: PluginServerContext) {
  const comments = createCommentStore();
  server.handle(listCommitsRpc, async ({ workspaceId, limit }, context) =>
    listCommits({ cwd: await workspaceDirectory(context, workspaceId), limit }),
  );
  server.handle(commitDiffRpc, async ({ workspaceId, sha }, context) =>
    getCommitDiff({ cwd: await workspaceDirectory(context, workspaceId), sha }),
  );
  server.handle(listCommentsRpc, comments.list);
  server.handle(addCommentRpc, comments.add);
  server.handle(updateCommentRpc, comments.update);
  server.handle(removeCommentsRpc, comments.remove);
  const stopAgentClosed = server.on("agent.closed", ({ agent }) => comments.removeAgent(agent.id));
  return () => stopAgentClosed();
}
