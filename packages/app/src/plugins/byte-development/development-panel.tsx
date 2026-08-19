import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { shouldShowPluginListCreateAction } from "@/plugins/project/plugin-project-list-presentation";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";
import { useSessionStore } from "@/stores/session-store";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { formatTimeAgo } from "@/utils/time";
import { DevelopmentDeleteSheet } from "./development-delete-sheet";
import { DevelopmentPanelMain } from "./development-panel-main";
import {
  buildDevelopmentCopyInput,
  buildDevelopmentDraftInput,
  buildDevelopmentPrdInput,
} from "./development-draft-model";
import {
  developmentPrdSourceFromInput,
  type DevelopmentPrdSourceValue,
} from "./development-prd-source-model";
import {
  resolveDevelopmentProjectSelection,
  type DevelopmentProjectMode,
} from "./development-project-selection-model";
import { resolveProjectConversationWorkspace } from "./flow-navigation";
import {
  developmentStageCollaborationFromInput,
  updateDevelopmentStageCollaborationInput,
} from "./development-stage-collaboration-model";
import {
  createDevelopmentStageAgent,
  resolveReusableDevelopmentStageSession,
} from "./development-stage-agent-actions";
import {
  developmentFlowStatusLabel,
  type DevelopmentFlow,
  type DevelopmentStageId,
} from "./flow-model";
import { buildByteDevelopmentFixedFormValues } from "./project-context-model";
import {
  developmentFlowsQueryKey,
  prependDevelopmentFlow,
  replaceDevelopmentFlow,
  useDevelopmentFlows,
} from "./use-development-flows";
import { useByteDevelopmentProjectContext } from "./use-project-context";
import { useDevelopmentDelete } from "./use-development-delete";
import { useDevelopmentProjectSettingsNavigation } from "./use-development-project-settings-navigation";
import type { PluginProjectDefaultAgentValue } from "@/plugins/project/plugin-project-default-agent-field";

const EMPTY_FLOWS: DevelopmentFlow[] = [];

function asInputRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function statusVariant(status: PluginHttpJob["status"]): "success" | "error" | "muted" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "timed_out") return "error";
  return "muted";
}

function resolveFlowProjectIdForForm(input: {
  editing: boolean;
  selectedFlowProjectId: string | null;
  editedFlowProjectId: string | null;
  projectMode: DevelopmentProjectMode;
}): string | null {
  if (input.editing) return input.editedFlowProjectId;
  if (input.projectMode === "existing") return input.selectedFlowProjectId;
  return null;
}

function canConfigureFlowProject(input: {
  creating: boolean;
  flowTitle: string;
  projectMode: DevelopmentProjectMode;
  selectedFlowProjectId: string | null;
  supportsDirectorylessProjects: boolean;
}): boolean {
  if (!input.creating) return true;
  if (!input.flowTitle.trim()) return false;
  if (input.projectMode === "existing") return Boolean(input.selectedFlowProjectId);
  return input.supportsDirectorylessProjects;
}

function resolveContextProjectId(input: {
  creating: boolean;
  selectedFlowProjectId: string | null;
  selectedFlowProjectIdFromJob: string | null;
  flowProjectIdForForm: string | null;
}): string | null {
  if (input.creating) return input.selectedFlowProjectId;
  return input.selectedFlowProjectIdFromJob ?? input.flowProjectIdForForm;
}

function resolveCanRenderForm(input: {
  creating: boolean;
  canCreateFlow: boolean;
  supportsJobDrafts: boolean;
  flowProjectIdForForm: string | null;
}): boolean {
  if (input.creating) return input.canCreateFlow && input.supportsJobDrafts;
  return Boolean(input.flowProjectIdForForm);
}

