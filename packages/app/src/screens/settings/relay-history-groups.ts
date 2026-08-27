export interface RelayHistoryRecordLike {
  id: string;
  serverId: string;
  clientId: string | null;
  clientHostname: string | null;
  deviceType: string | null;
  role: "client" | "server_control" | "server_data";
  connectionId: string | null;
  remoteAddress: string | null;
  remotePort: number | null;
  connectedAt: string;
  disconnectedAt: string | null;
}

export interface RelayHistoryGroup<T extends RelayHistoryRecordLike = RelayHistoryRecordLike> {
  key: string;
  latest: T;
  records: T[];
}

function resolveRelayHistoryIdentity(record: RelayHistoryRecordLike): string {
  if (record.role !== "client") {
    return `server:${record.serverId}`;
  }
  if (record.clientId) {
    return `client:${record.clientId}`;
  }
  return [
    "client-fallback",
    record.serverId,
    record.clientHostname ?? "",
    record.deviceType ?? "",
    record.remoteAddress ?? "",
  ].join(":");
}

export function groupRelayHistory<T extends RelayHistoryRecordLike>(
  history: readonly T[],
): RelayHistoryGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const record of history) {
    const key = resolveRelayHistoryIdentity(record);
    const records = groups.get(key);
    if (records) {
      records.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  return Array.from(groups, ([key, records]) => {
    records.sort((left, right) => right.connectedAt.localeCompare(left.connectedAt));
    return { key, latest: records[0]!, records };
  }).sort((left, right) => right.latest.connectedAt.localeCompare(left.latest.connectedAt));
}
