import { useCallback, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DEVELOPMENT_PLUGIN_ID } from "@/plugins/byte-development/flow-model";
import {
  DESKTOP_PLUGIN_MAIN_CONTENT_MIN_WIDTH,
  resolveDesktopPluginPanelWidth,
} from "@/plugins/sidebar-panel/desktop-panel-layout";
import { PluginAppPanelHost } from "@/plugins/sidebar-panel/panel-host";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";

export function DesktopPluginContentHost({ children }: { children: ReactNode }) {
  const selection = usePluginAppPanelStore((state) => state.selection);
  const [availableWidth, setAvailableWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setAvailableWidth(event.nativeEvent.layout.width);
  }, []);
  const pluginPanelWidth =
    selection && availableWidth > 0
      ? resolveDesktopPluginPanelWidth({
          availableWidth,
          isDevelopmentPanel: selection.pluginId === DEVELOPMENT_PLUGIN_ID,
        })
      : null;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={[styles.content, selection && styles.contentWithPlugin]}>{children}</View>
      {selection && pluginPanelWidth !== null ? (
        <PluginAppPanelHost compact={false} desktopWidth={pluginPanelWidth} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  contentWithPlugin: {
    minWidth: DESKTOP_PLUGIN_MAIN_CONTENT_MIN_WIDTH,
  },
});
