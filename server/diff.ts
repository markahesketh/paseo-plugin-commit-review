import { highlightCode, isLanguageSupported } from "@getpaseo/highlight";
import type { DiffFile, DiffHunk, DiffLine, HighlightToken } from "../shared/review";
import { blobSizes, gitLines, readBlobs } from "./git";

const MAX_FILE_DIFF_LINES = 5_000;
const MAX_HIGHLIGHT_LINE_CHARS = 10_000;
const MAX_HIGHLIGHT_FILE_BYTES = 1_000_000;
// Budgets across the whole commit, so a large commit gets a response of bounded
// size and bounded highlighting work. Files past the diff budget are hidden like
// any too-large file; files past the highlight budget are shown without tokens.
const MAX_COMMIT_DIFF_CHARS = 1_000_000;
const MAX_COMMIT_HIGHLIGHT_BYTES = 2_000_000;

const C_ESCAPES: Record<string, string> = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r" };

// Git C-quotes paths with quotes, backslashes or control characters, even with
// core.quotePath=false. Octal escapes are UTF-8 bytes.
function unquotePath(path: string): string {
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

// The `diff --git a/X b/Y` line is ambiguous when a path contains " b/". Only
// files without ---/+++ or rename lines need it, and those keep their path, so
// X and Y are the same and the line splits into two halves of equal length.
function headerPath(firstLine: string): string | null {
  const half = (firstLine.length - 1) / 2;
  const oldPath = stripPrefix(firstLine.slice(0, half), "a/");
  return firstLine[half] === " " && oldPath === stripPrefix(firstLine.slice(half + 1), "b/") ? oldPath : null;
}

function prefixedValue(lines: readonly string[], prefix: string): string | null {
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line ? unquotePath(line.slice(prefix.length)) : null;
}

interface Section {
  // The `diff --git` line without its prefix, then the metadata lines before the first hunk.
  header: string[];
  inHunks: boolean;
  // Null once the file is past its own limit or the commit's budget.
  hunks: DiffHunk[] | null;
  oldLine: number;
  newLine: number;
  additions: number;
  deletions: number;
  lineCount: number;
  chars: number;
}

interface ParsedFile {
  file: DiffFile;
  oldBlob: string | null;
  newBlob: string | null;
}

function readLine(section: Section, line: string, budget: number): void {
  const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunkMatch) {
    section.inHunks = true;
    section.hunks?.push({ header: line, lines: [] });
    section.oldLine = Number.parseInt(hunkMatch[1], 10);
    section.newLine = Number.parseInt(hunkMatch[2], 10);
    return;
  }
  if (!section.inHunks) {
    section.header.push(line);
    return;
  }
  const content = line.slice(1);
  let parsed: DiffLine;
  if (line[0] === "+") {
    parsed = { type: "add", content, oldLineNumber: null, newLineNumber: section.newLine++, tokens: null };
    section.additions++;
  } else if (line[0] === "-") {
    parsed = { type: "remove", content, oldLineNumber: section.oldLine++, newLineNumber: null, tokens: null };
    section.deletions++;
  } else if (line[0] === " ") {
    parsed = { type: "context", content, oldLineNumber: section.oldLine++, newLineNumber: section.newLine++, tokens: null };
  } else {
    return;
  }
  section.lineCount++;
  section.chars += line.length;
  if (section.lineCount > MAX_FILE_DIFF_LINES || section.chars > budget) section.hunks = null;
  section.hunks?.at(-1)?.lines.push(parsed);
}

