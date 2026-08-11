import { afterEach, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { startLocalRelayServer, type LocalRelayServerController } from "@getpaseo/relay";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WebSocketFactory } from "@getpaseo/client/internal/daemon-client-transport-types";
import { buildRelayWebSocketUrl } from "@getpaseo/protocol/daemon-endpoints";
import {
  getConnectionOfferRelays,
  parseConnectionOfferFromUrl,
} from "@getpaseo/protocol/connection-offer";
import { generateLocalPairingOffer } from "../pairing-offer.js";
import { createTestPaseoDaemon, type TestPaseoDaemon } from "../test-utils/paseo-daemon.js";

function createNodeWebSocketFactory(
  onDirectSocket?: (socket: WebSocket) => void,
): WebSocketFactory {
  return (url, options) => {
    const socket = new WebSocket(url, options?.protocols, {
      headers: options?.headers,
      perMessageDeflate: false,
    });
    if (new URL(url).searchParams.has("directToken")) {
      onDirectSocket?.(socket);
    }
    return socket;
  };
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function relayHasClientConnection(relay: LocalRelayServerController): boolean {
  return relay.getStatus().connections.some((connection) => connection.role === "client");
}

function relayHasNoDataConnections(relay: LocalRelayServerController): boolean {
  return relay
    .getStatus()
    .connections.every(
      (connection) => connection.role !== "client" && connection.role !== "server_data",
    );
}

describe("Relay to LAN direct E2EE upgrade", () => {
  let relay: LocalRelayServerController | null = null;
  let daemon: TestPaseoDaemon | null = null;
  const clients: DaemonClient[] = [];

  afterEach(async () => {
    for (const client of clients) {
      await client.close().catch(() => undefined);
    }
    clients.length = 0;
    await daemon?.close();
    daemon = null;
    await relay?.stop();
    relay = null;
  });

  test("upgrades an approved Relay client to direct E2EE and falls back to Relay", async () => {
    relay = await startLocalRelayServer({ listen: "127.0.0.1:0" });
    daemon = await createTestPaseoDaemon({
      relayEnabled: true,
      relayEndpoint: relay.connectEndpoint,
      relayUseTls: false,
    });

    const admin = new DaemonClient({
      url: `ws://127.0.0.1:${daemon.port}/ws`,
      clientId: "lan-direct-admin",
      clientType: "cli",
      webSocketFactory: createNodeWebSocketFactory(),
      reconnect: { enabled: false },
    });
    clients.push(admin);
    await admin.connect();

    const pairing = await generateLocalPairingOffer({
      paseoHome: daemon.paseoHome,
      relayEnabled: true,
      relayEndpoint: relay.connectEndpoint,
      relayUseTls: false,
      includeQr: false,
    });
    const offer = parseConnectionOfferFromUrl(pairing.url ?? "");
    if (!offer) throw new Error("Pairing offer was not generated");
    const relayEndpoint = getConnectionOfferRelays(offer)[0]!;
    let directSocket: WebSocket | null = null;
    let allowDirect = true;
    const remoteFactory: WebSocketFactory = (url, options) => {
      if (new URL(url).searchParams.has("directToken") && !allowDirect) {
        throw new Error("Direct path intentionally disabled");
      }
      return createNodeWebSocketFactory((socket) => {
        directSocket = socket;
      })(url, options);
    };
    const remoteClientId = `lan-direct-client-${Date.now()}`;
    const remote = new DaemonClient({
      url: buildRelayWebSocketUrl({
        endpoint: relayEndpoint.endpoint,
        useTls: relayEndpoint.useTls === true,
        serverId: offer.serverId,
        role: "client",
      }),
      clientId: remoteClientId,
      clientType: "cli",
      webSocketFactory: remoteFactory,
      e2ee: {
        enabled: true,
        daemonPublicKeyB64: offer.daemonPublicKeyB64,
      },
      reconnect: {
        enabled: true,
        baseDelayMs: 25,
        maxDelayMs: 100,
      },
    });
    clients.push(remote);

    await expect(remote.connect()).rejects.toThrow("无权限，联系服务端通过连接申请");
    const approved = await admin.approveDaemonClientAccess(remoteClientId);
    expect(approved.client?.clientId).toBe(remoteClientId);

    await waitFor(
      () =>
        remote.getConnectionState().status === "connected" &&
        remote.getConnectionTransport()?.type === "direct" &&
        directSocket !== null,
      "Client did not establish the LAN direct transport",
    );
    expect(remote.getConnectionTransport()).toMatchObject({
      type: "direct",
      e2ee: true,
      upgradedFromRelay: true,
    });
    await waitFor(
      () => relayHasNoDataConnections(relay!),
      "Relay continued carrying the upgraded client connection",
    );
    await expect(remote.getDaemonStatus()).resolves.toBeDefined();

    allowDirect = false;
    directSocket!.terminate();

    await waitFor(
      () =>
        remote.getConnectionState().status === "connected" &&
        remote.getConnectionTransport()?.type === "relay" &&
        relayHasClientConnection(relay!),
      "Client did not fall back to Relay after the direct transport closed",
    );
    expect(remote.getConnectionTransport()).toMatchObject({
      type: "relay",
      e2ee: true,
    });
    await expect(remote.getDaemonStatus()).resolves.toBeDefined();
  }, 30_000);
});
