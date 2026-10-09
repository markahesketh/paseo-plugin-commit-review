import type {
  DiffFile,
  DiffHunk,
  DiffLine,
  ReviewComment,
  ReviewContextLine,
  ReviewSide,
} from "../shared/review";

const CONTEXT_RADIUS = 3;

export interface LineTarget {
  filePath: string;
  side: ReviewSide;
  lineNumber: number;
}

export type DiffRow =
  | { kind: "file"; key: string; fileKey: string; file: DiffFile; collapsed: boolean; commentCount: number }
  | { kind: "notice"; key: string; text: string }
  | { kind: "hunk"; key: string; header: string }
  | {
      kind: "line";
      key: string;
      file: DiffFile;
      hunk: DiffHunk;
      lineIndex: number;
      line: DiffLine;
      target: LineTarget;
      selected: boolean;
    }
  | { kind: "comment"; key: string; comment: ReviewComment }
  | { kind: "editor"; key: string; file: DiffFile; hunk: DiffHunk; lineIndex: number; target: LineTarget };

export function lineTarget(filePath: string, line: DiffLine): LineTarget {
  return line.type === "remove"
    ? { filePath, side: "old", lineNumber: line.oldLineNumber ?? 0 }
    : { filePath, side: "new", lineNumber: line.newLineNumber ?? 0 };
}

export function targetKey(target: LineTarget): string {
  return `${target.filePath}:${target.side}:${target.lineNumber}`;
}

export function reviewContext(hunk: DiffHunk, lineIndex: number) {
  const start = Math.max(0, lineIndex - CONTEXT_RADIUS);
  const end = Math.min(hunk.lines.length, lineIndex + CONTEXT_RADIUS + 1);
  const contextLines: ReviewContextLine[] = hunk.lines
    .slice(start, end)
    .map(({ type, content, oldLineNumber, newLineNumber }) => ({
      type,
      content,
      oldLineNumber,
      newLineNumber,
    }));
  return { hunkHeader: hunk.header, targetIndex: lineIndex - start, contextLines };
}

function noticeFor(file: DiffFile): string | null {
  if (file.status === "binary") return "Binary file not shown";
  if (file.status === "too_large") return "Diff too large to show";
  if (file.hunks.length === 0) return file.change === "renamed" ? "File renamed without changes" : "No textual changes";
  return null;
}

// Git can list one path twice, e.g. when a symlink becomes a file, so the
// position in the diff is part of every key.
export function fileKey(file: DiffFile, index: number): string {
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

    const notice = noticeFor(file);
    if (notice) {
      rows.push({ kind: "notice", key: `notice:${id}`, text: notice });
      return;
    }

    file.hunks.forEach((hunk, hunkIndex) => {
      rows.push({ kind: "hunk", key: `hunk:${id}:${hunkIndex}`, header: hunk.header });
      hunk.lines.forEach((line, lineIndex) => {
        const target = lineTarget(file.path, line);
        const key = targetKey(target);
        rows.push({
          kind: "line",
          key: `line:${id}:${key}`,
          file,
          hunk,
          lineIndex,
          line,
          target,
          selected: key === editingKey,
        });
        for (const comment of commentsByTarget.get(key) ?? []) {
          rows.push({ kind: "comment", key: `comment:${comment.id}`, comment });
        }
        if (key === editingKey) {
          rows.push({ kind: "editor", key: `editor:${id}:${key}`, file, hunk, lineIndex, target });
        }
      });
    });
  });
  return rows;
}
