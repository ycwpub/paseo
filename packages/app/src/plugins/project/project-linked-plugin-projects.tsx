import { useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ExternalLink, RefreshCw } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { useFetchQueries } from "@/data/query";
import { usePlugins } from "@/hooks/use-plugins";
import {
  DEVELOPMENT_PLUGIN_ID,
  developmentJobStatusLabel,
} from "@/plugins/byte-development/flow-model";
import { useDevelopmentFlows } from "@/plugins/byte-development/use-development-flows";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { formatTimeAgo } from "@/utils/time";
import {
  buildLinkedPluginProjects,
  type LinkedPluginAppTarget,
  type LinkedPluginProject,
} from "./project-linked-plugin-projects-model";
import { pluginProjectsQueryKey } from "./use-plugin-projects";

export function ProjectLinkedPluginProjects({
  serverId,
  projectId,
}: {
  serverId: string;
  projectId: string;
}) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const supportsProjectManagement = useHostFeature(serverId, "pluginProjectManagement");
  const supportsJobList = useHostFeature(serverId, "pluginAppJobList");
  const plugins = usePlugins(serverId);
  const openPluginPanel = usePluginAppPanelStore((state) => state.open);
  const appTargets = useMemo<LinkedPluginAppTarget[]>(
    () =>
      plugins.plugins.flatMap((plugin) => {
        if (
          !plugin.installed ||
          !plugin.enabled ||
          !plugin.pluginId ||
          plugin.pluginId === DEVELOPMENT_PLUGIN_ID
        ) {
          return [];
        }
        return plugin.apps.map((app) => ({
          pluginId: plugin.pluginId!,
          pluginName: plugin.displayName,
          appId: app.id,
          appName: app.initialDocument?.title?.trim() || app.id,
        }));
      }),
    [plugins.plugins],
  );
  const appQueries = useFetchQueries<PluginAppState[]>(
    appTargets.map((target) => ({
      queryKey: pluginProjectsQueryKey(serverId, target.pluginId, target.appId),
      enabled: supportsProjectManagement && connected && Boolean(client),
      dataShape: "list",
      queryFn: async () => {
        if (!client) throw new Error("Host 未连接");
        const result = await client.listPluginAppProjects(target.pluginId, target.appId);
        if (result.error) throw new Error(result.error);
        return result.projects;
      },
      staleTimeMs: 5_000,
    })),
  );
  const developmentPlugin = useMemo(
    () =>
      plugins.plugins.find(
        (plugin) =>
          plugin.installed &&
          plugin.enabled &&
          plugin.pluginId === DEVELOPMENT_PLUGIN_ID &&
          plugin.apps.length > 0,
      ) ?? null,
    [plugins.plugins],
  );
  const developmentQuery = useDevelopmentFlows({
    active: Boolean(developmentPlugin),
    serverId,
    supported: supportsJobList,
  });
  const linkedProjects = useMemo(
    () =>
      buildLinkedPluginProjects({
        projectId,
        appStateSources: appTargets.map((target, index) => ({
          target,
          states: appQueries[index]?.data ?? [],
        })),
        jobTargets:
          developmentPlugin?.pluginId && developmentPlugin.apps[0]
            ? (developmentQuery.data ?? []).map((flow) => ({
                id: flow.id,
                pluginId: developmentPlugin.pluginId!,
                pluginName: developmentPlugin.displayName,
                appId: developmentPlugin.apps[0]!.id,
                projectId: flow.projectId,
                title: flow.title,
                description: `研发流程 · ${developmentJobStatusLabel(flow.job.status)}`,
                updatedAt: flow.updatedAt,
              }))
            : [],
      }),
    [appQueries, appTargets, developmentPlugin, developmentQuery.data, projectId],
  );
  const loading =
    plugins.isLoading ||
    appQueries.some((query) => query.isLoading) ||
    (Boolean(developmentPlugin) && developmentQuery.isLoading);
  const refreshing =
    plugins.isMutating ||
    appQueries.some((query) => query.isFetching) ||
    developmentQuery.isFetching;
  const error =
    plugins.error ??
    appQueries.find((query) => query.error)?.error ??
    developmentQuery.error ??
    null;
  const refresh = useCallback(() => {
    void Promise.all([
      plugins.refresh(),
      ...appQueries.map((query) => query.refetch()),
      ...(developmentPlugin ? [developmentQuery.refetch()] : []),
    ]).catch(() => undefined);
  }, [appQueries, developmentPlugin, developmentQuery, plugins]);
  const refreshAction = useMemo(
    () => (
      <Button size="xs" variant="ghost" leftIcon={RefreshCw} loading={refreshing} onPress={refresh}>
        刷新
      </Button>
    ),
    [refresh, refreshing],
  );
  const openLinkedProject = useCallback(
    (project: LinkedPluginProject) =>
      openPluginPanel({
        serverId,
        pluginId: project.pluginId,
        appId: project.appId,
        projectId: project.projectId,
        pluginProjectId: project.pluginProjectId,
      }),
    [openPluginPanel, serverId],
  );

  if (!loading && !error && linkedProjects.length === 0) return null;

  return (
    <SettingsSection
      title="关联插件项目"
      testID="project-linked-plugin-projects"
      trailing={refreshAction}
    >
      <View style={styles.card}>
        {loading && linkedProjects.length === 0 ? (
          <Text style={styles.stateText}>正在加载关联插件项目…</Text>
        ) : null}
        {error ? (
          <Text style={styles.errorText}>
            加载关联插件项目失败：{error instanceof Error ? error.message : String(error)}
          </Text>
        ) : null}
        {linkedProjects.map((project, index) => (
          <LinkedPluginProjectRow
            key={project.id}
            project={project}
            bordered={index > 0}
            onOpen={openLinkedProject}
          />
        ))}
      </View>
    </SettingsSection>
  );
}

function LinkedPluginProjectRow({
  project,
  bordered,
  onOpen,
}: {
  project: LinkedPluginProject;
  bordered: boolean;
  onOpen: (project: LinkedPluginProject) => void;
}) {
  const handlePress = useCallback(() => onOpen(project), [onOpen, project]);
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      bordered && styles.rowBorder,
      (hovered || pressed) && styles.rowActive,
    ],
    [bordered],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开插件项目：${project.title}`}
      onPress={handlePress}
      style={rowStyle}
      testID={`project-linked-plugin-project-${project.id}`}
    >
      <View style={styles.rowContent}>
        <View style={styles.titleLine}>
          <Text style={styles.title}>{project.title}</Text>
          <Text style={styles.pluginName}>{project.pluginName}</Text>
        </View>
        <Text style={styles.description}>{project.description}</Text>
        <Text style={styles.time}>更新于 {formatTimeAgo(new Date(project.updatedAt))}</Text>
      </View>
      <ExternalLink size={16} color={styles.iconColor.color} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    overflow: "hidden",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  rowBorder: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  rowActive: {
    backgroundColor: theme.colors.surface2,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  pluginName: {
    color: theme.colors.accentForeground,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    fontSize: theme.fontSize.xs,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  time: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  stateText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[4],
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[4],
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
}));
