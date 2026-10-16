import {
  REVIEW_CONTEXT_RADIUS,
  type DiffFile,
  type DiffHunk,
  type DiffLine,
  type ReviewComment,
  type ReviewCommentContext,
  type ReviewContextLine,
  type ReviewSide,
} from "../shared/review";

export interface LineTarget {
  filePath: string;
  side: ReviewSide;
  lineNumber: number;
}

export type DiffRow =
  | { kind: "file"; key: string; fileKey: string; file: DiffFile; collapsed: boolean; commentCount: number }
  | { kind: "notice"; key: string; text: string }
  | { kind: "hunk"; key: string; header: string }
  | { kind: "line"; key: string; line: DiffLine; target: LineTarget; selected: boolean }
  | { kind: "comment"; key: string; comment: ReviewComment }
  | { kind: "editor"; key: string; target: LineTarget; context: ReviewCommentContext };

function lineTarget(filePath: string, line: DiffLine): LineTarget {
  return line.type === "remove"
    ? { filePath, side: "old", lineNumber: line.oldLineNumber }
    : { filePath, side: "new", lineNumber: line.newLineNumber };
}

export function targetKey(target: LineTarget): string {
  return `${target.filePath}:${target.side}:${target.lineNumber}`;
}

function contextLine({ tokens: _tokens, ...line }: DiffLine): ReviewContextLine {
  return line;
}

export function reviewContext(hunk: DiffHunk, lineIndex: number): ReviewCommentContext {
  const start = Math.max(0, lineIndex - REVIEW_CONTEXT_RADIUS);
  const lines = hunk.lines.slice(start, lineIndex + REVIEW_CONTEXT_RADIUS + 1).map(contextLine);
  return { hunkHeader: hunk.header, targetLine: lines[lineIndex - start], lines };
}

const STATUS_NOTICE = { binary: "Binary file not shown", too_large: "Diff too large to show" };

// Git can list one path twice, e.g. when a symlink becomes a file, so the
// position in the diff is part of every key.
function fileKey(file: DiffFile, index: number): string {
  return `${index}:${file.path}`;
}

export function buildRows(input: {
  files: readonly DiffFile[];
  comments: readonly ReviewComment[];
  collapsed: ReadonlySet<string>;
  editing: LineTarget | null;
}): DiffRow[] {
  const commentsByTarget = new Map<string, ReviewComment[]>();
  const commentsByFile = new Map<string, number>();
  for (const comment of input.comments) {
    const key = targetKey(comment);
    commentsByTarget.set(key, [...(commentsByTarget.get(key) ?? []), comment]);
    commentsByFile.set(comment.filePath, (commentsByFile.get(comment.filePath) ?? 0) + 1);
  }
  const editingKey = input.editing ? targetKey(input.editing) : null;

  const rows: DiffRow[] = [];
  input.files.forEach((file, fileIndex) => {
    const id = fileKey(file, fileIndex);
    const collapsed = input.collapsed.has(id);
    rows.push({
      kind: "file",
      key: `file:${id}`,
      fileKey: id,
      file,
      collapsed,
      commentCount: commentsByFile.get(file.path) ?? 0,
    });
    if (collapsed) return;

    if (file.status !== "ok") {
      rows.push({ kind: "notice", key: `notice:${id}`, text: STATUS_NOTICE[file.status] });
      return;
    }
    if (file.hunks.length === 0) {
      const text = file.change === "renamed" ? "File renamed without changes" : "No textual changes";
      rows.push({ kind: "notice", key: `notice:${id}`, text });
      return;
    }

    file.hunks.forEach((hunk, hunkIndex) => {
      rows.push({ kind: "hunk", key: `hunk:${id}:${hunkIndex}`, header: hunk.header });
      hunk.lines.forEach((line, lineIndex) => {
        const target = lineTarget(file.path, line);
        const key = targetKey(target);
        rows.push({ kind: "line", key: `line:${id}:${key}`, line, target, selected: key === editingKey });
        for (const comment of commentsByTarget.get(key) ?? []) {
          rows.push({ kind: "comment", key: `comment:${comment.id}`, comment });
        }
        if (key === editingKey) {
          rows.push({ kind: "editor", key: `editor:${id}:${key}`, target, context: reviewContext(hunk, lineIndex) });
        }
      });
    });
  });
  return rows;
}
