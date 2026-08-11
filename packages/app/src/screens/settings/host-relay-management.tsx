import type { TFunction } from "i18next";
import { Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { DaemonGetStatusResponse } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import {
  formatRelayPeerEndpoint,
  resolveRelayServerDeviceType,
  resolveRelayServerHostname,
} from "./relay-connection-display";

const ThemedTrash2 = withUnistyles(Trash2);
const destructiveColorMapping = (theme: Theme) => ({
  color: theme.colors.destructive,
});
const removeHistoryIcon = <ThemedTrash2 size={ICON_SIZE.sm} uniProps={destructiveColorMapping} />;

type LocalRelayRuntime = NonNullable<
  NonNullable<NonNullable<DaemonGetStatusResponse["payload"]["relay"]>["local"]>["runtime"]
>;
type LocalRelayConnection = LocalRelayRuntime["connections"][number];
type LocalRelayHistoryRecord = NonNullable<LocalRelayRuntime["history"]>[number];

function resolveRelayDeviceTypeLabel(
  deviceType: LocalRelayConnection["deviceType"],
  t: TFunction,
): string {
  if (!deviceType) return t("settings.host.relay.management.deviceTypes.unknown");
  return t(`settings.host.relay.management.deviceTypes.${deviceType}`);
}

function RelayManagementField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[styles.fieldValue, mono ? styles.fieldValueMono : null]}
        numberOfLines={2}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function LocalRelayConnectionGroup({
  connections,
  title,
  empty,
  hostLabelByServerId,
  serverDeviceTypeByServerId,
  showHostLabel,
  t,
}: {
  connections: LocalRelayConnection[];
  title: string;
  empty: string;
  hostLabelByServerId: ReadonlyMap<string, string>;
  serverDeviceTypeByServerId: ReadonlyMap<string, NonNullable<LocalRelayConnection["deviceType"]>>;
  showHostLabel: boolean;
  t: TFunction;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.count}>{connections.length}</Text>
      </View>
      {connections.length > 0 ? (
        <View style={styles.list}>
          {connections.map((connection) => {
            const serverHostname = showHostLabel
              ? resolveRelayServerHostname(
                  connection.hostname,
                  connection.serverId,
                  hostLabelByServerId,
                )
              : null;
            return (
              <View
                key={`${connection.role}:${connection.serverId}:${
                  connection.connectionId ?? "control"
                }`}
                style={styles.row}
              >
                <View style={styles.details}>
                  <Text style={styles.role}>
                    {t(`settings.host.relay.management.roles.${connection.role}`)}
                  </Text>
                  <View style={styles.fieldGrid}>
                    <RelayManagementField
                      label={t("settings.host.relay.management.deviceType")}
                      value={resolveRelayDeviceTypeLabel(
                        resolveRelayServerDeviceType(
                          connection.deviceType,
                          connection.role,
                          connection.serverId,
                          serverDeviceTypeByServerId,
                        ),
                        t,
                      )}
                    />
                    {serverHostname ? (
                      <RelayManagementField
                        label={t("settings.host.relay.management.hostname")}
                        value={serverHostname}
                      />
                    ) : null}
                    {connection.clientHostname ? (
                      <RelayManagementField
                        label={t("settings.host.relay.management.clientHostname")}
                        value={connection.clientHostname}
                      />
                    ) : null}
                    {connection.clientId ? (
                      <RelayManagementField
                        label={t("settings.host.relay.management.clientId")}
                        value={connection.clientId}
                        mono
                      />
                    ) : null}
                    <RelayManagementField
                      label={t("settings.host.relay.management.serverId")}
                      value={connection.serverId}
                      mono
                    />
                    {connection.connectionId ? (
                      <RelayManagementField
                        label={t("settings.host.relay.management.connectionId")}
                        value={connection.connectionId}
                        mono
                      />
                    ) : null}
                    <RelayManagementField
                      label={t("settings.host.relay.management.peerEndpoint")}
                      value={
                        formatRelayPeerEndpoint(connection.remoteAddress, connection.remotePort) ??
                        t("settings.host.relay.management.unknownPeer")
                      }
                      mono
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.empty}>{empty}</Text>
      )}
    </View>
  );
}

function LocalRelayHistoryGroup({
  history,
  title,
  empty,
  deletingId,
  serverDeviceTypeByServerId,
  onDelete,
  t,
}: {
  history: LocalRelayHistoryRecord[];
  title: string;
  empty: string;
  deletingId: string | null;
  serverDeviceTypeByServerId: ReadonlyMap<string, NonNullable<LocalRelayConnection["deviceType"]>>;
  onDelete: (historyId: string) => void;
  t: TFunction;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.count}>{history.length}</Text>
      </View>
      {history.length > 0 ? (
        <View style={styles.list}>
          {history.map((record) => (
            <LocalRelayHistoryRow
              key={record.id}
              record={record}
              deletingId={deletingId}
              serverDeviceTypeByServerId={serverDeviceTypeByServerId}
              onDelete={onDelete}
              t={t}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>{empty}</Text>
      )}
    </View>
  );
}

function LocalRelayHistoryRow({
  record,
  deletingId,
  serverDeviceTypeByServerId,
  onDelete,
  t,
}: {
  record: LocalRelayHistoryRecord;
  deletingId: string | null;
  serverDeviceTypeByServerId: ReadonlyMap<string, NonNullable<LocalRelayConnection["deviceType"]>>;
  onDelete: (historyId: string) => void;
  t: TFunction;
}) {
  const handleDelete = useCallback(() => onDelete(record.id), [onDelete, record.id]);
  return (
    <View style={styles.row}>
      <View style={styles.details}>
        <Text style={styles.role}>{t(`settings.host.relay.management.roles.${record.role}`)}</Text>
        <View style={styles.fieldGrid}>
          <RelayManagementField
            label={t("settings.host.relay.management.deviceType")}
            value={resolveRelayDeviceTypeLabel(
              resolveRelayServerDeviceType(
                record.deviceType,
                record.role,
                record.serverId,
                serverDeviceTypeByServerId,
              ),
              t,
            )}
          />
          {record.clientHostname ? (
            <RelayManagementField
              label={t("settings.host.relay.management.clientHostname")}
              value={record.clientHostname}
            />
          ) : null}
          {record.clientId ? (
            <RelayManagementField
              label={t("settings.host.relay.management.clientId")}
              value={record.clientId}
              mono
            />
          ) : null}
          {record.role !== "client" && record.hostname ? (
            <RelayManagementField
              label={t("settings.host.relay.management.hostname")}
              value={record.hostname}
            />
          ) : null}
          <RelayManagementField
            label={t("settings.host.relay.management.serverId")}
            value={record.serverId}
            mono
          />
          <RelayManagementField
            label={t("settings.host.relay.management.peerEndpoint")}
            value={
              formatRelayPeerEndpoint(record.remoteAddress, record.remotePort) ??
              t("settings.host.relay.management.unknownPeer")
            }
            mono
          />
          <RelayManagementField
            label={t("settings.host.relay.management.connectedAt")}
            value={new Date(record.connectedAt).toLocaleString()}
          />
          <RelayManagementField
            label={t("settings.host.relay.management.disconnectedAt")}
            value={
              record.disconnectedAt
                ? new Date(record.disconnectedAt).toLocaleString()
                : t("settings.host.relay.management.stillConnected")
            }
          />
        </View>
      </View>
      <Button
        variant="ghost"
        size="xs"
        leftIcon={removeHistoryIcon}
        loading={deletingId === record.id}
        disabled={deletingId !== null}
        onPress={handleDelete}
        accessibilityLabel={
          deletingId === record.id
            ? t("settings.host.relay.management.deleting")
            : t("settings.host.relay.management.delete")
        }
        style={styles.deleteButton}
      />
    </View>
  );
}

export function LocalRelayManagement({
  runtime,
  isLoading,
  hostLabelByServerId,
  serverDeviceTypeByServerId,
  client,
  onHistoryChanged,
  onError,
  t,
}: {
  runtime: LocalRelayRuntime | null;
  isLoading: boolean;
  hostLabelByServerId: ReadonlyMap<string, string>;
  serverDeviceTypeByServerId: ReadonlyMap<string, NonNullable<LocalRelayConnection["deviceType"]>>;
  client: DaemonClient | null;
  onHistoryChanged: () => void;
  onError: (message: string) => void;
  t: TFunction;
}) {
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const clientConnections = runtime?.connections.filter(
    (connection) => connection.role === "client",
  );
  const serverConnections = runtime?.connections.filter(
    (connection) => connection.role !== "client",
  );
  const clientHistory = (runtime?.history ?? []).filter((record) => record.role === "client");
  const serverHistory = (runtime?.history ?? []).filter((record) => record.role !== "client");
  const deleteHistory = useCallback(
    (historyId: string) => {
      if (!client || deletingHistoryId) return;
      setDeletingHistoryId(historyId);
      void client
        .deleteDaemonRelayHistory(historyId)
        .then((result) => {
          if (!result.success) throw new Error(result.error ?? "Failed to delete Relay history");
          return onHistoryChanged();
        })
        .catch((deleteError: unknown) => {
          onError(deleteError instanceof Error ? deleteError.message : String(deleteError));
        })
        .finally(() => setDeletingHistoryId(null));
    },
    [client, deletingHistoryId, onError, onHistoryChanged],
  );
  return (
    <View style={[settingsStyles.card, styles.card]}>
      <View style={styles.header}>
        <Text style={settingsStyles.rowTitle}>{t("settings.host.relay.management.title")}</Text>
        {runtime ? (
          <Text style={styles.count}>
            {t("settings.host.relay.management.count", {
              count: runtime.connections.length,
            })}
          </Text>
        ) : null}
      </View>
      {runtime ? (
        <>
          <View style={styles.fieldGrid}>
            <RelayManagementField
              label={t("settings.host.relay.management.pairingAddress")}
              value={runtime.pairingBaseUrl}
              mono
            />
            <RelayManagementField
              label={t("settings.host.relay.management.relayAddress")}
              value={`ws://${runtime.publicEndpoint}`}
              mono
            />
          </View>
          <LocalRelayConnectionGroup
            connections={clientConnections ?? []}
            title={t("settings.host.relay.management.clients")}
            empty={t("settings.host.relay.management.noClients")}
            hostLabelByServerId={hostLabelByServerId}
            serverDeviceTypeByServerId={serverDeviceTypeByServerId}
            showHostLabel={false}
            t={t}
          />
          <Text style={styles.historyHint}>
            {t("settings.host.relay.management.historyRetention", {
              days: runtime.historyRetentionDays ?? 30,
            })}
          </Text>
          <LocalRelayHistoryGroup
            history={clientHistory}
            title={t("settings.host.relay.management.clientHistory")}
            empty={t("settings.host.relay.management.noClientHistory")}
            deletingId={deletingHistoryId}
            serverDeviceTypeByServerId={serverDeviceTypeByServerId}
            onDelete={deleteHistory}
            t={t}
          />
          <LocalRelayHistoryGroup
            history={serverHistory}
            title={t("settings.host.relay.management.serverHistory")}
            empty={t("settings.host.relay.management.noServerHistory")}
            deletingId={deletingHistoryId}
            serverDeviceTypeByServerId={serverDeviceTypeByServerId}
            onDelete={deleteHistory}
            t={t}
          />
          <LocalRelayConnectionGroup
            connections={serverConnections ?? []}
            title={t("settings.host.relay.management.servers")}
            empty={t("settings.host.relay.management.noServers")}
            hostLabelByServerId={hostLabelByServerId}
            serverDeviceTypeByServerId={serverDeviceTypeByServerId}
            showHostLabel
            t={t}
          />
        </>
      ) : (
        <Text style={styles.empty}>
          {isLoading
            ? t("settings.host.relay.management.loading")
            : t("settings.host.relay.management.unavailable")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  group: {
    gap: theme.spacing[2],
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  groupTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  list: {
    gap: theme.spacing[2],
  },
  row: {
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  details: {
    gap: theme.spacing[2],
  },
  role: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  field: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  fieldLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  fieldValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  fieldValueMono: {
    fontFamily: theme.fontFamily.mono,
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  historyHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  deleteButton: {
    alignSelf: "flex-end",
  },
}));
