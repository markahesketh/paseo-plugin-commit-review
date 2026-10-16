// Measures commits.diff on a synthetic large commit: time, response size, the
// longest event-loop block, child process errors, and files that lost highlighting.
//
//   node --no-warnings bench/large-commit.ts [many|huge] [--impl <dir>] [--repo <dir>]
//
// many: 2,000 files of 200 lines, 100 lines changed in each.
// huge: one added file whose diff is over git's 64 MB output buffer.
//
// --impl runs another checkout's server/diff.ts, for a before and after:
//   git archive <rev> server shared | tar -x -C <dir> && ln -s "$PWD/node_modules" <dir>/node_modules
import { ChildProcess, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

// Run the sources as Node runs them in production, without a build step.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!/^[./]/.test(specifier)) throw error;
      return next(`${specifier}.ts`, context);
    }
  },
});

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { impl: { type: "string" }, repo: { type: "string" } },
});
const scenario = positionals[0] ?? "many";
const impl = resolve(values.impl ?? join(import.meta.dirname, ".."));
const repo = values.repo ?? join(tmpdir(), `commit-review-bench-${scenario}`);

process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

function git(...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 30 }).trim();
}

function line(file: number, index: number, version: string): string {
  return `export const value_${file}_${index} = "${version}-${index}"; // padding to a typical line length\n`;
}

function createRepo(): void {
  mkdirSync(repo, { recursive: true });
  git("init", "-q");
  git("config", "user.name", "Bench");
  git("config", "user.email", "bench@example.com");
  if (scenario === "many") {
    const write = (version: (index: number) => string) => {
      for (let file = 0; file < 2_000; file++) {
        let text = "";
        for (let index = 0; index < 200; index++) text += line(file, index, version(index));
        writeFileSync(join(repo, `file-${file}.ts`), text);
      }
    };
    write(() => "old");
    git("add", "-A");
    git("commit", "-q", "-m", "Base");
    write((index) => (index % 2 === 0 ? "new" : "old"));
  } else {
    writeFileSync(join(repo, "small.ts"), "export const a = 1;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "Base");
    let text = "";
    for (let index = 0; index < 1_000_000; index++) text += line(0, index, "big");
    writeFileSync(join(repo, "generated.ts"), text);
    writeFileSync(join(repo, "small.ts"), "export const a = 2;\n");
  }
  git("add", "-A");
  git("commit", "-q", "-m", "Large");
}

if (!existsSync(join(repo, ".git"))) createRepo();
const sha = git("rev-parse", "HEAD");

let processErrors = 0;
const emit = ChildProcess.prototype.emit;
ChildProcess.prototype.emit = function (this: ChildProcess, event: string | symbol, ...args: unknown[]) {
  if (event === "error") processErrors++;
  return emit.call(this, event, ...args);
} as typeof emit;

const { getCommitDiff } = (await import(join(impl, "server/diff"))) as typeof import("../server/diff");

const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
const start = performance.now();
let result: Awaited<ReturnType<typeof getCommitDiff>> | null = null;
let failure: string | null = null;
try {
  result = await getCommitDiff({ cwd: repo, sha });
} catch (error) {
  failure = error instanceof Error ? error.message.slice(0, 200) : String(error);
}
const seconds = (performance.now() - start) / 1000;
// Let the histogram's timer fire once more, so a block just before the result counts.
await new Promise((resolve) => setTimeout(resolve, 50));
loop.disable();

const files = result?.files ?? [];
const statuses: Record<string, number> = {};
let unhighlighted = 0;
for (const file of files) {
  statuses[file.status] = (statuses[file.status] ?? 0) + 1;
  if (file.status === "ok" && file.hunks.every((hunk) => hunk.lines.every((l) => l.tokens === null))) unhighlighted++;
}

console.log(
  JSON.stringify({
    scenario,
    impl,
    seconds: Number(seconds.toFixed(2)),
    responseMB: Number((Buffer.byteLength(JSON.stringify(result ?? {})) / 1e6).toFixed(1)),
    maxEventLoopBlockMs: Math.round(loop.max / 1e6),
    processErrors,
    files: files.length,
    statuses,
    okFilesWithoutHighlighting: unhighlighted,
    failure,
  }),
);
