import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { MessageSquare, Plus, RefreshCw } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginAppDefinition,
  PluginHttpJob,
  PluginSummary,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getHostProjectId,
  getHostProjectSourceDirectory,
  useHostProjects,
} from "@/projects/host-projects";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { useHostFeature } from "@/runtime/host-features";
import { PluginAppSurface } from "@/screens/settings/plugins/plugin-app-modal";
import { useSessionStore } from "@/stores/session-store";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { settingsStyles } from "@/styles/settings";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { formatTimeAgo } from "@/utils/time";
import {
  DEVELOPMENT_STAGES,
  developmentJobStatusLabel,
  developmentStageLabel,
  type DevelopmentFlow,
} from "./flow-model";
import { resolveProjectConversationWorkspace } from "./flow-navigation";
import { buildByteDevelopmentFixedFormValues } from "./project-context-model";
import {
  developmentFlowsQueryKey,
  prependDevelopmentFlow,
  useDevelopmentFlows,
} from "./use-development-flows";
import { useByteDevelopmentProjectContext } from "./use-project-context";

const EMPTY_FLOWS: DevelopmentFlow[] = [];

function prettyJson(value: unknown): string {
  if (value === undefined || value === null) return "暂无输出";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusVariant(status: PluginHttpJob["status"]): "success" | "error" | "muted" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "timed_out") return "error";
  return "muted";
}

function FlowListItem({
  flow,
  projectName,
  selected,
  onSelect,
}: {
  flow: DevelopmentFlow;
  projectName: string;
  selected: boolean;
  onSelect: (flowId: string) => void;
}) {
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const handlePress = useCallback(() => onSelect(flow.id), [flow.id, onSelect]);
  const pressableStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.flowItem,
      (hovered || pressed) && styles.flowItemHovered,
      selected && styles.flowItemSelected,
    ],
    [selected],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={pressableStyle}
      testID={`development-flow-${flow.id}`}
    >
      <Text numberOfLines={2} style={styles.flowTitle}>
        {flow.title}
      </Text>
      <Text numberOfLines={1} style={styles.flowProject}>
        {projectName}
      </Text>
      <View style={styles.flowMeta}>
        <StatusBadge
          label={developmentJobStatusLabel(flow.job.status)}
          variant={statusVariant(flow.job.status)}
        />
        <Text style={styles.flowTime}>{formatTimeAgo(new Date(flow.updatedAt))}</Text>
      </View>
    </Pressable>
  );
}

