import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

function useReachability(workspaceId: string, headSha: string | null, comments: readonly ReviewComment[]) {
  const reachableCommits = useRpc(reachableCommitsRpc);
  const shas = useMemo(() => [...new Set(comments.map((comment) => comment.sha))].sort(), [comments]);
  const query = useQuery({
    queryKey: reviewQueryKey(workspaceId, "reachable", headSha, shas),
    queryFn: async (): Promise<Reachability> => ({
      head: headSha!,
      checked: new Set(shas),
      reachable: new Set((await reachableCommits({ workspaceId, shas })).shas),
    }),
    enabled: headSha !== null && shas.length > 0,
    // An answer for an older HEAD would send or discard the wrong comments.
    placeholderData: (previous) => (previous?.head === headSha ? previous : undefined),
  });
  return { reachability: query.data ?? null, error: query.error };
}

// Stays on its commit when new commits land, and falls back to the newest only
// when the commit leaves the list.
// A list from the cache can be older than HEAD, so the pin waits for a fetch.
function usePinnedCommit(commits: readonly CommitSummary[], fresh: boolean) {
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const commit = commits.find((candidate) => candidate.sha === selectedSha) ?? commits[0] ?? null;
  if (fresh && commit && commit.sha !== selectedSha) setSelectedSha(commit.sha);
  return [commit, setSelectedSha] as const;
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
  const [commit, selectCommit] = usePinnedCommit(commitList, commits.isFetchedAfterMount);

  const review = useReviewComments(workspaceId);
  const { reachability, error: reachabilityError } = useReachability(
    workspaceId,
    commitList[0]?.sha ?? null,
    review.comments,
  );
  const { sendable, stale, pending } = splitSendable(review.comments, reachability);

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
        onSelect={selectCommit}
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
        pendingCount={pending.length}
        reachabilityError={reachabilityError}
        onRemove={review.remove}
        onRemoveSent={review.removeAsync}
      />
    </>
  );
}
