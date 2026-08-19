import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { PluginAppPanelHost } from "@/plugins/sidebar-panel/panel-host";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";

export function DesktopPluginContentHost({ children }: { children: ReactNode }) {
  const hasPluginSelection = usePluginAppPanelStore((state) => state.selection !== null);

  return (
    <View style={styles.container}>
      {hasPluginSelection ? (
        <PluginAppPanelHost compact={false} />
      ) : (
        <View style={styles.content}>{children}</View>
      )}
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
  },
});
