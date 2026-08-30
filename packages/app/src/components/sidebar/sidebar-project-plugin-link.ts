import { useCallback, useMemo } from "react";
import type { PluginAppState, PluginSummary } from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { usePlugins } from "@/hooks/use-plugins";
import {
  DEVELOPMENT_PLUGIN_ID,
  DEVELOPMENT_SERVICE_NAME,
  developmentFlowFromJob,
} from "@/plugins/byte-development/flow-model";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

interface PluginAppTarget {
  pluginId: string;
  pluginName: string;
  appId: string;
  appName: string;
  development: boolean;
}

export interface SidebarProjectPluginLink {
  pluginId: string;
  pluginName: string;
  appId: string;
  projectId: string;
  pluginProjectId?: string;
  title: string;
  updatedAt: string;
}

export function buildSidebarProjectPluginTargets(
  plugins: readonly PluginSummary[],
): PluginAppTarget[] {
  const targets: PluginAppTarget[] = [];
  for (const plugin of plugins) {
    if (!plugin.installed || !plugin.enabled || !plugin.pluginId) continue;
    const apps = plugin.apps ?? [];
    if (plugin.pluginId === DEVELOPMENT_PLUGIN_ID) {
      const app = apps[0];
      if (app) {
        targets.push({
          pluginId: plugin.pluginId,
          pluginName: plugin.displayName,
          appId: app.id,
          appName: app.initialDocument?.title?.trim() || app.id,
          development: true,
        });
      }
      continue;
    }
    for (const app of apps) {
      targets.push({
        pluginId: plugin.pluginId,
        pluginName: plugin.displayName,
        appId: app.id,
        appName: app.initialDocument?.title?.trim() || app.id,
        development: false,
      });
    }
  }
  return targets;
}

export function sidebarPluginLinkFromAppState(
  target: PluginAppTarget,
  projectId: string,
  state: PluginAppState,
): SidebarProjectPluginLink | null {
  if (state.projectId !== projectId || !state.defaultAgent) return null;
  return {
    pluginId: target.pluginId,
    pluginName: target.pluginName,
    appId: target.appId,
    projectId,
    title: state.name?.trim() || state.document?.title?.trim() || target.appName,
    updatedAt: state.updatedAt,
  };
}

export function selectLatestSidebarProjectPluginLink(
  links: readonly (SidebarProjectPluginLink | null)[],
): SidebarProjectPluginLink | null {
  return (
    links
      .filter((link): link is SidebarProjectPluginLink => link !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  );
}

export function useSidebarProjectPluginLink(input: {
  active: boolean;
  serverId: string;
  projectId: string;
}) {
  const client = useHostRuntimeClient(input.serverId);
  const connected = useHostRuntimeIsConnected(input.serverId);
  const supportsProjectApps = useHostFeature(input.serverId, "pluginProjectManagement");
  const supportsJobs = useHostFeature(input.serverId, "pluginAppJobList");
  const plugins = usePlugins(input.serverId, { enabled: input.active });
  const openPluginPanel = usePluginAppPanelStore((state) => state.open);
  const targets = useMemo(
    () => buildSidebarProjectPluginTargets(plugins.plugins),
    [plugins.plugins],
  );
  const targetKey = useMemo(
    () =>
      targets
        .map((target) => `${target.pluginId}:${target.appId}:${target.development ? "job" : "app"}`)
        .join("|"),
    [targets],
  );
  const query = useFetchQuery({
    queryKey: ["sidebar-project-plugin-link", input.serverId, input.projectId, targetKey] as const,
    enabled:
      input.active &&
      connected &&
      Boolean(client) &&
      targets.length > 0 &&
      (supportsProjectApps || supportsJobs),
    dataShape: "value",
    queryFn: async () => {
      if (!client) return null;
      const candidates = await Promise.all(
        targets.map(async (target): Promise<SidebarProjectPluginLink | null> => {
          try {
            if (target.development) {
              if (!supportsJobs) return null;
              const result = await client.listPluginAppJobs({
                pluginId: target.pluginId,
                serviceName: DEVELOPMENT_SERVICE_NAME,
                projectId: input.projectId,
                limit: 100,
              });
              if (result.error) return null;
              const flow = result.jobs
                .map(developmentFlowFromJob)
                .filter((candidate) => candidate?.projectId === input.projectId)
                .sort((left, right) => right!.updatedAt.localeCompare(left!.updatedAt))[0];
              return flow
                ? {
                    pluginId: target.pluginId,
                    pluginName: target.pluginName,
                    appId: target.appId,
                    projectId: input.projectId,
                    pluginProjectId: flow.id,
                    title: flow.title,
                    updatedAt: flow.updatedAt,
                  }
                : null;
            }
            if (!supportsProjectApps) return null;
            const result = await client.getPluginApp(
              target.pluginId,
              target.appId,
              input.projectId,
            );
            if (result.error || !result.app) return null;
            return sidebarPluginLinkFromAppState(target, input.projectId, result.app);
          } catch {
            return null;
          }
        }),
      );
      return selectLatestSidebarProjectPluginLink(candidates);
    },
    staleTimeMs: 5_000,
  });
  const link = query.data ?? null;
  const open = useCallback(() => {
    if (!link) return;
    openPluginPanel({
      serverId: input.serverId,
      pluginId: link.pluginId,
      appId: link.appId,
      projectId: link.projectId,
      pluginProjectId: link.pluginProjectId,
    });
  }, [input.serverId, link, openPluginPanel]);

  return {
    link,
    open,
    isLoading: query.isLoading || plugins.isLoading,
  };
}