function FlowList({
  flows,
  projectNames,
  selectedFlowId,
  loading,
  error,
  onSelect,
  onCreate,
  onRefresh,
  compact,
}: {
  flows: DevelopmentFlow[];
  projectNames: ReadonlyMap<string, string>;
  selectedFlowId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (flowId: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
  compact: boolean;
}) {
  return (
    <View style={[styles.flowSidebar, compact && styles.flowSidebarCompact]}>
      <View style={styles.flowListHeader}>
        <View style={styles.flowListHeading}>
          <Text style={styles.sectionTitle}>开发流程</Text>
          <Text style={styles.countText}>{flows.length}</Text>
        </View>
        <Button size="xs" variant="default" leftIcon={Plus} onPress={onCreate}>
          新建
        </Button>
      </View>
      {loading ? <Text style={styles.hint}>正在加载研发流程…</Text> : null}
      {error ? (
        <View style={styles.listError}>
          <Text style={styles.errorText}>{error}</Text>
          <Button size="xs" variant="outline" leftIcon={RefreshCw} onPress={onRefresh}>
            重试
          </Button>
        </View>
      ) : null}
      {!loading && !error && flows.length === 0 ? (
        <View style={styles.emptyList}>
          <Text style={styles.emptyTitle}>还没有开发流程</Text>
          <Text style={styles.hint}>创建后会在这里按最近活跃时间展示。</Text>
        </View>
      ) : null}
      <View style={styles.flowItems}>
        {flows.map((flow) => (
          <FlowListItem
            key={flow.id}
            flow={flow}
            projectName={
              (flow.projectId ? projectNames.get(flow.projectId) : null) ?? "未关联 Project"
            }
            selected={flow.id === selectedFlowId}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

function StageProgress({ flow }: { flow: DevelopmentFlow }) {
  const selectedIndex = DEVELOPMENT_STAGES.findIndex((stage) => stage.id === flow.currentStage);
  return (
    <View style={styles.stageGrid}>
      {DEVELOPMENT_STAGES.map((stage, index) => {
        const completed = flow.job.status === "succeeded" || index < selectedIndex;
        const current = index === selectedIndex && flow.job.status !== "succeeded";
        return (
          <View
            key={stage.id}
            style={[
              styles.stageItem,
              completed && styles.stageItemCompleted,
              current && styles.stageItemCurrent,
            ]}
          >
            <Text
              style={[styles.stageIndex, (completed || current) && styles.stageIndexHighlighted]}
            >
              {index + 1}
            </Text>
            <Text style={styles.stageLabel}>{stage.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function FlowDetail({
  flow,
  projectName,
  onOpenProject,
}: {
  flow: DevelopmentFlow;
  projectName: string;
  onOpenProject: () => void;
}) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeading}>
          <Text style={styles.detailTitle}>{flow.title}</Text>
          <Text style={styles.detailSubtitle}>
            {projectName} · {developmentStageLabel(flow.currentStage)}
          </Text>
        </View>
        <Button
          variant="outline"
          leftIcon={MessageSquare}
          disabled={!flow.projectId}
          onPress={onOpenProject}
        >
          在 Project 中对话
        </Button>
      </View>
      <Text style={styles.projectChatHint}>
        研发流程用于跟踪 PRD 到发布的执行状态；日常沟通和后续指令仍在关联的 Project 会话中进行。
      </Text>
      <StageProgress flow={flow} />
      <View style={[settingsStyles.card, styles.infoCard]}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>状态</Text>
          <StatusBadge
            label={developmentJobStatusLabel(flow.job.status)}
            variant={statusVariant(flow.job.status)}
          />
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Project ID</Text>
          <Text selectable style={styles.infoValue}>
            {flow.projectId ?? "未关联"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Process ID</Text>
          <Text selectable style={styles.infoValue}>
            {flow.id}
          </Text>
        </View>
        {flow.job.workflowRunId ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Workflow Run ID</Text>
            <Text selectable style={styles.infoValue}>
              {flow.job.workflowRunId}
            </Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>创建时间</Text>
          <Text style={styles.infoValue}>{new Date(flow.job.createdAt).toLocaleString()}</Text>
        </View>
      </View>
      {flow.job.error ? (
        <View style={[settingsStyles.card, styles.errorCard]}>
          <Text style={styles.outputTitle}>错误信息</Text>
          <Text selectable style={styles.errorText}>
            {flow.job.error}
          </Text>
        </View>
      ) : null}
      <View style={[settingsStyles.card, styles.outputCard]}>
        <Text style={styles.outputTitle}>流程输入</Text>
        <Text selectable style={styles.codeText}>
          {prettyJson(flow.job.input)}
        </Text>
      </View>
      <View style={[settingsStyles.card, styles.outputCard]}>
        <Text style={styles.outputTitle}>流程输出</Text>
        <Text selectable style={styles.codeText}>
          {prettyJson(flow.job.result)}
        </Text>
      </View>
    </View>
  );
}

export function ByteDevelopmentPanel({
  active,
  serverId,
  plugin,
  appDefinition,
  compact = false,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  compact?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const closePluginPanel = usePluginAppPanelStore((state) => state.close);
  const activeWorkspace = useActiveWorkspaceSelection();
  const supportsJobList = useHostFeature(serverId, "pluginAppJobList");
  const query = useDevelopmentFlows({ active, serverId, supported: supportsJobList });
  const flows = query.data ?? EMPTY_FLOWS;
  const projects = useHostProjects([serverId]);
  const projectOptions = useMemo(
    () =>
      projects.flatMap((project) => {
        const projectId = getHostProjectId(project, serverId);
        if (!projectId) return [];
        return [
          {
            id: projectId,
            value: projectId,
            label: project.projectName,
            description: projectId,
          },
        ];
      }),
    [projects, serverId],
  );
  const projectNames = useMemo(
    () => new Map(projectOptions.map((option) => [option.value, option.label])),
    [projectOptions],
  );
  const activeProjectId = useSessionStore((state) => {
    const workspaceId = activeWorkspace?.serverId === serverId ? activeWorkspace.workspaceId : null;
    if (!workspaceId) return null;
    for (const workspace of state.sessions[serverId]?.workspaces.values() ?? []) {
      if (workspace.id === workspaceId) return workspace.projectId;
    }
    return null;
  });
  const [creating, setCreating] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProjectId && projectNames.has(selectedProjectId)) return;
    setSelectedProjectId(
      (activeProjectId && projectNames.has(activeProjectId) ? activeProjectId : null) ??
        projectOptions[0]?.value ??
        null,
    );
  }, [activeProjectId, projectNames, projectOptions, selectedProjectId]);

  useEffect(() => {
    if (creating) return;
    if (selectedFlowId && flows.some((flow) => flow.id === selectedFlowId)) return;
    setSelectedFlowId(flows[0]?.id ?? null);
  }, [creating, flows, selectedFlowId]);

  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId) ?? null;
  const selectedProjectDisplay = useMemo(() => {
    const option = projectOptions.find((candidate) => candidate.value === selectedProjectId);
    return option ? { label: option.label, description: option.description } : null;
  }, [projectOptions, selectedProjectId]);
  const selectedProject = useMemo(
    () =>
      projects.find((project) => getHostProjectId(project, serverId) === selectedProjectId) ?? null,
    [projects, selectedProjectId, serverId],
  );
  const projectContext = useByteDevelopmentProjectContext({
    active: active && creating,
    serverId,
    project: selectedProject,
  });
  const fixedFormValues = useMemo(
    () =>
      buildByteDevelopmentFixedFormValues({
        projectId: selectedProjectId,
        repositoryPath: projectContext.repositoryPath,
        larkDocumentLinks: projectContext.larkDocumentLinks,
      }),
    [projectContext.larkDocumentLinks, projectContext.repositoryPath, selectedProjectId],
  );

  const handleSelectFlow = useCallback((flowId: string) => {
    setCreating(false);
    setSelectedFlowId(flowId);
  }, []);
  const handleCreate = useCallback(() => {
    setCreating(true);
    setSelectedFlowId(null);
  }, []);
  const handleRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);
  const handleSubmitted = useCallback(
    (job: PluginHttpJob) => {
      queryClient.setQueryData(
        developmentFlowsQueryKey(serverId),
        (current: DevelopmentFlow[] | undefined) => prependDevelopmentFlow(current, job),
      );
      setCreating(false);
      setSelectedFlowId(job.id);
    },
    [queryClient, serverId],
  );
  const handleOpenProject = useCallback(() => {
    const projectId = selectedFlow?.projectId;
    if (!projectId) return;
    const session = useSessionStore.getState().sessions[serverId];
    const target = resolveProjectConversationWorkspace({
      projectId,
      activeWorkspaceId:
        activeWorkspace?.serverId === serverId ? activeWorkspace.workspaceId : null,
      workspaces: session?.workspaces.values() ?? [],
    });
    closePluginPanel();
    if (target) {
      navigateToWorkspace({ serverId, workspaceId: target.id });
      return;
    }
    const project = projects.find(
      (candidate) => getHostProjectId(candidate, serverId) === projectId,
    );
    router.push(
      buildNewWorkspaceRoute({
        serverId,
        projectId,
        displayName: project?.projectName,
        sourceDirectory: project
          ? (getHostProjectSourceDirectory(project, serverId) ?? undefined)
          : undefined,
      }),
    );
  }, [activeWorkspace, closePluginPanel, projects, router, selectedFlow?.projectId, serverId]);

  if (!supportsJobList) {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.emptyTitle}>当前 Host 版本不支持开发流程列表</Text>
        <Text style={styles.hint}>请更新并重启 Paseo daemon 后再使用字节开发插件。</Text>
      </View>
    );
  }

  let mainContent;
  if (creating) {
    mainContent = (
      <View style={styles.createPane}>
        <View style={styles.createHeader}>
          <Text style={styles.detailTitle}>创建开发流程</Text>
          <Text style={styles.projectChatHint}>
            选择关联 Project 后启动流程；后续日常对话仍回到该 Project。
          </Text>
        </View>
        <SelectField
          label="关联 Project"
          value={selectedProjectId}
          selectedDisplay={selectedProjectDisplay}
          options={projectOptions}
          onChange={setSelectedProjectId}
          placeholder="选择 Project"
          emptyText="当前 Host 没有可用 Project"
          searchable
          searchPlaceholder="搜索 Project"
          hint="仓库路径和关联飞书文档会自动读取所选 Project 的配置。"
        />
        {selectedProjectId && projectContext.repositoryPath && !projectContext.isLoading ? (
          <PluginAppSurface
            active={active}
            serverId={serverId}
            plugin={plugin}
            appDefinition={appDefinition}
            fixedFormValues={fixedFormValues}
            showConversation={false}
            onJobSubmitted={handleSubmitted}
            previewTitle="流程配置"
          />
        ) : (
          <View style={styles.emptyDetail}>
            <Text style={styles.emptyTitle}>
              {projectContext.isLoading ? "正在读取 Project 配置…" : "当前 Project 无法启动流程"}
            </Text>
            <Text style={styles.hint}>
              {projectContext.error ??
                (selectedProjectId
                  ? "该 Project 没有关联代码目录，请先为 Project 配置目录。"
                  : "请先创建或选择 Project。")}
            </Text>
          </View>
        )}
      </View>
    );
  } else if (selectedFlow) {
    mainContent = (
      <FlowDetail
        flow={selectedFlow}
        projectName={
          (selectedFlow.projectId ? projectNames.get(selectedFlow.projectId) : null) ??
          "未关联 Project"
        }
        onOpenProject={handleOpenProject}
      />
    );
  } else {
    mainContent = (
      <View style={styles.emptyDetail}>
        <Text style={styles.emptyTitle}>选择或创建开发流程</Text>
        <Text style={styles.hint}>
          左侧用于管理研发流程，Project 会话仍承载日常沟通和 Agent 指令。
        </Text>
        <Button variant="default" leftIcon={Plus} onPress={handleCreate}>
          创建开发流程
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.layout, compact ? styles.layoutCompact : styles.layoutDesktop]}>
      <FlowList
        flows={flows}
        projectNames={projectNames}
        selectedFlowId={selectedFlowId}
        loading={query.isLoading}
        error={query.error instanceof Error ? query.error.message : null}
        onSelect={handleSelectFlow}
        onCreate={handleCreate}
        onRefresh={handleRefresh}
        compact={compact}
      />
      <View style={styles.main}>{mainContent}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  layout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[6],
  },
  layoutDesktop: {
    minWidth: 760,
  },
  layoutCompact: {
    flexDirection: "column",
  },
  flowSidebarCompact: {
    width: "100%",
    paddingRight: 0,
    paddingBottom: theme.spacing[4],
    borderRightWidth: 0,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  flowSidebar: {
    width: 250,
    flexShrink: 0,
    gap: theme.spacing[3],
    paddingRight: theme.spacing[4],
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
  },
  flowListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  flowListHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  countText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  flowItems: {
    gap: theme.spacing[2],
  },
  flowItem: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  flowItemHovered: {
    backgroundColor: theme.colors.surface2,
  },
  flowItemSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  flowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 19,
  },
  flowProject: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  flowMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  flowTime: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  detail: {
    gap: theme.spacing[4],
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  detailHeading: {
    flex: 1,
    minWidth: 260,
    gap: theme.spacing[1],
  },
  detailTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
  },
  detailSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  projectChatHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  stageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  stageItem: {
    minWidth: 86,
    flexGrow: 1,
    flexBasis: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  stageItemCompleted: {
    borderColor: `${theme.colors.statusSuccess}55`,
    backgroundColor: `${theme.colors.statusSuccess}12`,
  },
  stageItemCurrent: {
    borderColor: theme.colors.accent,
  },
  stageIndex: {
    width: 20,
    height: 20,
    textAlign: "center",
    lineHeight: 20,
    borderRadius: theme.borderRadius.full,
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface3,
    fontSize: theme.fontSize.xs,
  },
  stageIndexHighlighted: {
    color: theme.colors.accentForeground,
    backgroundColor: theme.colors.accent,
  },
  stageLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  infoCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[4],
  },
  infoLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  infoValue: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    textAlign: "right",
  },
  outputCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  errorCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
    borderColor: theme.colors.statusDanger,
  },
  outputTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  codeText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  createPane: {
    gap: theme.spacing[4],
  },
  createHeader: {
    gap: theme.spacing[1],
  },
  emptyList: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[4],
  },
  listError: {
    gap: theme.spacing[2],
  },
  emptyDetail: {
    alignItems: "flex-start",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[8],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  errorText: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  unsupported: {
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[6],
  },
}));
