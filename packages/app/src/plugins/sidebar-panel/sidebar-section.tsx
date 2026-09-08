import { useCallback, useMemo } from "react";
import { usePathname } from "expo-router";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, EyeOff, GripVertical } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolvePluginIcon } from "@/plugins/icons";
import {
  installedPluginEntryKey,
  isSamePluginAppSelection,
  type InstalledPluginEntry,
  resolveInstalledPluginEntries,
  resolvePluginAppSelection,
} from "@/plugins/sidebar-panel/model";
import { usePluginSidebarOrderStore } from "@/plugins/sidebar-panel/order-store";
import { resolvePluginLauncherIcon } from "@/plugins/sidebar-panel/presentation";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { SortablePluginGrid } from "@/plugins/sidebar-panel/sortable-plugin-grid";
import { usePluginSidebarHost } from "@/plugins/sidebar-panel/use-plugin-sidebar-host";
import { usePluginSidebarVisibilityStore } from "@/plugins/sidebar-panel/visibility-store";
import { useHosts } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { Theme } from "@/styles/theme";
import { parseServerIdFromPathname } from "@/utils/host-routes";

interface InstalledPluginSidebarSectionProps {
  onPluginOpened?: () => void;
}

const EMPTY_PLUGIN_ORDER: string[] = [];
const ThemedGripVertical = withUnistyles(GripVertical);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedEyeOff = withUnistyles(EyeOff);
const pluginIconColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const selectedPluginIconColorMapping = (theme: Theme) => ({
  color: theme.colors.accentForeground,
});
const orderHintColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
});
const sectionActionColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

function PluginGlyph({ name, selected }: { name: string; selected: boolean }) {
  const ThemedIcon = useMemo(() => withUnistyles(resolvePluginIcon(name)), [name]);
  return (
    <ThemedIcon
      size={18}
      uniProps={selected ? selectedPluginIconColorMapping : pluginIconColorMapping}
    />
  );
}

function PluginLauncher({
  entry,
  selected,
  onPressEntry,
  drag,
  isDragging,
}: {
  entry: InstalledPluginEntry;
  selected: boolean;
  onPressEntry: (pluginId: string) => void;
  drag: () => void;
  isDragging: boolean;
}) {
  const displayName = entry.plugin.displayName;
  const pluginId = installedPluginEntryKey(entry);
  const iconName = resolvePluginLauncherIcon(entry.plugin);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const handlePress = useCallback(() => onPressEntry(pluginId), [onPressEntry, pluginId]);
  const launcherStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.launcher,
      (hovered || pressed) && styles.launcherHovered,
      selected && styles.launcherSelected,
      isDragging && styles.launcherDragging,
    ],
    [isDragging, selected],
  );

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={displayName}
          accessibilityHint="拖动可调整插件顺序"
          accessibilityState={accessibilityState}
          onPress={handlePress}
          onLongPress={drag}
          style={launcherStyle}
          testID={`sidebar-plugin-${displayName}`}
        >
          <View style={[styles.pluginIcon, selected && styles.pluginIconSelected]}>
            <PluginGlyph name={iconName} selected={selected} />
          </View>
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.pluginName}>
            {displayName}
          </Text>
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={6}>
        <Text style={styles.tooltipText}>{displayName}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

