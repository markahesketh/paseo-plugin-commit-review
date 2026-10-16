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
import { buildRows, draftText, editorKey, type DiffRow, type Draft, type Editor, type LineTarget } from "./rows";

const EMPTY_SET: ReadonlySet<string> = new Set();

type CommitDiffProps = {
  workspaceId: string;
  commit: CommitSummary;
  comments: readonly ReviewComment[];
  actions: ReviewCommentActions;
  palette: DiffPalette;
};

// A remount per commit resets collapse state, the editor and its draft.
export function CommitDiff(props: CommitDiffProps) {
  return <CommitDiffView key={props.commit.sha} {...props} />;
}

function CommitDiffView(props: CommitDiffProps) {
  const { workspaceId, commit, palette } = props;
  const { add, update, remove } = props.actions;
  const commitDiff = useRpc(commitDiffRpc);
  const diff = useQuery({
    queryKey: reviewQueryKey(workspaceId, "diff", commit.sha),
    queryFn: () => commitDiff({ workspaceId, sha: commit.sha }),
    staleTime: Infinity,
  });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [editor, setEditor] = useState<Editor | null>(null);
  const draft = useRef<Draft | null>(null);

  const files = diff.data?.files ?? [];
  const comments = useMemo(
    () => props.comments.filter((comment) => comment.sha === commit.sha),
    [props.comments, commit.sha],
  );
  const rows = useMemo(() => buildRows({ files, comments, collapsed, editor }), [files, comments, collapsed, editor]);
  const gutter = useMemo(() => gutterWidth(files), [files]);

  const toggleFile = useCallback((fileKey: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(fileKey)) next.delete(fileKey);
      else next.add(fileKey);
      return next;
    });
  }, []);
  const changeEditor = useCallback((next: Editor | null) => {
    draft.current = null;
    setEditor(next);
  }, []);
  const toggleLineEditor = useCallback(
    (target: LineTarget) => {
      const next: Editor = { kind: "new", target };
      changeEditor(editor && editorKey(editor) === editorKey(next) ? null : next);
    },
    [changeEditor, editor],
  );

  const renderRow = useCallback(
    ({ item }: { item: DiffRow }) => {
      const editorProps = (editor: Editor, initialBody: string) => ({
        palette,
        inset: gutter,
        initialBody: draftText(draft.current, editor, initialBody),
        onChangeBody: (text: string) => {
          draft.current = { editor, text };
        },
        onCancel: () => changeEditor(null),
      });
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
              onPress={toggleLineEditor}
            />
          );
        case "comment":
          return (
            <CommentCard
              comment={item.comment}
              palette={palette}
              inset={gutter}
              onEdit={(id) => changeEditor({ kind: "edit", commentId: id })}
              onRemove={(id) => remove([id])}
            />
          );
        case "edit-comment":
          return (
            <CommentEditor
              {...editorProps(item.editor, item.comment.body)}
              submitLabel="Save"
              onSubmit={(body) => {
                update({ id: item.comment.id, body });
                changeEditor(null);
              }}
            />
          );
        case "new-comment":
          return (
            <CommentEditor
              {...editorProps(item.editor, "")}
              submitLabel="Comment"
              onSubmit={(body) => {
                add({ sha: commit.sha, baseRef: commit.baseRef, ...item.editor.target, body, context: item.context });
                changeEditor(null);
              }}
            />
          );
      }
    },
    [palette, gutter, toggleFile, toggleLineEditor, changeEditor, update, remove, add, commit],
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
