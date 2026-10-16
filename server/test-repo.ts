import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

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
      repo.run("config", "diff.noprefix", "true");
      repo.run("config", "color.ui", "always");
      repo.run("config", "color.diff", "always");
      repo.run("config", "diff.suppressBlankEmpty", "true");
      repo.run("config", "diff.relative", "true");
      repo.run("config", "log.showRoot", "false");
      repo.run("config", "diff.submodule", "log");
      repo.run("config", "diff.ignoreSubmodules", "all");
      repo.run("config", "diff.renames", "copies");
      repo.run("config", "log.showSignature", "true");
      const key = join(repo.cwd, ".git", "signing-key");
      execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
      repo.run("config", "gpg.format", "ssh");
      repo.run("config", "user.signingKey", key);
      repo.run("config", "commit.gpgSign", "true");
    },
  };

  beforeEach(() => {
    repo.cwd = mkdtempSync(join(tmpdir(), "commit-review-"));
    repo.init();
  });
  afterEach(() => rmSync(repo.cwd, { recursive: true, force: true }));

  return repo;
}
