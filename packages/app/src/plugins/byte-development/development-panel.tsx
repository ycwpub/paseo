import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { Plus, RefreshCw } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginAppDefinition,
  PluginHttpJob,
  PluginSummary,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getHostProjectId,
  getHostProjectSourceDirectory,
  useHostProjects,
} from "@/projects/host-projects";
import { registerProjectDescriptor } from "@/hooks/open-project";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { formatTimeAgo } from "@/utils/time";
import { developmentJobStatusLabel, type DevelopmentFlow } from "./flow-model";
import { DevelopmentPanelMain } from "./development-panel-main";
import {
  developmentPrdSourceFromInput,
  EMPTY_DEVELOPMENT_PRD_SOURCE,
  serializeDevelopmentPrdSource,
  type DevelopmentPrdSourceValue,
} from "./development-prd-source-model";
import { createDevelopmentProject } from "./flow-project";
import { resolveProjectConversationWorkspace } from "./flow-navigation";
import { buildByteDevelopmentFixedFormValues } from "./project-context-model";
import {
  developmentFlowsQueryKey,
  prependDevelopmentFlow,
  removeDevelopmentFlow,
  replaceDevelopmentFlow,
  useDevelopmentFlows,
} from "./use-development-flows";
import { useByteDevelopmentProjectContext } from "./use-project-context";

const EMPTY_FLOWS: DevelopmentFlow[] = [];

function asInputRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function resolveSourceProjectId({
  input,
  flowProjectId,
  projectNames,
  fallbackProjectId,
}: {
  input: Record<string, unknown>;
  flowProjectId: string | null;
  projectNames: ReadonlyMap<string, string>;
  fallbackProjectId: string | null;
}): string | null {
  if (typeof input.sourceProjectId === "string" && projectNames.has(input.sourceProjectId)) {
    return input.sourceProjectId;
  }
  if (flowProjectId && projectNames.has(flowProjectId)) return flowProjectId;
  return fallbackProjectId;
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
  const client = useHostRuntimeClient(serverId);
  const closePluginPanel = usePluginAppPanelStore((state) => state.close);
  const activeWorkspace = useActiveWorkspaceSelection();
  const supportsJobList = useHostFeature(serverId, "pluginAppJobList");
  const supportsJobMutation = useHostFeature(serverId, "pluginAppJobMutation");
  const supportsDirectorylessProjects = useHostFeature(serverId, "projectCreateDirectoryless");
  const query = useDevelopmentFlows({ active, serverId, supported: supportsJobList });
  const flows = query.data ?? EMPTY_FLOWS;
  const projects = useHostProjects([serverId]);
  const upsertProject = useSessionStore((state) => state.upsertProject);
  const setHasHydratedWorkspaces = useSessionStore((state) => state.setHasHydratedWorkspaces);
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({});
  const [prdSource, setPrdSource] = useState<DevelopmentPrdSourceValue>({
    ...EMPTY_DEVELOPMENT_PRD_SOURCE,
  });
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedSourceProjectId, setSelectedSourceProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSourceProjectId && projectNames.has(selectedSourceProjectId)) return;
    setSelectedSourceProjectId(
      (activeProjectId && projectNames.has(activeProjectId) ? activeProjectId : null) ??
        projectOptions[0]?.value ??
        null,
    );
  }, [activeProjectId, projectNames, projectOptions, selectedSourceProjectId]);

  useEffect(() => {
    if (creating || editing) return;
    if (selectedFlowId && flows.some((flow) => flow.id === selectedFlowId)) return;
    setSelectedFlowId(flows[0]?.id ?? null);
  }, [creating, editing, flows, selectedFlowId]);

  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId) ?? null;
  const selectedProjectDisplay = useMemo(() => {
    const option = projectOptions.find((candidate) => candidate.value === selectedSourceProjectId);
    return option ? { label: option.label, description: option.description } : null;
  }, [projectOptions, selectedSourceProjectId]);
  const selectedProject = useMemo(
    () =>
      projects.find((project) => getHostProjectId(project, serverId) === selectedSourceProjectId) ??
      null,
    [projects, selectedSourceProjectId, serverId],
  );
  const projectContext = useByteDevelopmentProjectContext({
    active: active && (creating || editing),
    serverId,
    project: selectedProject,
  });
  const fixedFormValues = useMemo(
    () =>
      buildByteDevelopmentFixedFormValues({
        projectId: editing ? (selectedFlow?.projectId ?? null) : null,
        sourceProjectId: selectedSourceProjectId,
        repositoryPath: projectContext.repositoryPath,
        larkDocumentLinks: projectContext.larkDocumentLinks,
      }),
    [
      editing,
      projectContext.larkDocumentLinks,
      projectContext.repositoryPath,
      selectedFlow?.projectId,
      selectedSourceProjectId,
    ],
  );
  const editInitialValues = useMemo(() => {
    return asInputRecord(selectedFlow?.job.input);
  }, [selectedFlow?.job.input]);

  const handleSelectFlow = useCallback((flowId: string) => {
    setCreating(false);
    setEditing(false);
    setActionError(null);
    setSelectedFlowId(flowId);
  }, []);
  const handleCreate = useCallback(() => {
    setCreating(true);
    setEditing(false);
    setActionError(null);
    setPrdSource({ ...EMPTY_DEVELOPMENT_PRD_SOURCE });
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
      setEditing(false);
      setSelectedFlowId(job.id);
    },
    [queryClient, serverId],
  );
  const handlePrepareSubmission = useCallback(
    async (form: Record<string, unknown>) => {
      if (!client) throw new Error("Host 未连接");
      if (!supportsDirectorylessProjects) {
        throw new Error("当前 Host 不支持为开发流程创建独立 Project，请更新 daemon");
      }
      const submission = {
        ...form,
        ...serializeDevelopmentPrdSource(prdSource),
      };
      const flowTitle =
        typeof submission.flow_title === "string" ? submission.flow_title.trim() : "";
      const prd = typeof submission.prd === "string" ? submission.prd.trim() : "";
      if (!flowTitle || !prd) {
        throw new Error("流程名称和 PRD / 需求说明均不能为空");
      }
      const project = await createDevelopmentProject({
        client,
        flowTitle,
      });
      registerProjectDescriptor({
        serverId,
        project,
        upsertProject,
        setHasHydratedWorkspaces,
      });
      return {
        ...submission,
        projectId: project.projectId,
        sourceProjectId: selectedSourceProjectId,
      };
    },
    [
      client,
      prdSource,
      selectedSourceProjectId,
      serverId,
      setHasHydratedWorkspaces,
      supportsDirectorylessProjects,
      upsertProject,
    ],
  );
  const handleEdit = useCallback(() => {
    if (!selectedFlow) return;
    const input = asInputRecord(selectedFlow.job.input);
    const sourceProjectId = resolveSourceProjectId({
      input,
      flowProjectId: selectedFlow.projectId,
      projectNames,
      fallbackProjectId: projectOptions[0]?.value ?? null,
    });
    setSelectedSourceProjectId(sourceProjectId);
    setEditDraft(input);
    setPrdSource(developmentPrdSourceFromInput(input));
    setActionError(null);
    setEditing(true);
  }, [projectNames, projectOptions, selectedFlow]);
  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setActionError(null);
  }, []);
  const handleSaveEdit = useCallback(() => {
    if (!client || !selectedFlow) return;
    const flowTitle = typeof editDraft.flow_title === "string" ? editDraft.flow_title.trim() : "";
    const prd = prdSource.prd.trim();
    if (!flowTitle || !prd || !projectContext.repositoryPath) {
      setActionError("流程名称、PRD / 需求说明和代码来源 Project 均不能为空。");
      return;
    }
    setSaving(true);
    setActionError(null);
    void client
      .updatePluginAppJob(selectedFlow.id, {
        ...editDraft,
        ...serializeDevelopmentPrdSource(prdSource),
        ...fixedFormValues,
        projectId: selectedFlow.projectId,
        sourceProjectId: selectedSourceProjectId,
      })
      .then((result) => {
        if (result.error || !result.job) throw new Error(result.error ?? "保存失败");
        queryClient.setQueryData(
          developmentFlowsQueryKey(serverId),
          (current: DevelopmentFlow[] | undefined) => replaceDevelopmentFlow(current, result.job!),
        );
        setEditing(false);
        return undefined;
      })
      .catch((error: unknown) => {
        setActionError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSaving(false));
  }, [
    client,
    editDraft,
    fixedFormValues,
    projectContext.repositoryPath,
    prdSource,
    queryClient,
    selectedFlow,
    selectedSourceProjectId,
    serverId,
  ]);
  const handleDelete = useCallback(() => {
    if (!client || !selectedFlow) return;
    void (async () => {
      const confirmed = await confirmDialog({
        title: "删除开发流程",
        message: `删除“${selectedFlow.title}”及其流程记录？关联 Project 和会话会保留。`,
        confirmLabel: "删除",
        destructive: true,
      });
      if (!confirmed) return;
      setDeleting(true);
      setActionError(null);
      try {
        const result = await client.deletePluginAppJob(selectedFlow.id);
        if (result.error || !result.deleted) throw new Error(result.error ?? "删除失败");
        queryClient.setQueryData(
          developmentFlowsQueryKey(serverId),
          (current: DevelopmentFlow[] | undefined) =>
            removeDevelopmentFlow(current, selectedFlow.id),
        );
        setSelectedFlowId(null);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setDeleting(false);
      }
    })();
  }, [client, queryClient, selectedFlow, serverId]);
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
    const flowInput = asInputRecord(selectedFlow.job.input);
    const repositoryPath =
      typeof flowInput.repository_path === "string" ? flowInput.repository_path : undefined;
    router.push(
      buildNewWorkspaceRoute({
        serverId,
        projectId,
        displayName: project?.projectName ?? selectedFlow.title,
        sourceDirectory:
          (project ? getHostProjectSourceDirectory(project, serverId) : null) ??
          repositoryPath ??
          undefined,
      }),
    );
  }, [activeWorkspace, closePluginPanel, projects, router, selectedFlow, serverId]);

  if (!supportsJobList) {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.emptyTitle}>当前 Host 版本不支持开发流程列表</Text>
        <Text style={styles.hint}>请更新并重启 Paseo daemon 后再使用字节开发插件。</Text>
      </View>
    );
  }

  const selectedProjectName =
    (selectedFlow?.projectId ? projectNames.get(selectedFlow.projectId) : null) ?? "未关联 Project";
  const canRenderForm = Boolean(selectedSourceProjectId && projectContext.repositoryPath);

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
      <View style={styles.main}>
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
        {!supportsJobMutation && selectedFlow && !creating ? (
          <Text style={styles.hint}>更新 daemon 后可编辑和删除已有开发流程。</Text>
        ) : null}
        <DevelopmentPanelMain
          active={active}
          serverId={serverId}
          plugin={plugin}
          appDefinition={appDefinition}
          creating={creating}
          editing={editing}
          selectedFlow={selectedFlow}
          projectName={selectedProjectName}
          sourceProjectId={selectedSourceProjectId}
          sourceProjectDisplay={selectedProjectDisplay}
          projectOptions={projectOptions}
          fixedFormValues={fixedFormValues}
          prdSource={prdSource}
          editInitialValues={editInitialValues}
          contextLoading={projectContext.isLoading}
          contextError={projectContext.error}
          canRenderForm={canRenderForm}
          saving={saving}
          deleting={deleting}
          canMutate={supportsJobMutation}
          onSourceProjectChange={setSelectedSourceProjectId}
          onFormValuesChange={setEditDraft}
          onPrdSourceChange={setPrdSource}
          onPrepareSubmission={handlePrepareSubmission}
          onJobSubmitted={handleSubmitted}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
          onCreate={handleCreate}
          onOpenProject={handleOpenProject}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </View>
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
    gap: theme.spacing[3],
  },
  emptyList: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[4],
  },
  listError: {
    gap: theme.spacing[2],
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
