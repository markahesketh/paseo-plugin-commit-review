import type { PluginHandlerContext } from "@getpaseo/plugin/server";

export async function workspaceDirectory(
  { paseo }: PluginHandlerContext,
  workspaceId: string,
): Promise<string> {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace?.workspaceDirectory) throw new Error("Workspace has no directory");
  return workspace.workspaceDirectory;
}
