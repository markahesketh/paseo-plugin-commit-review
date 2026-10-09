import type { PluginClientContext } from "@getpaseo/plugin/client";
import { CommitReviewPanel } from "./client/commit-review-panel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "commit-review",
    title: "Review commit",
    icon: "GitCommitHorizontal",
    context: "agent",
    // The Explorer holds Files and Changes. Its + menu lists only workspace
    // panels, so the command and slash command open this one there.
    locations: ["explorer", "workspace"],
    Component: CommitReviewPanel,
  });
  client.addCommandCenterItem({
    id: "open-commit-review",
    title: "Review a commit",
    icon: "GitCommitHorizontal",
    keywords: ["commit", "review", "diff", "comment"],
    context: "agent",
    onSelect({ openPanel }) {
      openPanel("commit-review", { location: "explorer" });
    },
  });
  client.addSlashCommand({
    name: "review-commit",
    description: "Review a single commit and send comments to this agent",
    argumentHint: "",
    context: "agent",
    onSubmit({ openPanel }) {
      openPanel("commit-review", { location: "explorer" });
    },
  });
  return () => {};
}