function finishSection({ header: lines, hunks, additions, deletions }: Section): ParsedFile {
  const header = headerPath(lines[0]);
  const renameFrom = prefixedValue(lines, "rename from ");
  const renameTo = prefixedValue(lines, "rename to ");
  const isNew = lines.some((line) => line.startsWith("new file mode"));
  const isDeleted = lines.some((line) => line.startsWith("deleted file mode"));
  const oldPath = renameFrom ?? metadataPath(lines, "--- ") ?? header;
  const newPath = renameTo ?? metadataPath(lines, "+++ ") ?? header;
  const path = (isDeleted ? oldPath : newPath) ?? oldPath ?? "unknown";
  const change: DiffFile["change"] = isNew ? "added" : isDeleted ? "deleted" : renameFrom ? "renamed" : "modified";
  const binary = lines.some((line) => line.startsWith("Binary files ") || line === "GIT binary patch");
  // Full object names with --full-index; all zeros on the side where the file does not exist.
  const index = lines.map((line) => line.match(/^index ([0-9a-f]+)\.\.([0-9a-f]+)/)).find(Boolean);
  const blob = (name: string | undefined) => (name && !/^0+$/.test(name) ? name : null);

  const base = { path, oldPath: change === "renamed" ? oldPath : null, change, additions, deletions };
  if (binary) return { file: { ...base, status: "binary" }, oldBlob: null, newBlob: null };
  if (!hunks) return { file: { ...base, status: "too_large" }, oldBlob: null, newBlob: null };
  return { file: { ...base, status: "ok", hunks }, oldBlob: blob(index?.[1]), newBlob: blob(index?.[2]) };
}

async function parseDiff(lines: AsyncIterable<string>): Promise<ParsedFile[]> {
  const files: ParsedFile[] = [];
  let budget = MAX_COMMIT_DIFF_CHARS;
  const finish = (section: Section) => {
    const parsed = finishSection(section);
    if (parsed.file.status === "ok") budget -= section.chars;
    files.push(parsed);
  };
  let section: Section | null = null;
  for await (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (section) finish(section);
      section = {
        header: [line.slice("diff --git ".length)],
        inHunks: false,
        hunks: [],
        oldLine: 0,
        newLine: 0,
        additions: 0,
        deletions: 0,
        lineCount: 0,
        chars: 0,
      };
    } else if (section) {
      readLine(section, line, budget);
    }
  }
  if (section) finish(section);
  return files;
}

// Reads whole old and new documents for highlighting, in diff order, until the
// commit's highlight budget is spent. Files after that are shown without tokens.
async function readDocuments(cwd: string, files: readonly ParsedFile[]): Promise<Map<string, string>> {
  const highlightable = files.filter(({ file }) => file.status === "ok" && isLanguageSupported(file.path));
  const blobsOf = ({ oldBlob, newBlob }: ParsedFile) =>
    [oldBlob, newBlob].filter((blob): blob is string => blob !== null);
  const sizes = await blobSizes(cwd, highlightable.flatMap(blobsOf));
  const wanted = new Set<string>();
  let budget = MAX_COMMIT_HIGHLIGHT_BYTES;
  for (const file of highlightable) {
    const blobs = blobsOf(file).filter((blob) => (sizes.get(blob) ?? Infinity) <= MAX_HIGHLIGHT_FILE_BYTES);
    const cost = blobs.reduce((total, blob) => total + (sizes.get(blob) ?? 0), 0);
    if (cost > budget) continue;
    budget -= cost;
    for (const blob of blobs) wanted.add(blob);
  }
  return readBlobs(cwd, [...wanted]);
}

function highlightDocument(content: string | undefined, path: string): HighlightToken[][] | null {
  if (content === undefined) return null;
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
function highlightFile({ file, oldBlob, newBlob }: ParsedFile, documents: Map<string, string>): DiffFile {
  if (file.status !== "ok") return file;
  const oldDocument = highlightDocument(oldBlob ? documents.get(oldBlob) : undefined, file.oldPath ?? file.path);
  const newDocument = highlightDocument(newBlob ? documents.get(newBlob) : undefined, file.path);
  if (!oldDocument && !newDocument) return file;
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
  const files = await parseDiff(
    gitLines(cwd, [
      "show",
      "--format=",
      "--patch",
      "--full-index",
      "--find-renames",
      "--no-ext-diff",
      "--no-textconv",
      "--first-parent",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--end-of-options",
      `${sha}^{commit}`,
      "--",
    ]),
  );
  const documents = await readDocuments(cwd, files);
  const highlighted: DiffFile[] = [];
  for (const file of files) {
    highlighted.push(highlightFile(file, documents));
    // Highlighting is synchronous; yield between files so other requests are served.
    await new Promise(setImmediate);
  }
  return { files: highlighted };
}
