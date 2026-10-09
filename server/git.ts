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

export async function git(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...STABLE_OUTPUT_CONFIG, ...args], {
      maxBuffer: MAX_OUTPUT_BYTES,
      encoding: "utf8",
    });
    return stdout;
  } catch (error) {
    // Show git's own message, not the full command line.
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || (error instanceof Error ? error.message : String(error)));
  }
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
