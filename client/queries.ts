import type { RpcInput } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCommentRpc,
  listCommentsRpc,
  removeCommentsRpc,
  updateCommentRpc,
  type ReviewComment,
} from "../shared/review";

export function reviewQueryKey(workspaceId: string, ...parts: unknown[]) {
  return ["commit-review", workspaceId, ...parts];
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type NewComment = Omit<RpcInput<typeof addCommentRpc>, "workspaceId">;

const NO_COMMENTS: ReviewComment[] = [];

export function useReviewComments(workspaceId: string) {
  const listComments = useRpc(listCommentsRpc);
  const addComment = useRpc(addCommentRpc);
  const updateComment = useRpc(updateCommentRpc);
  const removeComments = useRpc(removeCommentsRpc);
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = reviewQueryKey(workspaceId, "comments");

  const query = useQuery({ queryKey, queryFn: () => listComments({ workspaceId }) });
  const onSuccess = () => queryClient.invalidateQueries({ queryKey });
  const onError = (error: unknown) => toast.error(errorText(error));
  const add = useMutation({ mutationFn: (comment: NewComment) => addComment({ workspaceId, ...comment }), onSuccess, onError });
  const update = useMutation({
    mutationFn: (input: { id: string; body: string }) => updateComment({ workspaceId, ...input }),
    onSuccess,
    onError,
  });
  const remove = useMutation({ mutationFn: (ids: string[]) => removeComments({ workspaceId, ids }), onSuccess, onError });

  return { comments: query.data?.comments ?? NO_COMMENTS, add: add.mutate, update: update.mutate, remove: remove.mutateAsync };
}

export type ReviewCommentActions = Pick<ReturnType<typeof useReviewComments>, "add" | "update" | "remove">;
