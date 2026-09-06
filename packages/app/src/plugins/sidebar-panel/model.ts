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

export function installedPluginEntryKey(entry: InstalledPluginEntry): string {
  return entry.plugin.pluginId ?? entry.plugin.id;
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
  plugins: readonly PluginSummary[] | null | undefined,
  preferredOrder: readonly string[] = [],
): InstalledPluginEntry[] {
  const entries = (plugins ?? [])
    .flatMap((plugin) => {
      if (!plugin.installed || !plugin.pluginId) return [];
      const apps = plugin.apps ?? [];
      return [{ plugin, app: plugin.enabled ? (apps[0] ?? null) : null }];
    })
    .sort((left, right) =>
      left.plugin.displayName.localeCompare(right.plugin.displayName, undefined, {
        sensitivity: "base",
      }),
    );
  if (preferredOrder.length === 0) return entries;

  const rank = new Map(preferredOrder.map((pluginId, index) => [pluginId, index]));
  return entries.sort((left, right) => {
    const leftRank = rank.get(installedPluginEntryKey(left));
    const rightRank = rank.get(installedPluginEntryKey(right));
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
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
