import { describe, expect, it, vi } from "vitest";
import type { HostRuntimeSnapshot } from "@/runtime/host-runtime";
import { resolveConnectionProbePresentation } from "./host-connection-presentation";

function snapshot(input: Partial<HostRuntimeSnapshot> = {}): HostRuntimeSnapshot {
  return {
    serverId: "server-local",
    activeConnectionId: null,
    activeConnection: null,
    connectionStatus: "offline",
    client: null,
    lastError: null,
    lastOnlineAt: null,
    agentDirectoryStatus: "idle",
    agentDirectoryError: null,
    hasEverLoadedAgentDirectory: false,
    probeByConnectionId: new Map(),
    clientGeneration: 0,
    connectionEpoch: 0,
    ...input,
  };
}

describe("resolveConnectionProbePresentation", () => {
  it("does not show a stale timeout for the active online connection", () => {
    const presentation = resolveConnectionProbePresentation({
      connectionId: "local",
      snapshot: snapshot({
        activeConnectionId: "local",
        connectionStatus: "online",
        probeByConnectionId: new Map([["local", { status: "unavailable", latencyMs: null }]]),
      }),
    });

    expect(presentation).toEqual({
      latencyMs: null,
      latencyLoading: false,
      latencyError: false,
    });
  });

  it("uses the live heartbeat latency for the active online connection", () => {
    const presentation = resolveConnectionProbePresentation({
      connectionId: "local",
      snapshot: snapshot({
        activeConnectionId: "local",
        connectionStatus: "online",
        client: {
          getLastLivenessRttMs: vi.fn(() => 18),
        } as unknown as HostRuntimeSnapshot["client"],
        probeByConnectionId: new Map([["local", { status: "unavailable", latencyMs: null }]]),
      }),
    });

    expect(presentation).toEqual({
      latencyMs: 18,
      latencyLoading: false,
      latencyError: false,
    });
  });

  it("keeps showing timeout for an unavailable inactive connection", () => {
    const presentation = resolveConnectionProbePresentation({
      connectionId: "remote",
      snapshot: snapshot({
        probeByConnectionId: new Map([["remote", { status: "unavailable", latencyMs: null }]]),
      }),
    });

    expect(presentation).toEqual({
      latencyMs: undefined,
      latencyLoading: false,
      latencyError: true,
    });
  });
});
