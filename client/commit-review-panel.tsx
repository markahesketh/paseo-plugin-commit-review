import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { FlatList, Icon, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { buildReviewAttachments } from "../shared/attachment";
import {
  addCommentRpc,
  commitDiffRpc,
  listCommentsRpc,
  listCommitsRpc,
  removeCommentsRpc,
  updateCommentRpc,
} from "../shared/review";
import { AgentPicker } from "./agent-picker";
import { agentLabel, useWorkspaceAgents } from "./agents";
import { CommitPicker, CommitSummaryLine } from "./commit-picker";
import { CommentCard, CommentEditor } from "./comment-card";
import { Notice, SmallButton } from "./controls";
import { FileHeader, HunkHeader, LineRow, gutterWidth } from "./diff-rows";
import { surfaceColor } from "./hover";
import { createDiffPalette } from "./palette";
import { buildRows, targetKey, type DiffRow, type LineTarget } from "./rows";
import { preferAgent, usePreferredAgent } from "./target-agent";

const EMPTY_SET: ReadonlySet<string> = new Set();

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CommitReviewPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const palette = useMemo(() => createDiffPalette(theme), [theme]);
  const paseo = usePaseo();
  const toast = useToast();
  const queryClient = useQueryClient();
  const workspace = useWorkspace(workspaceId, ({ directory, projectKind }) => ({ directory, projectKind }));
  const cwd = workspace?.directory ?? null;
  // Paseo already knows whether the project is a Git repository, so git never runs for one that is not.
  const isGit = workspace?.projectKind === "git";
  const agents = useWorkspaceAgents(workspaceId);
  const preferredAgentId = usePreferredAgent(workspaceId);
  const agentList = agents.data ?? [];
  const targetAgent =
    agentList.find((agent) => agent.id === preferredAgentId) ?? agentList[0] ?? null;

  const listCommits = useRpc(listCommitsRpc);
  const commitDiff = useRpc(commitDiffRpc);
  const listComments = useRpc(listCommentsRpc);
  const addComment = useRpc(addCommentRpc);
  const updateComment = useRpc(updateCommentRpc);
  const removeComments = useRpc(removeCommentsRpc);

  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [editing, setEditing] = useState<LineTarget | null>(null);
  const [message, setMessage] = useState("");
  // The new-comment draft outlives the editor row when the list virtualizes it away.
  const draft = useRef("");

  const commits = useQuery({
    queryKey: ["commits", workspaceId],
    queryFn: () => listCommits({ workspaceId }),
    enabled: isGit,
  });
  const commitList = commits.data?.commits ?? [];
  // A selected commit that leaves the list (amend, rebase) falls back to the newest.
  const commit =
    commitList.find((candidate) => candidate.sha === selectedSha) ?? commitList[0] ?? null;
  const sha = commit?.sha ?? null;

  useEffect(() => {
    setCollapsed(EMPTY_SET);
    setEditing(null);
  }, [sha]);

  useEffect(() => {
    draft.current = "";
  }, [editing]);

  const diff = useQuery({
    queryKey: ["diff", workspaceId, sha],
    queryFn: () => commitDiff({ workspaceId, sha: sha! }),
    enabled: isGit && sha !== null,
    staleTime: Infinity,
  });
  const comments = useQuery({
    queryKey: ["comments", workspaceId],
    queryFn: () => listComments({ workspaceId }),
  });
  const allComments = comments.data?.comments ?? [];

  const invalidateComments = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["comments", workspaceId] }),
    [queryClient, workspaceId],
  );
  const onError = useCallback((error: unknown) => toast.error(errorText(error)), [toast]);
  const { mutate: add } = useMutation({ mutationFn: addComment, onSuccess: invalidateComments, onError });
  const { mutate: update } = useMutation({ mutationFn: updateComment, onSuccess: invalidateComments, onError });
  const { mutate: remove } = useMutation({ mutationFn: removeComments, onSuccess: invalidateComments, onError });

  // Comments on commits that left the history (amend, rebase) are not shown, so they are not sent.
  const listedShas = useMemo(() => new Set(commitList.map((candidate) => candidate.sha)), [commitList]);
  const sendable = allComments.filter((comment) => listedShas.has(comment.sha));
  const staleCount = allComments.length - sendable.length;

  const send = useMutation({
    mutationFn: async () => {
      // Steer like the composer does: the daemon adds the review to a running
      // turn when the provider can, and otherwise starts a new turn.
      if (!targetAgent) throw new Error("No agent in this workspace");
      await paseo.agents.ref(targetAgent.id).send(message.trim(), {
        attachments: buildReviewAttachments({ cwd: cwd!, comments: sendable }),
        activeTurnBehavior: "steer",
      });
      await removeComments({ workspaceId, ids: sendable.map((comment) => comment.id) });
    },
    onSuccess: () => {
      setMessage("");
      toast.show("Review sent", { variant: "success" });
      return invalidateComments();
    },
    onError,
  });

  const files = diff.data?.files ?? [];
  const commitComments = useMemo(
    () => allComments.filter((comment) => comment.sha === sha),
    [allComments, sha],
  );
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of allComments) counts.set(comment.sha, (counts.get(comment.sha) ?? 0) + 1);
    return counts;
  }, [allComments]);
  const rows = useMemo(
    () => buildRows({ files, comments: commitComments, collapsed, editing }),
    [files, commitComments, collapsed, editing],
  );
  const gutter = useMemo(() => gutterWidth(files), [files]);

  const toggleFile = useCallback((fileKey: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(fileKey)) next.delete(fileKey);
      else next.add(fileKey);
      return next;
    });
  }, []);

  const toggleEditing = useCallback((target: LineTarget) => {
    setEditing((current) => (current && targetKey(current) === targetKey(target) ? null : target));
  }, []);

  const renderRow = useCallback(
    ({ item }: { item: DiffRow }) => {
      switch (item.kind) {
        case "file":
          return (
            <FileHeader
              file={item.file}
              fileKey={item.fileKey}
              collapsed={item.collapsed}
              commentCount={item.commentCount}
              palette={palette}
              onToggle={toggleFile}
            />
          );
        case "notice":
          return <Notice text={item.text} palette={palette} />;
        case "hunk":
          return <HunkHeader header={item.header} palette={palette} />;
        case "line":
          return (
            <LineRow
              line={item.line}
              target={item.target}
              selected={item.selected}
              gutter={gutter}
              palette={palette}
              onPress={toggleEditing}
            />
          );
        case "comment":
          return (
            <CommentCard
              comment={item.comment}
              palette={palette}
              inset={gutter}
              onUpdate={(id, body) => update({ workspaceId, id, body })}
              onRemove={(id) => remove({ workspaceId, ids: [id] })}
            />
          );
        case "editor":
          return (
            <CommentEditor
              initialBody={draft.current}
              submitLabel="Comment"
              palette={palette}
              inset={gutter}
              onChangeBody={(body) => {
                draft.current = body;
              }}
              onCancel={() => setEditing(null)}
              onSubmit={(body) => {
                if (!commit) return;
                add({
                  workspaceId,
                  sha: commit.sha,
                  baseRef: commit.baseRef,
                  ...item.target,
                  body,
                  context: item.context,
                });
                setEditing(null);
              }}
            />
          );
      }
    },
    [palette, gutter, toggleFile, toggleEditing, update, remove, add, commit, workspaceId],
  );

  const padding = layout.compact ? 12 : 16;

  let body: React.ReactNode;
  if (cwd === null) {
    body = <Notice text="Workspace not available." palette={palette} />;
  } else if (!isGit) {
    body = <Notice text="This workspace is not a Git repository." palette={palette} />;
  } else if (commits.isPending || (sha !== null && diff.isPending)) {
    body = (
      <View style={{ padding: 24, alignItems: "center" }}>
        <ActivityIndicator color={palette.foregroundMuted} />
      </View>
    );
  } else if (commits.isError) {
    body = <Notice text={`Could not read commits: ${errorText(commits.error)}`} palette={palette} />;
  } else if (diff.isError) {
    body = <Notice text={`Could not read the commit diff: ${errorText(diff.error)}`} palette={palette} />;
  } else if (commitList.length === 0) {
    body = <Notice text="No commits in this workspace." palette={palette} />;
  } else if (files.length === 0) {
    body = <Notice text="No changes in this commit." palette={palette} />;
  } else {
    body = (
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        extraData={palette}
        keyExtractor={(row: DiffRow) => row.key}
        renderItem={renderRow}
        initialNumToRender={60}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: padding,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderColor: palette.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select commit"
          disabled={commitList.length === 0}
          onPress={() => setPickerOpen(true)}
          style={(state) => ({
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: surfaceColor(state, palette),
          })}
        >
          <Icon name="GitCommitHorizontal" size={16} color={palette.foregroundMuted} />
          {commit ? (
            <CommitSummaryLine commit={commit} palette={palette} />
          ) : (
            <Text style={{ flex: 1, color: palette.foregroundMuted, fontSize: 13 }}>No commit selected</Text>
          )}
          <Icon name="ChevronsUpDown" size={14} color={palette.foregroundMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh commits"
          hitSlop={8}
          onPress={() => {
            void commits.refetch();
            void diff.refetch();
          }}
        >
          <Icon name="RefreshCw" size={15} color={palette.foregroundMuted} />
        </Pressable>
      </View>

      {body}

      {allComments.length > 0 ? (
        <View
          style={{
            gap: 8,
            padding: padding,
            borderTopWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
          }}
        >
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Add a message (optional)"
            placeholderTextColor={palette.foregroundMuted}
            accessibilityLabel="Review message"
            style={{
              padding: 8,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.raised,
              color: palette.foreground,
              fontSize: 13,
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, color: palette.foregroundMuted, fontSize: 12 }}>
              {`${sendable.length} comment${sendable.length === 1 ? "" : "s"}`}
              {staleCount > 0 ? ` · ${staleCount} on commits no longer in history` : ""}
            </Text>
            <SmallButton
              label="Discard"
              variant="secondary"
              palette={palette}
              onPress={() => {
                remove({ workspaceId, ids: allComments.map((comment) => comment.id) });
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select the agent to send the review to"
              onPress={() => {
                void agents.refetch();
                setAgentPickerOpen(true);
              }}
              style={(state) => ({
                flexShrink: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: surfaceColor(state, palette),
              })}
            >
              <Icon name="Bot" size={14} color={palette.foregroundMuted} />
              <Text numberOfLines={1} style={{ flexShrink: 1, color: palette.foreground, fontSize: 13 }}>
                {targetAgent ? agentLabel(targetAgent) : "No agent"}
              </Text>
              <Icon name="ChevronDown" size={14} color={palette.foregroundMuted} />
            </Pressable>
            <SmallButton
              label={send.isPending ? "Sending…" : "Send"}
              variant="primary"
              disabled={send.isPending || sendable.length === 0 || cwd === null || targetAgent === null}
              palette={palette}
              onPress={() => send.mutate()}
            />
          </View>
        </View>
      ) : null}

      <AgentPicker
        open={agentPickerOpen}
        agents={agentList}
        selectedId={targetAgent?.id ?? null}
        palette={palette}
        onOpenChange={setAgentPickerOpen}
        onSelect={(agentId) => preferAgent(workspaceId, agentId)}
      />
      <CommitPicker
        open={pickerOpen}
        commits={commitList}
        selectedSha={sha}
        commentCounts={commentCounts}
        palette={palette}
        onOpenChange={setPickerOpen}
        onSelect={setSelectedSha}
      />
    </View>
  );
}
