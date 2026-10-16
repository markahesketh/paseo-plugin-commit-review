import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { listCommitsRpc, reachableCommitsRpc, type CommitSummary, type ReviewComment } from "../shared/review";
import { splitSendable, type Reachability } from "./comments";
import { CommitDiff } from "./commit-diff";
import { Notice } from "./controls";
import { createDiffPalette, type DiffPalette } from "./palette";
import { errorText, reviewQueryKey, useReviewComments } from "./queries";
import { ReviewFooter } from "./review-footer";
import { ReviewHeader } from "./review-header";

export function CommitReviewPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const palette = useMemo(() => createDiffPalette(theme), [theme]);
  const workspace = useWorkspace(workspaceId, ({ directory, projectKind }) => ({ directory, projectKind }));
  const padding = layout.compact ? 12 : 16;

  // Paseo already knows whether the project is a Git repository, so git never runs for one that is not.
  let body: React.ReactNode;
  if (!workspace) body = <Notice text="Workspace not available." palette={palette} />;
  else if (workspace.projectKind !== "git") body = <Notice text="This workspace is not a Git repository." palette={palette} />;
  else body = <CommitReview workspaceId={workspaceId} cwd={workspace.directory} palette={palette} padding={padding} />;
  return <View style={{ flex: 1, backgroundColor: palette.surface }}>{body}</View>;
}

const NO_COMMITS: CommitSummary[] = [];

// Asked again whenever HEAD moves or the set of commented commits changes.
function useReachability(workspaceId: string, headSha: string | null, comments: readonly ReviewComment[]) {
  const reachableCommits = useRpc(reachableCommitsRpc);
  const shas = useMemo(() => [...new Set(comments.map((comment) => comment.sha))].sort(), [comments]);
  const query = useQuery({
    queryKey: reviewQueryKey(workspaceId, "reachable", headSha, shas),
    queryFn: async (): Promise<Reachability> => ({
      checked: new Set(shas),
      reachable: new Set((await reachableCommits({ workspaceId, shas })).shas),
    }),
    enabled: headSha !== null && shas.length > 0,
    placeholderData: keepPreviousData,
  });
  return query.data ?? null;
}

function CommitReview(props: { workspaceId: string; cwd: string; palette: DiffPalette; padding: number }) {
  const { workspaceId, palette } = props;
  const queryClient = useQueryClient();
  const listCommits = useRpc(listCommitsRpc);
  const commits = useQuery({
    queryKey: reviewQueryKey(workspaceId, "commits"),
    queryFn: () => listCommits({ workspaceId }),
  });
  const commitList = commits.data?.commits ?? NO_COMMITS;
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const commit = commitList.find((candidate) => candidate.sha === selectedSha) ?? commitList[0] ?? null;
  // Pin the newest commit as soon as commits load, so a refetch after an agent
  // commits keeps the commit under review instead of jumping to the new HEAD.
  // Only a selected commit that leaves the list (amend, rebase) falls back.
  if (commit && commit.sha !== selectedSha) setSelectedSha(commit.sha);

  const review = useReviewComments(workspaceId);
  const reachability = useReachability(workspaceId, commitList[0]?.sha ?? null, review.comments);
  const { sendable, stale } = splitSendable(review.comments, reachability);

  let body: React.ReactNode;
  if (commits.isPending) {
    body = (
      <View style={{ padding: 24, alignItems: "center" }}>
        <ActivityIndicator color={palette.foregroundMuted} />
      </View>
    );
  } else if (commits.isError) {
    body = <Notice text={`Could not read commits: ${errorText(commits.error)}`} palette={palette} />;
  } else if (!commit) {
    body = <Notice text="No commits in this workspace." palette={palette} />;
  } else {
    body = (
      <CommitDiff
        key={commit.sha}
        workspaceId={workspaceId}
        commit={commit}
        comments={review.comments}
        actions={review}
        palette={palette}
      />
    );
  }

  return (
    <>
      <ReviewHeader
        commit={commit}
        commits={commitList}
        comments={review.comments}
        palette={palette}
        padding={props.padding}
        onSelect={setSelectedSha}
        onRefresh={() => void queryClient.invalidateQueries({ queryKey: reviewQueryKey(workspaceId) })}
      />
      {body}
      <ReviewFooter
        workspaceId={workspaceId}
        cwd={props.cwd}
        sendable={sendable}
        stale={stale}
        palette={palette}
        padding={props.padding}
        onRemove={review.remove}
      />
    </>
  );
}
