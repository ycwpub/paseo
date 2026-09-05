import { describe, expect, it, vi } from "vitest";
import type { HostProfile } from "@/types/host-connection";
import type { HostRuntimeSnapshot } from "@/runtime/host-runtime";
import type { ConnectionProbeState } from "@/utils/connection-selection";
import {
  shouldRecoverDesktopManagedDaemon,
  startDesktopManagedDaemonRecovery,
} from "./desktop-managed-daemon-recovery";

function host(endpoint = "localhost:6767"): HostProfile {
  return {
    serverId: "server-local",
    label: "Local",
    appearance: { color: "blue", badgeDisplay: null },
    lifecycle: {},
    connections: [
      {
        id: "local-connection",
        type: "directTcp",
        endpoint,
        useTls: false,
      },
    ],
    preferredConnectionId: "local-connection",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
}

function snapshot(
  status: "pending" | "available" | "unavailable",
  connectionStatus: HostRuntimeSnapshot["connectionStatus"] = "offline",
): HostRuntimeSnapshot {
  const probe: ConnectionProbeState =
    status === "available" ? { status: "available", latencyMs: 3 } : { status, latencyMs: null };
  return {
    serverId: "server-local",
    activeConnectionId: connectionStatus === "online" ? "local-connection" : null,
    activeConnection:
      connectionStatus === "online"
        ? {
            type: "directTcp",
            endpoint: "localhost:6767",
            display: "localhost:6767",
          }
        : null,
    connectionStatus,
    client: null,
    lastError: null,
    lastOnlineAt: null,
    agentDirectoryStatus: "idle",
    agentDirectoryError: null,
    hasEverLoadedAgentDirectory: false,
    probeByConnectionId: new Map([["local-connection", probe]]),
    clientGeneration: 0,
    connectionEpoch: 0,
  };
}

function createStore(currentHost: HostProfile, currentSnapshot: HostRuntimeSnapshot) {
  const listeners = new Set<() => void>();
  return {
    getHosts: () => [currentHost],
    getSnapshot: () => currentSnapshot,
    subscribeAll: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeHostList: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: () => {
      for (const listener of listeners) listener();
    },
  };
}

describe("desktop managed daemon recovery", () => {
  it("only recovers a confirmed unavailable local daemon connection", () => {
    expect(shouldRecoverDesktopManagedDaemon(createStore(host(), snapshot("unavailable")))).toBe(
      true,
    );
    expect(shouldRecoverDesktopManagedDaemon(createStore(host(), snapshot("pending")))).toBe(false);
    expect(
      shouldRecoverDesktopManagedDaemon(createStore(host(), snapshot("available", "online"))),
    ).toBe(false);
    expect(
      shouldRecoverDesktopManagedDaemon(
        createStore(host("10.0.0.8:6767"), snapshot("unavailable")),
      ),
    ).toBe(false);
  });

  it("restarts a managed daemon after its local connection becomes unavailable", async () => {
    vi.useFakeTimers();
    const store = createStore(host(), snapshot("unavailable"));
    const startIfEnabled = vi.fn().mockResolvedValue({ ok: true });
    const stop = startDesktopManagedDaemonRecovery({
      store,
      service: {
        isRunning: () => false,
        startIfEnabled,
      },
      shouldStartDaemon: true,
      recoveryDelayMs: 100,
      retryDelayMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(startIfEnabled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(startIfEnabled).toHaveBeenCalledTimes(1);
    expect(startIfEnabled).toHaveBeenCalledWith({ shouldStart: true });

    stop();
    vi.useRealTimers();
  });
});
