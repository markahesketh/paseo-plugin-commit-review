import { describe, expect, it } from "vitest";
import { createCommentStore } from "./comments";

const draft = {
  sha: "abc1234def",
  shortSha: "abc1234",
  filePath: "a.ts",
  side: "new" as const,
  lineNumber: 1,
  body: "Fix",
  hunkHeader: "@@ -1 +1 @@",
  targetIndex: 0,
  contextLines: [],
};

describe("comment store", () => {
  it("keeps each workspace's comments apart and removes only the given IDs", () => {
    const store = createCommentStore();
    const sent = store.add({ ...draft, workspaceId: "a" }).comment;
    const addedWhileSending = store.add({ ...draft, workspaceId: "a" }).comment;
    store.add({ ...draft, workspaceId: "b" });

    store.remove({ ids: [sent.id] });

    expect(store.list({ workspaceId: "a" }).comments).toEqual([addedWhileSending]);
    expect(store.list({ workspaceId: "b" }).comments).toHaveLength(1);
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
