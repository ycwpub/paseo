import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type pino from "pino";
import {
  PluginStateSchema,
  type PluginInstallSource,
  type PluginListItem,
  type PluginLogEntry,
  type PluginSourceStatusItem,
  type PluginSourceUpdateItem,
  type PluginState,
  type PluginSummary,
} from "@getpaseo/protocol/messages";
import type { McpStore } from "../mcp/mcp-store.js";
import type { SkillStore } from "../skill/skill-store.js";
import type { DaemonConfigStore } from "../daemon-config-store.js";
import { PluginService as PluginResourceService } from "../plugin/plugin-service.js";
import { PluginService as PluginRuntimeService } from "./index.js";
import { ManagedPluginSources } from "./managed-source.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDeclaredResources(pluginPath: string): boolean {
  if (existsSync(path.join(pluginPath, ".codex-plugin", "plugin.json"))) return true;
  const manifestPath = path.join(pluginPath, "paseo-plugin.json");
  if (!existsSync(manifestPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    if (!isRecord(parsed)) return false;
    const resources = isRecord(parsed.resources) ? parsed.resources : {};
    if (
      ["skills", "mcpServers", "httpServices", "apps"].some(
        (key) => parsed[key] !== undefined || resources[key] !== undefined,
      )
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return ["skills", ".mcp.json", ".http.json", ".app.json"].some((entry) =>
    existsSync(path.join(pluginPath, entry)),
  );
}

function hasRuntimeManifest(pluginPath: string): boolean {
  return existsSync(path.join(pluginPath, "paseo-plugin.json"));
}

function runtimeOnlySummary(plugin: PluginListItem): PluginSummary {
  return {
    id: `runtime:${plugin.id}`,
    pluginId: plugin.id,
    name: plugin.id,
    displayName: plugin.id,
    version: "0.0.0",
    description: "Paseo 运行时插件",
    keywords: [],
    sourceType: plugin.source === "git" ? "git" : "local",
    sourcePath: plugin.path,
    installed: true,
    enabled: plugin.enabled,
    installable: false,
    updateAvailable: false,
    skills: [],
    mcpServers: [],
    httpServices: [],
    apps: [],
    runtime: plugin,
    unsupportedComponents: [],
    warnings: [],
  };
}

export function mergePluginState(
  state: PluginState,
  runtimePlugins: PluginListItem[],
): PluginState {
  const plugins = state.plugins.map((plugin) => ({ ...plugin }));
  for (const runtime of runtimePlugins) {
    const resource = plugins.find(
      (plugin) =>
        plugin.installed &&
        (plugin.pluginId === runtime.id ||
          plugin.name === runtime.id ||
          (plugin.sourcePath !== undefined &&
            path.resolve(plugin.sourcePath) === path.resolve(runtime.path))),
    );
    if (resource) {
      resource.runtime = runtime;
      if (runtime.error && !resource.warnings.includes(runtime.error)) {
        resource.warnings = [...resource.warnings, runtime.error];
      }
      continue;
    }
    plugins.push(runtimeOnlySummary(runtime));
  }
  return PluginStateSchema.parse({
    ...state,
    plugins: plugins.sort((left, right) => {
      if (left.installed !== right.installed) return left.installed ? -1 : 1;
      return left.displayName.localeCompare(right.displayName);
    }),
  });
}

/**
 * The single plugin lifecycle used by the daemon.
 *
 * Main's process-isolated runtime remains authoritative for executable plugins.
 * The feature branch's Skills/MCP/App/HTTP support is attached as declarative
 * resources under the same plugin ID and exposed through one catalog.
 */
export class UnifiedPluginService extends PluginResourceService {
  private readonly runtime: PluginRuntimeService;
  private readonly unifiedLogger: pino.Logger;

  constructor(options: {
    paseoHome: string;
    logger: pino.Logger;
    daemonConfigStore: DaemonConfigStore;
    daemonVersion: string;
    mcpStore: McpStore;
    skillStore: SkillStore;
    bundledMarketplacePaths?: string[];
  }) {
    super({
      paseoHome: options.paseoHome,
      logger: options.logger,
      mcpStore: options.mcpStore,
      skillStore: options.skillStore,
      ...(options.bundledMarketplacePaths
        ? { bundledMarketplacePaths: options.bundledMarketplacePaths }
        : {}),
    });
    this.unifiedLogger = options.logger.child({ module: "unified-plugin-service" });
    this.runtime = new PluginRuntimeService(
      options.logger,
      options.daemonConfigStore,
      options.daemonVersion,
      { managedSources: new ManagedPluginSources(options.paseoHome) },
    );
  }

  override refresh(): PluginState {
    return mergePluginState(super.refresh(), this.runtime.listPlugins());
  }

  override getState(): PluginState {
    return mergePluginState(super.getState(), this.runtime.listPlugins());
  }

  override async install(
    source: PluginInstallSource,
  ): Promise<{ plugin: PluginSummary; state: PluginState }> {
    if (source.type === "local" && !hasDeclaredResources(source.path)) {
      if (!hasRuntimeManifest(source.path)) {
        throw new Error("插件目录缺少 paseo-plugin.json 或 .codex-plugin/plugin.json");
      }
      const runtime = await this.runtime.installDirectory({ path: source.path });
      const state = this.getState();
      return {
        plugin:
          state.plugins.find((plugin) => plugin.pluginId === runtime.id && plugin.installed) ??
          runtimeOnlySummary(runtime),
        state,
      };
    }

    const installed = await super.install(source);
    const pluginId = installed.plugin.pluginId;
    const packagePath = pluginId ? this.getInstalledPackagePath(pluginId) : null;
    if (pluginId && packagePath && hasRuntimeManifest(packagePath)) {
      await this.installOrReloadRuntime(packagePath, pluginId);
    }
    const state = this.getState();
    return {
      plugin:
        state.plugins.find((plugin) => plugin.pluginId === pluginId && plugin.installed) ??
        installed.plugin,
      state,
    };
  }

  override async setEnabled(
    pluginId: string,
    enabled: boolean,
  ): Promise<{ plugin: PluginSummary; state: PluginState }> {
    const resourceInstalled = super
      .getState()
      .plugins.some((plugin) => plugin.installed && plugin.pluginId === pluginId);
    const runtimeInstalled = this.runtime.listPlugins().some((plugin) => plugin.id === pluginId);
    if (!resourceInstalled && !runtimeInstalled) throw new Error("Plugin not found");

    if (resourceInstalled) await super.setEnabled(pluginId, enabled);
    if (runtimeInstalled) {
      if (enabled) await this.runtime.enablePlugin(pluginId);
      else await this.runtime.disablePlugin(pluginId);
    }
    const state = this.getState();
    const plugin = state.plugins.find((entry) => entry.installed && entry.pluginId === pluginId);
    if (!plugin) throw new Error("Plugin not found");
    return { plugin, state };
  }

  override async uninstall(pluginId: string): Promise<{ ok: boolean; state: PluginState }> {
    const runtimeInstalled = this.runtime.listPlugins().some((plugin) => plugin.id === pluginId);
    const resourceInstalled = super
      .getState()
      .plugins.some((plugin) => plugin.installed && plugin.pluginId === pluginId);
    if (runtimeInstalled) await this.runtime.removePlugin(pluginId);
    const resourceResult = resourceInstalled
      ? await super.uninstall(pluginId)
      : { ok: runtimeInstalled, state: super.getState() };
    return { ok: resourceResult.ok || runtimeInstalled, state: this.getState() };
  }

  bindPaseoSessionHost(
    sessionHost: Parameters<PluginRuntimeService["bindPaseoSessionHost"]>[0],
  ): void {
    this.runtime.bindPaseoSessionHost(sessionHost);
  }

  start(): Promise<void> {
    return this.runtime.start();
  }

  stopAllPlugins(): Promise<void> {
    return this.runtime.stopAllPlugins();
  }

  subscribe(listener: (pluginId: string) => void): () => void {
    return this.runtime.subscribe(listener);
  }

  listPlugins(): PluginListItem[] {
    return this.runtime.listPlugins();
  }

  getLogs(pluginId: string): PluginLogEntry[] {
    return this.runtime.getLogs(pluginId);
  }

  catalog(): Array<{ id: string; clientBundle: string }> {
    return this.runtime.catalog();
  }

  invokePluginRpc(pluginId: string, method: string, input: unknown): Promise<unknown> {
    return this.runtime.invokePluginRpc(pluginId, method, input);
  }

  inspectDirectory(pluginPath: string): Promise<{ id: string }> {
    return this.runtime.inspectDirectory(pluginPath);
  }

  async installDirectory(input: { path: string; id?: string }): Promise<PluginListItem> {
    const installed = await this.runtime.installDirectory(input);
    if (hasDeclaredResources(installed.path)) {
      await super.install({ type: "local", path: installed.path });
    }
    return this.requireRuntimePlugin(installed.id);
  }

  async installSource(input: {
    source: string;
    id?: string;
    ref?: string;
    pluginPath?: string;
  }): Promise<PluginListItem> {
    const installed = await this.runtime.installSource(input);
    if (hasDeclaredResources(installed.path)) {
      await super.install({ type: "local", path: installed.path });
    }
    return this.requireRuntimePlugin(installed.id);
  }

  statusSources(pluginId?: string): Promise<PluginSourceStatusItem[]> {
    return this.runtime.statusSources(pluginId);
  }

  updateSources(pluginId?: string): Promise<PluginSourceUpdateItem[]> {
    return this.runtime.updateSources(pluginId);
  }

  async reloadPlugin(pluginId: string): Promise<PluginListItem> {
    const plugin = await this.runtime.reloadPlugin(pluginId);
    const packagePath = this.getInstalledPackagePath(pluginId);
    if (packagePath) await super.install({ type: "local", path: packagePath });
    return plugin;
  }

  async enablePlugin(pluginId: string): Promise<PluginListItem> {
    await this.setEnabled(pluginId, true);
    return this.requireRuntimePlugin(pluginId);
  }

  async disablePlugin(pluginId: string): Promise<PluginListItem> {
    await this.setEnabled(pluginId, false);
    return this.requireRuntimePlugin(pluginId);
  }

  async removePlugin(pluginId: string): Promise<void> {
    await this.uninstall(pluginId);
  }

  private async installOrReloadRuntime(pluginPath: string, pluginId: string): Promise<void> {
    try {
      const current = this.runtime.listPlugins().find((plugin) => plugin.id === pluginId);
      if (current) {
        if (current.enabled) await this.runtime.reloadPlugin(pluginId);
        return;
      }
      await this.runtime.installDirectory({ path: pluginPath, id: pluginId });
    } catch (error) {
      this.unifiedLogger.warn(
        { err: error, pluginId, pluginPath },
        "Plugin resources installed, but its runtime failed to start",
      );
    }
  }

  private requireRuntimePlugin(pluginId: string): PluginListItem {
    const plugin = this.runtime.listPlugins().find((entry) => entry.id === pluginId);
    if (!plugin) throw new Error(`Runtime plugin not found: ${pluginId}`);
    return plugin;
  }
}
