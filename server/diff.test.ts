import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DiffFile } from "../shared/review";
import { getCommitDiff } from "./diff";
import { useTestRepo } from "./test-repo";

const repo = useTestRepo();

function hunksOf(file: DiffFile) {
  if (file.status !== "ok") throw new Error(`${file.path} is ${file.status}`);
  return file.hunks;
}

describe("getCommitDiff", () => {
  it("returns only the selected commit's changes with line numbers and syntax tokens", async () => {
    repo.commit("Initial", { "a.ts": "const a = 1;\nconst b = 2;\n", "other.ts": "x\n" });
    const sha = repo.commit("Change b", { "a.ts": "const a = 1;\nconst b = 3;\n" });
    repo.commit("Later", { "other.ts": "y\n" });

    const { files } = await getCommitDiff({ cwd: repo.cwd, sha });

    expect(files.map((f) => f.path)).toEqual(["a.ts"]);
    const lines = hunksOf(files[0])[0].lines;
    expect(lines.map((l) => [l.type, l.oldLineNumber, l.newLineNumber, l.content])).toEqual([
      ["context", 1, 1, "const a = 1;"],
      ["remove", 2, null, "const b = 2;"],
      ["add", null, 2, "const b = 3;"],
    ]);
    expect(lines[2].tokens?.find((t) => t.text === "const")?.style).toBe("keyword");
  });

  it("counts blank context lines when diff.suppressBlankEmpty is set", async () => {
    repo.commit("Initial", { "a.ts": "const a = 1;\n\nconst b = 2;\nconst c = 3;\n" });
    const sha = repo.commit("Change c", { "a.ts": "const a = 1;\n\nconst b = 2;\nconst c = 4;\n" });

    const { files } = await getCommitDiff({ cwd: repo.cwd, sha });

    const added = hunksOf(files[0])[0].lines.find((l) => l.type === "add");
    expect(added).toMatchObject({ newLineNumber: 4, content: "const c = 4;" });
  });

  it("reads paths that git quotes", async () => {
    const name = 'q"uo\\te\tü.ts';
    const sha = repo.commit("Quoted", { [name]: "const a = 1;\n" });

    const { files } = await getCommitDiff({ cwd: repo.cwd, sha });

    expect(files[0].path).toBe(name);
    expect(hunksOf(files[0])[0].lines[0].tokens).not.toBeNull();
  });

  it("never passes the SHA to git as an option", async () => {
    repo.commit("Initial", { "a.txt": "a\n" });
    const output = join(repo.cwd, "written-by-git");

    await expect(getCommitDiff({ cwd: repo.cwd, sha: `--output=${output}` })).rejects.toThrow();
    expect(existsSync(output)).toBe(false);
  });

  it("highlights with whole-file context outside the hunk", async () => {
    const opening = "/*\n" + "comment\n".repeat(10);
    repo.commit("Initial", { "a.ts": opening + "old\n*/\n" });
    const sha = repo.commit("Edit comment", { "a.ts": opening + "new\n*/\n" });

    const { files } = await getCommitDiff({ cwd: repo.cwd, sha });

    const added = hunksOf(files[0])[0].lines.find((l) => l.type === "add");
    expect(added?.tokens?.[0]?.style).toBe("comment");
  });

  it("reports added, deleted, renamed and binary files", async () => {
    repo.commit("Initial", { "gone.txt": "bye\n", "old-name.txt": "same content\nacross lines\n" });
    repo.run("mv", "old-name.txt", "new-name.txt");
    const sha = repo.commit("Mixed", { "new.txt": "hi\n", "image.bin": Buffer.from([0, 1, 2, 0]) });
    repo.run("rm", "-q", "gone.txt");
    const deleteSha = repo.commit("Delete", {});

    const mixed = await getCommitDiff({ cwd: repo.cwd, sha });
    const deleted = await getCommitDiff({ cwd: repo.cwd, sha: deleteSha });

    const byPath = Object.fromEntries(mixed.files.map((f) => [f.path, f]));
    expect(byPath["new.txt"]).toMatchObject({ change: "added", additions: 1 });
    expect(byPath["new-name.txt"]).toMatchObject({ change: "renamed", oldPath: "old-name.txt" });
    expect(byPath["image.bin"]).toMatchObject({ status: "binary" });
    expect(byPath["image.bin"]).not.toHaveProperty("hunks");
    expect(deleted.files[0]).toMatchObject({ path: "gone.txt", change: "deleted", deletions: 1 });
  });

  it("shows files outside the subdirectory it runs from", async () => {
    mkdirSync(join(repo.cwd, "sub"));
    const sha = repo.commit("Both", { "a.txt": "a\n", "sub/b.txt": "b\n" });

    const { files } = await getCommitDiff({ cwd: join(repo.cwd, "sub"), sha });

    expect(files.map((f) => f.path)).toEqual(["a.txt", "sub/b.txt"]);
  });

  it("shows a changed submodule as a file", async () => {
    const target = repo.commit("Initial", { "a.txt": "a\n" });
    repo.run("update-index", "--add", "--cacheinfo", `160000,${target},vendor`);
    repo.run("-c", "diff.ignoreSubmodules=none", "commit", "-q", "-m", "Add submodule");
    const sha = repo.run("rev-parse", "HEAD");

    const { files } = await getCommitDiff({ cwd: repo.cwd, sha });

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: "vendor", change: "added", additions: 1 });
  });

  it("works on the root commit", async () => {
    const sha = repo.commit("Initial", { "a.py": "def f():\n    return 1\n" });

    const { files } = await getCommitDiff({ cwd: repo.cwd, sha });

    expect(files[0]).toMatchObject({ path: "a.py", change: "added", additions: 2 });
  });
});