function canCopyDevelopmentFlow(input: {
  supportsJobDrafts: boolean;
  flow: DevelopmentFlow | null;
  pluginId: string | undefined;
}): boolean {
  return input.supportsJobDrafts && Boolean(input.flow?.projectId) && Boolean(input.pluginId);
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
          label={developmentFlowStatusLabel(flow)}
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
        {shouldShowPluginListCreateAction(flows.length) ? (
          <Button size="xs" variant="default" leftIcon={Plus} onPress={onCreate}>
            新建
          </Button>
        ) : null}
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

function DevelopmentPanelLayout({
  compact,
  flows,
  projectNames,
  selectedFlowId,
  loading,
  queryError,
  actionError,
  showMutationHint,
  onSelect,
  onCreate,
  onRefresh,
  children,
}: {
  compact: boolean;
  flows: DevelopmentFlow[];
  projectNames: ReadonlyMap<string, string>;
  selectedFlowId: string | null;
  loading: boolean;
  queryError: unknown;
  actionError: string | null;
  showMutationHint: boolean;
  onSelect: (flowId: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <View style={[styles.layout, compact ? styles.layoutCompact : styles.layoutDesktop]}>
      <FlowList
        flows={flows}
        projectNames={projectNames}
        selectedFlowId={selectedFlowId}
        loading={loading}
        error={queryError instanceof Error ? queryError.message : null}
        onSelect={onSelect}
        onCreate={onCreate}
        onRefresh={onRefresh}
        compact={compact}
      />
      <View style={styles.main}>
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
        {showMutationHint ? (
          <Text style={styles.hint}>更新 daemon 后可编辑和删除已有开发流程。</Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

// oxlint-disable-next-line complexity -- This state owner coordinates draft, Project, PRD, copy, delete, and navigation lifecycles.
export function ByteDevelopmentPanel({
  active,
  serverId,
  plugin,
  appDefinition,
  compact = false,
  initialProjectId,
  initialPluginProjectId,
  onNavigateAway,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  compact?: boolean;
  initialProjectId?: string;
  initialPluginProjectId?: string;
  onNavigateAway?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(serverId);
  const openAddProjectFlow = useAddProjectFlowStore((state) => state.openRequest);
  const closePluginPanel = usePluginAppPanelStore((state) => state.close);
  const activeWorkspace = useActiveWorkspaceSelection();
  const supportsJobList = useHostFeature(serverId, "pluginAppJobList");
  const supportsJobMutation = useHostFeature(serverId, "pluginAppJobMutation");
  const supportsJobDrafts = useHostFeature(serverId, "pluginAppJobDrafts");
  const supportsDirectorylessProjects = useHostFeature(serverId, "projectCreateDirectoryless");
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({});
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [projectMode, setProjectMode] = useState<DevelopmentProjectMode>("existing");
  const [selectedFlowProjectId, setSelectedFlowProjectId] = useState<string | null>(null);
  const [flowTitle, setFlowTitle] = useState("");
  const [defaultAgent, setDefaultAgent] = useState<PluginProjectDefaultAgentValue>({
    provider: "",
    model: "",
  });

  useEffect(() => {
    if (creating) return;
    if (selectedFlowProjectId && projectNames.has(selectedFlowProjectId)) return;
    setSelectedFlowProjectId(
      (activeProjectId && projectNames.has(activeProjectId) ? activeProjectId : null) ??
        projectOptions[0]?.value ??
        null,
    );
  }, [activeProjectId, creating, projectNames, projectOptions, selectedFlowProjectId]);

  useEffect(() => {
    if (creating || editing) return;
    if (selectedFlowId && flows.some((flow) => flow.id === selectedFlowId)) return;
    const requestedFlow =
      (initialPluginProjectId
        ? flows.find((flow) => flow.id === initialPluginProjectId)
        : undefined) ??
      (initialProjectId ? flows.find((flow) => flow.projectId === initialProjectId) : undefined);
    setSelectedFlowId(requestedFlow?.id ?? flows[0]?.id ?? null);
  }, [creating, editing, flows, initialPluginProjectId, initialProjectId, selectedFlowId]);

  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId) ?? null;
  const handleOpenProjectSettings = useDevelopmentProjectSettingsNavigation({
    serverId,
    projectId: selectedFlow?.projectId,
    onNavigateAway,
  });
  const selectedFlowProjectDisplay = useMemo(() => {
    const option = projectOptions.find((candidate) => candidate.value === selectedFlowProjectId);
    return option ? { label: option.label, description: option.description } : null;
  }, [projectOptions, selectedFlowProjectId]);
  const flowProjectIdForForm = resolveFlowProjectIdForForm({
    editing,
    selectedFlowProjectId,
    editedFlowProjectId: selectedFlow?.projectId ?? null,
    projectMode,
  });
  const contextProjectId = resolveContextProjectId({
    creating,
    selectedFlowProjectId,
    selectedFlowProjectIdFromJob: selectedFlow?.projectId ?? null,
    flowProjectIdForForm,
  });
  const selectedProject = useMemo(
    () =>
      projects.find((project) => getHostProjectId(project, serverId) === contextProjectId) ?? null,
    [contextProjectId, projects, serverId],
  );
  const projectContext = useByteDevelopmentProjectContext({
    active: active && Boolean(contextProjectId),
    serverId,
    project: selectedProject,
  });
  const fixedFormValues = useMemo(
    () =>
      buildByteDevelopmentFixedFormValues({
        projectId: contextProjectId,
        repositoryPath: projectContext.repositoryPath,
      }),
    [contextProjectId, projectContext.repositoryPath],
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
    setActionError(
      supportsJobDrafts ? null : "当前 Host 不支持开发任务草稿，请更新并重启 daemon。",
    );
    setProjectMode("existing");
    setFlowTitle("");
    setDefaultAgent({ provider: "", model: "" });
    setSelectedFlowProjectId(null);
    setSelectedFlowId(null);
  }, [supportsJobDrafts]);
  const handleProjectModeChange = useCallback(
    (mode: DevelopmentProjectMode) => {
      if (mode === "new") {
        const projectName = flowTitle.trim();
        if (!projectName) {
          setActionError("请先填写新开发流程名称，再创建 Project。");
          return;
        }
        if (!supportsDirectorylessProjects) {
          setActionError("当前 Host 不支持创建多目录 Project，请更新并重启 daemon。");
          return;
        }
        setActionError(null);
        openAddProjectFlow({
          preferredHostId: serverId,
          initialDirectorylessProjectName: projectName,
          onProjectCreated: ({ project }) => {
            setProjectMode("existing");
            setSelectedFlowProjectId(project.projectId);
          },
        });
        return;
      }
      setProjectMode("existing");
    },
    [flowTitle, openAddProjectFlow, serverId, supportsDirectorylessProjects],
  );
  const handleFlowProjectChange = useCallback((projectId: string) => {
    setSelectedFlowProjectId(projectId);
  }, []);
  const handleFlowTitleChange = useCallback((title: string) => {
    setFlowTitle(title);
    setActionError(null);
  }, []);
  const handleDefaultAgentChange = useCallback((value: PluginProjectDefaultAgentValue) => {
    setDefaultAgent(value);
    setActionError(null);
  }, []);
  const handleRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);
  const handleCreateDraft = useCallback(() => {
    if (!client || !plugin.pluginId) {
      setActionError("Host 未连接");
      return;
    }
    if (!supportsJobDrafts) {
      setActionError("当前 Host 不支持开发任务草稿，请更新并重启 daemon。");
      return;
    }
    void (async () => {
      setSaving(true);
      setActionError(null);
      try {
        const projectSelection = await resolveDevelopmentProjectSelection({
          selection: {
            mode: "existing",
            existingProjectId: selectedFlowProjectId,
          },
        });
        const title = flowTitle.trim();
        if (!title) throw new Error("开发流程名称不能为空");
        const result = await client.createPluginAppJobDraft({
          pluginId: plugin.pluginId!,
          serviceName: "development",
          projectId: projectSelection.projectId,
          input: buildDevelopmentDraftInput({
            flowTitle: title,
            projectId: projectSelection.projectId,
            defaultAgent,
          }),
        });
        if (result.error || !result.job) {
          throw new Error(result.error ?? "创建开发任务失败");
        }
        queryClient.setQueryData(
          developmentFlowsQueryKey(serverId),
          (current: DevelopmentFlow[] | undefined) => prependDevelopmentFlow(current, result.job!),
        );
        setCreating(false);
        setEditing(false);
        setSelectedFlowId(result.job.id);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setSaving(false);
      }
    })();
  }, [
    client,
    defaultAgent,
    flowTitle,
    plugin.pluginId,
    queryClient,
    selectedFlowProjectId,
    serverId,
    supportsJobDrafts,
  ]);
  const handleEdit = useCallback(() => {
    if (!selectedFlow) return;
    const input = asInputRecord(selectedFlow.job.input);
    setEditDraft(input);
    setActionError(null);
    setEditing(true);
  }, [selectedFlow]);
  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setActionError(null);
  }, []);
  const handleSaveEdit = useCallback(() => {
    if (!client || !selectedFlow) return;
    const editFlowTitle =
      typeof editDraft.flow_title === "string" ? editDraft.flow_title.trim() : "";
    if (!editFlowTitle) {
      setActionError("流程名称不能为空。PRD 请在 PRD 节点中填写。");
      return;
    }
    setSaving(true);
    setActionError(null);
    void client
      .updatePluginAppJob(
        selectedFlow.id,
        buildDevelopmentPrdInput({
          currentInput: {
            ...asInputRecord(selectedFlow.job.input),
            ...editDraft,
          },
          projectId: selectedFlow.projectId,
          prdSource: developmentPrdSourceFromInput(editDraft),
          fixedFormValues,
        }),
      )
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
  }, [client, editDraft, fixedFormValues, queryClient, selectedFlow, serverId]);
  const handleSavePrd = useCallback(
    async (value: DevelopmentPrdSourceValue) => {
      if (!client || !selectedFlow) throw new Error("开发任务不可用");
      if (selectedFlow.job.status === "queued" || selectedFlow.job.status === "running") {
        throw new Error("旧版 Workflow 仍在运行，暂时不能修改 PRD");
      }
      const result = await client.updatePluginAppJob(
        selectedFlow.id,
        buildDevelopmentPrdInput({
          currentInput: asInputRecord(selectedFlow.job.input),
          projectId: selectedFlow.projectId,
          prdSource: value,
        }),
      );
      if (result.error || !result.job) throw new Error(result.error ?? "保存 PRD 失败");
      queryClient.setQueryData(
        developmentFlowsQueryKey(serverId),
        (current: DevelopmentFlow[] | undefined) => replaceDevelopmentFlow(current, result.job!),
      );
    },
    [client, queryClient, selectedFlow, serverId],
  );
  const updateSelectedFlowInput = useCallback(
    async (input: Record<string, unknown>) => {
      if (!client || !selectedFlow) throw new Error("开发流程不可用");
      if (selectedFlow.job.status === "queued" || selectedFlow.job.status === "running") {
        throw new Error("旧版 Workflow 仍在运行，暂时不能更新节点");
      }
      const result = await client.updatePluginAppJob(selectedFlow.id, input);
      if (result.error || !result.job) throw new Error(result.error ?? "保存节点信息失败");
      queryClient.setQueryData(
        developmentFlowsQueryKey(serverId),
        (current: DevelopmentFlow[] | undefined) => replaceDevelopmentFlow(current, result.job!),
      );
      return result.job;
    },
    [client, queryClient, selectedFlow, serverId],
  );
  const handleSaveStageKnowledge = useCallback(
    async (stageId: DevelopmentStageId, knowledge: string) => {
      if (!selectedFlow) throw new Error("开发流程不可用");
      await updateSelectedFlowInput(
        updateDevelopmentStageCollaborationInput({
          currentInput: asInputRecord(selectedFlow.job.input),
          stageId,
          patch: { knowledge },
        }),
      );
    },
    [selectedFlow, updateSelectedFlowInput],
  );
  const handleOpenStage = useCallback(
    async (
      stageId: DevelopmentStageId,
      knowledge: string,
      prdSource?: DevelopmentPrdSourceValue,
      reopen = false,
    ) => {
      if (!client || !selectedFlow) throw new Error("开发流程不可用");
      const projectId = selectedFlow.projectId;
      if (!projectId) throw new Error("开发流程没有关联 Project");

      let currentInput = asInputRecord(selectedFlow.job.input);
      if (prdSource) {
        currentInput = buildDevelopmentPrdInput({
          currentInput,
          projectId,
          prdSource,
          fixedFormValues,
        });
      }
      const collaboration = developmentStageCollaborationFromInput(currentInput, stageId);
      const session = useSessionStore.getState().sessions[serverId];
      const collaborationWorkspace = collaboration.workspaceId
        ? (session?.workspaces.get(collaboration.workspaceId) ?? null)
        : null;
      const reusableSession = resolveReusableDevelopmentStageSession({
        projectId,
        agentId: collaboration.agentId,
        workspaceId: collaboration.workspaceId,
        workspace: collaborationWorkspace,
      });
      if (reusableSession) {
        await updateSelectedFlowInput(
          updateDevelopmentStageCollaborationInput({
            currentInput,
            stageId,
            patch: {
              knowledge,
              status:
                reopen || collaboration.status !== "completed"
                  ? ("in_progress" as const)
                  : ("completed" as const),
              ...(reopen ? { completedAt: null } : {}),
            },
          }),
        );
        closePluginPanel();
        navigateToAgent({
          serverId,
          agentId: reusableSession.agentId,
          workspaceId: reusableSession.workspaceId,
          pin: true,
        });
        return;
      }

      const existingWorkspace = resolveProjectConversationWorkspace({
        projectId,
        activeWorkspaceId:
          activeWorkspace?.serverId === serverId ? activeWorkspace.workspaceId : null,
        workspaces: session?.workspaces.values() ?? [],
      });
      const created = await createDevelopmentStageAgent({
        client,
        flow: selectedFlow,
        stageId,
        knowledge,
        flowInput: currentInput,
        sourceDirectory:
          (selectedProject ? getHostProjectSourceDirectory(selectedProject, serverId) : null) ??
          projectContext.repositoryPath,
        existingWorkspace: existingWorkspace
          ? {
              id: existingWorkspace.id,
              projectId: existingWorkspace.projectId,
              workspaceDirectory: existingWorkspace.workspaceDirectory,
            }
          : null,
      });
      await updateSelectedFlowInput(
        updateDevelopmentStageCollaborationInput({
          currentInput,
          stageId,
          patch: {
            status: "in_progress",
            knowledge,
            agentId: created.agentId,
            workspaceId: created.workspaceId,
            startedAt: created.startedAt,
            completedAt: null,
          },
          now: created.startedAt,
        }),
      );
      closePluginPanel();
      navigateToAgent({
        serverId,
        agentId: created.agentId,
        workspaceId: created.workspaceId,
        pin: true,
      });
    },
    [
      activeWorkspace,
      client,
      closePluginPanel,
      fixedFormValues,
      projectContext.repositoryPath,
      selectedFlow,
      selectedProject,
      serverId,
      updateSelectedFlowInput,
    ],
  );
  const handleCompleteStage = useCallback(
    async (stageId: DevelopmentStageId, knowledge: string) => {
      if (!selectedFlow) throw new Error("开发流程不可用");
      const collaboration = developmentStageCollaborationFromInput(selectedFlow.job.input, stageId);
      if (!collaboration.agentId) {
        throw new Error("请先在 Project 中开始该节点，再标记完成");
      }
      const completedAt = new Date().toISOString();
      await updateSelectedFlowInput(
        updateDevelopmentStageCollaborationInput({
          currentInput: asInputRecord(selectedFlow.job.input),
          stageId,
          patch: {
            status: "completed",
            knowledge,
            completedAt,
          },
          now: completedAt,
        }),
      );
    },
    [selectedFlow, updateSelectedFlowInput],
  );
  const handleReopenStage = useCallback(
    async (stageId: DevelopmentStageId, knowledge: string) => {
      await handleOpenStage(stageId, knowledge, undefined, true);
    },
    [handleOpenStage],
  );
  const handleFlowDeleted = useCallback(() => setSelectedFlowId(null), []);
  const developmentDelete = useDevelopmentDelete({
    client,
    serverId,
    flows,
    projects,
    onDeleted: handleFlowDeleted,
    onError: setActionError,
  });
  const handleDelete = useCallback(
    () => developmentDelete.open(selectedFlow),
    [developmentDelete, selectedFlow],
  );
  const handleCopy = useCallback(() => {
    if (!client || !selectedFlow || !plugin.pluginId) {
      setActionError("开发流程不可用");
      return;
    }
    if (!supportsJobDrafts) {
      setActionError("当前 Host 不支持复制插件项目，请更新并重启 daemon。");
      return;
    }
    const projectId = selectedFlow.projectId;
    if (!projectId) {
      setActionError("源开发流程没有关联 Project");
      return;
    }
    void (async () => {
      setCopying(true);
      setActionError(null);
      try {
        const result = await client.createPluginAppJobDraft({
          pluginId: plugin.pluginId!,
          serviceName: selectedFlow.job.serviceName,
          projectId,
          input: buildDevelopmentCopyInput({
            currentInput: asInputRecord(selectedFlow.job.input),
            sourceTitle: selectedFlow.title,
            existingTitles: flows.map((flow) => flow.title),
            projectId,
          }),
        });
        if (result.error || !result.job) {
          throw new Error(result.error ?? "复制插件项目失败");
        }
        queryClient.setQueryData(
          developmentFlowsQueryKey(serverId),
          (current: DevelopmentFlow[] | undefined) => prependDevelopmentFlow(current, result.job!),
        );
        setCreating(false);
        setEditing(false);
        setSelectedFlowId(result.job.id);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setCopying(false);
      }
    })();
  }, [client, flows, plugin.pluginId, queryClient, selectedFlow, serverId, supportsJobDrafts]);
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
  const canCreateFlow =
    canConfigureFlowProject({
      creating,
      flowTitle,
      projectMode,
      selectedFlowProjectId,
      supportsDirectorylessProjects,
    }) && Boolean(defaultAgent.provider.trim() && defaultAgent.model.trim());
  const canRenderForm = resolveCanRenderForm({
    creating,
    canCreateFlow,
    supportsJobDrafts,
    flowProjectIdForForm,
  });
  const canCopyFlow = canCopyDevelopmentFlow({
    supportsJobDrafts,
    flow: selectedFlow,
    pluginId: plugin.pluginId,
  });

  return (
    <>
      <DevelopmentPanelLayout
        compact={compact}
        flows={flows}
        projectNames={projectNames}
        selectedFlowId={selectedFlowId}
        loading={query.isLoading}
        queryError={query.error}
        actionError={actionError}
        showMutationHint={!supportsJobMutation && Boolean(selectedFlow) && !creating}
        onSelect={handleSelectFlow}
        onCreate={handleCreate}
        onRefresh={handleRefresh}
      >
        <DevelopmentPanelMain
          active={active}
          serverId={serverId}
          plugin={plugin}
          appDefinition={appDefinition}
          creating={creating}
          editing={editing}
          flowTitle={flowTitle}
          selectedFlow={selectedFlow}
          projectName={selectedProjectName}
          projectMode={projectMode}
          flowProjectId={flowProjectIdForForm}
          flowProjectDisplay={selectedFlowProjectDisplay}
          projectOptions={projectOptions}
          canCreateNewProject={supportsDirectorylessProjects}
          defaultAgent={defaultAgent}
          defaultAgentCwd={
            selectedProject ? getHostProjectSourceDirectory(selectedProject, serverId) : null
          }
          fixedFormValues={fixedFormValues}
          editInitialValues={editInitialValues}
          contextLoading={creating ? false : projectContext.isLoading}
          contextError={projectContext.error}
          canRenderForm={canRenderForm}
          saving={saving}
          copying={copying}
          deleting={developmentDelete.deleting}
          canMutate={supportsJobMutation}
          canCopy={canCopyFlow}
          onFlowTitleChange={handleFlowTitleChange}
          onProjectModeChange={handleProjectModeChange}
          onFlowProjectChange={handleFlowProjectChange}
          onDefaultAgentChange={handleDefaultAgentChange}
          onFormValuesChange={setEditDraft}
          onCreateDraft={handleCreateDraft}
          onSavePrd={handleSavePrd}
          onSaveStageKnowledge={handleSaveStageKnowledge}
          onOpenStage={handleOpenStage}
          onCompleteStage={handleCompleteStage}
          onReopenStage={handleReopenStage}
          onCopy={handleCopy}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
          onCreate={handleCreate}
          onOpenProject={handleOpenProject}
          onOpenProjectSettings={handleOpenProjectSettings}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </DevelopmentPanelLayout>
      <DevelopmentDeleteSheet
        visible={Boolean(developmentDelete.deleteTarget)}
        flowTitle={developmentDelete.deleteTarget?.title ?? ""}
        projectName={developmentDelete.projectName}
        otherFlowCount={developmentDelete.otherFlowCount}
        projectDeleteUnavailableReason={developmentDelete.projectDeleteUnavailableReason}
        deleting={developmentDelete.deleting}
        onClose={developmentDelete.close}
        onDelete={developmentDelete.confirm}
      />
    </>
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
