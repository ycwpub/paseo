import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "expo-router";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { PluginAppPanelHost } from "@/plugins/sidebar-panel/panel-host";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";

export function DesktopPluginContentHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const selection = usePluginAppPanelStore((state) => state.selection);
  const close = usePluginAppPanelStore((state) => state.close);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    const routeChanged = previousPathnameRef.current !== pathname;
    previousPathnameRef.current = pathname;
    if (routeChanged && selection) {
      close();
    }
  }, [close, pathname, selection]);

  return (
    <View style={styles.container} testID="desktop-plugin-content-host">
      <View
        style={[styles.content, selection && styles.hiddenContent]}
        testID="desktop-route-content"
      >
        {children}
      </View>
      {selection ? <PluginAppPanelHost compact={false} /> : null}
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
  hiddenContent: {
    display: "none",
  },
});
