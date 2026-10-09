import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const HighlightTokenSchema = z.object({
  text: z.string(),
  style: z.string().nullable(),
});

export const DiffLineSchema = z.object({
  type: z.enum(["add", "remove", "context"]),
  content: z.string(),
  oldLineNumber: z.number().int().nullable(),
  newLineNumber: z.number().int().nullable(),
  tokens: z.array(HighlightTokenSchema).nullable(),
});

export const DiffHunkSchema = z.object({
  header: z.string(),
  lines: z.array(DiffLineSchema),
});

export const DiffFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  change: z.enum(["added", "deleted", "modified", "renamed"]),
  additions: z.number().int(),
  deletions: z.number().int(),
  status: z.enum(["ok", "binary", "too_large"]),
  hunks: z.array(DiffHunkSchema),
});

export const CommitSummarySchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  subject: z.string(),
  authorName: z.string(),
  authorDate: z.string(),
  filesChanged: z.number().int(),
  additions: z.number().int(),
  deletions: z.number().int(),
});

// Full or abbreviated object names only, so a value can never reach git as an option.
export const ShaSchema = z.string().regex(/^[0-9a-f]{4,64}$/, "Not a commit SHA");

export const ReviewSideSchema = z.enum(["old", "new"]);

export const ReviewContextLineSchema = DiffLineSchema.omit({ tokens: true });

export const ReviewCommentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sha: ShaSchema,
  shortSha: ShaSchema,
  filePath: z.string(),
  side: ReviewSideSchema,
  lineNumber: z.number().int().positive(),
  body: z.string(),
  hunkHeader: z.string(),
  targetIndex: z.number().int().nonnegative(),
  contextLines: z.array(ReviewContextLineSchema),
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
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

// The server resolves the directory from the workspace ID; clients never send a path.
export const listCommitsRpc = defineRpc({
  name: "commits.list",
  input: z.object({ workspaceId: z.string(), limit: z.number().int().positive().max(500).optional() }),
  output: z.object({ commits: z.array(CommitSummarySchema) }),
});

export const commitDiffRpc = defineRpc({
  name: "commits.diff",
  input: z.object({ workspaceId: z.string(), sha: ShaSchema }),
  output: z.object({ files: z.array(DiffFileSchema) }),
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
  input: z.object({ id: z.string(), body: z.string() }),
  output: z.object({ comment: ReviewCommentSchema.nullable() }),
});

export const removeCommentsRpc = defineRpc({
  name: "comments.remove",
  input: z.object({ ids: z.array(z.string()) }),
  output: z.object({ removed: z.number().int() }),
});
