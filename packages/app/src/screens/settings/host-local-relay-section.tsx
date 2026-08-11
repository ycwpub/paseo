import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useFetchQuery } from "@/data/query";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeClient, useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import {
  normalizeHostPort,
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
} from "@/utils/daemon-endpoints";
import { LocalRelayManagement } from "./host-relay-management";
import { buildRelayHostLabelMap, buildRelayServerDeviceTypeMap } from "./relay-connection-display";
import { SettingsSection } from "./settings-section";

export function LocalRelayConfigurationSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const hostLabelByServerId = useMemo(() => buildRelayHostLabelMap(hosts), [hosts]);
  const serverInfos = useSessionStore(
    useShallow((state) => Object.values(state.sessions).map((session) => session.serverInfo)),
  );
  const serverDeviceTypeByServerId = useMemo(
    () => buildRelayServerDeviceTypeMap(serverInfos),
    [serverInfos],
  );
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const [lanRelayListen, setLanRelayListen] = useState("0.0.0.0:6769");
  const [lanRelayPairingBaseUrl, setLanRelayPairingBaseUrl] = useState("");
  const [lanRelayWebAppEnabled, setLanRelayWebAppEnabled] = useState(false);
  const [lanRelayWebAppPath, setLanRelayWebAppPath] = useState("/app");
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localRelayStatusQuery = useFetchQuery({
    queryKey: ["daemon-local-relay-status", serverId],
    queryFn: async () => {
      if (!client) throw new Error(t("workspace.terminal.hostDisconnected"));
      return client.getDaemonStatus();
    },
    enabled: Boolean(client && isConnected && config?.relay?.local?.enabled),
    dataShape: "value",
    staleTimeMs: 0,
    retry: false,
    refetchInterval: config?.relay?.local?.enabled ? 2000 : false,
  });
  const handleRelayHistoryChanged = useCallback(() => {
    void localRelayStatusQuery.refetch();
  }, [localRelayStatusQuery]);

  useEffect(() => {
    if (!config || isDirty) return;
    setLanRelayListen(config.relay?.local?.listen ?? "0.0.0.0:6769");
    setLanRelayPairingBaseUrl(config.relay?.local?.pairingBaseUrl ?? "");
    setLanRelayWebAppEnabled(config.relay?.local?.webApp?.enabled ?? false);
    setLanRelayWebAppPath(config.relay?.local?.webApp?.path ?? "/app");
  }, [config, isDirty]);

  const markDraftChanged = useCallback(() => {
    setError(null);
    setIsDirty(true);
  }, []);
  const handleLanRelayListenChange = useCallback(
    (value: string) => {
      markDraftChanged();
      setLanRelayListen(value);
    },
    [markDraftChanged],
  );
  const handleLanRelayPairingBaseUrlChange = useCallback(
    (value: string) => {
      markDraftChanged();
      setLanRelayPairingBaseUrl(value);
    },
    [markDraftChanged],
  );
  const handleLanRelayWebAppEnabledChange = useCallback(
    (value: boolean) => {
      markDraftChanged();
      setLanRelayWebAppEnabled(value);
    },
    [markDraftChanged],
  );
  const handleLanRelayWebAppPathChange = useCallback(
    (value: string) => {
      markDraftChanged();
      setLanRelayWebAppPath(value);
    },
    [markDraftChanged],
  );

  const handleSave = useCallback(() => {
    let listen: string;
    let localPairingBaseUrl: string | undefined;
    let localWebAppPath: string;
    try {
      listen = normalizeHostPort(lanRelayListen);
      localPairingBaseUrl = lanRelayPairingBaseUrl.trim()
        ? normalizeLocalRelayPairingBaseUrl(lanRelayPairingBaseUrl)
        : undefined;
      localWebAppPath = normalizeLocalRelayWebAppPath(lanRelayWebAppPath);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      return;
    }

    setIsSaving(true);
    setError(null);
    void patchConfig({
      relay: {
        local: {
          listen,
          pairingBaseUrl: localPairingBaseUrl,
          webApp: {
            enabled: lanRelayWebAppEnabled,
            path: localWebAppPath,
          },
        },
      },
    })
      .then(() => {
        setLanRelayListen(listen);
        setLanRelayPairingBaseUrl(localPairingBaseUrl ?? "");
        setLanRelayWebAppPath(localWebAppPath);
        setIsDirty(false);
        return localRelayStatusQuery.refetch();
      })
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : String(saveError));
      })
      .finally(() => setIsSaving(false));
  }, [
    lanRelayListen,
    lanRelayPairingBaseUrl,
    lanRelayWebAppEnabled,
    lanRelayWebAppPath,
    localRelayStatusQuery,
    patchConfig,
  ]);

  return (
    <SettingsSection title={t("settings.host.relay.lan.title")}>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t("settings.host.relay.lan.listenLabel")}</Text>
        <Text style={settingsStyles.rowHint}>{t("settings.host.relay.lan.listenHint")}</Text>
        <SettingsTextAreaCard
          accessibilityLabel={t("settings.host.relay.lan.listenLabel")}
          value={lanRelayListen}
          onChangeText={handleLanRelayListenChange}
          placeholder="0.0.0.0:6769"
          testID="lan-relay-listen-input"
          style={styles.listenInput}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t("settings.host.relay.lan.pairingUrlLabel")}</Text>
        <Text style={settingsStyles.rowHint}>{t("settings.host.relay.lan.pairingUrlHint")}</Text>
        <SettingsTextAreaCard
          accessibilityLabel={t("settings.host.relay.lan.pairingUrlLabel")}
          value={lanRelayPairingBaseUrl}
          onChangeText={handleLanRelayPairingBaseUrlChange}
          placeholder={t("settings.host.relay.lan.pairingUrlPlaceholder")}
          testID="lan-relay-pairing-url-input"
          style={styles.listenInput}
        />
      </View>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.host.relay.lan.webApp.title")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.host.relay.lan.webApp.hint")}</Text>
          </View>
          <Switch
            value={lanRelayWebAppEnabled}
            onValueChange={handleLanRelayWebAppEnabledChange}
            accessibilityLabel={t("settings.host.relay.lan.webApp.title")}
            testID="lan-relay-web-app-switch"
          />
        </View>
      </View>
      {lanRelayWebAppEnabled ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("settings.host.relay.lan.webApp.pathLabel")}</Text>
          <Text style={settingsStyles.rowHint}>{t("settings.host.relay.lan.webApp.pathHint")}</Text>
          <SettingsTextAreaCard
            accessibilityLabel={t("settings.host.relay.lan.webApp.pathLabel")}
            value={lanRelayWebAppPath}
            onChangeText={handleLanRelayWebAppPathChange}
            placeholder="/app"
            testID="lan-relay-web-app-path-input"
            style={styles.listenInput}
          />
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button
          variant="default"
          size="sm"
          onPress={handleSave}
          disabled={isLoading || !config || isSaving || !isDirty}
          testID="lan-relay-config-save"
        >
          {isSaving ? t("settings.host.relay.saving") : t("settings.host.relay.save")}
        </Button>
      </View>
      <LocalRelayManagement
        runtime={localRelayStatusQuery.data?.relay?.local?.runtime ?? null}
        isLoading={localRelayStatusQuery.isPending}
        hostLabelByServerId={hostLabelByServerId}
        serverDeviceTypeByServerId={serverDeviceTypeByServerId}
        client={client}
        onHistoryChanged={handleRelayHistoryChanged}
        onError={setError}
        t={t}
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  field: {
    gap: theme.spacing[2],
  },
  fieldLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginLeft: theme.spacing[1],
  },
  listenInput: {
    minHeight: 48,
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    marginBottom: theme.spacing[2],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
