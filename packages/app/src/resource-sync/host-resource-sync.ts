import equal from "fast-deep-equal";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  Assistant,
  LocalResourceApplyResult,
  LocalResourceExistingPolicy,
  LocalResourceMissingPolicy,
  LocalResourceSnapshot,
  McpServer,
  PaseoConfigRaw,
  PaseoConfigRevision,
  PaseoHostKnowledge,
  PaseoProjectKnowledge,
  PluginSummary,
  Skill,
} from "@getpaseo/protocol/messages";

export type HostResourceSyncKind = "skills" | "mcp" | "plugins" | "assistants" | "knowledge";

export type KnowledgeSyncTarget =
  | { scope: "global" }
  | { scope: "project"; projectId: string; repoRoot: string }
  | { scope: "assistant"; assistantId: string; assistantName: string };

export interface ResourceSyncHost {
  serverId: string;
  label: string;
  client: DaemonClient;
  knowledgeTarget?: KnowledgeSyncTarget;
}

export interface ResourceSyncStats {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  localCreated: number;
  localUpdated: number;
  localSkipped: number;
  localConflicts: number;
  bytesTransferred: number;
  failures: string[];
}

export interface LocalContentSyncPolicy {
  missing: LocalResourceMissingPolicy;
  existing: LocalResourceExistingPolicy;
}

export interface ResourceSyncDirectionResult extends ResourceSyncStats {
  kind: HostResourceSyncKind;
  sourceServerId: string;
  targetServerId: string;
}

export interface TwoWayResourceSyncResult {
  firstToSecond: ResourceSyncDirectionResult;
  secondToFirst: ResourceSyncDirectionResult;
}

interface AssistantSyncItem {
  assistant: Assistant;
  selectedMcpNames: string[];
  selectedSkillNames: string[];
}

interface LocalContentSnapshot {
  source: string;
  resolvedPath: string;
  snapshot: LocalResourceSnapshot | null;
  error: string | null;
}

interface KnowledgeLocalContentSnapshot extends LocalContentSnapshot {
  section: "general" | "standards" | "projectSpecific";
  type: "local-directory" | "local-document";
}

interface KnowledgeSnapshot {
  knowledge: PaseoHostKnowledge | PaseoProjectKnowledge;
  target: KnowledgeSyncTarget;
  localContent: KnowledgeLocalContentSnapshot[];
  projectConfig?: PaseoConfigRaw;
  projectRevision?: PaseoConfigRevision | null;
  assistant?: Assistant;
}

interface PluginSyncItem {
  plugin: PluginSummary;
  localContent?: LocalContentSnapshot;
}

type ResourceSnapshot =
  | { kind: "skills"; items: Skill[] }
  | { kind: "mcp"; items: McpServer[] }
  | { kind: "plugins"; items: PluginSyncItem[] }
  | { kind: "assistants"; items: AssistantSyncItem[] }
  | { kind: "knowledge"; value: KnowledgeSnapshot };

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function emptyStats(scanned: number): ResourceSyncStats {
  return {
    scanned,
    created: 0,
    updated: 0,
    skipped: 0,
    localCreated: 0,
    localUpdated: 0,
    localSkipped: 0,
    localConflicts: 0,
    bytesTransferred: 0,
    failures: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireResult<T>(
  result: { error: string | null } & Record<string, unknown>,
  key: string,
  fallback: string,
): T {
  if (result.error) throw new Error(result.error);
  const value = result[key];
  if (!value) throw new Error(fallback);
  return value as T;
}

async function readAssistantSnapshot(client: DaemonClient): Promise<AssistantSyncItem[]> {
  const [assistantResult, mcpResult, skillResult] = await Promise.all([
    client.listAssistants(),
    client.listMcpServers(),
    client.listSkills(),
  ]);
  if (assistantResult.error) throw new Error(assistantResult.error);
  if (mcpResult.error) throw new Error(mcpResult.error);
  if (skillResult.error) throw new Error(skillResult.error);
  const mcpNames = new Map(mcpResult.servers.map((server) => [server.id, server.name]));
  const skillNames = new Map(skillResult.skills.map((skill) => [skill.id, skill.name]));
  return assistantResult.assistants.map((assistant) => ({
    assistant,
    selectedMcpNames: assistant.resourceSelection.selectedMcpServerIds.flatMap((id) => {
      const name = mcpNames.get(id);
      return name ? [name] : [];
    }),
    selectedSkillNames: assistant.resourceSelection.selectedSkillIds.flatMap((id) => {
      const name = skillNames.get(id);
      return name ? [name] : [];
    }),
  }));
}

function isAbsoluteLocalPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value === "~" ||
    value.startsWith("~/") ||
    value.startsWith("~\\")
  );
}

