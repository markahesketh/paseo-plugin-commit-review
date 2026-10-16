import { describe, expect, it } from "vitest";
import type { DiffFile, DiffHunk, DiffLine, ReviewComment } from "../shared/review";
import { buildRows, draftText, reviewContext, type Editor } from "./rows";

function add(content: string, newLineNumber: number): DiffLine {
  return { type: "add", content, oldLineNumber: null, newLineNumber, tokens: null };
}
function remove(content: string, oldLineNumber: number): DiffLine {
  return { type: "remove", content, oldLineNumber, newLineNumber: null, tokens: null };
}
function context(content: string, lineNumber: number): DiffLine {
  return { type: "context", content, oldLineNumber: lineNumber, newLineNumber: lineNumber, tokens: null };
}

function file(change: DiffFile["change"], lines: DiffLine[]): DiffFile {
  return {
    path: "link",
    oldPath: null,
    change,
    additions: lines.filter((line) => line.type === "add").length,
    deletions: lines.filter((line) => line.type === "remove").length,
    status: "ok",
    hunks: [{ header: "@@ -1 +1 @@", lines }],
  };
}

function comment(target: Pick<ReviewComment, "side" | "lineNumber">): ReviewComment {
  return {
    id: "c1",
    workspaceId: "workspace",
    sha: "a".repeat(40),
    baseRef: `${"0".repeat(40)}..${"a".repeat(40)}`,
    filePath: "link",
    body: "why?",
    context: { hunkHeader: "@@", targetLine: { type: "context", content: "", oldLineNumber: 1, newLineNumber: 1 }, lines: [] },
    createdAt: "",
    updatedAt: "",
    ...target,
  };
}

describe("buildRows", () => {
  // Git lists a path twice when a symlink becomes a file.
  it("gives unique keys and separate collapse state to a path that appears twice", () => {
    const files = [file("deleted", [remove("x", 1)]), file("added", [add("x", 1)])];

    const expanded = buildRows({ files, comments: [], collapsed: new Set(), editor: null });
    const firstKey = expanded.find((row) => row.kind === "file")!;
    const collapsed = buildRows({
      files,
      comments: [],
      collapsed: new Set([firstKey.kind === "file" ? firstKey.fileKey : ""]),
      editor: null,
    });

    const keys = expanded.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(collapsed.map((row) => row.kind)).toEqual(["file", "file", "hunk", "line"]);
  });

  it("places a comment on an old-side line after the removed line, not the new line with that number", () => {
    const files = [file("modified", [context("a", 1), remove("b", 2), add("c", 2), context("d", 3)])];

    const rows = buildRows({ files, comments: [comment({ side: "old", lineNumber: 2 })], collapsed: new Set(), editor: null });

    const index = rows.findIndex((row) => row.kind === "comment");
    const before = rows[index - 1];
    expect(before.kind === "line" && before.line.type).toBe("remove");
  });

  it("shows one editor: in place of the comment being edited, or after the line getting a new one", () => {
    const files = [file("modified", [context("a", 1), add("b", 2)])];
    const comments = [comment({ side: "new", lineNumber: 1 })];
    const kinds = (editor: Editor | null) =>
      buildRows({ files, comments, collapsed: new Set(), editor }).map((row) => row.kind);

    expect(kinds(null)).toEqual(["file", "hunk", "line", "comment", "line"]);
    expect(kinds({ kind: "edit", commentId: "c1" })).toEqual(["file", "hunk", "line", "edit-comment", "line"]);
    expect(kinds({ kind: "new", target: { filePath: "link", side: "new", lineNumber: 2 } })).toEqual([
      "file", "hunk", "line", "comment", "line", "new-comment",
    ]);
  });
});

describe("draftText", () => {
  const lineA: Editor = { kind: "new", target: { filePath: "f", side: "new", lineNumber: 1 } };
  const lineB: Editor = { kind: "new", target: { filePath: "f", side: "new", lineNumber: 2 } };
  const edit: Editor = { kind: "edit", commentId: "c1" };

  it("gives typed text back only to the editor it was typed in", () => {
    const draft = { editor: lineA, text: "foo" };

    expect(draftText(draft, lineA, "")).toBe("foo");
    expect(draftText(draft, lineB, "")).toBe("");
    expect(draftText(draft, edit, "saved body")).toBe("saved body");
    expect(draftText(null, lineA, "")).toBe("");
  });
});

describe("reviewContext", () => {
  it("clips the context at the start of a hunk and still points at the commented line", () => {
    const hunk: DiffHunk = {
      header: "@@ -1,6 +1,6 @@",
      lines: [context("a", 1), add("b", 2), context("c", 3), context("d", 4), context("e", 5), context("f", 6)],
    };

    const result = reviewContext(hunk, 1);

    expect(result.hunkHeader).toBe(hunk.header);
    expect(result.targetLine).toEqual({ type: "add", content: "b", oldLineNumber: null, newLineNumber: 2 });
    expect(result.lines.map((line) => line.content)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.lines[0]).not.toHaveProperty("tokens");
  });
});
