import { useCallback, useMemo } from "react";
import { usePathname } from "expo-router";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePlugins } from "@/hooks/use-plugins";
import {
  isSamePluginAppSelection,
  resolveInstalledPluginEntries,
  resolvePluginAppSelection,
} from "@/plugins/sidebar-panel/model";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { useHostFeature } from "@/runtime/host-features";
import { useHosts } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { parseServerIdFromPathname } from "@/utils/host-routes";

interface InstalledPluginSidebarSectionProps {
  onPluginOpened?: () => void;
}

function PluginLauncher({
  displayName,
  index,
  selected,
  onPressEntry,
}: {
  displayName: string;
  index: number;
  selected: boolean;
  onPressEntry: (index: number) => void;
}) {
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "P";
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const handlePress = useCallback(() => onPressEntry(index), [index, onPressEntry]);
  const launcherStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.launcher,
      (hovered || pressed) && styles.launcherHovered,
      selected && styles.launcherSelected,
    ],
    [selected],
  );

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={displayName}
          accessibilityState={accessibilityState}
          onPress={handlePress}
          style={launcherStyle}
          testID={`sidebar-plugin-${displayName}`}
        >
          <View style={[styles.pluginIcon, selected && styles.pluginIconSelected]}>
            <Text style={[styles.pluginIconText, selected && styles.pluginIconTextSelected]}>
              {initial}
            </Text>
          </View>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.pluginName}>
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
  const serverId =
    routeServerId ??
    activeWorkspace?.serverId ??
    (hosts.length === 1 ? hosts[0]?.serverId : null) ??
    hosts[0]?.serverId ??
    "";
  const supportsPlugins = useHostFeature(serverId, "plugins");
  const { plugins } = usePlugins(serverId, {
    enabled: Boolean(serverId) && supportsPlugins,
  });
  const entries = useMemo(() => resolveInstalledPluginEntries(plugins), [plugins]);
  const selected = usePluginAppPanelStore((state) => state.selection);
  const toggle = usePluginAppPanelStore((state) => state.toggle);

  const handleEntryPress = useCallback(
    (index: number) => {
      const entry = entries[index];
      if (!entry) return;
      const next = resolvePluginAppSelection(serverId, entry);
      const willOpen = !isSamePluginAppSelection(selected, next);
      toggle(next);
      if (willOpen) onPluginOpened?.();
    },
    [entries, onPluginOpened, selected, serverId, toggle],
  );

  if (!supportsPlugins || entries.length === 0) return null;

  return (
    <View style={styles.section} testID="sidebar-installed-plugins">
      <Text style={styles.sectionTitle}>{t("settings.hostSections.plugins")}</Text>
      <View style={styles.launcherGrid}>
        {entries.map((entry, index) => {
          const selection = resolvePluginAppSelection(serverId, entry);
          const isSelected = isSamePluginAppSelection(selected, selection);
          return (
            <PluginLauncher
              key={`${selection.pluginId}:${selection.appId}`}
              displayName={entry.plugin.displayName}
              index={index}
              selected={isSelected}
              onPressEntry={handleEntryPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  launcherGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  launcher: {
    width: 58,
    minHeight: 58,
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
  pluginIconText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  pluginIconTextSelected: {
    color: theme.colors.accentForeground,
  },
  pluginName: {
    width: "100%",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
}));