function joinLocalPath(base: string, value: string): string {
  if (isAbsoluteLocalPath(value)) return value;
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${separator}${value.replace(/^[\\/]+/, "")}`;
}

function resolveKnowledgeLocalPath(target: KnowledgeSyncTarget, source: string): string {
  const value = source.trim();
  if (isAbsoluteLocalPath(value)) return value;
  if (target.scope === "global") return joinLocalPath("~/.paseo", value);
  if (target.scope === "project") return joinLocalPath(target.repoRoot, value);
  return joinLocalPath(`~/.paseo/assistants/${target.assistantId}`, value);
}

async function exportLocalContent(
  client: DaemonClient,
  source: string,
  resolvedPath: string,
): Promise<LocalContentSnapshot> {
  try {
    const result = await client.exportLocalResource({ path: resolvedPath });
    if (result.error || !result.snapshot) {
      throw new Error(result.error ?? "未返回本地资源快照");
    }
    return { source, resolvedPath, snapshot: result.snapshot, error: null };
  } catch (error) {
    return { source, resolvedPath, snapshot: null, error: errorMessage(error) };
  }
}

async function readKnowledgeLocalContent(
  client: DaemonClient,
  target: KnowledgeSyncTarget,
  knowledge: PaseoHostKnowledge | PaseoProjectKnowledge,
): Promise<KnowledgeLocalContentSnapshot[]> {
  const projectKnowledge = knowledge as PaseoProjectKnowledge;
  const sections = [
    ["general", knowledge.general],
    ["standards", knowledge.standards],
    ["projectSpecific", projectKnowledge.projectSpecific],
  ] as const;
  const resources = sections.flatMap(([section, entries]) =>
    (entries ?? []).flatMap((entry) =>
      entry.type === "local-directory" || entry.type === "local-document"
        ? [{ section, type: entry.type, source: entry.source.trim() }]
        : [],
    ),
  );
  const snapshotsByPath = new Map<string, Promise<LocalContentSnapshot>>();
  return Promise.all(
    resources.map(async (resource) => {
      const resolvedPath = resolveKnowledgeLocalPath(target, resource.source);
      let snapshot = snapshotsByPath.get(resolvedPath);
      if (!snapshot) {
        snapshot = exportLocalContent(client, resource.source, resolvedPath);
        snapshotsByPath.set(resolvedPath, snapshot);
      }
      const content = await snapshot;
      return {
        source: resource.source,
        resolvedPath: content.resolvedPath,
        snapshot: content.snapshot,
        error: content.error,
        section: resource.section,
        type: resource.type,
      };
    }),
  );
}

async function readKnowledgeSnapshot(
  host: ResourceSyncHost,
  captureLocalContent: boolean,
): Promise<KnowledgeSnapshot> {
  const target = host.knowledgeTarget;
  if (!target) throw new Error("未指定知识同步范围");
  if (target.scope === "global") {
    const response = await host.client.getDaemonConfig();
    const knowledge = response.config.knowledge ?? {};
    return {
      target,
      knowledge,
      localContent: captureLocalContent
        ? await readKnowledgeLocalContent(host.client, target, knowledge)
        : [],
    };
  }
  if (target.scope === "project") {
    const response = await host.client.readProjectConfig(
      target.repoRoot,
      undefined,
      target.projectId,
    );
    if (!response.ok) {
      throw new Error(`无法读取 Project ${target.projectId} 的知识`);
    }
    const knowledge = response.config?.project?.knowledge ?? {};
    return {
      target,
      knowledge,
      localContent: captureLocalContent
        ? await readKnowledgeLocalContent(host.client, target, knowledge)
        : [],
      projectConfig: response.config ?? {},
      projectRevision: response.revision,
    };
  }
  const response = await host.client.listAssistants();
  if (response.error) throw new Error(response.error);
  const normalizedName = normalizeName(target.assistantName);
  const assistant =
    response.assistants.find((entry) => entry.id === target.assistantId) ??
    response.assistants.find((entry) => normalizeName(entry.name) === normalizedName);
  if (!assistant) {
    throw new Error(`目标主机没有助手“${target.assistantName || target.assistantId}”`);
  }
  const resolvedTarget: KnowledgeSyncTarget = {
    ...target,
    assistantId: assistant.id,
  };
  const knowledge = assistant.knowledge ?? {};
  return {
    target: resolvedTarget,
    knowledge,
    localContent: captureLocalContent
      ? await readKnowledgeLocalContent(host.client, resolvedTarget, knowledge)
      : [],
    assistant,
  };
}

function localPluginPath(plugin: PluginSummary): string | null {
  if (plugin.marketplaceId || plugin.runtime?.source === "git" || plugin.runtime?.remote) {
    return null;
  }
  return plugin.sourcePath ?? plugin.runtime?.path ?? null;
}

async function readPluginSnapshot(
  client: DaemonClient,
  plugins: readonly PluginSummary[],
): Promise<PluginSyncItem[]> {
  return Promise.all(
    plugins.map(async (plugin) => {
      const sourcePath = localPluginPath(plugin);
      return sourcePath
        ? { plugin, localContent: await exportLocalContent(client, sourcePath, sourcePath) }
        : { plugin };
    }),
  );
}

async function readSnapshot(
  host: ResourceSyncHost,
  kind: HostResourceSyncKind,
  captureLocalContent: boolean,
): Promise<ResourceSnapshot> {
  switch (kind) {
    case "skills": {
      const result = await host.client.listSkills();
      if (result.error) throw new Error(result.error);
      return {
        kind,
        items: result.skills.filter((skill) => skill.source === "user"),
      };
    }
    case "mcp": {
      const result = await host.client.listMcpServers();
      if (result.error) throw new Error(result.error);
      return {
        kind,
        items: result.servers.filter((server) => !server.builtin && !server.pluginId),
      };
    }
    case "plugins": {
      const result = await host.client.listUnifiedPlugins();
      if (result.error) throw new Error(result.error);
      return {
        kind,
        items: captureLocalContent
          ? await readPluginSnapshot(
              host.client,
              result.plugins.filter((plugin) => plugin.installed),
            )
          : result.plugins.filter((plugin) => plugin.installed).map((plugin) => ({ plugin })),
      };
    }
    case "assistants":
      return { kind, items: await readAssistantSnapshot(host.client) };
    case "knowledge":
      return { kind, value: await readKnowledgeSnapshot(host, captureLocalContent) };
  }
}

function findByIdOrName<T extends { id: string; name: string }>(
  items: readonly T[],
  source: T,
): T | undefined {
  const normalizedName = normalizeName(source.name);
  return (
    items.find((item) => item.id === source.id) ??
    items.find((item) => normalizeName(item.name) === normalizedName)
  );
}

async function mergeSkills(
  target: ResourceSyncHost,
  sourceItems: readonly Skill[],
  targetItems: readonly Skill[],
): Promise<ResourceSyncStats> {
  const stats = emptyStats(sourceItems.length);
  for (const source of sourceItems) {
    const existing = findByIdOrName(targetItems, source);
    try {
      if (!existing) {
        const created = requireResult<Skill>(
          await target.client.createSkill({
            name: source.name,
            description: source.description,
            content: source.content ?? "",
            tags: source.tags,
          }),
          "skill",
          `无法创建技能 ${source.name}`,
        );
        if (!source.enabled) {
          requireResult<Skill>(
            await target.client.updateSkill({ id: created.id, enabled: false }),
            "skill",
            `无法禁用技能 ${source.name}`,
          );
        }
        stats.created += 1;
        continue;
      }
      const sourceData = {
        name: source.name,
        description: source.description,
        content: source.content ?? "",
        enabled: source.enabled,
        tags: source.tags ?? [],
      };
      const targetData = {
        name: existing.name,
        description: existing.description,
        content: existing.content ?? "",
        enabled: existing.enabled,
        tags: existing.tags ?? [],
      };
      if (source.updatedAt <= existing.updatedAt || equal(sourceData, targetData)) {
        stats.skipped += 1;
        continue;
      }
      requireResult<Skill>(
        await target.client.updateSkill({ id: existing.id, ...sourceData }),
        "skill",
        `无法更新技能 ${source.name}`,
      );
      stats.updated += 1;
    } catch (error) {
      stats.failures.push(`${source.name}：${errorMessage(error)}`);
    }
  }
  return stats;
}

async function mergeMcp(
  target: ResourceSyncHost,
  sourceItems: readonly McpServer[],
  targetItems: readonly McpServer[],
): Promise<ResourceSyncStats> {
  const stats = emptyStats(sourceItems.length);
  for (const source of sourceItems) {
    const existing = findByIdOrName(targetItems, source);
    try {
      if (!existing) {
        requireResult<McpServer>(
          await target.client.createMcpServer({
            name: source.name,
            description: source.description,
            enabled: source.enabled,
            transport: source.transport,
            originalJson: source.originalJson,
          }),
          "server",
          `无法创建 MCP 服务 ${source.name}`,
        );
        stats.created += 1;
        continue;
      }
      const sourceData = {
        name: source.name,
        description: source.description,
        enabled: source.enabled,
        transport: source.transport,
        originalJson: source.originalJson,
      };
      const targetData = {
        name: existing.name,
        description: existing.description,
        enabled: existing.enabled,
        transport: existing.transport,
        originalJson: existing.originalJson,
      };
      if (source.updatedAt <= existing.updatedAt || equal(sourceData, targetData)) {
        stats.skipped += 1;
        continue;
      }
      requireResult<McpServer>(
        await target.client.updateMcpServer({ id: existing.id, ...sourceData }),
        "server",
        `无法更新 MCP 服务 ${source.name}`,
      );
      stats.updated += 1;
    } catch (error) {
      stats.failures.push(`${source.name}：${errorMessage(error)}`);
    }
  }
  return stats;
}

function mapAssistantResourceSelection(
  item: AssistantSyncItem,
  targetMcp: readonly McpServer[],
  targetSkills: readonly Skill[],
): Assistant["resourceSelection"] {
  if (item.assistant.resourceSelection.mode === "all-enabled") {
    return {
      mode: "all-enabled",
      selectedMcpServerIds: [],
      selectedSkillIds: [],
    };
  }
  const mcpIdsByName = new Map(
    targetMcp.map((server) => [normalizeName(server.name), server.id] as const),
  );
  const skillIdsByName = new Map(
    targetSkills.map((skill) => [normalizeName(skill.name), skill.id] as const),
  );
  return {
    mode: "custom",
    selectedMcpServerIds: item.selectedMcpNames.flatMap((name) => {
      const id = mcpIdsByName.get(normalizeName(name));
      return id ? [id] : [];
    }),
    selectedSkillIds: item.selectedSkillNames.flatMap((name) => {
      const id = skillIdsByName.get(normalizeName(name));
      return id ? [id] : [];
    }),
  };
}

async function mergeAssistants(
  target: ResourceSyncHost,
  sourceItems: readonly AssistantSyncItem[],
  targetItems: readonly AssistantSyncItem[],
): Promise<ResourceSyncStats> {
  const stats = emptyStats(sourceItems.length);
  const [mcpResult, skillResult] = await Promise.all([
    target.client.listMcpServers(),
    target.client.listSkills(),
  ]);
  if (mcpResult.error) throw new Error(mcpResult.error);
  if (skillResult.error) throw new Error(skillResult.error);
  const targetAssistants = targetItems.map((item) => item.assistant);
  for (const sourceItem of sourceItems) {
    const source = sourceItem.assistant;
    const existing = findByIdOrName(targetAssistants, source);
    const resourceSelection = mapAssistantResourceSelection(
      sourceItem,
      mcpResult.servers,
      skillResult.skills,
    );
    try {
      if (!existing) {
        requireResult<Assistant>(
          await target.client.createAssistant({
            name: source.name,
            description: source.description,
            prompt: source.prompt,
            memoryEnabled: source.memoryEnabled,
            memory: source.memory,
            knowledge: source.knowledge,
            resourceSelection,
          }),
          "assistant",
          `无法创建助手 ${source.name}`,
        );
        stats.created += 1;
        continue;
      }
      const sourceData = {
        name: source.name,
        description: source.description,
        prompt: source.prompt,
        memoryEnabled: source.memoryEnabled,
        memory: source.memory,
        knowledge: source.knowledge,
        resourceSelection,
      };
      const targetData = {
        name: existing.name,
        description: existing.description,
        prompt: existing.prompt,
        memoryEnabled: existing.memoryEnabled,
        memory: existing.memory,
        knowledge: existing.knowledge,
        resourceSelection: existing.resourceSelection,
      };
      if (
        Date.parse(source.updatedAt) <= Date.parse(existing.updatedAt) ||
        equal(sourceData, targetData)
      ) {
        stats.skipped += 1;
        continue;
      }
      requireResult<Assistant>(
        await target.client.updateAssistant({ id: existing.id, ...sourceData }),
        "assistant",
        `无法更新助手 ${source.name}`,
      );
      stats.updated += 1;
    } catch (error) {
      stats.failures.push(`${source.name || source.id}：${errorMessage(error)}`);
    }
  }
  return stats;
}

async function installPlugin(target: ResourceSyncHost, plugin: PluginSummary): Promise<void> {
  if (plugin.runtime?.source === "git" || plugin.runtime?.remote) {
    if (!plugin.runtime.remote) throw new Error("缺少 Git 地址");
    await target.client.installPluginSource({
      source: plugin.runtime.remote,
      id: plugin.pluginId ?? plugin.name,
      ref: plugin.runtime.ref,
    });
    return;
  }
  if (plugin.marketplaceId) {
    const result = await target.client.installPlugin({
      type: "marketplace",
      marketplaceId: plugin.marketplaceId,
      pluginName: plugin.name,
    });
    if (result.error) throw new Error(result.error);
    return;
  }
  const sourcePath = plugin.sourcePath ?? plugin.runtime?.path;
  if (!sourcePath) throw new Error("缺少插件来源路径");
  const result = await target.client.installPlugin({ type: "local", path: sourcePath });
  if (result.error) throw new Error(result.error);
}

function addLocalApplyResult(stats: ResourceSyncStats, result: LocalResourceApplyResult): void {
  stats.localCreated += result.created;
  stats.localUpdated += result.updated;
  stats.localSkipped += result.skipped;
  stats.localConflicts += result.conflicts;
  stats.bytesTransferred += result.bytesWritten;
}

async function applyLocalContent(input: {
  target: ResourceSyncHost;
  sourceLabel: string;
  content: LocalContentSnapshot;
  targetPath: string;
  policy: LocalContentSyncPolicy;
  stats: ResourceSyncStats;
}): Promise<LocalResourceApplyResult | null> {
  if (input.content.error || !input.content.snapshot) {
    input.stats.failures.push(
      `${input.content.source}：无法读取来源内容：${input.content.error ?? "未知错误"}`,
    );
    return null;
  }
  const response = await input.target.client.applyLocalResource({
    path: input.targetPath,
    snapshot: input.content.snapshot,
    missingPolicy: input.policy.missing,
    existingPolicy: input.policy.existing,
    sourceLabel: input.sourceLabel,
  });
  if (response.error || !response.result) {
    throw new Error(response.error ?? "目标主机未返回本地资源同步结果");
  }
  addLocalApplyResult(input.stats, response.result);
  return response.result;
}

async function setPluginEnabled(
  target: ResourceSyncHost,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  const result = await target.client.setPluginEnabled(pluginId, enabled);
  if (result.error) throw new Error(result.error);
}

async function mergePlugins(
  sourceHost: ResourceSyncHost,
  target: ResourceSyncHost,
  sourceItems: readonly PluginSyncItem[],
  targetItems: readonly PluginSyncItem[],
  syncExistingState: boolean,
  localContentPolicy: LocalContentSyncPolicy,
): Promise<ResourceSyncStats> {
  const stats = emptyStats(sourceItems.length);
  for (const sourceItem of sourceItems) {
    const source = sourceItem.plugin;
    const sourceId = source.pluginId ?? source.name;
    const existing = targetItems.find(
      (item) =>
        (item.plugin.pluginId ?? item.plugin.name) === sourceId ||
        normalizeName(item.plugin.name) === normalizeName(source.name),
    )?.plugin;
    try {
      if (sourceItem.localContent) {
        const localResult = await applyLocalContent({
          target,
          sourceLabel: sourceHost.label,
          content: sourceItem.localContent,
          targetPath: sourceItem.localContent.source,
          policy: localContentPolicy,
          stats,
        });
        if (!localResult || localResult.status === "skipped_missing") {
          stats.skipped += 1;
          continue;
        }
      }
      if (!existing) {
        await installPlugin(target, source);
        if (!source.enabled) {
          await setPluginEnabled(target, sourceId, false);
        }
        stats.created += 1;
        continue;
      }
      if (!syncExistingState || existing.enabled === source.enabled) {
        stats.skipped += 1;
        continue;
      }
      await setPluginEnabled(target, existing.pluginId ?? existing.name, source.enabled);
      stats.updated += 1;
    } catch (error) {
      stats.failures.push(`${sourceId}：${errorMessage(error)}`);
    }
  }
  return stats;
}

function mergeKnowledgeResources<T extends { type: string; source: string }>(
  source: readonly T[] | undefined,
  target: readonly T[] | undefined,
): T[] | undefined {
  const merged = [...(target ?? [])];
  const keys = new Set(merged.map((entry) => `${entry.type}:${entry.source.trim()}`));
  for (const entry of source ?? []) {
    const key = `${entry.type}:${entry.source.trim()}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(entry);
  }
  return merged.length > 0 ? merged : undefined;
}

