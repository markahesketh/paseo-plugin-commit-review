import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

// Overrides user and repo config that changes the output the plugin parses.
const STABLE_OUTPUT_CONFIG = [
  "core.quotePath=false",
  "color.ui=false",
  "color.diff=false",
  "diff.suppressBlankEmpty=false",
  "diff.relative=false",
  "diff.renames=true",
  "diff.submodule=short",
  "diff.ignoreSubmodules=none",
  "log.showRoot=true",
  "log.showSignature=false",
].flatMap((setting) => ["-c", setting]);

export async function git(cwd: string, args: readonly string[], input = ""): Promise<string> {
  return (await gitBuffer(cwd, args, input)).toString("utf8");
}

async function gitBuffer(cwd: string, args: readonly string[], input: string): Promise<Buffer> {
  try {
    const run = execFileAsync("git", ["-C", cwd, ...STABLE_OUTPUT_CONFIG, ...args], {
      maxBuffer: MAX_OUTPUT_BYTES,
      encoding: "buffer",
    });
    // A write after git exits fails with EPIPE; git's exit status already reports why.
    run.child.stdin?.on("error", () => {}).end(input);
    const { stdout } = await run;
    return stdout;
  } catch (error) {
    throw gitError(error);
  }
}

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
  const stderr = String((error as { stderr?: unknown }).stderr ?? "").trim();
  return new Error(stderr || (error instanceof Error ? error.message : String(error)));
}

export async function* gitLines(cwd: string, args: readonly string[]): AsyncGenerator<string> {
  const child = spawn("git", ["-C", cwd, ...STABLE_OUTPUT_CONFIG, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  const stderr: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const failure = new Promise<string | null>((resolve) => {
    child.once("error", (error) => resolve(error.message));
    child.once("close", (code) => resolve(code === 0 ? null : Buffer.concat(stderr).toString("utf8").trim()));
  });
  try {
    let partial = "";
    for await (const chunk of child.stdout.setEncoding("utf8")) {
      const lines = (chunk as string).split("\n");
      lines[0] = partial + lines[0];
      partial = lines.pop() ?? "";
      yield* lines;
    }
    if (partial) yield partial;
    const message = await failure;
    if (message !== null) throw new Error(message || "git failed");
  } finally {
    child.kill();
  }
}

export async function blobSizes(cwd: string, oids: readonly string[]): Promise<Map<string, number>> {
  const output = await git(cwd, ["cat-file", "--batch-check"], oids.map((oid) => `${oid}\n`).join(""));
  const sizes = new Map<string, number>();
  for (const line of output.split("\n")) {
    const [oid, type, size] = line.split(" ");
    if (type === "blob") sizes.set(oid, Number(size));
  }
  return sizes;
}

export async function readBlobs(cwd: string, oids: readonly string[]): Promise<Map<string, string>> {
  const output = await gitBuffer(cwd, ["cat-file", "--batch"], oids.map((oid) => `${oid}\n`).join(""));
  const blobs = new Map<string, string>();
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf("\n", offset);
    const [oid, type, size] = output.toString("utf8", offset, headerEnd).split(" ");
    offset = headerEnd + 1;
    if (type === "missing") continue;
    blobs.set(oid, output.toString("utf8", offset, offset + Number(size)));
    offset += Number(size) + 1;
  }
  return blobs;
}
