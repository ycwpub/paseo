import type { PluginSummary } from "@getpaseo/protocol/messages";
import { resolveInstalledPluginEntries } from "@/plugins/sidebar-panel/model";

export interface PluginHostCatalog {
  serverId: string;
  plugins: readonly PluginSummary[];
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

export function selectPluginSidebarHost(
  catalogs: readonly PluginHostCatalog[],
): PluginHostCatalog | null {
  return (
    catalogs.find((catalog) => resolveInstalledPluginEntries(catalog.plugins).length > 0) ?? null
  );
}