function mergeKnowledge(
  source: PaseoHostKnowledge | PaseoProjectKnowledge,
  target: PaseoHostKnowledge | PaseoProjectKnowledge,
): PaseoProjectKnowledge {
  const sourceProject = source as PaseoProjectKnowledge;
  const targetProject = target as PaseoProjectKnowledge;
  return {
    ...target,
    general: mergeKnowledgeResources(source.general, target.general),
    standards: mergeKnowledgeResources(source.standards, target.standards),
    projectSpecific: mergeKnowledgeResources(
      sourceProject.projectSpecific,
      targetProject.projectSpecific,
    ),
  };
}

function knowledgeResourceCount(knowledge: PaseoHostKnowledge | PaseoProjectKnowledge): number {
  const projectKnowledge = knowledge as PaseoProjectKnowledge;
  return (
    (knowledge.general?.length ?? 0) +
    (knowledge.standards?.length ?? 0) +
    (projectKnowledge.projectSpecific?.length ?? 0)
  );
}

function localKnowledgeKey(
  section: KnowledgeLocalContentSnapshot["section"],
  type: KnowledgeLocalContentSnapshot["type"],
  source: string,
): string {
  return `${section}:${type}:${source.trim()}`;
}

function filterKnowledgeLocalResources(
  knowledge: PaseoHostKnowledge | PaseoProjectKnowledge,
  allowed: ReadonlySet<string>,
): PaseoProjectKnowledge {
  const projectKnowledge = knowledge as PaseoProjectKnowledge;
  const filter = <T extends { type: string; source: string }>(
    section: KnowledgeLocalContentSnapshot["section"],
    entries: readonly T[] | undefined,
  ): T[] | undefined => {
    const next = (entries ?? []).filter(
      (entry) =>
        entry.type === "cloud-document" ||
        allowed.has(
          localKnowledgeKey(
            section,
            entry.type as KnowledgeLocalContentSnapshot["type"],
            entry.source,
          ),
        ),
    );
    return next.length > 0 ? next : undefined;
  };
  return {
    ...knowledge,
    general: filter("general", knowledge.general),
    standards: filter("standards", knowledge.standards),
    projectSpecific: filter("projectSpecific", projectKnowledge.projectSpecific),
  };
}

