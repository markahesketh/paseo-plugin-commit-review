import { describe, expect, it } from "vitest";
import type { ReviewContextLine } from "../shared/review";
import { createCommentStore } from "./comments";

const targetLine: ReviewContextLine = { type: "add", content: "x", oldLineNumber: null, newLineNumber: 1 };
const sha = "a".repeat(40);

const draft = {
  sha,
  baseRef: `${"b".repeat(40)}..${sha}`,
  filePath: "a.ts",
  side: "new" as const,
  lineNumber: 1,
  body: "Fix",
  context: { hunkHeader: "@@ -0,0 +1 @@", targetLine, lines: [targetLine] },
};

describe("comment store", () => {
  it("keeps each workspace's comments apart and removes only the given IDs", () => {
    const store = createCommentStore();
    const sent = store.add({ ...draft, workspaceId: "a" }).comment;
    const addedWhileSending = store.add({ ...draft, workspaceId: "a" }).comment;
    store.add({ ...draft, workspaceId: "b" });

    store.remove({ workspaceId: "a", ids: [sent.id] });

    expect(store.list({ workspaceId: "a" }).comments).toEqual([addedWhileSending]);
    expect(store.list({ workspaceId: "b" }).comments).toHaveLength(1);
  });

  it("does not update or remove a comment through another workspace", () => {
    const store = createCommentStore();
    const comment = store.add({ ...draft, workspaceId: "a" }).comment;

    const updated = store.update({ workspaceId: "b", id: comment.id, body: "Changed" });
    const removed = store.remove({ workspaceId: "b", ids: [comment.id] });

    expect(updated.comment).toBeNull();
    expect(removed.removed).toBe(0);
    expect(store.list({ workspaceId: "a" }).comments).toEqual([comment]);
    expect(store.update({ workspaceId: "a", id: comment.id, body: "Changed" }).comment?.body).toBe("Changed");
  });

  it("drops an archived workspace's comments", () => {
    const store = createCommentStore();
    store.add({ ...draft, workspaceId: "a" });
    store.add({ ...draft, workspaceId: "b" });

    store.removeWorkspace("a");

    expect(store.list({ workspaceId: "a" }).comments).toEqual([]);
    expect(store.list({ workspaceId: "b" }).comments).toHaveLength(1);
  });
});
