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

const C = "c".repeat(40);

describe("splitSendable", () => {
  it("sends comments on reachable commits, sets aside those the daemon ruled out, and waits on the rest", () => {
    const comments = [comment("1", A), comment("2", B), comment("3", A), comment("4", C)];

    const { sendable, stale } = splitSendable(comments, { checked: new Set([A, B]), reachable: new Set([A]) });

    expect(sendable.map((c) => c.id)).toEqual(["1", "3"]);
    expect(stale.map((c) => c.id)).toEqual(["2"]);
  });

  it("sends and discards nothing before the daemon has answered", () => {
    expect(splitSendable([comment("1", A)], null)).toEqual({ sendable: [], stale: [] });
  });
});

describe("countComments", () => {
  it("pluralises", () => {
    expect([0, 1, 2].map(countComments)).toEqual(["0 comments", "1 comment", "2 comments"]);
  });
});
