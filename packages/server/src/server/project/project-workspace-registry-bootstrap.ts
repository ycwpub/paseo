import type { Logger } from "pino";

import type { AgentStorage } from "../agent/agent-storage.js";
import { migrateManagedProjectStorage } from "../migrations/migrate-managed-project-storage.migration.js";
import { migrateLegacyProjectIds } from "../migrations/migrate-project-ids.migration.js";
import type { WorkspaceGitService } from "../workspace-git-service.js";
import { bootstrapWorkspaceRegistries } from "../workspace-registry-bootstrap.js";
import type { ProjectRegistry, WorkspaceRegistry } from "../workspace-registry.js";

interface ProjectWorkspaceRegistryBootstrapOptions {
  serverId?: string;
  paseoHome: string;
  agentStorage: AgentStorage;
  projectRegistry: ProjectRegistry;
  workspaceRegistry: WorkspaceRegistry;
  workspaceGitService: WorkspaceGitService;
  logger: Logger;
}

export async function bootstrapProjectWorkspaceRegistries(
  options: ProjectWorkspaceRegistryBootstrapOptions,
): Promise<void> {
  await bootstrapWorkspaceRegistries(options);
  await migrateLegacyProjectIds(options);
  await migrateManagedProjectStorage(options);
}
