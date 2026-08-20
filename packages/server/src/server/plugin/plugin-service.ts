import { cpSync, existsSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type pino from "pino";
import {
  PluginStateSchema,
  type McpTransport,
  type PluginHttpServiceSummary,
  type PluginHttpListenerRuntime,
  type PluginHttpProjectConfig,
  type PluginHttpJobStatus,
  type PluginAppDefinition,
  type PluginAppState,
  type PluginHttpJob,
  type PluginInstallSource,
  type PluginMarketplaceSummary,
  type PluginState,
  type PluginSummary,
} from "@getpaseo/protocol/messages";
import { ensurePrivateDirectory } from "../private-files.js";
import type { McpStore } from "../mcp/mcp-store.js";
import type { SkillStore } from "../skill/skill-store.js";
import {
  assertPluginTreeSafe,
  loadPluginPackage,
  type PluginHttpServiceDefinition,
  type LoadedPluginPackage,
} from "./plugin-package.js";
import type { PluginAppRuntime, PluginAppSubmitInput } from "./plugin-app-runtime-types.js";
import type {
  PluginHttpServiceBinding,
  PluginHttpServiceRuntime,
} from "./plugin-http-runtime-types.js";
import { bundledPluginMarketplaceCandidates } from "./bundled-plugin-marketplace.js";
import {
  loadPluginMarketplace,
  type LoadedPluginMarketplace,
  type PluginMarketplaceEntry,
} from "./plugin-marketplace.js";
import { PluginStore, pluginAuthorName, type InstalledPluginRecord } from "./plugin-store.js";

interface MarketplaceState {
  summary: PluginMarketplaceSummary;
  loaded: LoadedPluginMarketplace | null;
}

interface CatalogPlugin {
  marketplace: LoadedPluginMarketplace;
  entry: PluginMarketplaceEntry;
  package: LoadedPluginPackage | null;
  error: string | null;
}

interface ResolvedInstallSource {
  sourcePath: string;
  marketplaceId?: string;
}

interface SyncedResourceState {
  skillIds: string[];
  mcpServerIds: string[];
  skillEnabled: Record<string, boolean>;
  mcpEnabled: Record<string, boolean>;
}

function sanitizePathSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\w.-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 100) || "plugin"
  );
}

function canonicalName(value: string): string {
  return value.trim().toLowerCase();
}

function replacePluginVariables(value: string, pluginRoot: string, pluginData: string): string {
  return value
    .replaceAll("${PLUGIN_ROOT}", pluginRoot)
    .replaceAll("${PLUGIN_DATA}", pluginData)
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginRoot)
    .replaceAll("${CLAUDE_PLUGIN_DATA}", pluginData);
}

function expandMcpTransport(
  transport: McpTransport,
  pluginRoot: string,
  pluginData: string,
): McpTransport {
  if (transport.type === "stdio") {
    return {
      ...transport,
      command: replacePluginVariables(transport.command, pluginRoot, pluginData),
      args: transport.args?.map((entry) => replacePluginVariables(entry, pluginRoot, pluginData)),
      env: {
        PLUGIN_ROOT: pluginRoot,
        PLUGIN_DATA: pluginData,
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        CLAUDE_PLUGIN_DATA: pluginData,
        ...Object.fromEntries(
          Object.entries(transport.env ?? {}).map(([key, value]) => [
            key,
            replacePluginVariables(value, pluginRoot, pluginData),
          ]),
        ),
      },
    };
  }
  return {
    ...transport,
    url: replacePluginVariables(transport.url, pluginRoot, pluginData),
    headers: Object.fromEntries(
      Object.entries(transport.headers ?? {}).map(([key, value]) => [
        key,
        replacePluginVariables(value, pluginRoot, pluginData),
      ]),
    ),
  };
}

