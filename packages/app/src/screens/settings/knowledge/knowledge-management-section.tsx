import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  Assistant,
  PaseoConfigRaw,
  PaseoConfigRevision,
  ProjectConfigRpcError,
} from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { useFetchQuery } from "@/data/query";
import { useAssistants, type UseAssistantsResult } from "@/hooks/use-assistants";
import { useProjects } from "@/hooks/use-projects";
import { ProjectKnowledgeEditor } from "@/projects/knowledge/editor";
import {
  projectKnowledgeDraftError,
  projectKnowledgeToDraft,
  type ProjectKnowledgeDraft,
} from "@/projects/knowledge/model";
import type { KnowledgeSyncTarget } from "@/resource-sync/host-resource-sync";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { SettingsSection } from "@/screens/settings/settings-section";
import { HostResourceSyncCard } from "@/screens/settings/shared/host-resource-sync-card";
import { settingsStyles } from "@/styles/settings";
import type { ProjectSummary } from "@/utils/projects";
import { HostKnowledgeSection } from "../host-knowledge/host-knowledge-section";
import {
  hostKnowledgeDraftError,
  hostKnowledgeDraftToConfig,
  hostKnowledgeToDraft,
} from "../host-knowledge/host-knowledge-model";
import {
  applyProjectKnowledgeToConfig,
  buildKnowledgeProjectTargets,
  type KnowledgeProjectTarget,
} from "./knowledge-management-model";

type KnowledgeScope = "global" | "project" | "assistant";
type ReadProjectConfigData = Awaited<ReturnType<DaemonClient["readProjectConfig"]>>;
const EMPTY_PROJECT_CONFIG: PaseoConfigRaw = {};

interface KnowledgeManagementSectionProps {
  serverId: string;
  initialScope?: KnowledgeScope;
  initialProjectId?: string | null;
  syncOnly?: boolean;
}

const SCOPE_OPTIONS = [
  {
    value: "global" as const,
    label: "全局知识",
    testID: "knowledge-scope-global",
  },
  {
    value: "project" as const,
    label: "Project 知识",
    testID: "knowledge-scope-project",
  },
  {
    value: "assistant" as const,
    label: "助手知识",
    testID: "knowledge-scope-assistant",
  },
];

function projectTargetKey(target: KnowledgeProjectTarget): string {
  return target.projectId;
}

function assistantTargetKey(assistant: Assistant): string {
  return assistant.id;
}

function buildKnowledgeSyncTarget(input: {
  scope: KnowledgeScope;
  targetServerId: string;
  sourceServerId: string;
  selectedTarget: KnowledgeProjectTarget | null;
  selectedAssistant: Assistant | null;
  projects: readonly ProjectSummary[];
}): KnowledgeSyncTarget | null {
  if (input.scope === "global") return { scope: "global" };
  if (input.scope === "assistant") {
    return input.selectedAssistant
      ? {
          scope: "assistant",
          assistantId: input.selectedAssistant.id,
          assistantName: input.selectedAssistant.name,
        }
      : null;
  }
  if (!input.selectedTarget) return null;
  const project = input.projects.find((entry) =>
    entry.hosts.some(
      (host) =>
        host.serverId === input.sourceServerId &&
        host.projectId === input.selectedTarget?.projectId,
    ),
  );
  const targetHost = project?.hosts.find((host) => host.serverId === input.targetServerId);
  return targetHost
    ? {
        scope: "project",
        projectId: targetHost.projectId,
        repoRoot: targetHost.repoRoot.trim() || targetHost.projectPath || "",
      }
    : null;
}

