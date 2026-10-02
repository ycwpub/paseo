import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Copy, MessageSquare, Pencil, Plus, Save, Settings, Trash2, X } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginAppDefaultAgent,
  PluginAppDefinition,
  PluginAppState,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useHostProjects } from "@/projects/host-projects";
import {
  getCurrentProjectRemoveReadiness,
  removeProjectFromHosts,
} from "@/projects/project-remove";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { useHostFeatureMap } from "@/runtime/host-features";
import {
  getHostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  useHosts,
} from "@/runtime/host-runtime";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { buildNewWorkspaceRoute, buildProjectSettingsRoute } from "@/utils/host-routes";
import {
  buildHostedPluginProjectRemoveTarget,
  buildHostedPluginProjects,
  type HostedPluginProject,
  pluginProjectHostKey,
  resolvePluginProjectHostIds,
  resolvePluginProjectInitialHostId,
  resolvePluginProjectSelectionKey,
} from "./plugin-project-host-model";
import { configurePluginProjectOnHost } from "./plugin-project-host-actions";
import {
  removePluginProjectState,
  upsertPluginProjectState,
} from "./plugin-project-management-model";
import {
  buildPluginProjectFormValues,
  buildPluginProjectOptions,
  pluginProjectBoundFieldIds,
  resolvePluginProjectBinding,
  type PluginProjectOption,
} from "./plugin-project-model";
import {
  PluginProjectDeleteSheet,
  type PluginProjectDeleteMode,
} from "./plugin-project-delete-sheet";
import { PluginProjectDefaultAgentField } from "./plugin-project-default-agent-field";
import { PluginProjectList } from "./plugin-project-list";
import { resolvePluginProjectConversationWorkspace } from "./plugin-project-navigation-model";
import { pluginProjectsQueryKey } from "./use-plugin-projects";
import { usePluginProjectHosts } from "./use-plugin-project-hosts";

type PluginProjectMode = "existing" | "new";
type PluginProjectView = "detail" | "create" | "edit" | "copy";

const EMPTY_AGENT: PluginAppDefaultAgent = { provider: "codex", model: "" };

function pluginProjectEditorTitle(view: "create" | "edit" | "copy"): string {
  if (view === "create") return "创建插件项目";
  if (view === "copy") return "复制插件项目";
  return "编辑插件项目";
}

function pluginProjectSaveLabel(view: "create" | "edit" | "copy"): string {
  if (view === "create") return "创建插件项目";
  if (view === "copy") return "复制插件项目";
  return "保存修改";
}

