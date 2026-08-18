import path from "node:path";

function processResourcesPath(): string | undefined {
  const value = "resourcesPath" in process ? process.resourcesPath : undefined;
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function bundledPluginMarketplaceCandidates(
  resourcesPath = processResourcesPath(),
): string[] {
  if (!resourcesPath) return [];
  return [path.join(resourcesPath, ".agents", "plugins", "marketplace.json")];
}