function KnowledgeHostSync({
  serverId,
  scope,
  projects,
  selectedTarget,
  selectedAssistant,
}: {
  serverId: string;
  scope: KnowledgeScope;
  projects: readonly ProjectSummary[];
  selectedTarget: KnowledgeProjectTarget | null;
  selectedAssistant: Assistant | null;
}) {
  const resolveKnowledgeTarget = useCallback(
    (targetServerId: string) =>
      buildKnowledgeSyncTarget({
        scope,
        targetServerId,
        sourceServerId: serverId,
        selectedTarget,
        selectedAssistant,
        projects,
      }),
    [projects, scope, selectedAssistant, selectedTarget, serverId],
  );
  const requiredFeature = scope === "assistant" ? "assistants" : undefined;
  const disabled =
    (scope === "project" && !selectedTarget) || (scope === "assistant" && !selectedAssistant);

  return (
    <SettingsSection title="多主机共享">
      <HostResourceSyncCard
        serverId={serverId}
        kind="knowledge"
        requiredFeature={requiredFeature}
        disabled={disabled}
        description="同步当前选中的知识范围。云文档共享配置；本地目录和本地文档会按所选策略同步实际内容。"
        warning="“合并”会保留目标独有内容；同名但内容不同的文件会另存为带来源主机标记的冲突副本，不会静默覆盖。"
        resolveKnowledgeTarget={resolveKnowledgeTarget}
      />
    </SettingsSection>
  );
}

export function KnowledgeManagementSection({
  serverId,
  initialScope = "global",
  initialProjectId = null,
  syncOnly = false,
}: KnowledgeManagementSectionProps) {
  const { projects, isLoading } = useProjects();
  const supportsAssistants = useHostFeature(serverId, "assistants");
  const assistants = useAssistants(serverId, { enabled: supportsAssistants });
  const [scope, setScope] = useState<KnowledgeScope>(initialScope);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null);
  const targets = useMemo(
    () => buildKnowledgeProjectTargets(projects, serverId),
    [projects, serverId],
  );
  const selectedTarget = useMemo(
    () => targets.find((target) => target.projectId === selectedProjectId) ?? targets[0] ?? null,
    [selectedProjectId, targets],
  );
  useEffect(() => {
    if (selectedTarget && selectedTarget.projectId !== selectedProjectId) {
      setSelectedProjectId(selectedTarget.projectId);
    }
  }, [selectedProjectId, selectedTarget]);

  const projectOptions = useMemo<SelectFieldOption<KnowledgeProjectTarget>[]>(
    () =>
      targets.map((target) => ({
        id: target.projectId,
        value: target,
        label: target.label,
        description: `${target.projectId} · ${target.description}`,
      })),
    [targets],
  );
  const selectedDisplay = useMemo(
    () =>
      selectedTarget
        ? {
            label: selectedTarget.label,
            description: `${selectedTarget.projectId} · ${selectedTarget.description}`,
          }
        : null,
    [selectedTarget],
  );
  const selectProject = useCallback((target: KnowledgeProjectTarget) => {
    setSelectedProjectId(target.projectId);
  }, []);
  const selectedAssistant = useMemo(
    () =>
      assistants.assistants.find((assistant) => assistant.id === selectedAssistantId) ??
      assistants.assistants[0] ??
      null,
    [assistants.assistants, selectedAssistantId],
  );
  useEffect(() => {
    if (selectedAssistant && selectedAssistant.id !== selectedAssistantId) {
      setSelectedAssistantId(selectedAssistant.id);
    }
  }, [selectedAssistant, selectedAssistantId]);
  const assistantOptions = useMemo<SelectFieldOption<Assistant>[]>(
    () =>
      assistants.assistants.map((assistant) => ({
        id: assistant.id,
        value: assistant,
        label: assistant.name.trim() || "未命名助手",
        description: assistant.description.trim() || assistant.id,
      })),
    [assistants.assistants],
  );
  const selectedAssistantDisplay = useMemo(
    () =>
      selectedAssistant
        ? {
            label: selectedAssistant.name.trim() || "未命名助手",
            description: selectedAssistant.description.trim() || selectedAssistant.id,
          }
        : null,
    [selectedAssistant],
  );
  const selectAssistant = useCallback((assistant: Assistant) => {
    setSelectedAssistantId(assistant.id);
  }, []);

  return (
    <View testID="knowledge-management-section">
      <SettingsSection title={syncOnly ? "选择同步范围" : "知识管理"}>
        <Text style={styles.description}>
          {syncOnly
            ? "选择要在不同主机之间同步的知识范围。"
            : "集中管理当前主机的全局知识、Project 知识和助手知识。全局知识适用于所有 Project；Project 知识仅在所选 Project 中生效；助手知识仅在使用所选助手时生效。"}
        </Text>
        <SegmentedControl
          options={SCOPE_OPTIONS}
          value={scope}
          onValueChange={setScope}
          style={styles.scopeSwitch}
          testID="knowledge-scope-switch"
        />
        {scope === "project" ? (
          <View style={settingsStyles.card}>
            <View style={styles.projectSelector}>
              <SelectField
                label="选择 Project"
                value={selectedTarget}
                selectedDisplay={selectedDisplay}
                options={projectOptions}
                onChange={selectProject}
                getValueKey={projectTargetKey}
                searchable
                loading={isLoading}
                placeholder="选择要管理知识的 Project"
                emptyText="当前主机没有可管理的 Project"
                testID="knowledge-project-selector"
              />
            </View>
          </View>
        ) : null}
        {scope === "assistant" && supportsAssistants ? (
          <View style={settingsStyles.card}>
            <View style={styles.projectSelector}>
              <SelectField
                label="选择助手"
                value={selectedAssistant}
                selectedDisplay={selectedAssistantDisplay}
                options={assistantOptions}
                onChange={selectAssistant}
                getValueKey={assistantTargetKey}
                searchable
                loading={assistants.isLoading}
                placeholder="选择要管理知识的助手"
                emptyText="当前主机没有可管理的助手"
                testID="knowledge-assistant-selector"
              />
            </View>
          </View>
        ) : null}
      </SettingsSection>

      {syncOnly ? (
        <KnowledgeHostSync
          serverId={serverId}
          scope={scope}
          projects={projects}
          selectedTarget={selectedTarget}
          selectedAssistant={selectedAssistant}
        />
      ) : (
        <KnowledgeScopeContent
          serverId={serverId}
          scope={scope}
          selectedTarget={selectedTarget}
          projectsLoading={isLoading}
          supportsAssistants={supportsAssistants}
          selectedAssistant={selectedAssistant}
          assistants={assistants}
        />
      )}
    </View>
  );
}

