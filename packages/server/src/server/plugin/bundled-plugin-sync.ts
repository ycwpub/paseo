import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export interface BundledPluginCatalogVersion {
  marketplaceFilePath: string;
  marketplaceId: string;
  pluginName: string;
  version: string;
}

export interface InstalledPluginVersion {
  pluginId: string;
  marketplaceId?: string;
  version: string;
}

function canonicalPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

function canonicalName(value: string): string {
  return value.trim().toLowerCase();
}

export function selectBundledPluginSyncs(options: {
  bundledMarketplacePaths: string[];
  catalog: BundledPluginCatalogVersion[];
  installed: InstalledPluginVersion[];
}): BundledPluginCatalogVersion[] {
  const bundledMarketplacePaths = new Set(options.bundledMarketplacePaths.map(canonicalPath));
  return options.catalog.filter((catalogPlugin) => {
    if (!bundledMarketplacePaths.has(canonicalPath(catalogPlugin.marketplaceFilePath)))
      return false;
    const installedPlugin = options.installed.find(
      (entry) =>
        entry.marketplaceId === catalogPlugin.marketplaceId &&
        canonicalName(entry.pluginId) === canonicalName(catalogPlugin.pluginName),
    );
    // Bundled packages are small and may gain a newly declared component without an
    // immediate version bump. Re-copy every installed bundled package at daemon startup
    // so the cache cannot expose an older package shape than the marketplace catalog.
    return installedPlugin !== undefined;
  });
}
