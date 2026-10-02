import type { PluginAppState } from "@getpaseo/protocol/messages";
import {
  buildManagedPluginProjects,
  type ManagedPluginProject,
} from "./plugin-project-management-model";
import type { PluginProjectOption } from "./plugin-project-model";

export interface PluginProjectHost {
  serverId: string;
  label: string;
}

export interface HostedPluginProject extends ManagedPluginProject {
  key: string;
  serverId: string;
  hostLabel: string;
}

export interface PluginProjectHostSource {
  serverId: string;
  hostLabel: string;
  states: readonly PluginAppState[];
  options: readonly PluginProjectOption[];
}

export function pluginProjectHostKey(serverId: string, projectId: string): string {
  return `${serverId}\u0000${projectId}`;
}

export function buildHostedPluginProjectRemoveTarget(project: {
  serverId: string;
  projectId: string;
}): {
  hosts: [{ serverId: string; projectId: string }];
} {
  return {
    hosts: [{ serverId: project.serverId, projectId: project.projectId }],
  };
}

export function resolvePluginProjectHostIds(
  hosts: readonly PluginProjectHost[],
  hostFilters: readonly string[],
  availableHostIds: readonly string[],
): string[] {
  const available = new Set(availableHostIds);
  const allAvailable = hosts
    .map((host) => host.serverId)
    .filter((serverId) => available.has(serverId));
  if (hostFilters.length === 0) return allAvailable;

  const selected = new Set(hostFilters);
  const filtered = allAvailable.filter((serverId) => selected.has(serverId));
  return filtered.length > 0 ? filtered : allAvailable;
}

export function buildHostedPluginProjects(
  sources: readonly PluginProjectHostSource[],
): HostedPluginProject[] {
  return sources
    .flatMap((source) =>
      buildManagedPluginProjects(source.states, source.options).map((project) => ({
        state: project.state,
        projectId: project.projectId,
        projectName: project.projectName,
        sourceDirectory: project.sourceDirectory,
        option: project.option,
        key: pluginProjectHostKey(source.serverId, project.projectId),
        serverId: source.serverId,
        hostLabel: source.hostLabel,
      })),
    )
    .sort((left, right) => right.state.updatedAt.localeCompare(left.state.updatedAt));
}

export function resolvePluginProjectInitialHostId(input: {
  visibleHostIds: readonly string[];
  currentServerId: string;
  onlineHostIds: ReadonlySet<string>;
}): string | null {
  if (input.visibleHostIds.length === 1) return input.visibleHostIds[0] ?? null;
  if (
    input.visibleHostIds.includes(input.currentServerId) &&
    input.onlineHostIds.has(input.currentServerId)
  ) {
    return input.currentServerId;
  }
  return (
    input.visibleHostIds.find((serverId) => input.onlineHostIds.has(serverId)) ??
    input.visibleHostIds[0] ??
    null
  );
}

export function resolvePluginProjectSelectionKey(input: {
  requestedProjectId?: string;
  preferredServerId: string;
  currentKey: string | null;
  activeProject: { serverId: string; projectId: string } | null;
  projects: readonly HostedPluginProject[];
}): string | null {
  const keys = new Set(input.projects.map((project) => project.key));
  if (input.currentKey && keys.has(input.currentKey)) return input.currentKey;

  if (input.requestedProjectId) {
    const preferredKey = pluginProjectHostKey(input.preferredServerId, input.requestedProjectId);
    if (keys.has(preferredKey)) return preferredKey;
    const requested = input.projects.find(
      (project) => project.projectId === input.requestedProjectId,
    );
    if (requested) return requested.key;
  }

  if (input.activeProject) {
    const activeKey = pluginProjectHostKey(
      input.activeProject.serverId,
      input.activeProject.projectId,
    );
    if (keys.has(activeKey)) return activeKey;
  }
  return input.projects[0]?.key ?? null;
}
