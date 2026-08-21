import { useCallback, useEffect, useMemo } from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { usePlugins } from "@/hooks/use-plugins";
import { ByteDevelopmentPanel } from "@/plugins/byte-development/development-panel";
import { DEVELOPMENT_PLUGIN_ID } from "@/plugins/byte-development/flow-model";
import {
  HTTP_SERVICE_PLUGIN_ID,
  HttpServicePanel,
} from "@/plugins/workflow-http-service/http-service-panel";
import { PluginDetailsSurface } from "@/plugins/sidebar-panel/plugin-details";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { ProjectScopedPluginAppSurface } from "@/screens/settings/plugins/plugin-app-modal";
import type { Theme } from "@/styles/theme";

const ThemedX = withUnistyles(X);
const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function PluginAppPanelHost({
  compact,
  desktopWidth,
}: {
  compact: boolean;
  desktopWidth?: number;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const selection = usePluginAppPanelStore((state) => state.selection);
  const close = usePluginAppPanelStore((state) => state.close);
  const serverId = selection?.serverId ?? "";
  const plugins = usePlugins(serverId, { enabled: Boolean(selection) });
  const plugin = useMemo(
    () =>
      selection
        ? (plugins.plugins.find((candidate) => candidate.pluginId === selection.pluginId) ?? null)
        : null,
    [plugins.plugins, selection],
  );
  const appDefinition = useMemo(
    () =>
      selection && plugin
        ? (plugin.apps.find((candidate) => candidate.id === selection.appId) ?? null)
        : null,
    [plugin, selection],
  );
  useEffect(() => {
    if (!selection || plugins.isLoading) return;
    if (!plugin || !plugin.installed) close();
  }, [close, plugin, plugins.isLoading, selection]);

  const handleClose = useCallback(() => close(), [close]);
  const closeButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.closeButton,
      (hovered || pressed) && styles.closeButtonActive,
    ],
    [],
  );
  const panelStyle = useMemo(
    () =>
      compact
        ? [styles.panel, styles.compactPanel, { paddingTop: insets.top }]
        : [styles.panel, styles.desktopPanel, { width: desktopWidth }],
    [compact, desktopWidth, insets.top],
  );

  if (!selection) return null;

  let content = <Text style={styles.stateText}>插件应用不可用。</Text>;
  if (plugins.isLoading) {
    content = <Text style={styles.stateText}>{t("common.loading")}</Text>;
  } else if (plugin?.enabled && appDefinition) {
    const contentKey = [
      selection.pluginId,
      selection.appId,
      selection.projectId,
      selection.pluginProjectId,
    ].join(":");
    if (plugin.pluginId === DEVELOPMENT_PLUGIN_ID) {
      content = (
        <ByteDevelopmentPanel
          key={contentKey}
          active
          compact={compact}
          serverId={selection.serverId}
          plugin={plugin}
          appDefinition={appDefinition}
          initialProjectId={selection.projectId}
          initialPluginProjectId={selection.pluginProjectId}
        />
      );
    } else if (plugin.pluginId === HTTP_SERVICE_PLUGIN_ID) {
      content = (
        <HttpServicePanel
          key={contentKey}
          active
          serverId={selection.serverId}
          plugin={plugin}
          appDefinition={appDefinition}
          initialProjectId={selection.projectId}
        />
      );
    } else {
      content = (
        <ProjectScopedPluginAppSurface
          key={contentKey}
          active
          serverId={selection.serverId}
          plugin={plugin}
          appDefinition={appDefinition}
          initialProjectId={selection.projectId}
        />
      );
    }
  } else if (plugin) {
    content = <PluginDetailsSurface plugin={plugin} />;
  }
  const subtitle = appDefinition?.id ?? (plugin ? `v${plugin.version}` : null);

  return (
    <View style={panelStyle} testID="plugin-app-side-panel">
      <View style={styles.header}>
        <TitlebarDragRegion />
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.title}>
            {plugin?.displayName ?? t("settings.hostSections.plugins")}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.close")}
          hitSlop={8}
          onPress={handleClose}
          style={closeButtonStyle}
          testID="plugin-app-side-panel-close"
        >
          <ThemedX size={14} uniProps={mutedIconColor} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    backgroundColor: theme.colors.surface0,
  },
  desktopPanel: {
    height: "100%",
    flexShrink: 0,
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.border,
  },
  compactPanel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
  },
  header: {
    position: "relative",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  closeButtonActive: {
    backgroundColor: theme.colors.surface2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing[6],
  },
  stateText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
