import { useMemo } from "react";
import type { PluginAppDefinition, PluginSummary } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { ByteDevelopmentPanel } from "./development-panel";

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
  const header = useMemo(
    () => ({
      title: "字节开发全流程",
      subtitle: plugin ? `${plugin.displayName} · 研发流程` : undefined,
    }),
    [plugin],
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
        />
      ) : null}
    </AdaptiveModalSheet>
  );
}
