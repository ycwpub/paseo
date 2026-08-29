import equal from "fast-deep-equal";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  Assistant,
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
  failures: string[];
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

interface KnowledgeSnapshot {
  knowledge: PaseoHostKnowledge | PaseoProjectKnowledge;
  target: KnowledgeSyncTarget;
  projectConfig?: PaseoConfigRaw;
  projectRevision?: PaseoConfigRevision | null;
  assistant?: Assistant;
}

type ResourceSnapshot =
  | { kind: "skills"; items: Skill[] }
  | { kind: "mcp"; items: McpServer[] }
  | { kind: "plugins"; items: PluginSummary[] }
  | { kind: "assistants"; items: AssistantSyncItem[] }
  | { kind: "knowledge"; value: KnowledgeSnapshot };

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function emptyStats(scanned: number): ResourceSyncStats {
  return { scanned, created: 0, updated: 0, skipped: 0, failures: [] };
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

async function readKnowledgeSnapshot(host: ResourceSyncHost): Promise<KnowledgeSnapshot> {
  const target = host.knowledgeTarget;
  if (!target) throw new Error("未指定知识同步范围");
  if (target.scope === "global") {
    const response = await host.client.getDaemonConfig();
    return { target, knowledge: response.config.knowledge ?? {} };
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
    return {
      target,
      knowledge: response.config?.project?.knowledge ?? {},
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
  return { target, knowledge: assistant.knowledge ?? {}, assistant };
}

async function readSnapshot(
  host: ResourceSyncHost,
  kind: HostResourceSyncKind,
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
      return { kind, items: result.plugins.filter((plugin) => plugin.installed) };
    }
    case "assistants":
      return { kind, items: await readAssistantSnapshot(host.client) };
    case "knowledge":
      return { kind, value: await readKnowledgeSnapshot(host) };
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

async function setPluginEnabled(
  target: ResourceSyncHost,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  const result = await target.client.setPluginEnabled(pluginId, enabled);
  if (result.error) throw new Error(result.error);
}

async function mergePlugins(
  target: ResourceSyncHost,
  sourceItems: readonly PluginSummary[],
  targetItems: readonly PluginSummary[],
  syncExistingState: boolean,
): Promise<ResourceSyncStats> {
  const stats = emptyStats(sourceItems.length);
  for (const source of sourceItems) {
    const sourceId = source.pluginId ?? source.name;
    const existing = targetItems.find(
      (plugin) =>
        (plugin.pluginId ?? plugin.name) === sourceId ||
        normalizeName(plugin.name) === normalizeName(source.name),
    );
    try {
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

async function mergeKnowledgeSnapshot(
  target: ResourceSyncHost,
  source: KnowledgeSnapshot,
  current: KnowledgeSnapshot,
): Promise<ResourceSyncStats> {
  const next = mergeKnowledge(source.knowledge, current.knowledge);
  const scanned = knowledgeResourceCount(source.knowledge);
  if (equal(next, current.knowledge)) {
    return { ...emptyStats(scanned), skipped: scanned };
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
  return {
    ...emptyStats(scanned),
    created: Math.max(0, nextCount - targetCount),
    skipped: Math.max(0, scanned - Math.max(0, nextCount - targetCount)),
  };
}

async function mergeSnapshot(input: {
  source: ResourceSyncHost;
  target: ResourceSyncHost;
  sourceSnapshot: ResourceSnapshot;
  targetSnapshot: ResourceSnapshot;
  syncExistingPluginState: boolean;
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
        input.target,
        input.sourceSnapshot.items,
        (input.targetSnapshot as Extract<ResourceSnapshot, { kind: "plugins" }>).items,
        input.syncExistingPluginState,
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
        input.target,
        input.sourceSnapshot.value,
        (input.targetSnapshot as Extract<ResourceSnapshot, { kind: "knowledge" }>).value,
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
}): Promise<ResourceSyncDirectionResult> {
  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    readSnapshot(input.source, input.kind),
    readSnapshot(input.target, input.kind),
  ]);
  return mergeSnapshot({
    ...input,
    sourceSnapshot,
    targetSnapshot,
    syncExistingPluginState: true,
  });
}

export async function syncHostResourcesTwoWay(input: {
  first: ResourceSyncHost;
  second: ResourceSyncHost;
  kind: HostResourceSyncKind;
}): Promise<TwoWayResourceSyncResult> {
  const [firstSnapshot, secondSnapshot] = await Promise.all([
    readSnapshot(input.first, input.kind),
    readSnapshot(input.second, input.kind),
  ]);
  const [firstToSecond, secondToFirst] = await Promise.all([
    mergeSnapshot({
      source: input.first,
      target: input.second,
      sourceSnapshot: firstSnapshot,
      targetSnapshot: secondSnapshot,
      syncExistingPluginState: false,
    }),
    mergeSnapshot({
      source: input.second,
      target: input.first,
      sourceSnapshot: secondSnapshot,
      targetSnapshot: firstSnapshot,
      syncExistingPluginState: false,
    }),
  ]);
  return { firstToSecond, secondToFirst };
}
