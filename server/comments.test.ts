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
  it("keeps each agent's comments apart and removes only the given IDs", () => {
    const store = createCommentStore();
    const sent = store.add({ ...draft, agentId: "a" }).comment;
    const addedWhileSending = store.add({ ...draft, agentId: "a" }).comment;
    store.add({ ...draft, agentId: "b" });

    store.remove({ ids: [sent.id] });

    expect(store.list({ agentId: "a" }).comments).toEqual([addedWhileSending]);
    expect(store.list({ agentId: "b" }).comments).toHaveLength(1);
  });

  it("drops a closed agent's comments", () => {
    const store = createCommentStore();
    store.add({ ...draft, agentId: "a" });
    store.add({ ...draft, agentId: "b" });

    store.removeAgent("a");

    expect(store.list({ agentId: "a" }).comments).toEqual([]);
    expect(store.list({ agentId: "b" }).comments).toHaveLength(1);
  });
});
