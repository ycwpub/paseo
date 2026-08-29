import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginLogEntry } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PluginLogsSheet({
  client,
  pluginId,
  serverId,
  onClose,
}: {
  client: NonNullable<ReturnType<typeof useHostRuntimeClient>>;
  pluginId: string;
  serverId: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const logs = useFetchQuery({
    queryKey: ["plugin-logs", serverId, pluginId],
    queryFn: () => client.getPluginLogs(pluginId),
    dataShape: "list",
    staleTimeMs: 0,
  });
  const refresh = useCallback(() => {
    void logs.refetch();
  }, [logs]);
  const header = useMemo<SheetHeader>(
    () => ({
      title: t("settings.plugins.logs.title", { id: pluginId }),
      actions: (
        <Button variant="outline" size="sm" onPress={refresh} disabled={logs.isFetching}>
          {logs.isFetching
            ? t("settings.plugins.logs.refreshing")
            : t("settings.plugins.logs.refresh")}
        </Button>
      ),
    }),
    [logs.isFetching, pluginId, refresh, t],
  );

  let content = <Text style={styles.logsState}>{t("settings.plugins.logs.loading")}</Text>;
  if (logs.isError) {
    content = (
      <Alert
        variant="error"
        title={t("settings.plugins.logs.errorTitle")}
        description={errorMessage(logs.error)}
      >
        <Button variant="outline" size="sm" onPress={refresh}>
          {t("settings.plugins.logs.refresh")}
        </Button>
      </Alert>
    );
  } else if (!logs.isLoading) {
    content = logs.data?.length ? (
      <View style={styles.logList}>
        {logs.data.map((entry: PluginLogEntry) => (
          <View key={entry.sequence} style={styles.logEntry}>
            <Text style={entry.stream === "stderr" ? styles.logStderr : styles.logStdout}>
              {entry.timestamp} {entry.stream}
            </Text>
            <Text style={styles.logMessage}>{entry.message}</Text>
          </View>
        ))}
      </View>
    ) : (
      <Text style={styles.logsState}>{t("settings.plugins.logs.empty")}</Text>
    );
  }

  return (
    <AdaptiveModalSheet header={header} visible onClose={onClose} testID="plugin-logs-sheet">
      {content}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  logsState: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
    paddingVertical: theme.spacing[6],
  },
  logList: { gap: theme.spacing[2] },
  logEntry: {
    padding: theme.spacing[3],
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
  },
  logStdout: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  logStderr: {
    color: theme.colors.statusDanger,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  logMessage: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.base,
  },
}));
