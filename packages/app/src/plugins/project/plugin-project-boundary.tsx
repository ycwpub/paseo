import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginAppDefinition } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import { useHostProjects } from "@/projects/host-projects";
import { useHostFeature } from "@/runtime/host-features";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import {
  buildPluginProjectFormValues,
  buildPluginProjectOptions,
  pluginProjectBoundFieldIds,
  resolveInitialPluginProjectId,
  resolvePluginProjectBinding,
} from "./plugin-project-model";

type PluginProjectMode = "existing" | "new";

export interface PluginProjectContext {
  projectId: string;
  projectName: string;
  sourceDirectory: string | null;
  fixedFormValues: Record<string, unknown>;
  hiddenFieldIds: string[];
}

export function PluginProjectBoundary({
  active,
  serverId,
  appDefinition,
  children,
}: {
  active: boolean;
  serverId: string;
  appDefinition: PluginAppDefinition;
  children: (context: PluginProjectContext) => ReactNode;
}) {
  const projects = useHostProjects([serverId]);
  const activeWorkspace = useActiveWorkspaceSelection();
  const activeProjectId = useSessionStore((state) => {
    const workspaceId = activeWorkspace?.serverId === serverId ? activeWorkspace.workspaceId : null;
    if (!workspaceId) return null;
    return state.sessions[serverId]?.workspaces.get(workspaceId)?.projectId ?? null;
  });
  const supportsDirectorylessProjects = useHostFeature(serverId, "projectCreateDirectoryless");
  const supportsProjectScopedApps = useHostFeature(serverId, "pluginProjectScopedApps");
  const openAddProjectFlow = useAddProjectFlowStore((state) => state.openRequest);
  const options = useMemo(
    () => buildPluginProjectOptions(projects, serverId),
    [projects, serverId],
  );
  const [mode, setMode] = useState<PluginProjectMode>("existing");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const projectBinding = useMemo(
    () => resolvePluginProjectBinding(appDefinition.project),
    [appDefinition.project],
  );

  useEffect(() => {
    if (!active || mode !== "existing") return;
    const nextProjectId = resolveInitialPluginProjectId({
      currentProjectId: selectedProjectId,
      activeProjectId,
      options,
    });
    if (nextProjectId !== selectedProjectId) setSelectedProjectId(nextProjectId);
  }, [active, activeProjectId, mode, options, selectedProjectId]);

  const selectedProject = useMemo(
    () => options.find((option) => option.value === selectedProjectId) ?? null,
    [options, selectedProjectId],
  );
  const selectedDisplay = useMemo(
    () =>
      selectedProject
        ? {
            label: selectedProject.label,
            description: selectedProject.description,
          }
        : null,
    [selectedProject],
  );
  const modeOptions = useMemo(
    () => [
      { value: "existing" as const, label: "选择已有 Project" },
      {
        value: "new" as const,
        label: "创建新 Project",
        disabled: !supportsDirectorylessProjects,
      },
    ],
    [supportsDirectorylessProjects],
  );
  const handleModeChange = useCallback((nextMode: PluginProjectMode) => {
    setMode(nextMode);
    setError(null);
  }, []);
  const handleProjectChange = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setError(null);
  }, []);
  const handleNewProjectNameChange = useCallback((name: string) => {
    setNewProjectName(name);
    setError(null);
  }, []);
  const handleCreateProject = useCallback(() => {
    const name = newProjectName.trim();
    if (!name) {
      setError("请输入自定义 Project 名称");
      return;
    }
    if (!supportsDirectorylessProjects) {
      setError("当前 Host 不支持创建多目录 Project，请更新并重启 daemon");
      return;
    }
    setError(null);
    openAddProjectFlow({
      preferredHostId: serverId,
      initialDirectorylessProjectName: name,
      onProjectCreated: ({ project }) => {
        setMode("existing");
        setSelectedProjectId(project.projectId);
        setNewProjectName("");
      },
    });
  }, [newProjectName, openAddProjectFlow, serverId, supportsDirectorylessProjects]);

  const context = useMemo<PluginProjectContext | null>(() => {
    if (!selectedProject) return null;
    return {
      projectId: selectedProject.value,
      projectName: selectedProject.projectName,
      sourceDirectory: selectedProject.sourceDirectory,
      fixedFormValues: buildPluginProjectFormValues(projectBinding, selectedProject),
      hiddenFieldIds: pluginProjectBoundFieldIds(projectBinding),
    };
  }, [projectBinding, selectedProject]);

  if (!supportsProjectScopedApps) {
    return (
      <View style={styles.projectCard}>
        <Text style={styles.projectTitle}>需要更新 Host</Text>
        <Text style={styles.projectDescription}>
          当前 Host 不支持以 Project 为核心的插件。请更新并重启 daemon 后再打开插件。
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.projectCard}>
        <View style={styles.projectHeader}>
          <Text style={styles.projectTitle}>{projectBinding.selectorLabel}</Text>
          {selectedProject && mode === "existing" ? (
            <Text style={styles.projectBadge}>{selectedProject.projectName}</Text>
          ) : null}
        </View>
        <Text style={styles.projectDescription}>{projectBinding.selectorDescription}</Text>
        <SegmentedControl
          value={mode}
          onValueChange={handleModeChange}
          options={modeOptions}
          style={styles.modeControl}
          testID="plugin-project-mode"
        />
        {mode === "existing" ? (
          <SelectField
            label="已有 Project"
            value={selectedProjectId}
            selectedDisplay={selectedDisplay}
            options={options}
            onChange={handleProjectChange}
            placeholder="选择 Project"
            emptyText="当前 Host 没有可用 Project，请创建新 Project"
            searchable
            searchPlaceholder="搜索 Project"
            hint="插件的页面状态、交互记录和流程运行都归属于该 Project。"
            testID="plugin-project-existing"
          />
        ) : (
          <Field
            label={projectBinding.createNameLabel}
            hint="名称由用户自定义；创建后会自动切换到新 Project。"
            error={error}
            testID="plugin-project-create-name"
          >
            <FormTextInput
              value={newProjectName}
              onChangeText={handleNewProjectNameChange}
              placeholder={projectBinding.createNamePlaceholder}
              testID="plugin-project-name-input"
            />
            <Button
              variant="default"
              leftIcon={Plus}
              disabled={!newProjectName.trim()}
              onPress={handleCreateProject}
            >
              进入创建 Project 流程
            </Button>
          </Field>
        )}
        {mode === "existing" && error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
      {mode === "existing" && context ? children(context) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    gap: theme.spacing[4],
  },
  projectCard: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  projectHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  projectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  projectBadge: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  projectDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  modeControl: {
    alignSelf: "flex-start",
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