async function mergeKnowledgeSnapshot(
  sourceHost: ResourceSyncHost,
  target: ResourceSyncHost,
  source: KnowledgeSnapshot,
  current: KnowledgeSnapshot,
  localContentPolicy: LocalContentSyncPolicy,
): Promise<ResourceSyncStats> {
  const scanned = knowledgeResourceCount(source.knowledge);
  const stats = emptyStats(scanned);
  const allowedLocalResources = new Set<string>();
  for (const content of source.localContent) {
    const key = localKnowledgeKey(content.section, content.type, content.source);
    try {
      const localResult = await applyLocalContent({
        target,
        sourceLabel: sourceHost.label,
        content,
        targetPath: resolveKnowledgeLocalPath(current.target, content.source),
        policy: localContentPolicy,
        stats,
      });
      if (localResult && localResult.status !== "skipped_missing") {
        allowedLocalResources.add(key);
      }
    } catch (error) {
      stats.failures.push(`${content.source}：${errorMessage(error)}`);
    }
  }
  const transferableKnowledge = filterKnowledgeLocalResources(
    source.knowledge,
    allowedLocalResources,
  );
  const next = mergeKnowledge(transferableKnowledge, current.knowledge);
  if (equal(next, current.knowledge)) {
    stats.skipped = scanned;
    return stats;
  }
  if (current.target.scope === "global") {
    await target.client.patchDaemonConfig({ knowledge: next });
  } else if (current.target.scope === "project") {
    const result = await target.client.writeProjectConfig({
      repoRoot: current.target.repoRoot,
      projectId: current.target.projectId,
      config: {
        ...current.projectConfig,
        project: { ...current.projectConfig?.project, knowledge: next },
      },
      expectedRevision: current.projectRevision ?? null,
    });
    if (!result.ok) throw new Error(`无法写入 Project ${current.target.projectId} 的知识`);
  } else {
    if (!current.assistant) throw new Error("目标助手不存在");
    const result = await target.client.updateAssistant({
      id: current.assistant.id,
      knowledge: next,
    });
    if (result.error) throw new Error(result.error);
  }
  const targetCount = knowledgeResourceCount(current.knowledge);
  const nextCount = knowledgeResourceCount(next);
  stats.created = Math.max(0, nextCount - targetCount);
  stats.skipped = Math.max(0, scanned - stats.created);
  return stats;
}

