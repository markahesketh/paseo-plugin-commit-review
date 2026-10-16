import { useRpc } from "@getpaseo/plugin/client";
import { FlatList } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { commitDiffRpc, type CommitSummary, type ReviewComment } from "../shared/review";
import { CommentCard, CommentEditor } from "./comment-card";
import { Notice } from "./controls";
import { FileHeader, HunkHeader, LineRow, gutterWidth } from "./diff-rows";
import type { DiffPalette } from "./palette";
import { errorText, reviewQueryKey, type ReviewCommentActions } from "./queries";
import { buildRows, targetKey, type DiffRow, type LineTarget } from "./rows";

const EMPTY_SET: ReadonlySet<string> = new Set();

// Rendered with `key={commit.sha}`, so every piece of state here starts fresh
// for each commit.
export function CommitDiff(props: {
  workspaceId: string;
  commit: CommitSummary;
  comments: readonly ReviewComment[];
  actions: ReviewCommentActions;
  palette: DiffPalette;
}) {
  const { workspaceId, commit, palette } = props;
  const { add, update, remove } = props.actions;
  const commitDiff = useRpc(commitDiffRpc);
  const diff = useQuery({
    queryKey: reviewQueryKey(workspaceId, "diff", commit.sha),
    queryFn: () => commitDiff({ workspaceId, sha: commit.sha }),
    staleTime: Infinity,
  });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [editing, setEditing] = useState<LineTarget | null>(null);
  // The new-comment draft outlives the editor row when the list virtualizes it away.
  const draft = useRef("");

  const files = diff.data?.files ?? [];
  const comments = useMemo(
    () => props.comments.filter((comment) => comment.sha === commit.sha),
    [props.comments, commit.sha],
  );
  const rows = useMemo(() => buildRows({ files, comments, collapsed, editing }), [files, comments, collapsed, editing]);
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
    draft.current = "";
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
              onUpdate={(id, body) => update({ id, body })}
              onRemove={(id) => void remove([id])}
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
                add({ sha: commit.sha, baseRef: commit.baseRef, ...item.target, body, context: item.context });
                setEditing(null);
              }}
            />
          );
      }
    },
    [palette, gutter, toggleFile, toggleEditing, update, remove, add, commit],
  );

  if (diff.isPending) {
    return (
      <View style={{ padding: 24, alignItems: "center" }}>
        <ActivityIndicator color={palette.foregroundMuted} />
      </View>
    );
  }
  if (diff.isError) return <Notice text={`Could not read the commit diff: ${errorText(diff.error)}`} palette={palette} />;
  if (files.length === 0) return <Notice text="No changes in this commit." palette={palette} />;
  return (
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
