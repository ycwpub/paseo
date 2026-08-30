import path from "node:path";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import type { OutputSchema } from "../../output/index.js";
import { withPluginManagementClient, withPluginSourceClient } from "./shared.js";

export interface UnifiedPluginOptions {
  host?: string;
  id?: string;
  ref?: string;
  path?: string;
}

export const unifiedPluginSchema: OutputSchema<PluginSummary> = {
  idField: (plugin) => plugin.pluginId ?? plugin.id,
  columns: [
    { header: "PLUGIN", field: (plugin) => plugin.pluginId ?? plugin.name, width: 20 },
    {
      header: "STATUS",
      field: (plugin) => plugin.runtime?.status ?? (plugin.enabled ? "enabled" : "disabled"),
      width: 10,
    },
    { header: "ENABLED", field: (plugin) => (plugin.enabled ? "yes" : "no"), width: 8 },
    {
      header: "DIRECTORY",
      field: (plugin) => plugin.runtime?.path ?? plugin.sourcePath ?? "",
      width: 40,
    },
    {
      header: "ERROR",
      field: (plugin) => plugin.runtime?.error ?? plugin.warnings.join("; "),
      width: 40,
    },
  ],
};

export async function listUnifiedPlugins(host: string | undefined): Promise<PluginSummary[]> {
  const result = await withPluginManagementClient(host, (client) => client.listUnifiedPlugins());
  if (result.error) throw new Error(result.error);
  return result.plugins;
}

export async function installUnifiedPlugin(
  source: string,
  options: UnifiedPluginOptions,
): Promise<PluginSummary> {
  const isExplicitPath =
    path.isAbsolute(source) ||
    source === "." ||
    source === ".." ||
    source.startsWith("./") ||
    source.startsWith("../") ||
    source.startsWith(".\\") ||
    source.startsWith("..\\");
  const canUseLocalInstall = isExplicitPath && !options.ref && !options.path;
  if (canUseLocalInstall) {
    return withPluginManagementClient(options.host, async (client) => {
      if (!options.id) {
        const result = await client.installPlugin({ type: "local", path: source });
        if (result.error) throw new Error(result.error);
        if (!result.plugin) throw new Error("Plugin installation returned no plugin");
        return result.plugin;
      }
      const installed = await client.installDirectoryPlugin(source, options.id);
      return requireUnifiedPlugin(await client.listUnifiedPlugins({ refresh: true }), installed.id);
    });
  }

  return withPluginSourceClient(options.host, async (client) => {
    const installed = await client.installPluginSource({
      source,
      ...(options.id ? { id: options.id } : {}),
      ...(options.ref ? { ref: options.ref } : {}),
      ...(options.path ? { pluginPath: options.path } : {}),
    });
    return requireUnifiedPlugin(await client.listUnifiedPlugins({ refresh: true }), installed.id);
  });
}

export async function actOnUnifiedPlugin(
  action: "reload" | "enable" | "disable",
  pluginId: string,
  host: string | undefined,
): Promise<PluginSummary> {
  return withPluginManagementClient(host, async (client) => {
    if (action === "reload") {
      await client.reloadPlugin(pluginId);
      return requireUnifiedPlugin(await client.listUnifiedPlugins({ refresh: true }), pluginId);
    }
    const result = await client.setPluginEnabled(pluginId, action === "enable");
    if (result.error) throw new Error(result.error);
    if (!result.plugin) throw new Error(`Plugin not found: ${pluginId}`);
    return result.plugin;
  });
}

export async function removeUnifiedPlugin(
  pluginId: string,
  host: string | undefined,
): Promise<PluginSummary> {
  return withPluginManagementClient(host, async (client) => {
    const current = requireUnifiedPlugin(await client.listUnifiedPlugins(), pluginId);
    const result = await client.uninstallPlugin(pluginId);
    if (result.error) throw new Error(result.error);
    if (!result.ok) throw new Error(`Plugin is not configured: ${pluginId}`);
    return {
      ...current,
      installed: false,
      enabled: false,
      ...(current.runtime
        ? {
            runtime: {
              ...current.runtime,
              enabled: false,
              status: "disabled" as const,
            },
          }
        : {}),
    };
  });
}

function requireUnifiedPlugin(
  result: {
    plugins: PluginSummary[];
    error: string | null;
  },
  pluginId: string,
): PluginSummary {
  if (result.error) throw new Error(result.error);
  const plugin = result.plugins.find(
    (candidate) => candidate.pluginId === pluginId || candidate.id === pluginId,
  );
  if (!plugin) throw new Error(`Plugin is not configured: ${pluginId}`);
  return plugin;
}