export function InstalledPluginSidebarSection({
  onPluginOpened,
}: InstalledPluginSidebarSectionProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const hosts = useHosts();
  const activeWorkspace = useActiveWorkspaceSelection();
  const routeServerId = parseServerIdFromPathname(pathname);
  const currentServerId =
    routeServerId ??
    activeWorkspace?.serverId ??
    (hosts.length === 1 ? hosts[0]?.serverId : null) ??
    hosts[0]?.serverId ??
    "";
  const pluginHost = usePluginSidebarHost(currentServerId);
  const serverId = pluginHost?.serverId ?? "";
  const preferredOrder = usePluginSidebarOrderStore(
    (state) => state.orderByServer[serverId] ?? EMPTY_PLUGIN_ORDER,
  );
  const setOrder = usePluginSidebarOrderStore((state) => state.setOrder);
  const entries = useMemo(
    () => resolveInstalledPluginEntries(pluginHost?.plugins, preferredOrder),
    [pluginHost?.plugins, preferredOrder],
  );
  const selected = usePluginAppPanelStore((state) => state.selection);
  const toggle = usePluginAppPanelStore((state) => state.toggle);
  const collapsed = usePluginSidebarVisibilityStore((state) => state.collapsed);
  const hidden = usePluginSidebarVisibilityStore((state) => state.hidden);
  const toggleCollapsed = usePluginSidebarVisibilityStore((state) => state.toggleCollapsed);
  const hide = usePluginSidebarVisibilityStore((state) => state.hide);

  const handleEntryPress = useCallback(
    (pluginId: string) => {
      const entry = entries.find((candidate) => installedPluginEntryKey(candidate) === pluginId);
      if (!entry) return;
      const next = resolvePluginAppSelection(serverId, entry);
      const willOpen = !isSamePluginAppSelection(selected, next);
      toggle(next);
      if (willOpen) onPluginOpened?.();
    },
    [entries, onPluginOpened, selected, serverId, toggle],
  );
  const handleOrderChange = useCallback(
    (orderedEntries: InstalledPluginEntry[]) => {
      setOrder(serverId, orderedEntries.map(installedPluginEntryKey));
    },
    [serverId, setOrder],
  );
  const keyExtractor = useCallback(
    (entry: InstalledPluginEntry) => installedPluginEntryKey(entry),
    [],
  );
  const renderPlugin = useCallback(
    ({
      item: entry,
      drag,
      isActive,
    }: {
      item: InstalledPluginEntry;
      drag: () => void;
      isActive: boolean;
    }) => {
      const selection = resolvePluginAppSelection(serverId, entry);
      const isSelected = isSamePluginAppSelection(selected, selection);
      return (
        <PluginLauncher
          entry={entry}
          selected={isSelected}
          onPressEntry={handleEntryPress}
          drag={drag}
          isDragging={isActive}
        />
      );
    },
    [handleEntryPress, selected, serverId],
  );

  if (!pluginHost || entries.length === 0 || hidden) return null;

  const CollapseIcon = collapsed ? ThemedChevronRight : ThemedChevronDown;
  const collapseLabel = collapsed ? "展开全部插件" : "折叠全部插件";

  return (
    <View style={styles.section} testID="sidebar-installed-plugins">
      <View style={styles.sectionHeader}>
        <Pressable
          accessibilityLabel={collapseLabel}
          accessibilityRole="button"
          onPress={toggleCollapsed}
          style={styles.sectionTitleButton}
          testID="sidebar-plugin-collapse-all"
        >
          <CollapseIcon size={14} uniProps={sectionActionColorMapping} />
          <Text style={styles.sectionTitle}>{t("settings.hostSections.plugins")}</Text>
          <Text style={styles.sectionCount}>{entries.length}</Text>
        </Pressable>
        <View style={styles.sectionActions}>
          {collapsed ? null : (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <View
                  accessibilityLabel="拖动插件可调整顺序"
                  accessibilityRole="text"
                  style={styles.orderHint}
                >
                  <ThemedGripVertical size={12} uniProps={orderHintColorMapping} />
                </View>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" offset={6}>
                <Text style={styles.tooltipText}>拖动插件可调整顺序</Text>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Pressable
                accessibilityLabel="隐藏插件区域"
                accessibilityRole="button"
                onPress={hide}
                style={styles.sectionAction}
                testID="sidebar-plugin-hide"
              >
                <ThemedEyeOff size={14} uniProps={sectionActionColorMapping} />
              </Pressable>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" offset={6}>
              <Text style={styles.tooltipText}>隐藏插件区域，可从底部工具栏恢复</Text>
            </TooltipContent>
          </Tooltip>
        </View>
      </View>
      {collapsed ? null : (
        <SortablePluginGrid
          data={entries}
          keyExtractor={keyExtractor}
          onDragEnd={handleOrderChange}
          style={styles.launcherGrid}
          renderItem={renderPlugin}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[2],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
  },
  sectionTitleButton: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[0.5],
  },
  sectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  sectionCount: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
  sectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[0.5],
  },
  sectionAction: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  orderHint: {
    color: theme.colors.foregroundExtraMuted,
    paddingHorizontal: theme.spacing[1],
  },
  launcherGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  launcher: {
    width: 64,
    minHeight: 68,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
  },
  launcherHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  launcherSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
    borderColor: theme.colors.accent,
  },
  launcherDragging: {
    backgroundColor: theme.colors.surfaceSidebarHover,
    borderColor: theme.colors.border,
  },
  pluginIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface3,
  },
  pluginIconSelected: {
    backgroundColor: theme.colors.accent,
  },
  pluginName: {
    width: "100%",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 14,
    textAlign: "center",
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
