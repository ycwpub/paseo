import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { HostConnection, HostProfile } from "@/types/host-connection";
import { DaemonConnectionApprovalRequiredError } from "@/utils/test-daemon-connection";

export function approvalPendingClient(error: unknown): DaemonClient | null {
  return error instanceof DaemonConnectionApprovalRequiredError
    ? (error.client as DaemonClient)
    : null;
}

function isLoopbackEndpoint(endpoint: string): boolean {
  const normalized = endpoint.trim().toLowerCase();
  return (
    normalized.startsWith("localhost:") ||
    normalized.startsWith("127.") ||
    normalized.startsWith("[::1]:") ||
    normalized.startsWith("::1:")
  );
}

export function pruneSupersededLoopbackConnections(input: {
  hosts: readonly HostProfile[];
  serverId: string;
  connection: HostConnection;
  updatedAt: string;
}): HostProfile[] | null {
  if (input.connection.type !== "directTcp" || !isLoopbackEndpoint(input.connection.endpoint)) {
    return null;
  }

  const profile = input.hosts.find((host) => host.serverId === input.serverId);
  if (!profile) return null;

  const staleConnectionIds = new Set(
    profile.connections
      .filter(
        (candidate) =>
          candidate.type === "directTcp" &&
          candidate.id !== input.connection.id &&
          isLoopbackEndpoint(candidate.endpoint),
      )
      .map((candidate) => candidate.id),
  );
  if (staleConnectionIds.size === 0) return null;

  return input.hosts.map((host) => {
    if (host.serverId !== input.serverId) return host;
    const preferredWasStale =
      host.preferredConnectionId !== null && staleConnectionIds.has(host.preferredConnectionId);
    return {
      ...host,
      connections: host.connections.filter((candidate) => !staleConnectionIds.has(candidate.id)),
      preferredConnectionId: preferredWasStale ? input.connection.id : host.preferredConnectionId,
      updatedAt: input.updatedAt,
    };
  });
}

export function shouldDeferQueuedMessage(queue: readonly { isEditing?: boolean }[]): boolean {
  return queue[0]?.isEditing === true;
}
