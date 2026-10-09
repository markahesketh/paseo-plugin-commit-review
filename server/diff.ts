import { highlightCode, isLanguageSupported } from "@getpaseo/highlight";
import type { DiffFile, DiffHunk, DiffLine, HighlightToken } from "../shared/review";
import { git, readFileAtRevision } from "./git";

const MAX_FILE_DIFF_LINES = 5_000;
const MAX_HIGHLIGHT_FILE_CHARS = 1_000_000;
const MAX_HIGHLIGHT_LINE_CHARS = 10_000;

const C_ESCAPES: Record<string, string> = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r" };

// Git C-quotes paths with quotes, backslashes or control characters, even with
// core.quotePath=false. Octal escapes are UTF-8 bytes.
export function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path;
  const bytes: number[] = [];
  const body = path.slice(1, -1);
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char !== "\\") {
      bytes.push(...Buffer.from(char, "utf8"));
      continue;
    }
    const next = body[++index];
    const octal = body.slice(index, index + 3);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      index += 2;
    } else {
      bytes.push(...Buffer.from(C_ESCAPES[next] ?? next, "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function stripPrefix(path: string, prefix: "a/" | "b/"): string {
  const unquoted = unquotePath(path);
  return unquoted.startsWith(prefix) ? unquoted.slice(prefix.length) : unquoted;
}

function metadataPath(lines: readonly string[], marker: "--- " | "+++ "): string | null {
  const line = lines.find((candidate) => candidate.startsWith(marker));
  if (!line) return null;
  const raw = line.slice(marker.length);
  // An unquoted path can be followed by a tab and a timestamp; a quoted one cannot.
  const path = raw.startsWith('"') ? raw : raw.replace(/\t.*$/, "").trimEnd();
  if (path === "/dev/null") return null;
  return stripPrefix(path, marker === "--- " ? "a/" : "b/");
}

function headerPaths(firstLine: string): { oldPath: string; newPath: string } | null {
  const match = firstLine.match(/^("?a\/.+"?) ("?b\/.+"?)$/);
  return match ? { oldPath: stripPrefix(match[1], "a/"), newPath: stripPrefix(match[2], "b/") } : null;
}

function prefixedValue(lines: readonly string[], prefix: string): string | null {
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line ? unquotePath(line.slice(prefix.length)) : null;
}

function parseSection(section: string): DiffFile {
  const lines = section.split("\n");
  const header = headerPaths(lines[0] ?? "");
  const renameFrom = prefixedValue(lines, "rename from ");
  const renameTo = prefixedValue(lines, "rename to ");
  const isNew = lines.some((line) => line.startsWith("new file mode"));
  const isDeleted = lines.some((line) => line.startsWith("deleted file mode"));
  const oldPath = renameFrom ?? metadataPath(lines, "--- ") ?? header?.oldPath ?? null;
  const newPath = renameTo ?? metadataPath(lines, "+++ ") ?? header?.newPath ?? null;
  const path = (isDeleted ? oldPath : newPath) ?? oldPath ?? "unknown";
  const change = isNew ? "added" : isDeleted ? "deleted" : renameFrom ? "renamed" : "modified";
  const binary = lines.some((line) => line.startsWith("Binary files ") || line === "GIT binary patch");

  const hunks: DiffHunk[] = [];
  let hunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let additions = 0;
  let deletions = 0;
  let lineCount = 0;

  for (const line of lines.slice(1)) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      hunk = { header: line, lines: [] };
      hunks.push(hunk);
      oldLine = Number.parseInt(hunkMatch[1], 10);
      newLine = Number.parseInt(hunkMatch[2], 10);
      continue;
    }
    if (!hunk) continue;
    const marker = line[0];
    let parsed: DiffLine | null = null;
    if (marker === "+") {
      parsed = { type: "add", content: line.slice(1), oldLineNumber: null, newLineNumber: newLine++, tokens: null };
      additions++;
    } else if (marker === "-") {
      parsed = { type: "remove", content: line.slice(1), oldLineNumber: oldLine++, newLineNumber: null, tokens: null };
      deletions++;
    } else if (marker === " ") {
      parsed = { type: "context", content: line.slice(1), oldLineNumber: oldLine++, newLineNumber: newLine++, tokens: null };
    }
    if (parsed) {
      hunk.lines.push(parsed);
      lineCount++;
    }
  }

  const status = binary ? "binary" : lineCount > MAX_FILE_DIFF_LINES ? "too_large" : "ok";
  return {
    path,
    oldPath: change === "renamed" ? oldPath : null,
    change,
    additions,
    deletions,
    status,
    hunks: status === "ok" ? hunks : [],
  };
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
  return diff
    .split(/^diff --git /m)
    .filter((section) => section.trim().length > 0)
    .map(parseSection);
}

function highlightDocument(content: string | null, path: string): HighlightToken[][] | null {
  if (content === null || content.length > MAX_HIGHLIGHT_FILE_CHARS) return null;
  try {
    return highlightCode(content, path);
  } catch {
    return null;
  }
}

function tokensFor(
  document: HighlightToken[][] | null,
  lineNumber: number | null,
  content: string,
): HighlightToken[] | null {
  if (!document || lineNumber === null || content.length > MAX_HIGHLIGHT_LINE_CHARS) return null;
  const tokens = document[lineNumber - 1];
  // Guard against a document that does not match the diff (e.g. CRLF or a filter).
  if (!tokens || tokens.map((token) => token.text).join("") !== content) return null;
  return tokens;
}

// Highlights whole old and new documents, like Paseo's own diff highlighter, so
// the parser sees multi-line strings and comments that start outside a hunk.
async function highlightFile(cwd: string, sha: string, file: DiffFile): Promise<DiffFile> {
  if (file.status !== "ok" || !isLanguageSupported(file.path)) return file;
  const oldPath = file.oldPath ?? file.path;
  const [oldContent, newContent] = await Promise.all([
    file.change === "added" ? null : readFileAtRevision(cwd, `${sha}^`, oldPath),
    file.change === "deleted" ? null : readFileAtRevision(cwd, sha, file.path),
  ]);
  const oldDocument = highlightDocument(oldContent, oldPath);
  const newDocument = highlightDocument(newContent, file.path);
  return {
    ...file,
    hunks: file.hunks.map((hunk) => ({
      header: hunk.header,
      lines: hunk.lines.map((line) => ({
        ...line,
        tokens:
          line.type === "remove"
            ? tokensFor(oldDocument, line.oldLineNumber, line.content)
            : tokensFor(newDocument, line.newLineNumber, line.content),
      })),
    })),
  };
}

export async function getCommitDiff({
  cwd,
  sha,
}: {
  cwd: string;
  sha: string;
}): Promise<{ files: DiffFile[] }> {
  const diff = await git(cwd, [
    "show",
    "--format=",
    "--patch",
    "--find-renames",
    "--no-ext-diff",
    "--no-textconv",
    "--first-parent",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "--end-of-options",
    sha,
    "--",
  ]);
  const files = parseUnifiedDiff(diff);
  return { files: await Promise.all(files.map((file) => highlightFile(cwd, sha, file))) };
}
