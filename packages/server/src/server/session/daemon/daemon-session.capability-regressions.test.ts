import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import pino from "pino";
import {
  DaemonSession,
  type DaemonRuntimeConfig,
  type DaemonSessionHost,
} from "./daemon-session.js";
import type { DaemonWebSocketRuntimeDiagnosticSnapshot } from "./diagnostics.js";
import type { ProviderAvailability } from "../../agent/agent-manager.js";
import type { HubRelationshipManagement } from "../../hub/relationship-controller.js";
import type { SessionOutboundMessage } from "../../messages.js";
import type { DaemonConfigReloadResult } from "../../daemon-config-store.js";
const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
function makeHome(): string {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "daemon-session-test-")));
  tempDirs.push(home);
  return home;
}
function makeSubsystem(overrides: {
  serverId?: string;
  daemonVersion?: string;
  daemonRuntimeConfig?: DaemonRuntimeConfig;
  listProviderAvailability?: () => Promise<ProviderAvailability[]>;
  getWebSocketRuntimeMetrics?: () => DaemonWebSocketRuntimeDiagnosticSnapshot | null;
  hubRelationships?: HubRelationshipManagement;
  reloadConfig?: () => DaemonConfigReloadResult;
}) {
  const emitted: SessionOutboundMessage[] = [];
  const restartIntents: Parameters<DaemonSessionHost["emitLifecycleIntent"]>[0][] = [];
  const host: DaemonSessionHost = {
    emit: (msg) => emitted.push(msg),
    emitLifecycleIntent: (intent) => restartIntents.push(intent),
  };
  const paseoHome = makeHome();
  const subsystem = new DaemonSession({
    host,
    clientId: "client-1",
    paseoHome,
    serverId: overrides.serverId,
    daemonVersion: overrides.daemonVersion,
    daemonRuntimeConfig: overrides.daemonRuntimeConfig,
    listAgents: () => [],
    listProjects: async () => [],
    listWorkspaces: async () => [],
    listProviderAvailability: overrides.listProviderAvailability ?? (async () => []),
    getWebSocketRuntimeMetrics: overrides.getWebSocketRuntimeMetrics,
    hubRelationships: overrides.hubRelationships,
    reloadConfig:
      overrides.reloadConfig ??
      (() => ({
        appliedPaths: [],
        restartRequiredPaths: [],
        overrideControlledPaths: [],
      })),
    logger: pino({ level: "silent" }),
  });
  return { subsystem, emitted, paseoHome, restartIntents };
}
describe("DaemonSession", () => {
  test("status includes live LAN Relay client and server connections", async () => {
    const { subsystem, emitted } = makeSubsystem({
      serverId: "srv-1",
      daemonVersion: "1.2.3",
      daemonRuntimeConfig: {
        listen: "127.0.0.1:6767",
        relay: {
          enabled: true,
          endpoints: [],
          local: { enabled: true, listen: "0.0.0.0:6769" },
        },
        getLocalRelayStatus: () => ({
          listen: "0.0.0.0:6769",
          publicEndpoint: "10.0.0.8:6769",
          pairingBaseUrl: "http://10.0.0.8:6769",
          connections: [
            {
              serverId: "srv-remote",
              role: "client",
              connectionId: "clt-1",
              remoteAddress: "10.0.0.9",
              remotePort: 54321,
              userAgent: "Paseo Android",
              connectedAt: "2026-07-30T00:00:00.000Z",
            },
          ],
        }),
      },
      listProviderAvailability: async () => [],
    });
    await subsystem.handleGetStatusRequest({
      type: "daemon.get_status.request",
      requestId: "relay-status",
    });
    expect(emitted[0]).toMatchObject({
      type: "daemon.get_status.response",
      payload: {
        relay: {
          local: {
            runtime: {
              publicEndpoint: "10.0.0.8:6769",
              connections: [
                {
                  serverId: "srv-remote",
                  role: "client",
                  connectionId: "clt-1",
                  remotePort: 54321,
                },
              ],
            },
          },
        },
      },
    });
  });
  test("deletes a LAN Relay history record through the daemon RPC", () => {
    const deleteLocalRelayHistory = vi.fn(() => true);
    const { subsystem, emitted } = makeSubsystem({
      daemonRuntimeConfig: {
        listen: "127.0.0.1:6767",
        relay: {
          enabled: true,
          endpoints: [],
          local: { enabled: true, listen: "0.0.0.0:6769" },
        },
        deleteLocalRelayHistory,
      },
    });
    subsystem.handleDeleteRelayHistoryRequest({
      type: "daemon.relay_history.delete.request",
      requestId: "delete-history",
      historyId: "rlyh_1",
    });
    expect(deleteLocalRelayHistory).toHaveBeenCalledWith("rlyh_1");
    expect(emitted).toEqual([
      {
        type: "daemon.relay_history.delete.response",
        payload: {
          requestId: "delete-history",
          historyId: "rlyh_1",
          success: true,
          error: null,
        },
      },
    ]);
  });
  test("status preserves daemon and Relay runtime fields when provider listing rejects", async () => {
    const { subsystem, emitted } = makeSubsystem({
      serverId: "srv-1",
      daemonVersion: "1.2.3",
      daemonRuntimeConfig: {
        listen: "127.0.0.1:6767",
        relay: {
          enabled: true,
          endpoints: [],
          local: { enabled: true, listen: "0.0.0.0:6769" },
        },
        getLocalRelayStatus: () => ({
          listen: "0.0.0.0:6769",
          publicEndpoint: "10.0.0.8:6769",
          pairingBaseUrl: "http://10.0.0.8:6769/app",
          connections: [],
        }),
      },
      listProviderAvailability: async () => {
        throw new Error("provider listing failed");
      },
    });
    await subsystem.handleGetStatusRequest({ type: "daemon.get_status.request", requestId: "s-2" });
    expect(emitted).toEqual([
      {
        type: "daemon.get_status.response",
        payload: {
          requestId: "s-2",
          serverId: "srv-1",
          version: "1.2.3",
          pid: process.pid,
          nodePath: process.execPath,
          startedAt: null,
          listen: "127.0.0.1:6767",
          relay: {
            enabled: true,
            endpoints: [],
            local: {
              enabled: true,
              listen: "0.0.0.0:6769",
              runtime: {
                listen: "0.0.0.0:6769",
                publicEndpoint: "10.0.0.8:6769",
                pairingBaseUrl: "http://10.0.0.8:6769/app",
                connections: [],
              },
            },
          },
          providers: [],
        },
      },
    ]);
  });
  test("pairing offer is empty when relay is disabled", async () => {
    const { subsystem, emitted } = makeSubsystem({
      daemonRuntimeConfig: {
        listen: "127.0.0.1:6767",
        getRelayConfig: () => ({
          enabled: false,
          endpoints: [],
          local: { enabled: false, listen: "0.0.0.0:6769" },
          endpoint: "relay.paseo.sh:443",
          publicEndpoint: "relay.paseo.sh:443",
          useTls: true,
          publicUseTls: true,
        }),
      },
    });
    await subsystem.handleGetPairingOfferRequest({
      type: "daemon.get_pairing_offer.request",
      requestId: "p-1",
    });
    expect(emitted).toEqual([
      {
        type: "daemon.get_pairing_offer.response",
        payload: {
          requestId: "p-1",
          url: "",
          qr: null,
          relayEnabled: false,
          offers: [],
        },
      },
    ]);
  });
  test("pairing offer mints a real connection URL when relay is enabled", async () => {
    const { subsystem, emitted } = makeSubsystem({
      daemonRuntimeConfig: {
        listen: "127.0.0.1:6767",
        appBaseUrl: "https://app.example.test",
        getRelayConfig: () => ({
          enabled: true,
          endpoints: [
            {
              endpoint: "relay.example.test:443",
              useTls: true,
              publicEndpoint: "relay.example.test:443",
              publicUseTls: true,
            },
            {
              endpoint: "192.168.1.20:6769",
              useTls: false,
            },
          ],
          local: { enabled: false, listen: "0.0.0.0:6769" },
          endpoint: "relay.example.test:443",
          publicEndpoint: "relay.example.test:443",
          useTls: true,
          publicUseTls: true,
        }),
      },
    });
    await subsystem.handleGetPairingOfferRequest({
      type: "daemon.get_pairing_offer.request",
      requestId: "p-2",
    });
    expect(emitted).toHaveLength(1);
    const message = emitted[0];
    expect(message.type).toBe("daemon.get_pairing_offer.response");
    if (message.type !== "daemon.get_pairing_offer.response") {
      throw new Error("expected a pairing offer response");
    }
    expect(message.payload.requestId).toBe("p-2");
    expect(message.payload.relayEnabled).toBe(true);
    expect(message.payload.url.startsWith("https://app.example.test")).toBe(true);
    expect(typeof message.payload.qr).toBe("string");
    expect(message.payload.offers).toHaveLength(2);
    expect(message.payload.offers.map((offer) => [offer.endpoint, offer.useTls])).toEqual([
      ["relay.example.test:443", true],
      ["192.168.1.20:6769", false],
    ]);
    expect(message.payload.offers.every((offer) => offer.url.includes("#offer="))).toBe(true);
    expect(message.payload.offers.every((offer) => typeof offer.qr === "string")).toBe(true);
  });
  test("diagnostics includes a log tail and redacts connection secrets", async () => {
    const { subsystem, emitted, paseoHome } = makeSubsystem({
      serverId: "srv-1",
      daemonVersion: "1.2.3",
      daemonRuntimeConfig: {
        listen: "127.0.0.1:6767",
        getRelayConfig: () => ({
          enabled: true,
          endpoints: [
            {
              endpoint: "relay.secret.test:443",
              useTls: true,
              publicEndpoint: "relay.secret.test:443",
              publicUseTls: true,
            },
          ],
          local: { enabled: false, listen: "0.0.0.0:6769" },
          endpoint: "relay.secret.test:443",
          publicEndpoint: "relay.secret.test:443",
          useTls: true,
          publicUseTls: true,
        }),
      },
    });
    writeFileSync(
      join(paseoHome, "daemon.log"),
      "first line\nrelay.secret.test:443 token=super-secret paseo://pairing-secret\n",
    );
    await subsystem.handleDiagnosticsRequest({ type: "diagnostics.request", requestId: "d-1" });
    expect(emitted).toHaveLength(1);
    const message = emitted[0];
    expect(message.type).toBe("diagnostics.response");
    if (message.type !== "diagnostics.response") {
      throw new Error("expected diagnostics response");
    }
    expect(message.payload.requestId).toBe("d-1");
    expect(message.payload.diagnostic).toContain("Daemon log tail");
    expect(message.payload.diagnostic).toContain("first line");
    expect(message.payload.diagnostic).not.toContain("relay.secret.test:443");
    expect(message.payload.diagnostic).not.toContain("super-secret");
    expect(message.payload.diagnostic).not.toContain("pairing-secret");
  });
});
