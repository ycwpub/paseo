import type { PluginAppState } from "@getpaseo/protocol/messages";
import type { PluginProjectOption } from "./plugin-project-model";

export interface ManagedPluginProject {
  state: PluginAppState;
  projectId: string;
  projectName: string;
  sourceDirectory: string | null;
  option: PluginProjectOption | null;
}

export function buildManagedPluginProjects(
  states: readonly PluginAppState[],
  options: readonly PluginProjectOption[],
): ManagedPluginProject[] {
  const optionsById = new Map(options.map((option) => [option.value, option]));
  return states.flatMap((state) => {
    const projectId = state.projectId?.trim();
    if (!projectId || !state.defaultAgent) return [];
    const option = optionsById.get(projectId) ?? null;
    return [
      {
        state,
        projectId,
        projectName: option?.projectName ?? projectId,
        sourceDirectory: option?.sourceDirectory ?? null,
        option,
      },
    ];
  });
}

export function resolveInitialManagedPluginProjectId(input: {
  currentProjectId: string | null;
  activeProjectId: string | null;
  projects: readonly ManagedPluginProject[];
}): string | null {
  const ids = new Set(input.projects.map((project) => project.projectId));
  if (input.currentProjectId && ids.has(input.currentProjectId)) return input.currentProjectId;
  if (input.activeProjectId && ids.has(input.activeProjectId)) return input.activeProjectId;
  return input.projects[0]?.projectId ?? null;
}

export function upsertPluginProjectState(
  states: readonly PluginAppState[] | undefined,
  next: PluginAppState,
): PluginAppState[] {
  const current = states ?? [];
  return [
    next,
    ...current.filter(
      (state) =>
        state.pluginId !== next.pluginId ||
        state.appId !== next.appId ||
        state.projectId !== next.projectId,
    ),
  ];
}

export function removePluginProjectState(
  states: readonly PluginAppState[] | undefined,
  projectId: string,
): PluginAppState[] {
  return (states ?? []).filter((state) => state.projectId !== projectId);
}
