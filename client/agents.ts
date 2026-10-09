import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";

export interface WorkspaceAgent {
  id: string;
  title: string | null;
  provider: string;
  status: string;
}

const AGENT_PAGE_LIMIT = 200;

// The workspace's live agents, most recently updated first.
export function useWorkspaceAgents(workspaceId: string) {
  const paseo = usePaseo();
  return useQuery({
    queryKey: ["agents", workspaceId],
    queryFn: async (): Promise<WorkspaceAgent[]> => {
      const { entries } = await paseo.agents.list({
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: AGENT_PAGE_LIMIT },
      });
      return entries
        .map((entry) => entry.agent)
        .filter((agent) => agent.workspaceId === workspaceId && !agent.archivedAt && agent.status !== "closed")
        .map(({ id, title, provider, status }) => ({ id, title, provider, status }));
    },
  });
}

export function agentLabel(agent: WorkspaceAgent): string {
  return agent.title ?? agent.provider;
}
