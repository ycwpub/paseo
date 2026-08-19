import { useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { Plus, RefreshCw } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { formatTimeAgo } from "@/utils/time";
import type { ManagedPluginProject } from "./plugin-project-management-model";
import { shouldShowPluginListCreateAction } from "./plugin-project-list-presentation";

function PluginProjectListItem({
  project,
  selected,
  onSelect,
}: {
  project: ManagedPluginProject;
  selected: boolean;
  onSelect: (projectId: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(project.projectId), [onSelect, project.projectId]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const itemStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.item,
      (hovered || pressed) && styles.itemHovered,
      selected && styles.itemSelected,
    ],
    [selected],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      style={itemStyle}
      onPress={handlePress}
      testID={`plugin-project-${project.projectId}`}
    >
      <Text numberOfLines={2} style={styles.itemTitle}>
        {project.projectName}
      </Text>
      <Text numberOfLines={1} style={styles.itemModel}>
        {project.state.defaultAgent?.provider} · {project.state.defaultAgent?.model}
      </Text>
      <Text style={styles.itemTime}>{formatTimeAgo(new Date(project.state.updatedAt))}</Text>
    </Pressable>
  );
}

export function PluginProjectList({
  projects,
  selectedProjectId,
  loading,
  error,
  onSelect,
  onCreate,
  onRefresh,
  compact,
}: {
  projects: readonly ManagedPluginProject[];
  selectedProjectId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
  compact: boolean;
}) {
  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.title}>插件项目</Text>
          <Text style={styles.count}>{projects.length}</Text>
        </View>
        {shouldShowPluginListCreateAction(projects.length) ? (
          <Button size="xs" variant="default" leftIcon={Plus} onPress={onCreate}>
            新建
          </Button>
        ) : null}
      </View>
      {loading ? <Text style={styles.hint}>正在加载插件项目…</Text> : null}
      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
          <Button size="xs" variant="outline" leftIcon={RefreshCw} onPress={onRefresh}>
            重试
          </Button>
        </View>
      ) : null}
      {!loading && !error && projects.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>还没有插件项目</Text>
          <Text style={styles.hint}>创建后会按最近更新时间展示。</Text>
        </View>
      ) : null}
      <View style={styles.items}>
        {projects.map((project) => (
          <PluginProjectListItem
            key={project.projectId}
            project={project}
            selected={project.projectId === selectedProjectId}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  sidebar: {
    width: 244,
    flexShrink: 0,
    gap: theme.spacing[3],
    paddingRight: theme.spacing[4],
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
  },
  sidebarCompact: {
    width: "100%",
    paddingRight: 0,
    paddingBottom: theme.spacing[4],
    borderRightWidth: 0,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  items: {
    gap: theme.spacing[2],
  },
  item: {
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  itemHovered: {
    backgroundColor: theme.colors.surface2,
  },
  itemSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  itemTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  itemModel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  itemTime: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  error: {
    gap: theme.spacing[2],
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  empty: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[4],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
