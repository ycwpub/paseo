import type { HostProfile } from "@/types/host-connection";
import type { DaemonServerInfo } from "@/stores/session-store";
import type { RelayDeviceType } from "@getpaseo/protocol/daemon-endpoints";

export function formatRelayPeerEndpoint(
  remoteAddress: string | null,
  remotePort: number | null,
): string | null {
  if (!remoteAddress) return null;
  const address = remoteAddress.includes(":") ? `[${remoteAddress}]` : remoteAddress;
  return `${address}:${remotePort ?? "—"}`;
}

export function buildRelayHostLabelMap(hosts: HostProfile[]): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  for (const host of hosts) {
    const label = host.label.trim();
    if (label && label !== host.serverId) {
      labels.set(host.serverId, label);
    }
  }
  return labels;
}

export function buildRelayServerDeviceTypeMap(
  serverInfos: Array<DaemonServerInfo | null | undefined>,
): ReadonlyMap<string, RelayDeviceType> {
  const deviceTypes = new Map<string, RelayDeviceType>();
  for (const serverInfo of serverInfos) {
    if (!serverInfo) continue;
    if (serverInfo.relayDeviceType) {
      deviceTypes.set(serverInfo.serverId, serverInfo.relayDeviceType);
      continue;
    }
    // COMPAT(relayDeviceType): pre-v0.2.0 CLI daemons only reported desktopManaged.
    // Remove this fallback after 2027-01-31.
    if (serverInfo.desktopManaged === false) {
      deviceTypes.set(serverInfo.serverId, "cli");
    }
  }
  return deviceTypes;
}

export function resolveRelayServerDeviceType(
  reportedDeviceType: RelayDeviceType | null,
  role: "client" | "server_control" | "server_data",
  serverId: string,
  deviceTypeByServerId: ReadonlyMap<string, RelayDeviceType>,
): RelayDeviceType | null {
  if (role === "client") return reportedDeviceType;
  // COMPAT(relayDeviceType): active Relay sockets created before v0.2.0 omit deviceType.
  // Remove this fallback after 2027-01-31.
  return reportedDeviceType ?? deviceTypeByServerId.get(serverId) ?? null;
}

export function resolveRelayServerHostname(
  connectionHostname: string | null,
  serverId: string,
  hostLabelByServerId: ReadonlyMap<string, string>,
): string | null {
  const reportedHostname = connectionHostname?.trim();
  if (reportedHostname) return reportedHostname;
  return hostLabelByServerId.get(serverId) ?? null;
}