async function mergeSnapshot(input: {
  source: ResourceSyncHost;
  target: ResourceSyncHost;
  sourceSnapshot: ResourceSnapshot;
  targetSnapshot: ResourceSnapshot;
  syncExistingPluginState: boolean;
  localContentPolicy: LocalContentSyncPolicy;
}): Promise<ResourceSyncDirectionResult> {
  if (input.sourceSnapshot.kind !== input.targetSnapshot.kind) {
    throw new Error("同步快照类型不一致");
  }
  let stats: ResourceSyncStats;
  switch (input.sourceSnapshot.kind) {
    case "skills":
      stats = await mergeSkills(
        input.target,
        input.sourceSnapshot.items,
        (input.targetSnapshot as Extract<ResourceSnapshot, { kind: "skills" }>).items,
      );
      break;
    case "mcp":
      stats = await mergeMcp(
        input.target,
        input.sourceSnapshot.items,
        (input.targetSnapshot as Extract<ResourceSnapshot, { kind: "mcp" }>).items,
      );
      break;
    case "plugins":
      stats = await mergePlugins(
        input.source,
        input.target,
        input.sourceSnapshot.items,
        (input.targetSnapshot as Extract<ResourceSnapshot, { kind: "plugins" }>).items,
        input.syncExistingPluginState,
        input.localContentPolicy,
      );
      break;
    case "assistants":
      stats = await mergeAssistants(
        input.target,
        input.sourceSnapshot.items,
        (input.targetSnapshot as Extract<ResourceSnapshot, { kind: "assistants" }>).items,
      );
      break;
    case "knowledge":
      stats = await mergeKnowledgeSnapshot(
        input.source,
        input.target,
        input.sourceSnapshot.value,
        (input.targetSnapshot as Extract<ResourceSnapshot, { kind: "knowledge" }>).value,
        input.localContentPolicy,
      );
      break;
  }
  return {
    kind: input.sourceSnapshot.kind,
    sourceServerId: input.source.serverId,
    targetServerId: input.target.serverId,
    ...stats,
  };
}