function KnowledgeScopeContent({
  serverId,
  scope,
  selectedTarget,
  projectsLoading,
  supportsAssistants,
  selectedAssistant,
  assistants,
}: {
  serverId: string;
  scope: KnowledgeScope;
  selectedTarget: KnowledgeProjectTarget | null;
  projectsLoading: boolean;
  supportsAssistants: boolean;
  selectedAssistant: Assistant | null;
  assistants: UseAssistantsResult;
}) {
  if (scope === "global") {
    return <HostKnowledgeSection serverId={serverId} />;
  }
  if (scope === "project") {
    if (selectedTarget) {
      return (
        <ProjectKnowledgeManager
          key={`${serverId}:${selectedTarget.projectId}`}
          serverId={serverId}
          target={selectedTarget}
        />
      );
    }
    return projectsLoading ? null : (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>请先创建 Project，再在这里维护 Project 知识。</Text>
        </View>
      </View>
    );
  }
  if (!supportsAssistants) {
    return (
      <Alert
        variant="warning"
        title="无法管理助手知识"
        description="当前主机版本不支持助手，请更新主机后再试。"
      />
    );
  }
  if (selectedAssistant) {
    return (
      <AssistantKnowledgeManager
        key={`${serverId}:${selectedAssistant.id}:${selectedAssistant.updatedAt}`}
        serverId={serverId}
        assistant={selectedAssistant}
        assistants={assistants}
      />
    );
  }
  return assistants.isLoading ? null : (
    <View style={settingsStyles.card}>
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>请先创建助手，再在这里维护助手知识。</Text>
      </View>
    </View>
  );
}

