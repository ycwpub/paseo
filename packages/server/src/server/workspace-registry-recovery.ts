import { statSync } from "node:fs";

import type { StoredAgentRecord } from "./agent/agent-storage.js";

export function collectRecoverableWorkspaceAgents(
  records: readonly StoredAgentRecord[],
): StoredAgentRecord[] {
  return records.filter((record) => {
    if (record.archivedAt) return false;
    try {
      return statSync(record.cwd).isDirectory();
    } catch {
      return false;
    }
  });
}

export function shouldRecoverEmptyWorkspaceRegistries(input: {
  projectsFileExists: boolean;
  workspacesFileExists: boolean;
  projectCount: number;
  workspaceCount: number;
  recoverableAgentCount: number;
}): boolean {
  if (!input.projectsFileExists || !input.workspacesFileExists) return true;
  return input.projectCount === 0 && input.workspaceCount === 0 && input.recoverableAgentCount > 0;
}

export function resolveRecoveredWorkspaceId(
  records: readonly StoredAgentRecord[],
  existingWorkspaceId: string | undefined,
  generateWorkspaceId: () => string,
): string {
  if (existingWorkspaceId) return existingWorkspaceId;
  const persistedWorkspaceId = records.find((record) => record.workspaceId)?.workspaceId;
  return persistedWorkspaceId ?? generateWorkspaceId();
}
