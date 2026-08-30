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
import { groupRelayHistory, type RelayHistoryGroup } from "./relay-history-groups";

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
type LocalRelayHistoryGroup = RelayHistoryGroup<LocalRelayHistoryRecord>;

const COLLAPSED_HISTORY_TIME_LIMIT = 5;

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
  groups,
  title,
  empty,
  deletingKey,
  serverDeviceTypeByServerId,
  onDelete,
  t,
}: {
  groups: LocalRelayHistoryGroup[];
  title: string;
  empty: string;
  deletingKey: string | null;
  serverDeviceTypeByServerId: ReadonlyMap<string, NonNullable<LocalRelayConnection["deviceType"]>>;
  onDelete: (group: LocalRelayHistoryGroup) => void;
  t: TFunction;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.count}>{groups.length}</Text>
      </View>
      {groups.length > 0 ? (
        <View style={styles.list}>
          {groups.map((group) => (
            <LocalRelayHistoryRow
              key={group.key}
              group={group}
              deletingKey={deletingKey}
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
  group,
  deletingKey,
  serverDeviceTypeByServerId,
  onDelete,
  t,
}: {
  group: LocalRelayHistoryGroup;
  deletingKey: string | null;
  serverDeviceTypeByServerId: ReadonlyMap<string, NonNullable<LocalRelayConnection["deviceType"]>>;
  onDelete: (group: LocalRelayHistoryGroup) => void;
  t: TFunction;
}) {
  const [expanded, setExpanded] = useState(false);
  const record = group.latest;
  const visibleRecords = expanded
    ? group.records
    : group.records.slice(0, COLLAPSED_HISTORY_TIME_LIMIT);
  const handleDelete = useCallback(() => onDelete(group), [group, onDelete]);
  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
  return (
    <View style={styles.row}>
      <View style={styles.details}>
        <View style={styles.historyRowHeader}>
          <Text style={styles.role}>
            {record.role === "client"
              ? t("settings.host.relay.management.roles.client")
              : t("settings.host.relay.management.roles.server")}
          </Text>
          <Text style={styles.count}>
            {t("settings.host.relay.management.connectionCount", {
              count: group.records.length,
            })}
          </Text>
        </View>
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
          <View style={[styles.field, styles.historyTimesField]}>
            <Text style={styles.fieldLabel}>
              {t("settings.host.relay.management.connectionHistory")}
            </Text>
            <View style={styles.historyTimes}>
              {visibleRecords.map((historyRecord) => (
                <Text key={historyRecord.id} style={styles.fieldValue}>
                  {formatHistoryTime(historyRecord, t)}
                </Text>
              ))}
            </View>
            {group.records.length > COLLAPSED_HISTORY_TIME_LIMIT ? (
              <Button variant="ghost" size="xs" onPress={toggleExpanded}>
                {expanded
                  ? t("settings.host.relay.management.collapseHistory")
                  : t("settings.host.relay.management.expandHistory", {
                      count: group.records.length,
                    })}
              </Button>
            ) : null}
          </View>
        </View>
      </View>
      <Button
        variant="ghost"
        size="xs"
        leftIcon={removeHistoryIcon}
        loading={deletingKey === group.key}
        disabled={deletingKey !== null}
        onPress={handleDelete}
        accessibilityLabel={
          deletingKey === group.key
            ? t("settings.host.relay.management.deleting")
            : t("settings.host.relay.management.delete")
        }
        style={styles.deleteButton}
      />
    </View>
  );
}

function formatHistoryTime(record: LocalRelayHistoryRecord, t: TFunction): string {
  const connectedAt = new Date(record.connectedAt).toLocaleString();
  const disconnectedAt = record.disconnectedAt
    ? new Date(record.disconnectedAt).toLocaleString()
    : t("settings.host.relay.management.stillConnected");
  return `${connectedAt} → ${disconnectedAt}`;
}

async function deleteRelayHistoryGroup(
  client: DaemonClient,
  group: LocalRelayHistoryGroup,
): Promise<void> {
  for (const record of group.records) {
    const result = await client.deleteDaemonRelayHistory(record.id);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to delete Relay history");
    }
  }
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
  const [deletingHistoryKey, setDeletingHistoryKey] = useState<string | null>(null);
  const clientConnections = runtime?.connections.filter(
    (connection) => connection.role === "client",
  );
  const serverConnections = runtime?.connections.filter(
    (connection) => connection.role !== "client",
  );
  const groupedHistory = groupRelayHistory(runtime?.history ?? []);
  const clientHistoryGroups = groupedHistory.filter((group) => group.latest.role === "client");
  const serverHistoryGroups = groupedHistory.filter((group) => group.latest.role !== "client");
  const deleteHistory = useCallback(
    (group: LocalRelayHistoryGroup) => {
      if (!client || deletingHistoryKey) return;
      setDeletingHistoryKey(group.key);
      void deleteRelayHistoryGroup(client, group)
        .then(() => {
          return onHistoryChanged();
        })
        .catch((deleteError: unknown) => {
          onError(deleteError instanceof Error ? deleteError.message : String(deleteError));
        })
        .finally(() => setDeletingHistoryKey(null));
    },
    [client, deletingHistoryKey, onError, onHistoryChanged],
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
            groups={clientHistoryGroups}
            title={t("settings.host.relay.management.clientHistory")}
            empty={t("settings.host.relay.management.noClientHistory")}
            deletingKey={deletingHistoryKey}
            serverDeviceTypeByServerId={serverDeviceTypeByServerId}
            onDelete={deleteHistory}
            t={t}
          />
          <LocalRelayHistoryGroup
            groups={serverHistoryGroups}
            title={t("settings.host.relay.management.serverHistory")}
            empty={t("settings.host.relay.management.noServerHistory")}
            deletingKey={deletingHistoryKey}
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
    fontSize: theme.fontSize.sm,
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
  historyRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
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
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  fieldValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  fieldValueMono: {
    fontFamily: theme.fontFamily.mono,
  },
  historyTimesField: {
    flexBasis: "100%",
  },
  historyTimes: {
    gap: theme.spacing[1],
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  historyHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  deleteButton: {
    alignSelf: "flex-end",
  },
}));
