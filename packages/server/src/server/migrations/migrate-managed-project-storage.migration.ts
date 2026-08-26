// COMPAT(managedProjectStorageRoot): migrate references written before Project-owned
// storage moved from $PASEO_HOME/{projectId} to $PASEO_HOME/projects/{projectId}.
import path from "node:path";

import type { Logger } from "pino";

import type { AgentStorage, StoredAgentRecord } from "../agent/agent-storage.js";
import {
  ensureManagedProjectStorageRoot,
  resolveLegacyManagedProjectStorageRoot,
} from "../project/project-storage-paths.js";
import type {
  PersistedProjectRecord,
  PersistedWorkspaceRecord,
  ProjectRegistry,
  WorkspaceRegistry,
} from "../workspace-registry.js";
import { areEquivalentPaths, getRealpathAwareRelativePath } from "../../utils/path.js";

interface ManagedProjectStorageMove {
  projectId: string;
  legacyRoot: string;
  managedRoot: string;
}

export interface ManagedProjectStorageMigrationResult {
  projectsUpdated: number;
  workspacesUpdated: number;
  agentsUpdated: number;
}

function rewritePathFromLegacyRoot(
  value: string | null,
  move: ManagedProjectStorageMove,
): string | null {
  if (value === null) return null;
  const relative = getRealpathAwareRelativePath(move.legacyRoot, value);
  if (relative === null) return value;

  return path.join(move.managedRoot, relative);
}

function rewriteProject(
  project: PersistedProjectRecord,
  move: ManagedProjectStorageMove,
): PersistedProjectRecord {
  if (
    project.rootPath === null ||
    (!areEquivalentPaths(project.rootPath, move.legacyRoot) &&
      !areEquivalentPaths(project.rootPath, move.managedRoot))
  ) {
    return project;
  }

  return {
    ...project,
    rootPath: null,
    kind: "non_git",
    projectKey: null,
  };
}

function rewriteWorkspace(
  workspace: PersistedWorkspaceRecord,
  move: ManagedProjectStorageMove,
): PersistedWorkspaceRecord {
  return {
    ...workspace,
    cwd: rewritePathFromLegacyRoot(workspace.cwd, move) ?? workspace.cwd,
    worktreeRoot: rewritePathFromLegacyRoot(workspace.worktreeRoot, move),
    mainRepoRoot: rewritePathFromLegacyRoot(workspace.mainRepoRoot, move),
  };
}

function rewriteAgentConfig(
  record: StoredAgentRecord,
  move: ManagedProjectStorageMove,
): StoredAgentRecord["config"] {
  if (!record.config) return record.config;

  const rewriteDirectories = (directories: string[] | null | undefined) => {
    if (!directories) return directories;
    const rewritten = directories.map(
      (directory) => rewritePathFromLegacyRoot(directory, move) ?? directory,
    );
    return rewritten.some((directory, index) => directory !== directories[index])
      ? rewritten
      : directories;
  };

  const writableProjectDirectories = rewriteDirectories(record.config.writableProjectDirectories);
  const readOnlyProjectDirectories = rewriteDirectories(record.config.readOnlyProjectDirectories);
  if (
    writableProjectDirectories === record.config.writableProjectDirectories &&
    readOnlyProjectDirectories === record.config.readOnlyProjectDirectories
  ) {
    return record.config;
  }

  return {
    ...record.config,
    writableProjectDirectories,
    readOnlyProjectDirectories,
  };
}

function findAgentStorageMove(
  record: StoredAgentRecord,
  movesByProjectId: ReadonlyMap<string, ManagedProjectStorageMove>,
  moves: readonly ManagedProjectStorageMove[],
  projectIdByWorkspaceId: ReadonlyMap<string, string>,
): ManagedProjectStorageMove | null {
  if (record.workspaceId) {
    const projectId = projectIdByWorkspaceId.get(record.workspaceId);
    const workspaceMove = projectId ? movesByProjectId.get(projectId) : undefined;
    if (workspaceMove) return workspaceMove;
  }

  return (
    moves.find((move) => getRealpathAwareRelativePath(move.legacyRoot, record.cwd) !== null) ?? null
  );
}

export async function migrateManagedProjectStorage(options: {
  paseoHome: string;
  agentStorage: AgentStorage;
  projectRegistry: ProjectRegistry;
  workspaceRegistry: WorkspaceRegistry;
  logger: Logger;
}): Promise<ManagedProjectStorageMigrationResult> {
  const projects = await options.projectRegistry.list();
  const moves = projects.map((project) => {
    const legacyRoot = resolveLegacyManagedProjectStorageRoot(options.paseoHome, project.projectId);
    const managedRoot = ensureManagedProjectStorageRoot(options.paseoHome, project.projectId);
    return { projectId: project.projectId, legacyRoot, managedRoot };
  });
  const movesByProjectId = new Map(moves.map((move) => [move.projectId, move]));

  let projectsUpdated = 0;
  for (const project of projects) {
    const move = movesByProjectId.get(project.projectId);
    if (!move) continue;
    const migrated = rewriteProject(project, move);
    if (migrated === project) continue;
    await options.projectRegistry.upsert(migrated);
    projectsUpdated += 1;
  }

  const workspaces = await options.workspaceRegistry.list();
  const projectIdByWorkspaceId = new Map(
    workspaces.map((workspace) => [workspace.workspaceId, workspace.projectId]),
  );
  let workspacesUpdated = 0;
  for (const workspace of workspaces) {
    const move = movesByProjectId.get(workspace.projectId);
    if (!move) continue;
    const migrated = rewriteWorkspace(workspace, move);
    if (
      migrated.cwd === workspace.cwd &&
      migrated.worktreeRoot === workspace.worktreeRoot &&
      migrated.mainRepoRoot === workspace.mainRepoRoot
    ) {
      continue;
    }
    await options.workspaceRegistry.upsert(migrated);
    workspacesUpdated += 1;
  }

  let agentsUpdated = 0;
  for (const record of await options.agentStorage.list()) {
    const move = findAgentStorageMove(record, movesByProjectId, moves, projectIdByWorkspaceId);
    if (!move) continue;
    const cwd = rewritePathFromLegacyRoot(record.cwd, move) ?? record.cwd;
    const config = rewriteAgentConfig(record, move);
    if (cwd === record.cwd && config === record.config) continue;
    await options.agentStorage.upsert({ ...record, cwd, config });
    agentsUpdated += 1;
  }

  const result = { projectsUpdated, workspacesUpdated, agentsUpdated };
  if (projectsUpdated > 0 || workspacesUpdated > 0 || agentsUpdated > 0) {
    options.logger.info(result, "Migrated managed Project storage references");
  }
  return result;
}
