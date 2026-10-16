import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

// The plugin's git calls inherit this too, so global and system config cannot change results.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

// A temporary repository for each test.
export function useTestRepo() {
  const repo = {
    cwd: "",
    run(...args: string[]): string {
      return execFileSync("git", ["-C", repo.cwd, ...args], { encoding: "utf8" }).trim();
    },
    commit(message: string, files: Record<string, string | Buffer>): string {
      for (const [path, content] of Object.entries(files)) writeFileSync(join(repo.cwd, path), content);
      repo.run("add", "-A");
      repo.run("commit", "-q", "-m", message);
      return repo.run("rev-parse", "HEAD");
    },
    init(...options: string[]): void {
      repo.run("init", "-q", ...options);
      repo.run("config", "user.name", "Test");
      repo.run("config", "user.email", "test@example.com");
      // User config like this must not change what the plugin parses.
      repo.run("config", "diff.noprefix", "true");
      repo.run("config", "color.ui", "always");
      repo.run("config", "diff.suppressBlankEmpty", "true");
    },
  };

  beforeEach(() => {
    repo.cwd = mkdtempSync(join(tmpdir(), "commit-review-"));
    repo.init();
  });
  afterEach(() => rmSync(repo.cwd, { recursive: true, force: true }));

  return repo;
}
