import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listCommits } from "./commits";
import { getCommitDiff } from "./diff";

let cwd: string;

// The plugin's git calls inherit this too, so global and system config cannot change results.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

function run(...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function commit(message: string, files: Record<string, string | Buffer>): string {
  for (const [path, content] of Object.entries(files)) writeFileSync(join(cwd, path), content);
  run("add", "-A");
  run("commit", "-q", "-m", message);
  return run("rev-parse", "HEAD");
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "commit-review-"));
  run("init", "-q");
  run("config", "user.name", "Test");
  run("config", "user.email", "test@example.com");
  // User config like this must not change what the plugin parses.
  run("config", "diff.noprefix", "true");
  run("config", "color.ui", "always");
  run("config", "diff.suppressBlankEmpty", "true");
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("listCommits", () => {
  it("lists commits newest first with their stats", async () => {
    commit("Initial", { "a.ts": "one\ntwo\n" });
    const sha = commit("Change a", { "a.ts": "one\nTWO\nthree\n" });

    const { commits } = await listCommits({ cwd });

    expect(commits.map((c) => c.subject)).toEqual(["Change a", "Initial"]);
    expect(commits[0]).toMatchObject({ sha, filesChanged: 1, additions: 2, deletions: 1, authorName: "Test" });
  });

  it("gives merge commits their first-parent stats", async () => {
    commit("Initial", { "a.txt": "a\n" });
    run("checkout", "-q", "-b", "topic");
    commit("Topic", { "b.txt": "b\n" });
    run("checkout", "-q", "-");
    commit("Main", { "c.txt": "c\n" });
    run("merge", "-q", "--no-ff", "-m", "Merge topic", "topic");

    const { commits } = await listCommits({ cwd });

    expect(commits[0]).toMatchObject({ subject: "Merge topic", filesChanged: 1, additions: 1 });
  });
});

describe("getCommitDiff", () => {
  it("returns only the selected commit's changes with line numbers and syntax tokens", async () => {
    commit("Initial", { "a.ts": "const a = 1;\nconst b = 2;\n", "other.ts": "x\n" });
    const sha = commit("Change b", { "a.ts": "const a = 1;\nconst b = 3;\n" });
    commit("Later", { "other.ts": "y\n" });

    const { files } = await getCommitDiff({ cwd, sha });

    expect(files.map((f) => f.path)).toEqual(["a.ts"]);
    const lines = files[0].hunks[0].lines;
    expect(lines.map((l) => [l.type, l.oldLineNumber, l.newLineNumber, l.content])).toEqual([
      ["context", 1, 1, "const a = 1;"],
      ["remove", 2, null, "const b = 2;"],
      ["add", null, 2, "const b = 3;"],
    ]);
    expect(lines[2].tokens?.find((t) => t.text === "const")?.style).toBe("keyword");
  });

  it("counts blank context lines when diff.suppressBlankEmpty is set", async () => {
    commit("Initial", { "a.ts": "const a = 1;\n\nconst b = 2;\nconst c = 3;\n" });
    const sha = commit("Change c", { "a.ts": "const a = 1;\n\nconst b = 2;\nconst c = 4;\n" });

    const { files } = await getCommitDiff({ cwd, sha });

    const added = files[0].hunks[0].lines.find((l) => l.type === "add");
    expect(added).toMatchObject({ newLineNumber: 4, content: "const c = 4;" });
  });

  it("reads paths that git quotes", async () => {
    const name = 'q"uo\\te\tü.ts';
    const sha = commit("Quoted", { [name]: "const a = 1;\n" });

    const { files } = await getCommitDiff({ cwd, sha });

    expect(files[0].path).toBe(name);
    expect(files[0].hunks[0].lines[0].tokens).not.toBeNull();
  });

  it("never passes the SHA to git as an option", async () => {
    commit("Initial", { "a.txt": "a\n" });
    const output = join(cwd, "written-by-git");

    await expect(getCommitDiff({ cwd, sha: `--output=${output}` })).rejects.toThrow();
    expect(existsSync(output)).toBe(false);
  });

  it("highlights with whole-file context outside the hunk", async () => {
    const opening = "/*\n" + "comment\n".repeat(10);
    commit("Initial", { "a.ts": opening + "old\n*/\n" });
    const sha = commit("Edit comment", { "a.ts": opening + "new\n*/\n" });

    const { files } = await getCommitDiff({ cwd, sha });

    const added = files[0].hunks[0].lines.find((l) => l.type === "add");
    expect(added?.tokens?.[0]?.style).toBe("comment");
  });

  it("reports added, deleted, renamed and binary files", async () => {
    commit("Initial", { "gone.txt": "bye\n", "old-name.txt": "same content\nacross lines\n" });
    run("mv", "old-name.txt", "new-name.txt");
    const sha = commit("Mixed", { "new.txt": "hi\n", "image.bin": Buffer.from([0, 1, 2, 0]) });
    run("rm", "-q", "gone.txt");
    const deleteSha = commit("Delete", {});

    const mixed = await getCommitDiff({ cwd, sha });
    const deleted = await getCommitDiff({ cwd, sha: deleteSha });

    const byPath = Object.fromEntries(mixed.files.map((f) => [f.path, f]));
    expect(byPath["new.txt"]).toMatchObject({ change: "added", additions: 1 });
    expect(byPath["new-name.txt"]).toMatchObject({ change: "renamed", oldPath: "old-name.txt" });
    expect(byPath["image.bin"]).toMatchObject({ status: "binary", hunks: [] });
    expect(deleted.files[0]).toMatchObject({ path: "gone.txt", change: "deleted", deletions: 1 });
  });

  it("works on the root commit", async () => {
    const sha = commit("Initial", { "a.py": "def f():\n    return 1\n" });

    const { files } = await getCommitDiff({ cwd, sha });

    expect(files[0]).toMatchObject({ path: "a.py", change: "added", additions: 2 });
  });
});