export interface PluginProjectContext {
  serverId: string;
  hostLabel: string;
  projectId: string;
  projectName: string;
  sourceDirectory: string | null;
  defaultAgent: PluginAppDefaultAgent;
  data: Record<string, unknown>;
  fixedFormValues: Record<string, unknown>;
  hiddenFieldIds: string[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function projectDisplay(option: PluginProjectOption | null) {
  return option ? { label: option.label, description: option.description } : null;
}

function hostDisplay(option: SelectFieldOption<string> | null): SelectFieldDisplay | null {
  return option ? { label: option.label, description: option.description } : null;
}

function PluginProjectEditor({
  view,
  active,
  serverId,
  hostOptions,
  selectedHost,
  hostLoading,
  projectMode,
  selectedOption,
  projectOptions,
  newProjectName,
  defaultAgent,
  saving,
  canCreateNewProject,
  error,
  onProjectModeChange,
  onHostChange,
  onProjectChange,
  onNewProjectNameChange,
  onDefaultAgentChange,
  onSave,
  onCancel,
}: {
  view: "create" | "edit" | "copy";
  active: boolean;
  serverId: string;
  hostOptions: SelectFieldOption<string>[];
  selectedHost: SelectFieldOption<string> | null;
  hostLoading: boolean;
  projectMode: PluginProjectMode;
  selectedOption: PluginProjectOption | null;
  projectOptions: PluginProjectOption[];
  newProjectName: string;
  defaultAgent: PluginAppDefaultAgent;
  saving: boolean;
  canCreateNewProject: boolean;
  error: string | null;
  onProjectModeChange: (mode: PluginProjectMode) => void;
  onHostChange: (serverId: string) => void;
  onProjectChange: (projectId: string) => void;
  onNewProjectNameChange: (name: string) => void;
  onDefaultAgentChange: (value: PluginAppDefaultAgent) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const modeOptions = useMemo(
    () => [
      { value: "existing" as const, label: "选择已有 Project" },
      {
        value: "new" as const,
        label: "创建新 Project",
        disabled: !canCreateNewProject || view === "edit",
      },
    ],
    [canCreateNewProject, view],
  );
  const title = pluginProjectEditorTitle(view);
  return (
    <View style={styles.editorCard}>
      <View style={styles.editorHeader}>
        <View style={styles.editorHeading}>
          <Text style={styles.editorTitle}>{title}</Text>
          <Text style={styles.description}>
            Project 是插件的核心，页面、流程、历史和 Agent 对话都归属于它。
          </Text>
        </View>
        <Button size="xs" variant="ghost" leftIcon={X} onPress={onCancel}>
          取消
        </Button>
      </View>
      {view !== "edit" ? (
        <SegmentedControl
          value={projectMode}
          onValueChange={onProjectModeChange}
          options={modeOptions}
          style={styles.modeControl}
        />
      ) : null}
      {view === "create" ? (
        <SelectField
          label="主机（必填）"
          value={selectedHost?.value ?? null}
          selectedDisplay={hostDisplay(selectedHost)}
          options={hostOptions}
          onChange={onHostChange}
          placeholder="选择主机"
          emptyText="当前工作区主机筛选中没有可用主机"
          loading={hostLoading}
          hint="插件项目将创建在所选主机，并仅使用该主机上的 Project、Provider 和模型。"
        />
      ) : null}
      {projectMode === "existing" ? (
        <SelectField
          label="Project（必填）"
          value={selectedOption?.value ?? null}
          selectedDisplay={projectDisplay(selectedOption)}
          options={projectOptions}
          onChange={onProjectChange}
          placeholder="选择 Project"
          emptyText="当前 Host 没有可用 Project"
          searchable
          searchPlaceholder="搜索 Project"
          disabled={view === "edit"}
          hint={
            view === "edit"
              ? "插件项目与 Project 的关联不可直接替换；如需更换，请创建新插件项目。"
              : "可以复用已有 Project，也可以创建新的多目录 Project。"
          }
        />
      ) : (
        <Field label="新 Project 名称（必填）" hint="创建后会自动绑定到该插件项目。">
          <FormTextInput
            value={newProjectName}
            onChangeText={onNewProjectNameChange}
            placeholder="输入自定义 Project 名称"
          />
        </Field>
      )}
      <PluginProjectDefaultAgentField
        active={active}
        serverId={serverId}
        cwd={selectedOption?.sourceDirectory ?? null}
        value={defaultAgent}
        disabled={saving || view === "copy"}
        onChange={onDefaultAgentChange}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.editorActions}>
        <Button variant="secondary" disabled={saving} onPress={onCancel}>
          取消
        </Button>
        <Button variant="default" leftIcon={Save} loading={saving} onPress={onSave}>
          {pluginProjectSaveLabel(view)}
        </Button>
      </View>
    </View>
  );
}

function PluginProjectDetailHeader({
  project,
  canCopy,
  onEdit,
  onCopy,
  onDelete,
  onOpenConversation,
  onOpenSettings,
  extraActions,
}: {
  project: HostedPluginProject;
  canCopy: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onOpenConversation: () => void;
  onOpenSettings: () => void;
  extraActions?: ReactNode;
}) {
  return (
    <View style={styles.detailHeader}>
      <View style={styles.detailHeading}>
        <Text style={styles.detailTitle}>{project.projectName}</Text>
        <Text style={styles.description}>
          默认模型：{project.state.defaultAgent?.provider} · {project.state.defaultAgent?.model}
        </Text>
        {!project.option ? (
          <Text style={styles.errorText}>关联 Project 当前未在该 Host 中加载。</Text>
        ) : null}
      </View>
      <View style={styles.detailActions}>
        <Button size="sm" variant="outline" leftIcon={Copy} disabled={!canCopy} onPress={onCopy}>
          复制
        </Button>
        <Button size="sm" variant="outline" leftIcon={Pencil} onPress={onEdit}>
          编辑
        </Button>
        <Button size="sm" variant="outline" leftIcon={Settings} onPress={onOpenSettings}>
          Project 设置
        </Button>
        <Button size="sm" variant="outline" leftIcon={MessageSquare} onPress={onOpenConversation}>
          前往 Project 对话
        </Button>
        <Button size="sm" variant="destructive" leftIcon={Trash2} onPress={onDelete}>
          删除
        </Button>
        {extraActions}
      </View>
    </View>
  );
}

// oxlint-disable-next-line complexity -- Coordinates generic plugin-project creation, editing, deletion, navigation, and child rendering.
export function PluginProjectBoundary({
  active,
  serverId,
  pluginId,
  appDefinition,
  initialProjectId,
  renderDetailActions,
  children,
}: {
  active: boolean;
  serverId: string;
  pluginId: string | null | undefined;
  appDefinition: PluginAppDefinition;
  initialProjectId?: string;
  renderDetailActions?: (context: PluginProjectContext) => ReactNode;
  children: (context: PluginProjectContext) => ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const compact = useIsCompactFormFactor();
  const hosts = useHosts();
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);
  const allHostIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const candidateHostIds = useMemo(
    () => resolvePluginProjectHostIds(hosts, hostFilters, allHostIds),
    [allHostIds, hostFilters, hosts],
  );
  const candidateHosts = useMemo(() => {
    const selected = new Set(candidateHostIds);
    return hosts.filter((host) => selected.has(host.serverId));
  }, [candidateHostIds, hosts]);
  const connectionStatuses = useHostRuntimeConnectionStatuses(candidateHostIds);
  const onlineHostIds = useMemo(
    () => new Set(candidateHostIds.filter((hostId) => connectionStatuses.get(hostId) === "online")),
    [candidateHostIds, connectionStatuses],
  );
  const projects = useHostProjects(candidateHostIds);
  const activeWorkspace = useActiveWorkspaceSelection();
  const closePluginPanel = usePluginAppPanelStore((state) => state.close);
  const openAddProjectFlow = useAddProjectFlowStore((state) => state.openRequest);
  const supportsDirectorylessProjects = useHostFeatureMap(
    candidateHostIds,
    "projectCreateDirectoryless",
  );
  const supportsProjectScopedApps = useHostFeatureMap(candidateHostIds, "pluginProjectScopedApps");
  const supportsProjectDefaultAgent = useHostFeatureMap(
    candidateHostIds,
    "pluginProjectDefaultAgent",
  );
  const supportsProjectManagement = useHostFeatureMap(candidateHostIds, "pluginProjectManagement");
  const supportsProjectCopy = useHostFeatureMap(candidateHostIds, "pluginProjectCopy");
  const projectOptionsByHost = useMemo(
    () =>
      new Map(
        candidateHostIds.map(
          (hostId) => [hostId, buildPluginProjectOptions(projects, hostId)] as const,
        ),
      ),
    [candidateHostIds, projects],
  );
  const activeProjectId = useSessionStore((state) => {
    if (!activeWorkspace) return null;
    return (
      state.sessions[activeWorkspace.serverId]?.workspaces.get(activeWorkspace.workspaceId)
        ?.projectId ?? null
    );
  });
  const query = usePluginProjectHosts({
    active,
    hosts: candidateHosts,
    pluginId,
    appId: appDefinition.id,
  });
  const availableHostIds = query.data.availableHostIds;
  const managedProjects = useMemo(
    () =>
      buildHostedPluginProjects(
        query.data.sources.map((source) => ({
          ...source,
          options: projectOptionsByHost.get(source.serverId) ?? [],
        })),
      ),
    [projectOptionsByHost, query.data.sources],
  );
  const [view, setView] = useState<PluginProjectView>("detail");
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const [formHostId, setFormHostId] = useState<string | null>(null);
  const [projectMode, setProjectMode] = useState<PluginProjectMode>("existing");
  const [formProjectId, setFormProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [defaultAgent, setDefaultAgent] = useState<PluginAppDefaultAgent>(EMPTY_AGENT);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedProject = useMemo(
    () => managedProjects.find((project) => project.key === selectedProjectKey) ?? null,
    [managedProjects, selectedProjectKey],
  );
  const formProjectOptions = useMemo(
    () => (formHostId ? (projectOptionsByHost.get(formHostId) ?? []) : []),
    [formHostId, projectOptionsByHost],
  );
  const managedProjectIds = useMemo(
    () =>
      new Set(
        managedProjects
          .filter((project) => project.serverId === formHostId)
          .map((project) => project.projectId),
      ),
    [formHostId, managedProjects],
  );
  const availableProjectOptions = useMemo(
    () => formProjectOptions.filter((option) => !managedProjectIds.has(option.value)),
    [formProjectOptions, managedProjectIds],
  );
  const hostOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      candidateHosts.map((host) => ({
        id: host.serverId,
        value: host.serverId,
        label: host.label?.trim() || host.serverId,
        description: connectionStatuses.get(host.serverId) === "online" ? "已连接" : "当前离线",
      })),
    [candidateHosts, connectionStatuses],
  );
  const selectedHostOption = useMemo(
    () => hostOptions.find((option) => option.value === formHostId) ?? null,
    [formHostId, hostOptions],
  );
  const formProject = useMemo(
    () => formProjectOptions.find((option) => option.value === formProjectId) ?? null,
    [formProjectId, formProjectOptions],
  );
  const formHostOnline = formHostId ? onlineHostIds.has(formHostId) : false;
  const formHostAvailable = formHostId ? availableHostIds.includes(formHostId) : false;
  const formSupportsDirectorylessProjects = formHostId
    ? supportsDirectorylessProjects.get(formHostId) === true
    : false;
  const formSupportsProjectManagement = formHostId
    ? supportsProjectManagement.get(formHostId) === true &&
      supportsProjectScopedApps.get(formHostId) === true &&
      supportsProjectDefaultAgent.get(formHostId) === true
    : false;
  const selectedSupportsProjectCopy = selectedProject
    ? supportsProjectCopy.get(selectedProject.serverId) === true
    : false;
  const deleteReadiness = useMemo(
    () =>
      selectedProject?.option
        ? getCurrentProjectRemoveReadiness(buildHostedPluginProjectRemoveTarget(selectedProject))
        : null,
    [selectedProject],
  );
  const projectDeleteUnavailableReason = useMemo(() => {
    if (!selectedProject?.option) return "关联 Project 当前未在 Host 中加载。";
    if (deleteReadiness?.kind === "needs_host_update") {
      return "关联 Project 所在 Host 不支持删除，请更新并重启 daemon。";
    }
    return null;
  }, [deleteReadiness, selectedProject]);
  const projectBinding = useMemo(
    () => resolvePluginProjectBinding(appDefinition.project),
    [appDefinition.project],
  );

  useEffect(() => {
    if (!active || view !== "detail") return;
    const next = resolvePluginProjectSelectionKey({
      requestedProjectId: selectedProjectKey ? undefined : initialProjectId,
      preferredServerId: serverId,
      currentKey: selectedProjectKey,
      activeProject:
        activeWorkspace && activeProjectId
          ? { serverId: activeWorkspace.serverId, projectId: activeProjectId }
          : null,
      projects: managedProjects,
    });
    if (next !== selectedProjectKey) setSelectedProjectKey(next);
  }, [
    active,
    activeProjectId,
    activeWorkspace,
    initialProjectId,
    managedProjects,
    selectedProjectKey,
    serverId,
    view,
  ]);

  const startCreate = useCallback(() => {
    const hostId = resolvePluginProjectInitialHostId({
      visibleHostIds: availableHostIds.length > 0 ? availableHostIds : candidateHostIds,
      currentServerId: serverId,
      onlineHostIds,
    });
    const options = hostId ? (projectOptionsByHost.get(hostId) ?? []) : [];
    setView("create");
    setFormHostId(hostId);
    setProjectMode("existing");
    setFormProjectId(
      (activeProjectId &&
      activeWorkspace?.serverId === hostId &&
      options.some((option) => option.value === activeProjectId)
        ? activeProjectId
        : null) ??
        options[0]?.value ??
        null,
    );
    setNewProjectName("");
    setDefaultAgent(EMPTY_AGENT);
    setActionError(null);
  }, [
    activeProjectId,
    activeWorkspace?.serverId,
    availableHostIds,
    candidateHostIds,
    onlineHostIds,
    projectOptionsByHost,
    serverId,
  ]);
  const startEdit = useCallback(() => {
    if (!selectedProject?.state.defaultAgent) return;
    setView("edit");
    setFormHostId(selectedProject.serverId);
    setProjectMode("existing");
    setFormProjectId(selectedProject.projectId);
    setDefaultAgent(selectedProject.state.defaultAgent);
    setActionError(null);
  }, [selectedProject]);
  const startCopy = useCallback(() => {
    if (!selectedProject?.state.defaultAgent || !selectedSupportsProjectCopy) return;
    setView("copy");
    setFormHostId(selectedProject.serverId);
    setProjectMode("existing");
    const firstAvailableOption = (projectOptionsByHost.get(selectedProject.serverId) ?? []).find(
      (option) =>
        !managedProjects.some(
          (project) =>
            project.serverId === selectedProject.serverId && project.projectId === option.value,
        ),
    );
    setFormProjectId(firstAvailableOption?.value ?? null);
    setNewProjectName(`${selectedProject.projectName} 副本`);
    setDefaultAgent(selectedProject.state.defaultAgent);
    setActionError(null);
  }, [managedProjects, projectOptionsByHost, selectedProject, selectedSupportsProjectCopy]);
  const cancelEditor = useCallback(() => {
    setView("detail");
    setActionError(null);
  }, []);
  const selectProject = useCallback((projectKey: string) => {
    setSelectedProjectKey(projectKey);
    setView("detail");
    setActionError(null);
  }, []);
  const changeHost = useCallback(
    (hostId: string) => {
      const options = projectOptionsByHost.get(hostId) ?? [];
      setFormHostId(hostId);
      setFormProjectId(
        activeProjectId &&
          activeWorkspace?.serverId === hostId &&
          options.some((option) => option.value === activeProjectId)
          ? activeProjectId
          : (options[0]?.value ?? null),
      );
      setActionError(null);
      setDefaultAgent(EMPTY_AGENT);
    },
    [activeProjectId, activeWorkspace?.serverId, projectOptionsByHost],
  );
  const changeProjectMode = useCallback((mode: PluginProjectMode) => {
    setProjectMode(mode);
    setActionError(null);
  }, []);

  const saveConfiguredProject = useCallback(
    async (targetServerId: string, projectId: string, agent: PluginAppDefaultAgent) => {
      if (!pluginId) throw new Error("插件不可用");
      const app = await configurePluginProjectOnHost({
        serverId: targetServerId,
        pluginId,
        appId: appDefinition.id,
        projectId,
        defaultAgent: agent,
        getClient: (hostId) => getHostRuntimeStore().getClient(hostId),
      });
      queryClient.setQueryData<PluginAppState[]>(
        pluginProjectsQueryKey(targetServerId, pluginId, appDefinition.id),
        (current) => upsertPluginProjectState(current, app),
      );
      await query.refetch();
      setSelectedProjectKey(pluginProjectHostKey(targetServerId, projectId));
      setView("detail");
    },
    [appDefinition.id, pluginId, query, queryClient],
  );
  const saveCopiedProject = useCallback(
    async (targetProjectId: string) => {
      const targetServerId = selectedProject?.serverId ?? "";
      const client = getHostRuntimeStore().getClient(targetServerId);
      if (!client || !pluginId || !selectedProject) {
        throw new Error("Host 未连接、插件不可用或源插件项目不存在");
      }
      const copied = await client.copyPluginAppProject({
        pluginId,
        appId: appDefinition.id,
        sourceProjectId: selectedProject.projectId,
        targetProjectId,
      });
      if (copied.error || !copied.app) {
        throw new Error(copied.error ?? "复制插件项目失败");
      }
      queryClient.setQueryData<PluginAppState[]>(
        pluginProjectsQueryKey(targetServerId, pluginId, appDefinition.id),
        (current) => upsertPluginProjectState(current, copied.app!),
      );
      await query.refetch();
      setSelectedProjectKey(pluginProjectHostKey(targetServerId, targetProjectId));
      setView("detail");
    },
    [appDefinition.id, pluginId, query, queryClient, selectedProject],
  );

  const saveEditor = useCallback(() => {
    if (saving) return;
    if (!formHostId) {
      setActionError("请选择主机");
      return;
    }
    if (!formHostOnline) {
      setActionError("所选主机当前离线，请连接后重试");
      return;
    }
    if (!formHostAvailable) {
      setActionError("所选主机未安装或未启用此插件");
      return;
    }
    if (!formSupportsProjectManagement) {
      setActionError("所选主机不支持插件项目，请更新并重启 daemon");
      return;
    }
    const provider = defaultAgent.provider.trim();
    const model = defaultAgent.model.trim();
    if (!provider || !model) {
      setActionError("请选择默认 Provider 和模型");
      return;
    }
    const agent = { provider, model } as PluginAppDefaultAgent;
    if (projectMode === "new" && view !== "edit") {
      const name = newProjectName.trim();
      if (!name) {
        setActionError("请输入新 Project 名称");
        return;
      }
      if (!formSupportsDirectorylessProjects) {
        setActionError("当前 Host 不支持创建多目录 Project，请更新并重启 daemon");
        return;
      }
      setActionError(null);
      openAddProjectFlow({
        preferredHostId: formHostId,
        initialDirectorylessProjectName: name,
        onProjectCreated: ({ project }) => {
          setSaving(true);
          const save =
            view === "copy"
              ? saveCopiedProject(project.projectId)
              : saveConfiguredProject(formHostId, project.projectId, agent);
          void save
            .catch((error: unknown) => setActionError(errorText(error)))
            .finally(() => setSaving(false));
        },
      });
      return;
    }
    if (!formProjectId) {
      setActionError("请选择 Project");
      return;
    }
    setSaving(true);
    setActionError(null);
    const save =
      view === "copy"
        ? saveCopiedProject(formProjectId)
        : saveConfiguredProject(formHostId, formProjectId, agent);
    void save
      .catch((error: unknown) => setActionError(errorText(error)))
      .finally(() => setSaving(false));
  }, [
    defaultAgent,
    formHostAvailable,
    formHostId,
    formHostOnline,
    formProjectId,
    formSupportsDirectorylessProjects,
    formSupportsProjectManagement,
    newProjectName,
    openAddProjectFlow,
    projectMode,
    saveConfiguredProject,
    saveCopiedProject,
    saving,
    view,
  ]);

  const openConversation = useCallback(() => {
    if (!selectedProject) return;
    const targetServerId = selectedProject.serverId;
    const session = useSessionStore.getState().sessions[targetServerId];
    const workspace = resolvePluginProjectConversationWorkspace({
      projectId: selectedProject.projectId,
      activeWorkspaceId:
        activeWorkspace?.serverId === targetServerId ? activeWorkspace.workspaceId : null,
      workspaces: session?.workspaces.values() ?? [],
    });
    closePluginPanel();
    if (workspace) {
      navigateToWorkspace({ serverId: targetServerId, workspaceId: workspace.id });
      return;
    }
    router.push(
      buildNewWorkspaceRoute({
        serverId: targetServerId,
        projectId: selectedProject.projectId,
        displayName: selectedProject.projectName,
        sourceDirectory: selectedProject.sourceDirectory ?? undefined,
      }),
    );
  }, [activeWorkspace, closePluginPanel, router, selectedProject]);
  const openProjectSettings = useCallback(() => {
    if (!selectedProject) return;
    closePluginPanel();
    router.push(buildProjectSettingsRoute(selectedProject.serverId, selectedProject.projectId));
  }, [closePluginPanel, router, selectedProject]);
  const refreshProjects = useCallback(() => {
    void query.refetch();
  }, [query]);
  const openDeleteSheet = useCallback(() => setDeleteVisible(true), []);
  const closeDeleteSheet = useCallback(() => setDeleteVisible(false), []);

  const confirmDelete = useCallback(
    (mode: PluginProjectDeleteMode) => {
      const client = selectedProject
        ? getHostRuntimeStore().getClient(selectedProject.serverId)
        : null;
      if (!client || !pluginId || !selectedProject || deleting) return;
      if (mode === "plugin_and_project" && deleteReadiness?.kind !== "ready") {
        setActionError(projectDeleteUnavailableReason ?? "关联 Project 当前不可删除");
        return;
      }
      const target = selectedProject;
      const readiness = deleteReadiness;
      setDeleting(true);
      setActionError(null);
      void (async () => {
        try {
          const response = await client.deletePluginAppProject({
            pluginId,
            appId: appDefinition.id,
            projectId: target.projectId,
          });
          if (response.error || !response.deleted) {
            throw new Error(response.error ?? "删除插件项目失败");
          }
          queryClient.setQueryData<PluginAppState[]>(
            pluginProjectsQueryKey(target.serverId, pluginId, appDefinition.id),
            (current) => removePluginProjectState(current, target.projectId),
          );
          await query.refetch();
          setDeleteVisible(false);
          setSelectedProjectKey(null);
          if (mode === "plugin_and_project" && readiness?.kind === "ready") {
            const outcome = await removeProjectFromHosts({
              targets: readiness.targets,
              getClient: (targetServerId) => getHostRuntimeStore().getClient(targetServerId),
            });
            if (outcome.kind !== "removed") {
              setActionError("插件项目已删除，但关联 Project 删除失败或 Host 已断开。");
            }
          }
        } catch (error) {
          setActionError(errorText(error));
        } finally {
          setDeleting(false);
        }
      })();
    },
    [
      appDefinition.id,
      deleteReadiness,
      deleting,
      pluginId,
      projectDeleteUnavailableReason,
      query,
      queryClient,
      selectedProject,
    ],
  );

  const context = useMemo<PluginProjectContext | null>(() => {
    if (!selectedProject?.state.defaultAgent) return null;
    const option =
      selectedProject.option ??
      ({
        id: selectedProject.projectId,
        value: selectedProject.projectId,
        label: selectedProject.projectName,
        projectName: selectedProject.projectName,
        sourceDirectory: selectedProject.sourceDirectory,
      } as PluginProjectOption);
    return {
      serverId: selectedProject.serverId,
      hostLabel: selectedProject.hostLabel,
      projectId: selectedProject.projectId,
      projectName: selectedProject.projectName,
      sourceDirectory: selectedProject.sourceDirectory,
      defaultAgent: selectedProject.state.defaultAgent,
      data: selectedProject.state.data,
      fixedFormValues: {
        ...buildPluginProjectFormValues(projectBinding, option),
        defaultAgentProvider: selectedProject.state.defaultAgent.provider,
        defaultAgentModel: selectedProject.state.defaultAgent.model,
        agent_provider: selectedProject.state.defaultAgent.provider,
        agent_model: selectedProject.state.defaultAgent.model,
      },
      hiddenFieldIds: [
        ...pluginProjectBoundFieldIds(projectBinding),
        "defaultAgentProvider",
        "defaultAgentModel",
        "agent_provider",
        "agent_model",
      ],
    };
  }, [projectBinding, selectedProject]);
  const listError = useMemo(() => {
    if (query.error instanceof Error) return query.error.message;
    if (query.data.hostErrors.length === 0) return null;
    return `部分主机加载失败：${query.data.hostErrors
      .map((hostError) => `${hostError.hostLabel}（${hostError.message}）`)
      .join("；")}`;
  }, [query.data.hostErrors, query.error]);

  let mainContent: ReactNode;
  if (view === "create" || view === "edit" || view === "copy") {
    const editorProjectOptions = view === "edit" ? formProjectOptions : availableProjectOptions;
    mainContent = (
      <PluginProjectEditor
        view={view}
        active={active}
        serverId={formHostId ?? serverId}
        hostOptions={hostOptions}
        selectedHost={selectedHostOption}
        hostLoading={query.isLoading}
        projectMode={projectMode}
        selectedOption={formProject}
        projectOptions={editorProjectOptions}
        newProjectName={newProjectName}
        defaultAgent={defaultAgent}
        saving={saving}
        canCreateNewProject={formSupportsDirectorylessProjects}
        error={actionError}
        onProjectModeChange={changeProjectMode}
        onHostChange={changeHost}
        onProjectChange={setFormProjectId}
        onNewProjectNameChange={setNewProjectName}
        onDefaultAgentChange={setDefaultAgent}
        onSave={saveEditor}
        onCancel={cancelEditor}
      />
    );
  } else if (selectedProject && context) {
    mainContent = (
      <>
        <PluginProjectDetailHeader
          project={selectedProject}
          canCopy={selectedSupportsProjectCopy}
          onEdit={startEdit}
          onCopy={startCopy}
          onDelete={openDeleteSheet}
          onOpenConversation={openConversation}
          onOpenSettings={openProjectSettings}
          extraActions={renderDetailActions?.(context)}
        />
        {children(context)}
      </>
    );
  } else {
    mainContent = (
      <View style={styles.emptyDetail}>
        <Text style={styles.editorTitle}>选择或创建插件项目</Text>
        <Text style={styles.description}>
          左侧管理插件项目，日常 Agent 沟通仍在关联 Project 中进行。
        </Text>
        <Button variant="default" leftIcon={Plus} onPress={startCreate}>
          创建插件项目
        </Button>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.layout, compact && styles.layoutCompact]}>
        <PluginProjectList
          projects={managedProjects}
          selectedProjectKey={selectedProjectKey}
          loading={query.isLoading}
          error={listError}
          onSelect={selectProject}
          onCreate={startCreate}
          onRefresh={refreshProjects}
          compact={compact}
        />
        <View style={styles.main}>
          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          {mainContent}
        </View>
      </View>
      <PluginProjectDeleteSheet
        visible={deleteVisible}
        projectName={selectedProject?.projectName ?? "关联 Project"}
        projectDeleteUnavailableReason={projectDeleteUnavailableReason}
        deleting={deleting}
        onClose={closeDeleteSheet}
        onDelete={confirmDelete}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  layout: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[6],
  },
  layoutCompact: {
    flexDirection: "column",
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[6],
  },
  editorCard: {
    gap: theme.spacing[4],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  editorHeading: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  editorTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  modeControl: {
    alignSelf: "flex-start",
  },
  editorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[4],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  detailHeading: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing[1],
  },
  detailTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  detailActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  emptyDetail: {
    alignItems: "flex-start",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[8],
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
}));
