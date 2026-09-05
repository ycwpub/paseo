import type { HostRuntimeSnapshot } from "@/runtime/host-runtime";

export interface ConnectionProbePresentation {
  latencyMs: number | null | undefined;
  latencyLoading: boolean;
  latencyError: boolean;
}

export function resolveConnectionProbePresentation(input: {
  connectionId: string;
  snapshot: HostRuntimeSnapshot | null;
}): ConnectionProbePresentation {
  const { connectionId, snapshot } = input;
  const probe = snapshot?.probeByConnectionId.get(connectionId);
  const isActiveOnline =
    snapshot?.connectionStatus === "online" && snapshot.activeConnectionId === connectionId;

  if (isActiveOnline) {
    const liveLatencyMs = snapshot.client?.getLastLivenessRttMs() ?? null;
    return {
      latencyMs: liveLatencyMs ?? (probe?.status === "available" ? probe.latencyMs : null),
      latencyLoading: false,
      latencyError: false,
    };
  }

  return {
    latencyMs: probe?.status === "available" ? probe.latencyMs : undefined,
    latencyLoading: !probe || probe.status === "pending",
    latencyError: probe?.status === "unavailable",
  };
}
