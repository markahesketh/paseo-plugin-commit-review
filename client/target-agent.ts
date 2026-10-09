import { useSyncExternalStore } from "react";

// The agent a workspace's review goes to. Opening the panel from an agent's
// command or slash command selects that agent; the panel's picker changes it.
const preferred = new Map<string, string>();
const listeners = new Set<() => void>();

export function preferAgent(workspaceId: string, agentId: string): void {
  if (preferred.get(workspaceId) === agentId) return;
  preferred.set(workspaceId, agentId);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreferredAgent(workspaceId: string): string | null {
  return useSyncExternalStore(subscribe, () => preferred.get(workspaceId) ?? null);
}
