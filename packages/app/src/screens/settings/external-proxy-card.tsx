import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Switch } from "@/components/ui/switch";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { settingsStyles } from "@/styles/settings";
import { resolveExternalProxyUiState } from "./external-proxy-model";

export function ExternalProxyCard({ serverId }: { serverId: string }) {
  const isConnected = useHostRuntimeIsConnected(serverId);
  const featureAdvertised = useHostFeature(serverId, "projectExternalProxy");
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = useMemo(
    () =>
      resolveExternalProxyUiState({
        featureAdvertised,
        configuredEnabled: config?.externalProxy.enabled,
      }),
    [config?.externalProxy.enabled, featureAdvertised],
  );
  const displayedValue = pendingValue ?? view.enabled;
  const disabled =
    !isConnected || isLoading || pendingValue !== null || view.switchDisabled || !config;

  const handleValueChange = useCallback(
    (enabled: boolean) => {
      if (disabled) return;
      setPendingValue(enabled);
      setError(null);
      void patchConfig({ externalProxy: { enabled } })
        .catch((updateError) => {
          setError(updateError instanceof Error ? updateError.message : String(updateError));
        })
        .finally(() => setPendingValue(null));
    },
    [disabled, patchConfig],
  );

  return (
    <View style={settingsStyles.card} testID="host-page-external-proxy-card">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>外部代理</Text>
          <Text style={settingsStyles.rowHint}>{view.hint}</Text>
          {error ? <Text style={settingsStyles.rowHint}>{error}</Text> : null}
        </View>
        <Switch
          value={displayedValue}
          onValueChange={handleValueChange}
          disabled={disabled}
          accessibilityLabel="启用外部代理"
          testID="host-page-external-proxy-switch"
        />
      </View>
    </View>
  );
}
