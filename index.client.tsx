import type { PluginAgentCommandContext, PluginClientContext } from "@getpaseo/plugin/client";
import { CommitReviewPanel } from "./client/commit-review-panel";
import { preferAgent } from "./client/target-agent";

function openForAgent({ workspace, agent, openPanel }: PluginAgentCommandContext) {
  preferAgent(workspace.id, agent.id);
  openPanel("commit-review", { location: "explorer" });
}

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "commit-review",
    title: "Commit review",
    icon: "GitCommitHorizontal",
    // A workspace panel, so the Explorer's + menu lists it beside Diff and
    // Pull request. The review goes to an agent picked in the panel.
    context: "workspace",
    locations: ["explorer", "workspace"],
    Component: CommitReviewPanel,
  });
  client.addCommandCenterItem({
    id: "open-commit-review",
    title: "Review a commit",
    icon: "GitCommitHorizontal",
    keywords: ["commit", "review", "diff", "comment"],
    context: "agent",
    onSelect: openForAgent,
  });
  client.addSlashCommand({
    name: "review-commit",
    description: "Review a single commit and send comments to this agent",
    argumentHint: "",
    context: "agent",
    onSubmit: openForAgent,
  });
  return () => {};
}
