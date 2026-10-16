import type { CommitSummary } from "../shared/review";
import { git } from "./git";

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
