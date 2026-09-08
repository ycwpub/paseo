import type { PluginState, PluginSummary } from "@getpaseo/protocol/messages";
import { resolveInstalledPluginEntries } from "@/plugins/sidebar-panel/model";

export interface PluginHostCatalog {
  serverId: string;
  plugins: readonly PluginSummary[];
  online: boolean;
}

export function prioritizePluginSidebarHosts(
  currentServerId: string | null | undefined,
  localServerId: string | null | undefined,
  connectedServerIds: readonly string[],
): string[] {
  const ordered = [currentServerId, localServerId, ...connectedServerIds];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of ordered) {
    const serverId = candidate?.trim() ?? "";
    if (!serverId || seen.has(serverId)) continue;
    seen.add(serverId);
    result.push(serverId);
  }

  return result;
}

export function projectPluginSidebarCatalogs(
  serverIds: readonly string[],
  pluginStates: readonly (PluginState | null | undefined)[],
  onlineServerIds: ReadonlySet<string>,
): PluginHostCatalog[] {
  return serverIds.map((serverId, index) => ({
    serverId,
    plugins: pluginStates[index]?.plugins ?? [],
    online: onlineServerIds.has(serverId),
  }));
}

export function selectPluginSidebarHost(
  catalogs: readonly PluginHostCatalog[],
): PluginHostCatalog | null {
  const catalogsWithPlugins = catalogs.filter(
    (catalog) => resolveInstalledPluginEntries(catalog.plugins).length > 0,
  );
  return catalogsWithPlugins.find((catalog) => catalog.online) ?? catalogsWithPlugins[0] ?? null;
}