function AssistantKnowledgeManager({
  serverId,
  assistant,
  assistants,
}: {
  serverId: string;
  assistant: Assistant;
  assistants: Pick<UseAssistantsResult, "updateAssistant" | "isMutating" | "isConnected">;
}) {
  const [value, setValue] = useState(() => hostKnowledgeToDraft(assistant.knowledge));
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validationError = useMemo(() => hostKnowledgeDraftError(value), [value]);
  const cloudCacheTarget = useMemo(
    () => ({
      serverId,
      scope: "assistant" as const,
      assistantId: assistant.id,
    }),
    [assistant.id, serverId],
  );
  const change = useCallback((next: ProjectKnowledgeDraft) => {
    setValue(next);
    setDirty(true);
    setSaveError(null);
  }, []);
  const save = useCallback(async () => {
    if (!assistants.isConnected || assistants.isMutating || validationError) return;
    setSaveError(null);
    try {
      await assistants.updateAssistant({
        id: assistant.id,
        knowledge: hostKnowledgeDraftToConfig(value),
      });
      setDirty(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [assistant.id, assistants, validationError, value]);

  return (
    <View testID="assistant-knowledge-manager">
      <ProjectKnowledgeEditor
        value={value}
        error={validationError ?? saveError}
        onChange={change}
        sections={["general", "standards"]}
        title={`${assistant.name.trim() || "未命名助手"} · 助手知识`}
        info="仅在使用当前助手时生效。通用知识按需加载和采纳；规范知识会完整提供给智能体，并要求严格遵守。"
        testID="assistant-knowledge-group"
        cloudCacheTarget={cloudCacheTarget}
      />
      <View style={styles.footer}>
        <Button
          variant="default"
          leftIcon={Save}
          disabled={!assistants.isConnected || !dirty || Boolean(validationError)}
          loading={assistants.isMutating}
          onPress={save}
          testID="assistant-knowledge-save"
        >
          保存助手知识
        </Button>
      </View>
    </View>
  );
}

function ProjectKnowledgeManager({
  serverId,
  target,
}: {
  serverId: string;
  target: KnowledgeProjectTarget;
}) {
  const client = useHostRuntimeClient(serverId);
  const supportsProjectConfigById = useHostFeature(serverId, "projectConfigById");
  const targetSupportsEditing =
    target.isOnline &&
    (target.repoRoot.trim().length > 0 ||
      (target.isDirectoryless === true && supportsProjectConfigById));
  const queryKey = useMemo(
    () => ["project-config", serverId, target.projectId] as const,
    [serverId, target.projectId],
  );
  const readQuery = useFetchQuery({
    queryKey,
    queryFn: () => {
      if (!client) throw new Error("主机连接不可用");
      return client.readProjectConfig(target.repoRoot, undefined, target.projectId);
    },
    enabled: Boolean(client) && targetSupportsEditing,
    retry: false,
    dataShape: "value",
    staleTimeMs: 0,
  });

  if (!client || !targetSupportsEditing) {
    return (
      <Alert
        variant="warning"
        title="无法管理此 Project 的知识"
        description={
          target.isOnline
            ? "当前主机版本不支持无目录 Project 的知识配置。"
            : "当前主机离线，请重新连接后再试。"
        }
      />
    );
  }
  if (readQuery.isLoading) {
    return <Text style={styles.loading}>正在加载 Project 知识…</Text>;
  }
  if (readQuery.isError) {
    return (
      <KnowledgeLoadError
        description={readQuery.error instanceof Error ? readQuery.error.message : "主机没有响应。"}
        onRetry={readQuery.refetch}
      />
    );
  }
  if (!readQuery.data?.ok) {
    return (
      <KnowledgeLoadError
        description={projectConfigErrorDescription(readQuery.data?.error)}
        onRetry={readQuery.refetch}
      />
    );
  }

  const revision = readQuery.data.revision;
  return (
    <ProjectKnowledgeForm
      key={`${target.projectId}:${revision?.mtimeMs ?? 0}:${revision?.size ?? 0}`}
      client={client}
      queryKey={queryKey}
      serverId={serverId}
      target={target}
      baseConfig={readQuery.data.config ?? EMPTY_PROJECT_CONFIG}
      revision={revision}
    />
  );
}

function ProjectKnowledgeForm({
  client,
  queryKey,
  serverId,
  target,
  baseConfig,
  revision,
}: {
  client: DaemonClient;
  queryKey: readonly [string, string, string];
  serverId: string;
  target: KnowledgeProjectTarget;
  baseConfig: PaseoConfigRaw;
  revision: PaseoConfigRevision | null;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(() => projectKnowledgeToDraft(baseConfig.project));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validationError = useMemo(() => projectKnowledgeDraftError(value), [value]);
  const actualCloudCacheTarget = useMemo(
    () => ({
      serverId,
      scope: "project" as const,
      projectId: target.projectId,
    }),
    [serverId, target.projectId],
  );
  const change = useCallback((next: ProjectKnowledgeDraft) => {
    setValue(next);
    setDirty(true);
    setSaveError(null);
  }, []);
  const save = useCallback(async () => {
    if (saving || validationError) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await client.writeProjectConfig({
        repoRoot: target.repoRoot,
        projectId: target.projectId,
        config: applyProjectKnowledgeToConfig(baseConfig, value),
        expectedRevision: revision,
      });
      if (!result.ok) {
        setSaveError(projectConfigErrorDescription(result.error));
        return;
      }
      queryClient.setQueryData<ReadProjectConfigData>(queryKey, {
        ok: true,
        config: result.config,
        revision: result.revision,
        requestId: "knowledge-manager-cache",
        repoRoot: target.repoRoot,
        ...(result.hasUncommittedWorktreeSetupChanges === undefined
          ? {}
          : {
              hasUncommittedWorktreeSetupChanges: result.hasUncommittedWorktreeSetupChanges,
            }),
      });
      setDirty(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [
    baseConfig,
    client,
    queryClient,
    queryKey,
    revision,
    saving,
    target.projectId,
    target.repoRoot,
    validationError,
    value,
  ]);

  return (
    <View testID="project-knowledge-manager">
      <ProjectKnowledgeEditor
        value={value}
        error={validationError ?? saveError}
        onChange={change}
        title={`${target.label} · Project 知识`}
        info="仅在当前 Project 中生效。通用知识按需加载，规范知识必须遵守，项目专有知识会完整提供给智能体并按需采纳。"
        cloudCacheTarget={actualCloudCacheTarget}
      />
      <View style={styles.footer}>
        <Button
          variant="default"
          leftIcon={Save}
          disabled={!dirty || Boolean(validationError)}
          loading={saving}
          onPress={save}
          testID="project-knowledge-save"
        >
          保存 Project 知识
        </Button>
      </View>
    </View>
  );
}

function KnowledgeLoadError({
  description,
  onRetry,
}: {
  description: string;
  onRetry: () => unknown;
}) {
  return (
    <Alert variant="error" title="无法加载 Project 知识" description={description}>
      <Button size="sm" variant="outline" onPress={onRetry}>
        重新加载
      </Button>
    </Alert>
  );
}

function projectConfigErrorDescription(error: ProjectConfigRpcError | undefined): string {
  switch (error?.code) {
    case "invalid_project_config":
      return "无法解析 Project 的 paseo.json，请修复配置后重新加载。";
    case "project_not_found":
      return "当前主机找不到这个 Project。";
    case "stale_project_config":
      return "Project 配置已在其他位置更新，请重新加载后再保存。";
    default:
      return "无法读取或保存 Project 知识，请重试。";
  }
}

const styles = StyleSheet.create((theme) => ({
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.5,
  },
  scopeSwitch: {
    alignSelf: "flex-start",
    marginTop: theme.spacing[3],
  },
  projectSelector: {
    padding: theme.spacing[4],
  },
  footer: {
    alignItems: "flex-end",
    marginTop: -theme.spacing[4],
    marginBottom: theme.spacing[8],
  },
  loading: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[4],
  },
}));
