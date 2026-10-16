import { describe, expect, it } from "vitest";
import type { ReviewComment } from "../shared/review";
import { countComments, splitSendable } from "./comments";

const A = "a".repeat(40);
const B = "b".repeat(40);

function comment(id: string, sha: string): ReviewComment {
  return {
    id,
    workspaceId: "workspace",
    sha,
    baseRef: `${"0".repeat(40)}..${sha}`,
    filePath: "f",
    side: "new",
    lineNumber: 1,
    body: id,
    context: { hunkHeader: "@@", targetLine: { type: "add", content: "", oldLineNumber: null, newLineNumber: 1 }, lines: [] },
    createdAt: "",
    updatedAt: "",
  };
}

describe("splitSendable", () => {
  it("keeps comments on reachable commits and sets the rest aside in order", () => {
    const comments = [comment("1", A), comment("2", B), comment("3", A)];

    const { sendable, stale } = splitSendable(comments, new Set([A]));

    expect(sendable.map((c) => c.id)).toEqual(["1", "3"]);
    expect(stale.map((c) => c.id)).toEqual(["2"]);
  });
});

describe("countComments", () => {
  it("pluralises", () => {
    expect([0, 1, 2].map(countComments)).toEqual(["0 comments", "1 comment", "2 comments"]);
  });
});
