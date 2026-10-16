import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const HighlightTokenSchema = z.object({
  text: z.string(),
  style: z.string().nullable(),
});

const LineNumberSchema = z.number().int().positive();

export const ReviewContextLineSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add"), content: z.string(), oldLineNumber: z.null(), newLineNumber: LineNumberSchema }),
  z.object({ type: z.literal("remove"), content: z.string(), oldLineNumber: LineNumberSchema, newLineNumber: z.null() }),
  z.object({
    type: z.literal("context"),
    content: z.string(),
    oldLineNumber: LineNumberSchema,
    newLineNumber: LineNumberSchema,
  }),
]);

export const DiffLineSchema = z.intersection(
  ReviewContextLineSchema,
  z.object({ tokens: z.array(HighlightTokenSchema).nullable() }),
);

export const DiffHunkSchema = z.object({
  header: z.string(),
  lines: z.array(DiffLineSchema),
});

const DiffFileBaseSchema = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  change: z.enum(["added", "deleted", "modified", "renamed"]),
  additions: z.number().int(),
  deletions: z.number().int(),
});

export const DiffFileSchema = z.discriminatedUnion("status", [
  DiffFileBaseSchema.extend({ status: z.literal("ok"), hunks: z.array(DiffHunkSchema) }),
  DiffFileBaseSchema.extend({ status: z.enum(["binary", "too_large"]) }),
]);

// Full or abbreviated object names only, so a value can never reach git as an option.
export const ShaSchema = z.string().regex(/^[0-9a-f]{4,64}$/, "Not a commit SHA");

// `<base>..<sha>` with full object names. The base is the first parent, or the
// empty tree for a root commit.
export const BaseRefSchema = z.string().regex(/^[0-9a-f]{40,64}\.\.[0-9a-f]{40,64}$/, "Not a commit range");

export const CommitSummarySchema = z.object({
  sha: ShaSchema,
  baseRef: BaseRefSchema,
  shortSha: z.string(),
  subject: z.string(),
  authorName: z.string(),
  authorDate: z.string(),
  filesChanged: z.number().int(),
  additions: z.number().int(),
  deletions: z.number().int(),
});

export const ReviewSideSchema = z.enum(["old", "new"]);

// Lines of diff on each side of the commented line that go to the agent.
export const REVIEW_CONTEXT_RADIUS = 3;

const CommentBodySchema = z.string().trim().min(1).max(20_000);

// The shape of a comment in Paseo's review attachment.
export const ReviewCommentContextSchema = z.object({
  hunkHeader: z.string(),
  targetLine: ReviewContextLineSchema,
  lines: z.array(ReviewContextLineSchema).max(2 * REVIEW_CONTEXT_RADIUS + 1),
});

export const ReviewCommentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sha: ShaSchema,
  baseRef: BaseRefSchema,
  filePath: z.string(),
  side: ReviewSideSchema,
  lineNumber: LineNumberSchema,
  body: CommentBodySchema,
  context: ReviewCommentContextSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type HighlightToken = z.infer<typeof HighlightTokenSchema>;
export type DiffLine = z.infer<typeof DiffLineSchema>;
export type DiffHunk = z.infer<typeof DiffHunkSchema>;
export type DiffFile = z.infer<typeof DiffFileSchema>;
export type CommitSummary = z.infer<typeof CommitSummarySchema>;
export type ReviewSide = z.infer<typeof ReviewSideSchema>;
export type ReviewContextLine = z.infer<typeof ReviewContextLineSchema>;
export type ReviewCommentContext = z.infer<typeof ReviewCommentContextSchema>;
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

// The server resolves the directory from the workspace ID; clients never send a path.
export const listCommitsRpc = defineRpc({
  name: "commits.list",
  input: z.object({ workspaceId: z.string() }),
  output: z.object({ commits: z.array(CommitSummarySchema) }),
});

export const commitDiffRpc = defineRpc({
  name: "commits.diff",
  input: z.object({ workspaceId: z.string(), sha: ShaSchema }),
  output: z.object({ files: z.array(DiffFileSchema) }),
});

// The given commits that are ancestors of HEAD. A comment on any other commit
// (amended, rebased away, or on another branch) is not sent.
export const reachableCommitsRpc = defineRpc({
  name: "commits.reachable",
  input: z.object({ workspaceId: z.string(), shas: z.array(ShaSchema).max(1_000) }),
  output: z.object({ shas: z.array(ShaSchema) }),
});

// Draft comments belong to the workspace; the user picks the agent when sending.
export const listCommentsRpc = defineRpc({
  name: "comments.list",
  input: z.object({ workspaceId: z.string() }),
  output: z.object({ comments: z.array(ReviewCommentSchema) }),
});

export const addCommentRpc = defineRpc({
  name: "comments.add",
  input: ReviewCommentSchema.omit({ id: true, createdAt: true, updatedAt: true }),
  output: z.object({ comment: ReviewCommentSchema }),
});

export const updateCommentRpc = defineRpc({
  name: "comments.update",
  input: z.object({ workspaceId: z.string(), id: z.string(), body: CommentBodySchema }),
  output: z.object({ comment: ReviewCommentSchema.nullable() }),
});

export const removeCommentsRpc = defineRpc({
  name: "comments.remove",
  input: z.object({ workspaceId: z.string(), ids: z.array(z.string()) }),
  output: z.object({ removed: z.number().int() }),
});
