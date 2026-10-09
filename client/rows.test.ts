import { describe, expect, it } from "vitest";
import type { DiffFile } from "../shared/review";
import { buildRows } from "./rows";

function file(change: DiffFile["change"], type: "add" | "remove"): DiffFile {
  const line = { type, content: "x", tokens: null };
  return {
    path: "link",
    oldPath: null,
    change,
    additions: type === "add" ? 1 : 0,
    deletions: type === "remove" ? 1 : 0,
    status: "ok",
    hunks: [
      {
        header: "@@ -1 +1 @@",
        lines: [
          type === "add"
            ? { ...line, oldLineNumber: null, newLineNumber: 1 }
            : { ...line, oldLineNumber: 1, newLineNumber: null },
        ],
      },
    ],
  };
}

describe("buildRows", () => {
  // Git lists a path twice when a symlink becomes a file.
  it("gives unique keys and separate collapse state to a path that appears twice", () => {
    const files = [file("deleted", "remove"), file("added", "add")];

    const expanded = buildRows({ files, comments: [], collapsed: new Set(), editing: null });
    const firstKey = expanded.find((row) => row.kind === "file")!;
    const collapsed = buildRows({
      files,
      comments: [],
      collapsed: new Set([firstKey.kind === "file" ? firstKey.fileKey : ""]),
      editing: null,
    });

    const keys = expanded.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(collapsed.map((row) => row.kind)).toEqual(["file", "file", "hunk", "line"]);
  });
});
