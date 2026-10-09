import type { CommitSummary } from "../shared/review";
import { git } from "./git";

const DEFAULT_LIMIT = 100;
const RECORD = "\x1e";
const FIELD = "\x1f";

function readStat(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function parseCommitLog(output: string): CommitSummary[] {
  return output
    .split(RECORD)
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [header, ...rest] = record.split("\n");
      const [sha, shortSha, subject, authorName, authorDate] = header.split(FIELD);
      const stat = rest.join("\n");
      return {
        sha,
        shortSha,
        subject,
        authorName,
        authorDate,
        filesChanged: readStat(stat, /(\d+) files? changed/),
        additions: readStat(stat, /(\d+) insertions?\(\+\)/),
        deletions: readStat(stat, /(\d+) deletions?\(-\)/),
      };
    });
}

export async function listCommits({
  cwd,
  limit,
}: {
  cwd: string;
  limit?: number;
}): Promise<{ commits: CommitSummary[] }> {
  const output = await git(cwd, [
    "log",
    `-n${limit ?? DEFAULT_LIMIT}`,
    `--format=${RECORD}%H${FIELD}%h${FIELD}%s${FIELD}%an${FIELD}%aI`,
    "--shortstat",
    // Merge commits get the same first-parent stats as their diff.
    "--diff-merges=first-parent",
  ]);
  return { commits: parseCommitLog(output) };
}
