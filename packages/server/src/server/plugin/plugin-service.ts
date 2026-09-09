import { cpSync, existsSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type pino from "pino";
import {
  PluginStateSchema,
  type AlertTroubleshooterTask,
  type McpTransport,
  type PluginHttpServiceSummary,
  type PluginHttpListenerRuntime,
  type PluginHttpLocalAddress,
  type PluginHttpProjectConfig,
  type PluginHttpTestResponse,
  type PluginHttpTestTarget,
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
import { selectBundledPluginSyncs } from "./bundled-plugin-sync.js";
import {
  loadPluginMarketplace,
  type LoadedPluginMarketplace,
  type PluginMarketplaceEntry,
} from "./plugin-marketplace.js";
import { PluginStore, pluginAuthorName, type InstalledPluginRecord } from "./plugin-store.js";
import {
  PluginProjectBindingStore,
  type PluginProjectBinding,
  type PluginProjectSnapshot,
  type PluginProjectUpdate,
} from "./plugin-project-binding-store.js";

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

interface PluginProjectBindingCandidate {
  binding: PluginProjectBinding;
  timestamp: string;
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalText(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pluginJobKnowledge(input: Record<string, unknown>): string {
  const values: string[] = [];
  const projectKnowledge = readOptionalText(input, "plugin_project_knowledge");
  if (projectKnowledge) values.push(projectKnowledge);
  const stages = asRecord(input.stage_collaboration);
  for (const [stageId, rawStage] of Object.entries(stages)) {
    const knowledge = readOptionalText(asRecord(rawStage), "knowledge");
    if (knowledge) values.push(`${stageId}:\n${knowledge}`);
  }
  return [...new Set(values)].join("\n\n");
}

function isProjectJob(job: PluginHttpJob): boolean {
  if (!job.projectId) return false;
  const input = asRecord(job.input);
  return (
    job.status === "draft" ||
    readOptionalText(input, "flow_title", "plugin_project_name") !== null ||
    input.plugin_project === true
  );
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
  private readonly projectBindings: PluginProjectBindingStore;
  private readonly bundledMarketplacePaths: string[];
  private httpRuntime: PluginHttpServiceRuntime | null = null;
  private appRuntime: PluginAppRuntime | null = null;
  private appCredentialRuntime: {
    configure(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      data?: Record<string, unknown>;
      credentials?: Record<string, string>;
    }): Record<string, unknown> | undefined;
    delete?(input: { pluginId: string; appId: string; projectId: string }): void;
  } | null = null;
  private alertTroubleshooterRuntime: {
    enqueueRecord(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      uniqueId?: string;
      resultId?: string;
    }): Promise<boolean>;
    scanNow(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      lookbackMinutes: number;
      excludeRecentMinutes: number;
    }): Promise<{
      matchedCount: number;
      failureCount: number;
      auditFile: string | null;
    }>;
    listTasks(input: {
      pluginId: string;
      appId: string;
      projectId: string;
    }): AlertTroubleshooterTask[];
    pauseTasks(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      taskIds: readonly string[];
    }): Promise<string[]>;
    deleteTasks(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      taskIds: readonly string[];
    }): Promise<string[]>;
  } | null = null;
  private marketplaceStates: MarketplaceState[] = [];
  private catalogPlugins: CatalogPlugin[] = [];

  constructor(options: {
    paseoHome: string;
    logger: pino.Logger;
    mcpStore: McpStore;
    skillStore: SkillStore;
    bundledMarketplacePaths?: string[];
  }) {
    this.cacheRoot = path.join(options.paseoHome, "plugins", "cache");
    this.dataRoot = path.join(options.paseoHome, "plugins", "data");
    this.logger = options.logger.child({ module: "plugin-service" });
    this.mcpStore = options.mcpStore;
    this.skillStore = options.skillStore;
    this.store = new PluginStore(options.paseoHome);
    this.projectBindings = new PluginProjectBindingStore(
      path.join(options.paseoHome, "plugins", "project-bindings"),
    );
    this.bundledMarketplacePaths =
      options.bundledMarketplacePaths ?? bundledPluginMarketplaceCandidates();
  }

  initialize(): void {
    ensurePrivateDirectory(this.cacheRoot);
    ensurePrivateDirectory(this.dataRoot);
    this.projectBindings.initialize();
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
    this.syncBundledPluginUpdates();
    this.refresh();
  }

  getInstalledPackagePath(pluginId: string): string | null {
    return this.store.getInstalled(pluginId)?.cachePath ?? null;
  }

  async attachHttpRuntime(runtime: PluginHttpServiceRuntime): Promise<PluginState> {
    this.httpRuntime = runtime;
    await this.reconcileHttpServices();
    this.reconcileProjectBindings();
    return this.getState();
  }

  attachAppRuntime(runtime: PluginAppRuntime): void {
    this.appRuntime = runtime;
    this.reconcileProjectBindings();
  }

  attachAppCredentialRuntime(runtime: NonNullable<PluginService["appCredentialRuntime"]>): void {
    this.appCredentialRuntime = runtime;
  }

  attachAlertTroubleshooterRuntime(runtime: {
    enqueueRecord(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      uniqueId?: string;
      resultId?: string;
    }): Promise<boolean>;
    scanNow(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      lookbackMinutes: number;
      excludeRecentMinutes: number;
    }): Promise<{
      matchedCount: number;
      failureCount: number;
      auditFile: string | null;
    }>;
    listTasks(input: {
      pluginId: string;
      appId: string;
      projectId: string;
    }): AlertTroubleshooterTask[];
    pauseTasks(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      taskIds: readonly string[];
    }): Promise<string[]>;
    deleteTasks(input: {
      pluginId: string;
      appId: string;
      projectId: string;
      taskIds: readonly string[];
    }): Promise<string[]>;
  }): void {
    this.alertTroubleshooterRuntime = runtime;
  }

  enqueueAlertTroubleshooterRecord(input: {
    pluginId: string;
    appId: string;
    projectId: string;
    uniqueId?: string;
    resultId?: string;
  }): Promise<boolean> {
    if (!this.alertTroubleshooterRuntime) {
      throw new Error("自动排查运行时尚未就绪");
    }
    return this.alertTroubleshooterRuntime.enqueueRecord(input);
  }

  scanAlertTroubleshooterNow(input: {
    pluginId: string;
    appId: string;
    projectId: string;
    lookbackMinutes: number;
    excludeRecentMinutes: number;
  }): Promise<{
    matchedCount: number;
    failureCount: number;
    auditFile: string | null;
  }> {
    if (!this.alertTroubleshooterRuntime) {
      throw new Error("自动排查运行时尚未就绪");
    }
    return this.alertTroubleshooterRuntime.scanNow(input);
  }

  listAlertTroubleshooterTasks(input: {
    pluginId: string;
    appId: string;
    projectId: string;
  }): AlertTroubleshooterTask[] {
    if (!this.alertTroubleshooterRuntime) throw new Error("自动排查运行时尚未就绪");
    return this.alertTroubleshooterRuntime.listTasks(input);
  }

  pauseAlertTroubleshooterTasks(input: {
    pluginId: string;
    appId: string;
    projectId: string;
    taskIds: readonly string[];
  }): Promise<string[]> {
    if (!this.alertTroubleshooterRuntime) throw new Error("自动排查运行时尚未就绪");
    return this.alertTroubleshooterRuntime.pauseTasks(input);
  }

  deleteAlertTroubleshooterTasks(input: {
    pluginId: string;
    appId: string;
    projectId: string;
    taskIds: readonly string[];
  }): Promise<string[]> {
    if (!this.alertTroubleshooterRuntime) throw new Error("自动排查运行时尚未就绪");
    return this.alertTroubleshooterRuntime.deleteTasks(input);
  }

  getApp(pluginId: string, appId: string, projectId: string): PluginAppState {
    return this.requireAppRuntime().get(pluginId, appId, projectId);
  }

  configureApp(
    pluginId: string,
    appId: string,
    projectId: string,
    defaultAgent: PluginAppState["defaultAgent"],
    data?: Record<string, unknown>,
    credentials?: Record<string, string>,
  ): PluginAppState {
    if (!defaultAgent) throw new Error("Default Agent provider and model are required");
    this.assertProjectBindingAvailable(projectId, {
      kind: "app",
      pluginId,
      appId,
      pluginProjectId: this.appPluginProjectId(pluginId, appId, projectId),
    });
    const safeData =
      this.appCredentialRuntime?.configure({
        pluginId,
        appId,
        projectId,
        data,
        credentials,
      }) ?? data;
    const app = this.requireAppRuntime().configure({
      pluginId,
      appId,
      projectId,
      defaultAgent,
      ...(safeData ? { data: safeData } : {}),
    });
    this.claimAppProject(app);
    return app;
  }

  listAppProjects(pluginId: string, appId: string): PluginAppState[] {
    return this.requireAppRuntime().listProjects(pluginId, appId);
  }

  getAppHtmlPreview(
    pluginId: string,
    appId: string,
    projectId: string,
  ): { html: string; htmlPath: string } | null {
    return this.requireAppRuntime().getHtmlPreview(pluginId, appId, projectId);
  }

  async copyAppProject(
    pluginId: string,
    appId: string,
    sourceProjectId: string,
    targetProjectId: string,
  ): Promise<PluginAppState> {
    this.assertProjectBindingAvailable(targetProjectId, {
      kind: "app",
      pluginId,
      appId,
      pluginProjectId: this.appPluginProjectId(pluginId, appId, targetProjectId),
    });
    const appRuntime = this.requireAppRuntime();
    const app = appRuntime.copyProject({
      pluginId,
      appId,
      sourceProjectId,
      targetProjectId,
    });
    try {
      await this.httpRuntime?.copyProjectConfig?.(pluginId, sourceProjectId, targetProjectId);
      this.claimAppProject(app);
      return app;
    } catch (error) {
      appRuntime.deleteProject(pluginId, appId, targetProjectId);
      throw error;
    }
  }

  deleteAppProject(pluginId: string, appId: string, projectId: string): boolean {
    const deleted = this.requireAppRuntime().deleteProject(pluginId, appId, projectId);
    if (deleted) {
      this.appCredentialRuntime?.delete?.({ pluginId, appId, projectId });
      this.projectBindings.release(projectId, this.appPluginProjectId(pluginId, appId, projectId));
    }
    return deleted;
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

  async createAppJobDraft(
    pluginId: string,
    serviceName: string,
    projectId: string,
    input: unknown,
  ): Promise<PluginHttpJob> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    this.assertProjectBindingAvailable(projectId);
    const job = await this.httpRuntime.createDraft(pluginId, serviceName, projectId, input);
    try {
      this.claimJobProject(job);
      return job;
    } catch (error) {
      await this.httpRuntime.deleteJob(job.id);
      throw error;
    }
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

  async updateAppJob(processId: string, input: unknown): Promise<PluginHttpJob | null> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    const current = this.httpRuntime.getJob(processId);
    if (current?.projectId) {
      const nextProjectId = readOptionalText(asRecord(input), "projectId", "project_id");
      if (nextProjectId && nextProjectId !== current.projectId) {
        throw new Error("插件项目不能切换到其他 Project，请创建新的插件项目");
      }
    }
    return this.httpRuntime.updateJob(processId, input);
  }

  async deleteAppJob(processId: string): Promise<boolean> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    const current = this.httpRuntime.getJob(processId);
    const deleted = await this.httpRuntime.deleteJob(processId);
    if (deleted && current?.projectId) {
      this.projectBindings.release(current.projectId, current.id);
    }
    return deleted;
  }

  deleteAppJobs(processIds: string[]): Promise<{
    deleted: string[];
    skipped: Array<{ processId: string; reason: string }>;
  }> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    const projectsByProcessId = new Map(
      processIds.flatMap((processId) => {
        const job = this.httpRuntime?.getJob(processId);
        return job?.projectId ? [[processId, job.projectId] as const] : [];
      }),
    );
    return this.httpRuntime.deleteJobs(processIds).then((result) => {
      for (const processId of result.deleted) {
        const projectId = projectsByProcessId.get(processId);
        if (projectId) this.projectBindings.release(projectId, processId);
      }
      return result;
    });
  }

  getPluginProjectForProject(projectId: string): PluginProjectSnapshot | null {
    const binding = this.resolveProjectBinding(projectId);
    return binding ? this.snapshotForBinding(binding) : null;
  }

  async updatePluginProjectForProject(
    projectId: string,
    update: PluginProjectUpdate,
  ): Promise<PluginProjectSnapshot> {
    const binding = this.resolveProjectBinding(projectId);
    if (!binding) {
      throw new Error(`Project ${projectId} 未绑定插件项目`);
    }
    if (binding.kind === "app") {
      if (!binding.appId) throw new Error("插件项目缺少 appId");
      const updated = this.requireAppRuntime().updateProject(
        binding.pluginId,
        binding.appId,
        binding.projectId,
        update,
      );
      this.claimAppProject(updated);
    } else {
      if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
      const job = this.httpRuntime.getJob(binding.pluginProjectId);
      if (!job) throw new Error("插件项目不存在或已删除");
      const currentInput = asRecord(job.input);
      const updated = await this.httpRuntime.updateJob(job.id, {
        ...currentInput,
        ...update.data,
        ...(update.name?.trim() ? { flow_title: update.name.trim() } : {}),
        ...(update.knowledge !== undefined ? { plugin_project_knowledge: update.knowledge } : {}),
        projectId: binding.projectId,
      });
      if (!updated) throw new Error("插件项目信息更新失败");
      this.claimJobProject(updated);
    }
    const snapshot = this.snapshotForBinding(binding);
    if (!snapshot) throw new Error("插件项目信息更新后无法读取");
    return snapshot;
  }

  buildProjectAgentContext(projectId: string): string | null {
    const snapshot = this.getPluginProjectForProject(projectId);
    if (!snapshot) return null;
    return [
      "<paseo_plugin_project>",
      `This Project is bound to exactly one plugin project: ${snapshot.name}.`,
      `Plugin project ID: ${snapshot.pluginProjectId}`,
      `Plugin ID: ${snapshot.pluginId}`,
      snapshot.appId ? `Plugin app ID: ${snapshot.appId}` : null,
      snapshot.serviceName ? `Plugin service: ${snapshot.serviceName}` : null,
      "Use the get_plugin_project tool to inspect its current structured information.",
      "Use the update_plugin_project tool when the user's work changes plugin-project information or knowledge.",
      "Plugin-project knowledge:",
      snapshot.knowledge.trim() || "No plugin-project knowledge has been recorded.",
      "</paseo_plugin_project>",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
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

  getHttpLocalAddresses(): PluginHttpLocalAddress[] {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.getLocalAddresses();
  }

  testHttpProjectRoute(input: {
    pluginId: string;
    projectId: string;
    listenerId: string;
    target: PluginHttpTestTarget;
    body?: Record<string, unknown>;
  }): Promise<Omit<PluginHttpTestResponse, "requestId">> {
    if (!this.httpRuntime) throw new Error("Plugin HTTP runtime is not ready");
    return this.httpRuntime.testProjectRoute(input);
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
      ...this.bundledMarketplacePaths,
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
    const synced = this.installResolvedSource(sourcePath, marketplaceId);
    await this.reconcileHttpServices();
    this.refresh();
    const state = this.getState();
    const plugin =
      state.plugins.find((entry) => entry.pluginId === synced.id && entry.installed) ??
      this.installedSummary(synced);
    return { plugin, state };
  }

  private installResolvedSource(
    sourcePath: string,
    marketplaceId: string | undefined,
  ): InstalledPluginRecord {
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
    return synced;
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

  private syncBundledPluginUpdates(): void {
    const updates = selectBundledPluginSyncs({
      bundledMarketplacePaths: this.bundledMarketplacePaths,
      catalog: this.catalogPlugins.flatMap((entry) => {
        if (!entry.package || !entry.entry.installable || !entry.entry.sourcePath) return [];
        return [
          {
            marketplaceFilePath: entry.marketplace.filePath,
            marketplaceId: entry.marketplace.id,
            pluginName: entry.package.manifest.name,
            version: entry.package.manifest.version,
          },
        ];
      }),
      installed: this.store.listInstalled().map((entry) => ({
        pluginId: entry.id,
        marketplaceId: entry.marketplaceId,
        version: entry.manifest.version,
      })),
    });

    for (const update of updates) {
      const catalogPlugin = this.catalogPlugins.find(
        (entry) =>
          entry.marketplace.id === update.marketplaceId &&
          canonicalName(entry.entry.name) === canonicalName(update.pluginName),
      );
      if (!catalogPlugin?.entry.sourcePath) continue;
      try {
        const installed = this.installResolvedSource(
          catalogPlugin.entry.sourcePath,
          update.marketplaceId,
        );
        this.logger.info(
          {
            pluginId: installed.id,
            version: installed.manifest.version,
            marketplaceId: update.marketplaceId,
          },
          "Synchronized bundled plugin",
        );
      } catch (error) {
        this.logger.warn(
          {
            err: error,
            pluginName: update.pluginName,
            version: update.version,
            marketplaceId: update.marketplaceId,
          },
          "Failed to synchronize bundled plugin",
        );
      }
    }
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

  private appPluginProjectId(pluginId: string, appId: string, projectId: string): string {
    return `app:${pluginId}:${appId}:${projectId}`;
  }

  private claimAppProject(app: PluginAppState): PluginProjectBinding {
    if (!app.projectId) throw new Error("插件项目缺少 Project ID");
    return this.projectBindings.claim(
      {
        projectId: app.projectId,
        pluginProjectId: this.appPluginProjectId(app.pluginId, app.appId, app.projectId),
        pluginId: app.pluginId,
        kind: "app",
        appId: app.appId,
      },
      app.updatedAt,
    ).binding;
  }

  private claimJobProject(job: PluginHttpJob): PluginProjectBinding {
    if (!job.projectId) throw new Error("插件项目缺少 Project ID");
    return this.projectBindings.claim(
      {
        projectId: job.projectId,
        pluginProjectId: job.id,
        pluginId: job.pluginId,
        kind: "job",
        serviceName: job.serviceName,
      },
      job.endedAt ?? job.startedAt ?? job.createdAt,
    ).binding;
  }

  private assertProjectBindingAvailable(
    projectId: string,
    expected?: Pick<
      PluginProjectBinding,
      "kind" | "pluginId" | "appId" | "serviceName" | "pluginProjectId"
    >,
  ): void {
    const current = this.resolveProjectBinding(projectId);
    if (!current) return;
    const same =
      expected !== undefined &&
      current.kind === expected.kind &&
      current.pluginId === expected.pluginId &&
      current.appId === expected.appId &&
      current.serviceName === expected.serviceName &&
      current.pluginProjectId === expected.pluginProjectId;
    if (same) return;
    throw new Error(
      `Project ${projectId} 已绑定插件项目 ${current.pluginId}/${current.pluginProjectId}，一个 Project 只能绑定一个插件项目`,
    );
  }

  private resolveProjectBinding(projectId: string): PluginProjectBinding | null {
    const current = this.projectBindings.get(projectId);
    if (current && this.snapshotForBinding(current)) return current;
    if (current) this.projectBindings.release(projectId, current.pluginProjectId);
    this.reconcileProjectBindings(projectId);
    return this.projectBindings.get(projectId);
  }

  private reconcileProjectBindings(onlyProjectId?: string): void {
    const candidates = [
      ...this.collectAppProjectBindingCandidates(onlyProjectId),
      ...this.collectJobProjectBindingCandidates(onlyProjectId),
    ];
    const now = new Date().toISOString();
    candidates.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    for (const candidate of candidates) {
      if (this.projectBindings.get(candidate.binding.projectId)) continue;
      this.projectBindings.claim(
        {
          projectId: candidate.binding.projectId,
          pluginProjectId: candidate.binding.pluginProjectId,
          pluginId: candidate.binding.pluginId,
          kind: candidate.binding.kind,
          ...(candidate.binding.appId ? { appId: candidate.binding.appId } : {}),
          ...(candidate.binding.serviceName ? { serviceName: candidate.binding.serviceName } : {}),
        },
        candidate.binding.updatedAt || now,
      );
    }
  }

  private collectAppProjectBindingCandidates(
    onlyProjectId?: string,
  ): PluginProjectBindingCandidate[] {
    if (!this.appRuntime) return [];
    const candidates: PluginProjectBindingCandidate[] = [];
    for (const plugin of this.getState().plugins) {
      if (!plugin.installed || !plugin.enabled || !plugin.pluginId) continue;
      for (const app of plugin.apps) {
        candidates.push(
          ...this.readAppProjectBindingCandidates(plugin.pluginId, app.id, onlyProjectId),
        );
      }
    }
    return candidates;
  }

  private readAppProjectBindingCandidates(
    pluginId: string,
    appId: string,
    onlyProjectId?: string,
  ): PluginProjectBindingCandidate[] {
    if (!this.appRuntime) return [];
    try {
      return this.appRuntime.listProjects(pluginId, appId).flatMap((state) => {
        if (
          !state.projectId ||
          !state.defaultAgent ||
          (onlyProjectId !== undefined && state.projectId !== onlyProjectId)
        ) {
          return [];
        }
        return [
          {
            binding: {
              projectId: state.projectId,
              pluginProjectId: this.appPluginProjectId(
                state.pluginId,
                state.appId,
                state.projectId,
              ),
              pluginId: state.pluginId,
              kind: "app" as const,
              appId: state.appId,
              createdAt: state.createdAt,
              updatedAt: state.updatedAt,
            },
            timestamp: state.updatedAt,
          },
        ];
      });
    } catch (error) {
      this.logger.warn(
        { err: error, pluginId, appId },
        "Failed to inspect plugin app projects while reconciling bindings",
      );
      return [];
    }
  }

  private collectJobProjectBindingCandidates(
    onlyProjectId?: string,
  ): PluginProjectBindingCandidate[] {
    if (!this.httpRuntime) return [];
    return this.httpRuntime
      .listJobs({
        ...(onlyProjectId ? { projectId: onlyProjectId } : {}),
        limit: Number.MAX_SAFE_INTEGER,
      })
      .flatMap((job) => {
        if (!isProjectJob(job) || !job.projectId) return [];
        const timestamp = job.endedAt ?? job.startedAt ?? job.createdAt;
        return [
          {
            binding: {
              projectId: job.projectId,
              pluginProjectId: job.id,
              pluginId: job.pluginId,
              kind: "job" as const,
              serviceName: job.serviceName,
              createdAt: job.createdAt,
              updatedAt: timestamp,
            },
            timestamp,
          },
        ];
      });
  }

  private snapshotForBinding(binding: PluginProjectBinding): PluginProjectSnapshot | null {
    if (binding.kind === "app") {
      if (!binding.appId || !this.appRuntime) return null;
      let state: PluginAppState | undefined;
      try {
        state = this.appRuntime
          .listProjects(binding.pluginId, binding.appId)
          .find((candidate) => candidate.projectId === binding.projectId);
      } catch (error) {
        this.logger.warn(
          {
            err: error,
            pluginId: binding.pluginId,
            appId: binding.appId,
            projectId: binding.projectId,
          },
          "Failed to read bound plugin app project",
        );
        return null;
      }
      if (!state) return null;
      return {
        ...binding,
        name: state.name ?? state.document?.title?.trim() ?? binding.appId,
        knowledge: state.knowledge,
        data: state.data,
        updatedAt: state.updatedAt,
      };
    }
    if (!this.httpRuntime) return null;
    const job = this.httpRuntime.getJob(binding.pluginProjectId);
    if (!job || job.projectId !== binding.projectId) return null;
    const data = asRecord(job.input);
    return {
      ...binding,
      name:
        readOptionalText(data, "flow_title", "plugin_project_name", "title") ??
        `${binding.pluginId}/${binding.serviceName ?? "project"}`,
      knowledge: pluginJobKnowledge(data),
      data,
      updatedAt: job.endedAt ?? job.startedAt ?? job.createdAt,
    };
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
