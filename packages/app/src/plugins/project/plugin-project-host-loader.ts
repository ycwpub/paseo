import type { PluginAppState, PluginSummary } from "@getpaseo/protocol/messages";

interface PluginProjectHostClient {
  listUnifiedPlugins(): Promise<{
    plugins: PluginSummary[];
    error: string | null;
  }>;
  listPluginAppProjects(
    pluginId: string,
    appId: string,
  ): Promise<{
    projects: PluginAppState[];
    error: string | null;
  }>;
}

export interface PluginProjectLoadHost {
  serverId: string;
  label: string;
  online: boolean;
}

export interface PluginProjectHostError {
  serverId: string;
  hostLabel: string;
  message: string;
}

export interface LoadedPluginProjectHost {
  serverId: string;
  hostLabel: string;
  states: PluginAppState[];
}

export interface LoadedPluginProjectHosts {
  availableHostIds: string[];
  sources: LoadedPluginProjectHost[];
  hostErrors: PluginProjectHostError[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function exposesPluginApp(
  plugins: readonly PluginSummary[],
  pluginId: string,
  appId: string,
): boolean {
  return plugins.some(
    (plugin) =>
      plugin.pluginId === pluginId &&
      plugin.installed &&
      plugin.enabled &&
      plugin.apps.some((app) => app.id === appId),
  );
}

export async function loadPluginProjectHosts(input: {
  hosts: readonly PluginProjectLoadHost[];
  pluginId: string;
  appId: string;
  getClient: (serverId: string) => PluginProjectHostClient | null;
}): Promise<LoadedPluginProjectHosts> {
  const results = await Promise.all(
    input.hosts.map(async (host) => {
      if (!host.online) {
        return {
          kind: "error" as const,
          error: {
            serverId: host.serverId,
            hostLabel: host.label,
            message: "主机离线",
          },
        };
      }
      const client = input.getClient(host.serverId);
      if (!client) {
        return {
          kind: "error" as const,
          error: {
            serverId: host.serverId,
            hostLabel: host.label,
            message: "主机未连接",
          },
        };
      }
      try {
        const catalog = await client.listUnifiedPlugins();
        if (catalog.error) throw new Error(catalog.error);
        if (!exposesPluginApp(catalog.plugins, input.pluginId, input.appId)) {
          return { kind: "unavailable" as const };
        }
        const projects = await client.listPluginAppProjects(input.pluginId, input.appId);
        if (projects.error) throw new Error(projects.error);
        return {
          kind: "loaded" as const,
          source: {
            serverId: host.serverId,
            hostLabel: host.label,
            states: projects.projects,
          },
        };
      } catch (error) {
        return {
          kind: "error" as const,
          error: {
            serverId: host.serverId,
            hostLabel: host.label,
            message: errorMessage(error),
          },
        };
      }
    }),
  );

  return {
    availableHostIds: results.flatMap((result) =>
      result.kind === "loaded" ? [result.source.serverId] : [],
    ),
    sources: results.flatMap((result) => (result.kind === "loaded" ? [result.source] : [])),
    hostErrors: results.flatMap((result) => (result.kind === "error" ? [result.error] : [])),
  };
}
