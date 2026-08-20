import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { PluginAppDefinition, PluginSummary } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { DESKTOP_TRAFFIC_LIGHT_WIDTH, getIsElectronRuntimeMac } from "@/constants/layout";
import { ByteDevelopmentPanel } from "./development-panel";

function MacTrafficLightSpacer() {
  return <View style={styles.macTrafficLightSpacer} />;
}

export function ByteDevelopmentModal({
  visible,
  serverId,
  plugin,
  appDefinition,
  onClose,
}: {
  visible: boolean;
  serverId: string;
  plugin: PluginSummary | null;
  appDefinition: PluginAppDefinition | null;
  onClose: () => void;
}) {
  const shouldAvoidMacTrafficLights = getIsElectronRuntimeMac();
  const header = useMemo(
    () => ({
      title: "字节开发全流程",
      subtitle: plugin ? `${plugin.displayName} · 研发流程` : undefined,
      leading: shouldAvoidMacTrafficLights ? <MacTrafficLightSpacer /> : undefined,
    }),
    [plugin, shouldAvoidMacTrafficLights],
  );
  return (
    <AdaptiveModalSheet
      visible={visible}
      header={header}
      onClose={onClose}
      desktopMaxWidth={1240}
      scrollable
      testID="byte-development-modal"
    >
      {plugin && appDefinition ? (
        <ByteDevelopmentPanel
          active={visible}
          serverId={serverId}
          plugin={plugin}
          appDefinition={appDefinition}
          onNavigateAway={onClose}
        />
      ) : null}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create({
  macTrafficLightSpacer: {
    width: DESKTOP_TRAFFIC_LIGHT_WIDTH,
  },
});
