import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { reviewQueryKey } from "./queries";

type AgentList = Awaited<ReturnType<ReturnType<typeof usePaseo>["agents"]["list"]>>;
type Agent = AgentList["entries"][number]["agent"];
export type WorkspaceAgent = Pick<Agent, "id" | "title" | "provider" | "status">;

const OPEN_STATUSES: Agent["status"][] = ["initializing", "idle", "running", "error"];
const PAGE_LIMIT = 200;

// The daemon cannot filter by workspace, so every page is read until the list ends.
export function useWorkspaceAgents(workspaceId: string) {
  const paseo = usePaseo();
  return useQuery({
    queryKey: reviewQueryKey(workspaceId, "agents"),
    queryFn: async (): Promise<WorkspaceAgent[]> => {
      const agents: WorkspaceAgent[] = [];
      let cursor: string | undefined;
      do {
        const { entries, pageInfo } = await paseo.agents.list({
          filter: { statuses: OPEN_STATUSES, includeArchived: false },
          sort: [{ key: "updated_at", direction: "desc" }],
          page: { limit: PAGE_LIMIT, cursor },
        });
        for (const { agent } of entries) {
          if (agent.workspaceId !== workspaceId) continue;
          const { id, title, provider, status } = agent;
          agents.push({ id, title, provider, status });
        }
        cursor = pageInfo.hasMore && pageInfo.nextCursor ? pageInfo.nextCursor : undefined;
      } while (cursor);
      return agents;
    },
  });
}

export function agentLabel(agent: WorkspaceAgent): string {
  return agent.title ?? agent.provider;
}
