import type { WorkspaceDescriptor } from "@/stores/session-store";

export function resolvePluginProjectConversationWorkspace(input: {
  projectId: string;
  activeWorkspaceId: string | null;
  workspaces: Iterable<WorkspaceDescriptor>;
}): WorkspaceDescriptor | null {
  const candidates = Array.from(input.workspaces).filter(
    (workspace) => workspace.projectId === input.projectId && !workspace.archivingAt,
  );
  const active = candidates.find((workspace) => workspace.id === input.activeWorkspaceId);
  if (active) return active;
  return candidates.find((workspace) => Boolean(workspace.pinnedAt)) ?? candidates[0] ?? null;
}