export async function syncHostResourcesOneWay(input: {
  source: ResourceSyncHost;
  target: ResourceSyncHost;
  kind: HostResourceSyncKind;
  localContentPolicy?: LocalContentSyncPolicy;
}): Promise<ResourceSyncDirectionResult> {
  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    readSnapshot(input.source, input.kind, true),
    readSnapshot(input.target, input.kind, false),
  ]);
  return mergeSnapshot({
    ...input,
    sourceSnapshot,
    targetSnapshot,
    syncExistingPluginState: true,
    localContentPolicy: input.localContentPolicy ?? { missing: "skip", existing: "merge" },
  });
}

export async function syncHostResourcesTwoWay(input: {
  first: ResourceSyncHost;
  second: ResourceSyncHost;
  kind: HostResourceSyncKind;
  localContentPolicy?: LocalContentSyncPolicy;
}): Promise<TwoWayResourceSyncResult> {
  const [firstSnapshot, secondSnapshot] = await Promise.all([
    readSnapshot(input.first, input.kind, true),
    readSnapshot(input.second, input.kind, true),
  ]);
  const [firstToSecond, secondToFirst] = await Promise.all([
    mergeSnapshot({
      source: input.first,
      target: input.second,
      sourceSnapshot: firstSnapshot,
      targetSnapshot: secondSnapshot,
      syncExistingPluginState: false,
      localContentPolicy: input.localContentPolicy ?? { missing: "skip", existing: "merge" },
    }),
    mergeSnapshot({
      source: input.second,
      target: input.first,
      sourceSnapshot: secondSnapshot,
      targetSnapshot: firstSnapshot,
      syncExistingPluginState: false,
      localContentPolicy: input.localContentPolicy ?? { missing: "skip", existing: "merge" },
    }),
  ]);
  return { firstToSecond, secondToFirst };
}
