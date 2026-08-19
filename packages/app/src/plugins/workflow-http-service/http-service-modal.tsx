import { useMemo } from "react";
import type { PluginAppDefinition, PluginSummary } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { HttpServicePanel } from "./http-service-panel";

export function HttpServiceModal({
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
      title: "HTTP 服务",
      subtitle: plugin ? `${plugin.displayName} · 多端口异步请求管理` : undefined,
    }),
    [plugin],
  );
  return (
    <AdaptiveModalSheet
      visible={visible}
      header={header}
      onClose={onClose}
      desktopMaxWidth={1320}
      scrollable
      testID="workflow-http-service-modal"
    >
      {plugin && appDefinition ? (
        <HttpServicePanel
          active={visible}
          serverId={serverId}
          plugin={plugin}
          appDefinition={appDefinition}
        />
      ) : null}
    </AdaptiveModalSheet>
  );
}
