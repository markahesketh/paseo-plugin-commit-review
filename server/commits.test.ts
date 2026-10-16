import { describe, expect, it } from "vitest";
import { listCommits } from "./commits";
import { useTestRepo } from "./test-repo";

const repo = useTestRepo();

describe("listCommits", () => {
  it("lists commits newest first with their stats", async () => {
    repo.commit("Initial", { "a.ts": "one\ntwo\n" });
    const sha = repo.commit("Change a", { "a.ts": "one\nTWO\nthree\n" });

    const { commits } = await listCommits({ cwd: repo.cwd });

    expect(commits.map((c) => c.subject)).toEqual(["Change a", "Initial"]);
    expect(commits[0]).toMatchObject({ sha, filesChanged: 1, additions: 2, deletions: 1, authorName: "Test" });
  });

  it("gives each commit the range from its first parent, or from the empty tree for the root", async () => {
    const root = repo.commit("Initial", { "a.txt": "a\n" });
    repo.run("checkout", "-q", "-b", "topic");
    const topic = repo.commit("Topic", { "b.txt": "b\n" });
    repo.run("checkout", "-q", "-");
    const main = repo.commit("Main", { "c.txt": "c\n" });
    repo.run("merge", "-q", "--no-ff", "-m", "Merge topic", "topic");
    const merge = repo.run("rev-parse", "HEAD");
    const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

    const { commits } = await listCommits({ cwd: repo.cwd });

    const baseRefs = Object.fromEntries(commits.map((c) => [c.sha, c.baseRef]));
    expect(baseRefs).toEqual({
      [merge]: `${main}..${merge}`,
      [main]: `${root}..${main}`,
      [topic]: `${root}..${topic}`,
      [root]: `${emptyTree}..${root}`,
    });
  });

  it("lists no commits in a repository without any", async () => {
    expect(await listCommits({ cwd: repo.cwd })).toEqual({ commits: [] });
  });

  it("gives merge commits their first-parent stats", async () => {
    repo.commit("Initial", { "a.txt": "a\n" });
    repo.run("checkout", "-q", "-b", "topic");
    repo.commit("Topic", { "b.txt": "b\n" });
    repo.run("checkout", "-q", "-");
    repo.commit("Main", { "c.txt": "c\n" });
    repo.run("merge", "-q", "--no-ff", "-m", "Merge topic", "topic");

    const { commits } = await listCommits({ cwd: repo.cwd });

    expect(commits[0]).toMatchObject({ subject: "Merge topic", filesChanged: 1, additions: 1 });
  });
});