function findRepoMarketplaceCandidates(startPath: string): string[] {
  const candidates: string[] = [];
  let current = path.resolve(startPath);
  while (true) {
    candidates.push(
      path.join(current, ".agents", "plugins", "marketplace.json"),
      path.join(current, ".claude-plugin", "marketplace.json"),
    );
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return candidates;
}

function pluginDisplayName(pluginPackage: LoadedPluginPackage): string {
  return pluginPackage.manifest.interface?.displayName ?? pluginPackage.manifest.name;
}

function pluginDescription(pluginPackage: LoadedPluginPackage): string {
  return pluginPackage.manifest.interface?.shortDescription ?? pluginPackage.manifest.description;
}

function loadCatalogPlugin(
  marketplace: LoadedPluginMarketplace,
  entry: PluginMarketplaceEntry,
): CatalogPlugin {
  if (entry.sourceType !== "local" || !entry.sourcePath || !entry.installable) {
    return { marketplace, entry, package: null, error: entry.warning ?? null };
  }
  try {
    const pluginPackage = loadPluginPackage(entry.sourcePath);
    if (canonicalName(pluginPackage.manifest.name) === canonicalName(entry.name)) {
      return { marketplace, entry, package: pluginPackage, error: null };
    }
    return {
      marketplace,
      entry,
      package: null,
      error: `Marketplace entry ${entry.name} points to plugin ${pluginPackage.manifest.name}.`,
    };
  } catch (error) {
    return {
      marketplace,
      entry,
      package: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function hasSkippedResources(
  record: InstalledPluginRecord,
  pluginPackage: LoadedPluginPackage,
): boolean {
  return (
    record.skillIds.length < pluginPackage.skills.length ||
    record.mcpServerIds.length < pluginPackage.mcpServers.length
  );
}

function addSkippedResourceWarning(
  warnings: string[],
  record: InstalledPluginRecord | null,
  pluginPackage: LoadedPluginPackage | null,
): void {
  if (!record || !pluginPackage || !hasSkippedResources(record, pluginPackage)) return;
  warnings.push("Some bundled resources were skipped because their names are already in use.");
}

function staticHttpServiceSummary(
  definition: PluginHttpServiceDefinition,
): PluginHttpServiceSummary {
  return {
    name: definition.name,
    host: definition.host,
    configuredPort: definition.port,
    boundPort: null,
    path: definition.path,
    workflowPath: definition.workflowPath,
    status: "stopped",
    submitUrl: null,
    resultUrlTemplate: null,
    error: null,
  };
}

function catalogPackageSummary(
  catalogPlugin: CatalogPlugin,
  pluginPackage: LoadedPluginPackage,
  installed: InstalledPluginRecord | null,
  warnings: string[],
  httpServices: PluginHttpServiceSummary[],
): PluginSummary {
  const manifest = pluginPackage.manifest;
  const updateAvailable = installed !== null && installed.manifest.version !== manifest.version;
  return {
    id: `${catalogPlugin.marketplace.id}:${catalogPlugin.entry.name}`,
    ...(installed ? { pluginId: installed.id } : {}),
    name: manifest.name,
    displayName: pluginDisplayName(pluginPackage),
    version: manifest.version,
    description: pluginDescription(pluginPackage),
    developerName: manifest.interface?.developerName ?? pluginAuthorName(manifest),
    category: manifest.interface?.category ?? catalogPlugin.entry.category,
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    keywords: manifest.keywords ?? [],
    sourceType: catalogPlugin.entry.sourceType,
    sourcePath: catalogPlugin.entry.sourcePath,
    marketplaceId: catalogPlugin.marketplace.id,
    marketplaceName: catalogPlugin.marketplace.displayName,
    installed: installed !== null,
    enabled: installed?.enabled ?? false,
    installable: catalogPlugin.entry.installable,
    updateAvailable,
    skills: pluginPackage.skills.map((entry) => entry.name),
    mcpServers: pluginPackage.mcpServers.map((entry) => entry.name),
    httpServices,
    apps: pluginPackage.apps,
    unsupportedComponents: pluginPackage.unsupportedComponents,
    warnings,
    installedAt: installed?.installedAt,
    updatedAt: installed?.updatedAt,
  };
}

function unavailableCatalogSummary(
  catalogPlugin: CatalogPlugin,
  installed: InstalledPluginRecord | null,
  warnings: string[],
): PluginSummary {
  return {
    id: `${catalogPlugin.marketplace.id}:${catalogPlugin.entry.name}`,
    ...(installed ? { pluginId: installed.id } : {}),
    name: catalogPlugin.entry.name,
    displayName: catalogPlugin.entry.name,
    version: "Unavailable",
    description: "Plugin metadata could not be loaded.",
    category: catalogPlugin.entry.category,
    keywords: [],
    sourceType: catalogPlugin.entry.sourceType,
    sourcePath: catalogPlugin.entry.sourcePath,
    marketplaceId: catalogPlugin.marketplace.id,
    marketplaceName: catalogPlugin.marketplace.displayName,
    installed: installed !== null,
    enabled: installed?.enabled ?? false,
    installable: false,
    updateAvailable: false,
    skills: [],
    mcpServers: [],
    httpServices: [],
    apps: [],
    unsupportedComponents: [],
    warnings,
    installedAt: installed?.installedAt,
    updatedAt: installed?.updatedAt,
  };
}

function loadedInstalledSummary(
  record: InstalledPluginRecord,
  pluginPackage: LoadedPluginPackage,
  warnings: string[],
  httpServices: PluginHttpServiceSummary[],
): PluginSummary {
  const manifest = pluginPackage.manifest;
  return {
    id: `installed:${record.id}`,
    pluginId: record.id,
    name: manifest.name,
    displayName: pluginDisplayName(pluginPackage),
    version: manifest.version,
    description: pluginDescription(pluginPackage),
    developerName: manifest.interface?.developerName ?? pluginAuthorName(manifest),
    category: manifest.interface?.category,
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    keywords: manifest.keywords ?? [],
    sourceType: "local",
    sourcePath: record.sourcePath,
    marketplaceId: record.marketplaceId,
    installed: true,
    enabled: record.enabled,
    installable: false,
    updateAvailable: false,
    skills: pluginPackage.skills.map((entry) => entry.name),
    mcpServers: pluginPackage.mcpServers.map((entry) => entry.name),
    httpServices,
    apps: pluginPackage.apps,
    unsupportedComponents: pluginPackage.unsupportedComponents,
    warnings,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
  };
}

function fallbackInstalledSummary(
  record: InstalledPluginRecord,
  warnings: string[],
): PluginSummary {
  const manifest = record.manifest;
  return {
    id: `installed:${record.id}`,
    pluginId: record.id,
    name: manifest.name,
    displayName: manifest.interface?.displayName ?? manifest.name,
    version: manifest.version,
    description: manifest.interface?.shortDescription ?? manifest.description,
    developerName: manifest.interface?.developerName ?? pluginAuthorName(manifest),
    category: manifest.interface?.category,
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    keywords: manifest.keywords ?? [],
    sourceType: "local",
    sourcePath: record.sourcePath,
    marketplaceId: record.marketplaceId,
    installed: true,
    enabled: record.enabled,
    installable: false,
    updateAvailable: false,
    skills: [],
    mcpServers: [],
    httpServices: [],
    apps: [],
    unsupportedComponents: [],
    warnings,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
  };
}

export class PluginService {
  private readonly cacheRoot: string;
  private readonly dataRoot: string;
  private readonly logger: pino.Logger;
  private readonly mcpStore: McpStore;
  private readonly skillStore: SkillStore;
  private readonly store: PluginStore;
  private httpRuntime: PluginHttpServiceRuntime | null = null;
  private appRuntime: PluginAppRuntime | null = null;
  private marketplaceStates: MarketplaceState[] = [];
  private catalogPlugins: CatalogPlugin[] = [];

  constructor(options: {
    paseoHome: string;
    logger: pino.Logger;
    mcpStore: McpStore;
    skillStore: SkillStore;
  }) {
    this.cacheRoot = path.join(options.paseoHome, "plugins", "cache");
    this.dataRoot = path.join(options.paseoHome, "plugins", "data");
    this.logger = options.logger.child({ module: "plugin-service" });
    this.mcpStore = options.mcpStore;
    this.skillStore = options.skillStore;
    this.store = new PluginStore(options.paseoHome);
  }

  initialize(): void {
    ensurePrivateDirectory(this.cacheRoot);
    ensurePrivateDirectory(this.dataRoot);
    for (const installed of this.store.listInstalled()) {
      try {
        const pluginPackage = loadPluginPackage(installed.cachePath);
        this.store.upsertInstalled(this.syncPackageResources(installed, pluginPackage));
      } catch (error) {
        this.logger.warn(
          { err: error, pluginId: installed.id, cachePath: installed.cachePath },
          "Failed to restore installed plugin resources",
        );
      }
    }
    this.refresh();
  }

  async attachHttpRuntime(runtime: PluginHttpServiceRuntime): Promise<PluginState> {
    this.httpRuntime = runtime;
    await this.reconcileHttpServices();
    return this.getState();
  }

  attachAppRuntime(runtime: PluginAppRuntime): void {
    this.appRuntime = runtime;
  }

  getApp(pluginId: string, appId: string, projectId: string): PluginAppState {
    return this.requireAppRuntime().get(pluginId, appId, projectId);
  }

  configureApp(
    pluginId: string,
    appId: string,
    projectId: string,
    defaultAgent: PluginAppState["defaultAgent"],
  ): PluginAppState {
    if (!defaultAgent) throw new Error("Default Agent provider and model are required");
    return this.requireAppRuntime().configure({ pluginId, appId, projectId, defaultAgent });
  }

  listAppProjects(pluginId: string, appId: string): PluginAppState[] {
    return this.requireAppRuntime().listProjects(pluginId, appId);
  }

  deleteAppProject(pluginId: string, appId: string, projectId: string): boolean {
    return this.requireAppRuntime().deleteProject(pluginId, appId, projectId);
  }

  generateApp(
    pluginId: string,
    appId: string,
    projectId: string,
    prompt: string,
  ): Promise<PluginAppState> {
    return this.requireAppRuntime().generate({ pluginId, appId, projectId, prompt });
  }

  submitAppAction(input: PluginAppSubmitInput): Promise<PluginHttpJob> {
    return this.requireAppRuntime().submit(input);
  }

  submitHttpService(pluginId: string, serviceName: string, input: unknown): Promise<PluginHttpJob> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.submit(pluginId, serviceName, input);
  }

  createAppJobDraft(
    pluginId: string,
    serviceName: string,
    projectId: string,
    input: unknown,
  ): Promise<PluginHttpJob> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.createDraft(pluginId, serviceName, projectId, input);
  }

  startAppJob(processId: string): Promise<PluginHttpJob | null> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.startJob(processId);
  }

  getAppJob(processId: string): PluginHttpJob | null {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.getJob(processId);
  }

  listAppJobs(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
    statuses?: PluginHttpJobStatus[];
    listenerId?: string;
    routeId?: string;
    createdBefore?: string;
    createdAfter?: string;
  }): PluginHttpJob[] {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.listJobs(options);
  }

  updateAppJob(processId: string, input: unknown): Promise<PluginHttpJob | null> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.updateJob(processId, input);
  }

  deleteAppJob(processId: string): Promise<boolean> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.deleteJob(processId);
  }

  deleteAppJobs(processIds: string[]): Promise<{
    deleted: string[];
    skipped: Array<{ processId: string; reason: string }>;
  }> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.deleteJobs(processIds);
  }

  getHttpProjectConfig(
    pluginId: string,
    projectId: string,
  ): { config: PluginHttpProjectConfig; runtimes: PluginHttpListenerRuntime[] } {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.getProjectConfig(pluginId, projectId);
  }

  saveHttpProjectConfig(
    config: Omit<PluginHttpProjectConfig, "updatedAt">,
  ): Promise<{ config: PluginHttpProjectConfig; runtimes: PluginHttpListenerRuntime[] }> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.saveProjectConfig(config);
  }

  cleanupHttpProjectJobs(pluginId: string, projectId: string): Promise<string[]> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.cleanupProjectJobs(pluginId, projectId);
  }

  resolveAppContext(
    pluginId: string,
    appId: string,
  ): {
    definition: PluginAppDefinition;
    pluginRoot: string;
  } {
    const record = this.store.getInstalled(pluginId);
    if (!record) throw new Error(`Plugin is not installed: ${pluginId}`);
    if (!record.enabled) throw new Error(`Plugin is disabled: ${pluginId}`);
    const pluginPackage = loadPluginPackage(record.cachePath);
    const definition = pluginPackage.apps.find((entry) => entry.id === appId);
    if (!definition) throw new Error(`Plugin app is not declared: ${pluginId}/${appId}`);
    return { definition, pluginRoot: pluginPackage.root };
  }

  listEnabledHttpTargets(): Array<{ pluginId: string; serviceName: string }> {
    return this.enabledHttpServiceBindings().map((binding) => ({
      pluginId: binding.pluginId,
      serviceName: binding.definition.name,
    }));
  }

  refresh(): PluginState {
    const configured = this.store.listMarketplaces();
    const configuredIds = new Set(configured.map((entry) => entry.id));
    const candidates = [
      path.join(os.homedir(), ".agents", "plugins", "marketplace.json"),
      ...bundledPluginMarketplaceCandidates(),
      ...findRepoMarketplaceCandidates(process.cwd()),
      ...configured.map((entry) => entry.path),
    ];
    const seenFiles = new Set<string>();
    const states: MarketplaceState[] = [];
    const catalog: CatalogPlugin[] = [];

    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      let candidateKey = path.resolve(candidate);
      try {
        candidateKey = statSync(candidate).isFile() ? realpathSync(candidate) : candidateKey;
      } catch {
        // The loader below produces the user-facing error.
      }
      if (seenFiles.has(candidateKey)) continue;
      seenFiles.add(candidateKey);
      try {
        const marketplace = loadPluginMarketplace(candidate);
        const removable = configuredIds.has(marketplace.id);
        states.push({
          summary: {
            id: marketplace.id,
            name: marketplace.name,
            displayName: marketplace.displayName,
            path: marketplace.filePath,
            removable,
            pluginCount: marketplace.plugins.length,
            error: null,
          },
          loaded: marketplace,
        });
        for (const entry of marketplace.plugins) {
          catalog.push(loadCatalogPlugin(marketplace, entry));
        }
      } catch (error) {
        const configuredRecord = configured.find(
          (entry) => path.resolve(entry.path) === path.resolve(candidate),
        );
        if (!configuredRecord) continue;
        states.push({
          summary: {
            id: configuredRecord.id,
            name: path.basename(candidate),
            displayName: path.basename(candidate),
            path: candidate,
            removable: true,
            pluginCount: 0,
            error: error instanceof Error ? error.message : String(error),
          },
          loaded: null,
        });
      }
    }

    this.marketplaceStates = states.sort((a, b) =>
      a.summary.displayName.localeCompare(b.summary.displayName),
    );
    this.catalogPlugins = catalog;
    return this.getState();
  }

  getState(): PluginState {
    const installed = this.store.listInstalled();
    const summaries: PluginSummary[] = [];
    const representedInstalled = new Set<string>();

    for (const catalogPlugin of this.catalogPlugins) {
      const pluginPackage = catalogPlugin.package;
      const name = pluginPackage?.manifest.name ?? catalogPlugin.entry.name;
      const installedRecord = installed.find(
        (entry) =>
          canonicalName(entry.id) === canonicalName(name) &&
          entry.marketplaceId === catalogPlugin.marketplace.id,
      );
      if (installedRecord) representedInstalled.add(installedRecord.id);
      summaries.push(this.catalogSummary(catalogPlugin, installedRecord ?? null));
    }

    for (const record of installed) {
      if (representedInstalled.has(record.id)) continue;
      summaries.push(this.installedSummary(record));
    }

    return PluginStateSchema.parse({
      plugins: summaries.sort((a, b) => {
        if (a.installed !== b.installed) return a.installed ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      }),
      marketplaces: this.marketplaceStates.map((entry) => entry.summary),
    });
  }

  addMarketplace(inputPath: string): { marketplace: PluginMarketplaceSummary; state: PluginState } {
    const marketplace = loadPluginMarketplace(inputPath);
    this.store.upsertMarketplace({
      id: marketplace.id,
      path: marketplace.filePath,
      addedAt: Date.now(),
    });
    const state = this.refresh();
    const summary =
      state.marketplaces.find((entry) => entry.id === marketplace.id) ??
      ({
        id: marketplace.id,
        name: marketplace.name,
        displayName: marketplace.displayName,
        path: marketplace.filePath,
        removable: true,
        pluginCount: marketplace.plugins.length,
        error: null,
      } satisfies PluginMarketplaceSummary);
    return { marketplace: summary, state };
  }

  removeMarketplace(marketplaceId: string): { ok: boolean; state: PluginState } {
    const ok = this.store.removeMarketplace(marketplaceId);
    return { ok, state: this.refresh() };
  }

  async install(
    source: PluginInstallSource,
  ): Promise<{ plugin: PluginSummary; state: PluginState }> {
    const { sourcePath, marketplaceId } = this.resolveInstallSource(source);
    const sourcePackage = loadPluginPackage(sourcePath);
    assertPluginTreeSafe(sourcePackage.root);
    const existing = this.store.getInstalled(sourcePackage.manifest.name);
    this.assertCompatibleExistingSource(existing, sourcePackage, marketplaceId);
    const cachePath = this.copyIntoCache(sourcePackage, marketplaceId);
    const cachedPackage = loadPluginPackage(cachePath);
    const baseRecord = this.createInstalledRecord(
      sourcePackage,
      cachedPackage,
      cachePath,
      marketplaceId,
      existing,
    );
    const synced = this.syncPackageResources(baseRecord, cachedPackage);
    this.store.upsertInstalled(synced);
    if (existing && path.resolve(existing.cachePath) !== path.resolve(synced.cachePath)) {
      rmSync(existing.cachePath, { recursive: true, force: true });
    }
    await this.reconcileHttpServices();
    this.refresh();
    const state = this.getState();
    const plugin =
      state.plugins.find((entry) => entry.pluginId === synced.id && entry.installed) ??
      this.installedSummary(synced);
    return { plugin, state };
  }

  async setEnabled(
    pluginId: string,
    enabled: boolean,
  ): Promise<{ plugin: PluginSummary; state: PluginState }> {
    const record = this.store.getInstalled(pluginId);
    if (!record) throw new Error("Plugin not found");
    const skillEnabled = { ...record.skillEnabled };
    const mcpEnabled = { ...record.mcpEnabled };
    const ownedSkills = this.skillStore.list().filter((skill) => skill.pluginId === pluginId);
    const ownedMcpServers = this.mcpStore.list().filter((server) => server.pluginId === pluginId);

    if (!enabled) {
      for (const skill of ownedSkills) skillEnabled[skill.name] = skill.enabled;
      for (const server of ownedMcpServers) mcpEnabled[server.name] = server.enabled;
    }
    for (const skill of ownedSkills) {
      this.skillStore.update({
        id: skill.id,
        enabled: enabled ? (skillEnabled[skill.name] ?? true) : false,
      });
    }
    for (const server of ownedMcpServers) {
      this.mcpStore.update({
        id: server.id,
        enabled: enabled ? (mcpEnabled[server.name] ?? true) : false,
      });
    }

    const updated = this.store.upsertInstalled({
      ...record,
      enabled,
      skillEnabled,
      mcpEnabled,
      updatedAt: Date.now(),
    });
    await this.reconcileHttpServices();
    const state = this.getState();
    return {
      plugin:
        state.plugins.find((entry) => entry.pluginId === updated.id && entry.installed) ??
        this.installedSummary(updated),
      state,
    };
  }

  async uninstall(pluginId: string): Promise<{ ok: boolean; state: PluginState }> {
    const record = this.store.getInstalled(pluginId);
    if (!record) return { ok: false, state: this.getState() };
    for (const skill of this.skillStore.list()) {
      if (skill.pluginId === pluginId) this.skillStore.delete(skill.id);
    }
    for (const server of this.mcpStore.list()) {
      if (server.pluginId === pluginId) this.mcpStore.delete(server.id);
    }
    const ok = this.store.removeInstalled(pluginId);
    await this.reconcileHttpServices();
    rmSync(record.cachePath, { recursive: true, force: true });
    this.refresh();
    return { ok, state: this.getState() };
  }

  private copyIntoCache(
    pluginPackage: LoadedPluginPackage,
    marketplaceId: string | undefined,
  ): string {
    const sourceBucket = sanitizePathSegment(marketplaceId ?? "local");
    const pluginBucket = sanitizePathSegment(pluginPackage.manifest.name);
    const versionBucket = sanitizePathSegment(pluginPackage.manifest.version);
    const destination = path.join(this.cacheRoot, sourceBucket, pluginBucket, versionBucket);
    if (path.resolve(pluginPackage.root) === path.resolve(destination)) return destination;
    ensurePrivateDirectory(path.dirname(destination));
    const temporary = path.join(path.dirname(destination), `.${versionBucket}.${randomUUID()}.tmp`);
    try {
      cpSync(pluginPackage.root, temporary, { recursive: true });
      loadPluginPackage(temporary);
      rmSync(destination, { recursive: true, force: true });
      renameSync(temporary, destination);
      return destination;
    } catch (error) {
      rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  private resolveInstallSource(source: PluginInstallSource): ResolvedInstallSource {
    if (source.type === "local") return { sourcePath: path.resolve(source.path) };
    const catalogPlugin = this.catalogPlugins.find(
      (entry) =>
        entry.marketplace.id === source.marketplaceId &&
        canonicalName(entry.entry.name) === canonicalName(source.pluginName),
    );
    if (!catalogPlugin) throw new Error("Marketplace plugin not found");
    if (!catalogPlugin.entry.installable || !catalogPlugin.entry.sourcePath) {
      throw new Error(catalogPlugin.entry.warning ?? "This marketplace plugin cannot be installed");
    }
    if (catalogPlugin.error || !catalogPlugin.package) {
      throw new Error(catalogPlugin.error ?? "Plugin metadata could not be loaded");
    }
    return {
      sourcePath: catalogPlugin.entry.sourcePath,
      marketplaceId: catalogPlugin.marketplace.id,
    };
  }

  private assertCompatibleExistingSource(
    existing: InstalledPluginRecord | null,
    sourcePackage: LoadedPluginPackage,
    marketplaceId: string | undefined,
  ): void {
    if (!existing) return;
    const sameMarketplace = existing.marketplaceId === marketplaceId;
    const samePath = path.resolve(existing.sourcePath) === path.resolve(sourcePackage.root);
    if (sameMarketplace || samePath) return;
    throw new Error(
      `Plugin ${sourcePackage.manifest.name} is already installed from another source`,
    );
  }

  private createInstalledRecord(
    sourcePackage: LoadedPluginPackage,
    cachedPackage: LoadedPluginPackage,
    cachePath: string,
    marketplaceId: string | undefined,
    existing: InstalledPluginRecord | null,
  ): InstalledPluginRecord {
    const timestamp = Date.now();
    return {
      id: cachedPackage.manifest.name,
      ...(marketplaceId ? { marketplaceId } : {}),
      sourcePath: sourcePackage.root,
      cachePath,
      manifest: cachedPackage.manifest,
      enabled: existing?.enabled ?? true,
      skillIds: existing?.skillIds ?? [],
      mcpServerIds: existing?.mcpServerIds ?? [],
      skillEnabled: existing?.skillEnabled ?? {},
      mcpEnabled: existing?.mcpEnabled ?? {},
      installedAt: existing?.installedAt ?? timestamp,
      updatedAt: timestamp,
    };
  }

  private syncPackageResources(
    record: InstalledPluginRecord,
    pluginPackage: LoadedPluginPackage,
  ): InstalledPluginRecord {
    const pluginData = path.join(this.dataRoot, sanitizePathSegment(record.id));
    ensurePrivateDirectory(pluginData);
    const state: SyncedResourceState = {
      skillIds: [],
      mcpServerIds: [],
      skillEnabled: { ...record.skillEnabled },
      mcpEnabled: { ...record.mcpEnabled },
    };
    this.syncSkills(record, pluginPackage, state);
    this.syncMcpServers(record, pluginPackage, pluginData, state);
    this.removeStaleResources(record.id, state);
    return {
      ...record,
      manifest: pluginPackage.manifest,
      skillIds: state.skillIds,
      mcpServerIds: state.mcpServerIds,
      skillEnabled: state.skillEnabled,
      mcpEnabled: state.mcpEnabled,
      updatedAt: Date.now(),
    };
  }

  private syncSkills(
    record: InstalledPluginRecord,
    pluginPackage: LoadedPluginPackage,
    state: SyncedResourceState,
  ): void {
    for (const skillDefinition of pluginPackage.skills) {
      const skill = this.skillStore.upsertImported({
        ...skillDefinition,
        source: "marketplace",
        tags: ["plugin", `plugin:${record.id}`],
        enabled: record.enabled ? (state.skillEnabled[skillDefinition.name] ?? true) : false,
        pluginId: record.id,
        pluginName: pluginDisplayName(pluginPackage),
      });
      if (skill.pluginId !== record.id) continue;
      state.skillIds.push(skill.id);
      if (!record.enabled && skill.enabled) {
        this.skillStore.update({ id: skill.id, enabled: false });
      } else if (record.enabled) {
        state.skillEnabled[skill.name] = skill.enabled;
      }
    }
  }

  private syncMcpServers(
    record: InstalledPluginRecord,
    pluginPackage: LoadedPluginPackage,
    pluginData: string,
    state: SyncedResourceState,
  ): void {
    for (const mcpDefinition of pluginPackage.mcpServers) {
      const transport = expandMcpTransport(mcpDefinition.transport, pluginPackage.root, pluginData);
      const server = this.mcpStore.upsertImported({
        name: mcpDefinition.name,
        description: mcpDefinition.description,
        enabled: record.enabled ? (state.mcpEnabled[mcpDefinition.name] ?? true) : false,
        transport,
        pluginId: record.id,
        pluginName: pluginDisplayName(pluginPackage),
        originalJson: JSON.stringify(
          {
            __paseoImported: true,
            __paseoPlugin: { id: record.id, name: pluginDisplayName(pluginPackage) },
            mcpServers: {
              [mcpDefinition.name]: {
                ...mcpDefinition.rawConfig,
                ...transport,
              },
            },
          },
          null,
          2,
        ),
      });
      if (server.pluginId !== record.id) continue;
      state.mcpServerIds.push(server.id);
      if (!record.enabled && server.enabled) {
        this.mcpStore.update({ id: server.id, enabled: false });
      } else if (record.enabled) {
        state.mcpEnabled[server.name] = server.enabled;
      }
    }
  }

  private removeStaleResources(pluginId: string, state: SyncedResourceState): void {
    for (const skill of this.skillStore.list()) {
      if (skill.pluginId === pluginId && !state.skillIds.includes(skill.id)) {
        this.skillStore.delete(skill.id);
      }
    }
    for (const server of this.mcpStore.list()) {
      if (server.pluginId === pluginId && !state.mcpServerIds.includes(server.id)) {
        this.mcpStore.delete(server.id);
      }
    }
  }

  private async reconcileHttpServices(): Promise<void> {
    if (!this.httpRuntime) return;
    await this.httpRuntime.reconcile(this.enabledHttpServiceBindings());
  }

  private requireAppRuntime(): PluginAppRuntime {
    if (!this.appRuntime) throw new Error("Plugin app runtime is not ready");
    return this.appRuntime;
  }

  private enabledHttpServiceBindings(): PluginHttpServiceBinding[] {
    const bindings: PluginHttpServiceBinding[] = [];
    for (const record of this.store.listInstalled()) {
      if (!record.enabled) continue;
      try {
        const pluginPackage = loadPluginPackage(record.cachePath);
        for (const definition of pluginPackage.httpServices) {
          bindings.push({
            pluginId: record.id,
            pluginName: pluginDisplayName(pluginPackage),
            definition,
          });
        }
      } catch (error) {
        this.logger.warn(
          { err: error, pluginId: record.id },
          "Skipping plugin HTTP services because the package could not be loaded",
        );
      }
    }
    return bindings;
  }

  private httpServiceSummaries(
    record: InstalledPluginRecord | null,
    pluginPackage: LoadedPluginPackage,
  ): PluginHttpServiceSummary[] {
    return pluginPackage.httpServices.map((definition) => {
      if (!record) return staticHttpServiceSummary(definition);
      return (
        this.httpRuntime?.getStatus(record.id, definition.name) ??
        staticHttpServiceSummary(definition)
      );
    });
  }

  private catalogSummary(
    catalogPlugin: CatalogPlugin,
    installed: InstalledPluginRecord | null,
  ): PluginSummary {
    const pluginPackage = catalogPlugin.package;
    const warnings = [
      ...(catalogPlugin.entry.warning ? [catalogPlugin.entry.warning] : []),
      ...(catalogPlugin.error ? [catalogPlugin.error] : []),
      ...(pluginPackage?.warnings ?? []),
    ];
    addSkippedResourceWarning(warnings, installed, pluginPackage);
    if (!pluginPackage) return unavailableCatalogSummary(catalogPlugin, installed, warnings);
    return catalogPackageSummary(
      catalogPlugin,
      pluginPackage,
      installed,
      warnings,
      this.httpServiceSummaries(installed, pluginPackage),
    );
  }

  private installedSummary(record: InstalledPluginRecord): PluginSummary {
    let pluginPackage: LoadedPluginPackage | null = null;
    const warnings: string[] = [];
    try {
      pluginPackage = loadPluginPackage(record.cachePath);
      warnings.push(...pluginPackage.warnings);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
    addSkippedResourceWarning(warnings, record, pluginPackage);
    if (!pluginPackage) return fallbackInstalledSummary(record, warnings);
    return loadedInstalledSummary(
      record,
      pluginPackage,
      warnings,
      this.httpServiceSummaries(record, pluginPackage),
    );
  }
}
