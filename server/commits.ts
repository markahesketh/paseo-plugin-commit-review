import type { CommitSummary } from "../shared/review";
import { git, gitSucceeds } from "./git";

const LIMIT = 100;
const RECORD = "\x1e";
const FIELD = "\x1f";

function readStat(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function parseCommitLog(output: string) {
  return output
    .split(RECORD)
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [header, ...rest] = record.split("\n");
      const [sha, parents, shortSha, subject, authorName, authorDate] = header.split(FIELD);
      const stat = rest.join("\n");
      return {
        firstParent: parents.split(" ")[0] || null,
        commit: {
          sha,
          shortSha,
          subject,
          authorName,
          authorDate,
          filesChanged: readStat(stat, /(\d+) files? changed/),
          additions: readStat(stat, /(\d+) insertions?\(\+\)/),
          deletions: readStat(stat, /(\d+) deletions?\(-\)/),
        },
      };
    });
}

export async function listCommits({ cwd }: { cwd: string }): Promise<{ commits: CommitSummary[] }> {
  const output = await git(cwd, [
    "log",
    `-n${LIMIT}`,
    `--format=${RECORD}%H${FIELD}%P${FIELD}%h${FIELD}%s${FIELD}%an${FIELD}%aI`,
    "--shortstat",
    // Merge commits get the same first-parent stats as their diff.
    "--diff-merges=first-parent",
    // A repository with no commits yet lists none instead of failing.
    "--ignore-missing",
    "HEAD",
  ]);
  const entries = parseCommitLog(output);
  // A root commit is compared with the empty tree, hashed by git so SHA-256 repositories work.
  const emptyTree = entries.some((entry) => entry.firstParent === null)
    ? (await git(cwd, ["hash-object", "-t", "tree", "/dev/null"])).trim()
    : null;
  return {
    commits: entries.map(({ firstParent, commit }) => ({
      ...commit,
      baseRef: `${firstParent ?? emptyTree}..${commit.sha}`,
    })),
  };
}

export async function reachableCommits({
  cwd,
  shas,
}: {
  cwd: string;
  shas: readonly string[];
}): Promise<{ shas: string[] }> {
  // A SHA that no longer resolves (an amended commit after gc) is unreachable, not an error.
  const input = ["HEAD", ...shas].map((rev) => `${rev}^{commit}\n`).join("");
  const [head, ...commits] = (await git(cwd, ["cat-file", "--batch-check=%(objectname)"], input)).split("\n");
  if (!isObjectName(head)) return { shas: [] };
  const reachable: string[] = [];
  // One at a time: merge-base walks by generation number, so it stays correct
  // when commit dates are skewed, which a single rev-list walk does not.
  for (const [index, sha] of shas.entries()) {
    const commit = commits[index];
    if (isObjectName(commit) && (await gitSucceeds(cwd, ["merge-base", "--is-ancestor", commit, head]))) {
      reachable.push(sha);
    }
  }
  return { shas: reachable };
}

function isObjectName(value: string): boolean {
  return /^[0-9a-f]+$/.test(value);
}
