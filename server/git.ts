import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

// Overrides user and repo config that changes the output the plugin parses.
const STABLE_OUTPUT_CONFIG = [
  "-c",
  "core.quotePath=false",
  "-c",
  "color.ui=false",
  "-c",
  "diff.suppressBlankEmpty=false",
];

export async function git(cwd: string, args: readonly string[], input = ""): Promise<string> {
  try {
    const run = execFileAsync("git", ["-C", cwd, ...STABLE_OUTPUT_CONFIG, ...args], {
      maxBuffer: MAX_OUTPUT_BYTES,
      encoding: "utf8",
    });
    run.child.stdin?.end(input);
    const { stdout } = await run;
    return stdout;
  } catch (error) {
    throw gitError(error);
  }
}

// For commands like `merge-base --is-ancestor` that answer "no" with exit status 1.
export async function gitSucceeds(cwd: string, args: readonly string[]): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", cwd, ...STABLE_OUTPUT_CONFIG, ...args]);
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return false;
    throw gitError(error);
  }
}

function gitError(error: unknown): Error {
  // Show git's own message, not the full command line.
  const stderr = (error as { stderr?: string }).stderr?.trim();
  return new Error(stderr || (error instanceof Error ? error.message : String(error)));
}

// Returns null when the path does not exist at that revision.
export async function readFileAtRevision(
  cwd: string,
  revision: string,
  path: string,
): Promise<string | null> {
  try {
    return await git(cwd, ["show", "--end-of-options", `${revision}:${path}`]);
  } catch {
    return null;
  }
}
