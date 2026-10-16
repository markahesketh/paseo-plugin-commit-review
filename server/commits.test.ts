import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listCommits, reachableCommits } from "./commits";
import { useTestRepo } from "./test-repo";

const repo = useTestRepo();

describe("listCommits", () => {
  it("lists commits newest first with their stats", async () => {
    repo.commit("Initial", { "a.ts": "one\ntwo\n" });
    const sha = repo.commit("Change a", { "a.ts": "one\nTWO\nthree\n" });

    const { commits } = await listCommits({ cwd: repo.cwd });

    expect(commits.map((c) => c.subject)).toEqual(["Change a", "Initial"]);
    expect(commits[0]).toMatchObject({ sha, filesChanged: 1, additions: 2, deletions: 1, authorName: "Test" });
    expect(commits[1]).toMatchObject({ filesChanged: 1, additions: 2, deletions: 0 });
  });

  it("counts a copied file's lines as added, like its diff", async () => {
    repo.commit("Initial", { "a.txt": "one\ntwo\nthree\n" });
    repo.commit("Copy", { "a.txt": "one\ntwo\nthree\nfour\n", "b.txt": "one\ntwo\nthree\n" });

    const { commits } = await listCommits({ cwd: repo.cwd });

    expect(commits[0]).toMatchObject({ filesChanged: 2, additions: 4 });
  });

  it("counts files outside the subdirectory it runs from", async () => {
    mkdirSync(join(repo.cwd, "sub"));
    repo.commit("Both", { "a.txt": "a\n", "sub/b.txt": "b\n" });

    const { commits } = await listCommits({ cwd: join(repo.cwd, "sub") });

    expect(commits[0]).toMatchObject({ filesChanged: 2, additions: 2 });
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

  it("hashes the empty tree for the repository's object format", async () => {
    rmSync(join(repo.cwd, ".git"), { recursive: true });
    repo.init("--object-format=sha256");
    const root = repo.commit("Initial", { "a.txt": "a\n" });
    const emptyTree = "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321";

    const { commits } = await listCommits({ cwd: repo.cwd });

    expect(commits[0].baseRef).toBe(`${emptyTree}..${root}`);
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

describe("reachableCommits", () => {
  it("drops a commit that was amended", async () => {
    const original = repo.commit("Initial", { "a.txt": "a\n" });
    repo.run("commit", "-q", "--amend", "-m", "Amended");
    const amended = repo.run("rev-parse", "HEAD");

    expect(await reachableCommits({ cwd: repo.cwd, shas: [original, amended] })).toEqual({ shas: [amended] });
  });

  it("keeps a commit older than the listed ones", async () => {
    const old = repo.commit("Old", { "a.txt": "a\n" });
    const branch = repo.run("symbolic-ref", "HEAD");
    const commits = Array.from(
      { length: 100 },
      (_, index) => `commit ${branch}\ncommitter Test <test@example.com> 0 +0000\ndata 1\n${index % 10}\n${index === 0 ? `from ${old}\n` : ""}`,
    );
    execFileSync("git", ["-C", repo.cwd, "fast-import", "--quiet"], { input: commits.join("") });

    expect((await listCommits({ cwd: repo.cwd })).commits.map((c) => c.sha)).not.toContain(old);
    expect(await reachableCommits({ cwd: repo.cwd, shas: [old] })).toEqual({ shas: [old] });
  });

  it("finds none when HEAD has no commits", async () => {
    const sha = repo.commit("Initial", { "a.txt": "a\n" });
    repo.run("checkout", "-q", "--orphan", "fresh");

    expect(await reachableCommits({ cwd: repo.cwd, shas: [sha] })).toEqual({ shas: [] });
  });
});
