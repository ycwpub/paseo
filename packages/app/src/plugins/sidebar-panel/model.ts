import type { PluginAppDefinition, PluginSummary } from "@getpaseo/protocol/messages";

export interface PluginAppPanelSelection {
  serverId: string;
  pluginId: string;
  appId: string | null;
  projectId?: string;
  pluginProjectId?: string;
}

export interface InstalledPluginEntry {
  plugin: PluginSummary;
  app: PluginAppDefinition | null;
}

export function isSamePluginAppSelection(
  current: PluginAppPanelSelection | null,
  next: PluginAppPanelSelection,
): boolean {
  return (
    current?.serverId === next.serverId &&
    current.pluginId === next.pluginId &&
    current.appId === next.appId &&
    current.projectId === next.projectId &&
    current.pluginProjectId === next.pluginProjectId
  );
}

export function resolveInstalledPluginEntries(
  plugins: readonly PluginSummary[],
): InstalledPluginEntry[] {
  return plugins
    .flatMap((plugin) => {
      if (!plugin.installed || !plugin.pluginId) return [];
      return [{ plugin, app: plugin.enabled ? (plugin.apps[0] ?? null) : null }];
    })
    .sort((left, right) =>
      left.plugin.displayName.localeCompare(right.plugin.displayName, undefined, {
        sensitivity: "base",
      }),
    );
}

export function resolvePluginAppSelection(
  serverId: string,
  entry: InstalledPluginEntry,
): PluginAppPanelSelection {
  return {
    serverId,
    pluginId: entry.plugin.pluginId!,
    appId: entry.app?.id ?? null,
  };
}
