import type { PluginAppState } from "@getpaseo/protocol/messages";

export interface LinkedPluginAppTarget {
  pluginId: string;
  pluginName: string;
  appId: string;
  appName: string;
}

export interface LinkedPluginAppStateSource {
  target: LinkedPluginAppTarget;
  states: readonly PluginAppState[];
}

export interface LinkedPluginJobTarget {
  id: string;
  pluginId: string;
  pluginName: string;
  appId: string;
  projectId: string | null;
  title: string;
  description: string;
  updatedAt: string;
}

export interface LinkedPluginProject {
  id: string;
  pluginId: string;
  pluginName: string;
  appId: string;
  projectId: string;
  pluginProjectId?: string;
  title: string;
  description: string;
  updatedAt: string;
}

export function buildLinkedPluginProjects(input: {
  projectId: string;
  appStateSources: readonly LinkedPluginAppStateSource[];
  jobTargets: readonly LinkedPluginJobTarget[];
}): LinkedPluginProject[] {
  const projects: LinkedPluginProject[] = [];

  for (const source of input.appStateSources) {
    for (const state of source.states) {
      if (state.projectId !== input.projectId || !state.defaultAgent) continue;
      const appTitle = state.document?.title?.trim() || source.target.appName;
      projects.push({
        id: `app:${source.target.pluginId}:${source.target.appId}:${input.projectId}`,
        pluginId: source.target.pluginId,
        pluginName: source.target.pluginName,
        appId: source.target.appId,
        projectId: input.projectId,
        title: appTitle,
        description: `${source.target.appName} · ${state.defaultAgent.provider} / ${state.defaultAgent.model}`,
        updatedAt: state.updatedAt,
      });
    }
  }

  for (const target of input.jobTargets) {
    if (target.projectId !== input.projectId) continue;
    projects.push({
      id: `job:${target.pluginId}:${target.id}`,
      pluginId: target.pluginId,
      pluginName: target.pluginName,
      appId: target.appId,
      projectId: input.projectId,
      pluginProjectId: target.id,
      title: target.title,
      description: target.description,
      updatedAt: target.updatedAt,
    });
  }

  return projects.sort((left, right) => {
    const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
    if (byUpdatedAt !== 0) return byUpdatedAt;
    const byPlugin = left.pluginName.localeCompare(right.pluginName, undefined, {
      sensitivity: "base",
    });
    return byPlugin !== 0 ? byPlugin : left.title.localeCompare(right.title);
  });
}
