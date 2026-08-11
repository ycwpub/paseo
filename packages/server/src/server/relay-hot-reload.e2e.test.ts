import { createServer, type Server } from "node:http";
import { DaemonClient } from "@getpaseo/client";
import { afterEach, expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { createTestPaseoDaemon, type TestPaseoDaemon } from "./test-utils/paseo-daemon.js";

interface TrackingRelay {
  endpoint: string;
  activeControlConnections(): number;
  stop(): Promise<void>;
}

const daemons: TestPaseoDaemon[] = [];
const relays: TrackingRelay[] = [];

afterEach(async () => {
  await Promise.all(daemons.splice(0).map((daemon) => daemon.close()));
  await Promise.all(relays.splice(0).map((relay) => relay.stop()));
});

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function createTrackingRelay(): Promise<TrackingRelay> {
  const httpServer = createServer();
  const websocketServer = new WebSocketServer({ server: httpServer });
  const controlSockets = new Set<WebSocket>();

  websocketServer.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "/", "http://relay.local");
    if (
      url.pathname !== "/ws" ||
      url.searchParams.get("role") !== "server" ||
      url.searchParams.has("connectionId")
    ) {
      socket.close(1008, "Unexpected test relay connection");
      return;
    }

    controlSockets.add(socket);
    socket.send(JSON.stringify({ type: "sync", connectionIds: [] }));
    socket.once("close", () => controlSockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Tracking relay did not bind to a TCP port");
  }

  const relay: TrackingRelay = {
    endpoint: `127.0.0.1:${address.port}`,
    activeControlConnections: () => controlSockets.size,
    async stop() {
      for (const socket of websocketServer.clients) socket.terminate();
      await new Promise<void>((resolve) => websocketServer.close(() => resolve()));
      await closeServer(httpServer);
    },
  };
  relays.push(relay);
  return relay;
}

test("applies Relay endpoint edits without restarting the daemon", async () => {
  const firstRelay = await createTrackingRelay();
  const secondRelay = await createTrackingRelay();
  const daemon = await createTestPaseoDaemon({
    relayEnabled: true,
    relayEndpoint: firstRelay.endpoint,
    relayUseTls: false,
  });
  daemons.push(daemon);
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    clientId: "relay-hot-reload-test",
    appVersion: "relay-hot-reload-test",
  });

  try {
    await client.connect();
    await expect.poll(() => firstRelay.activeControlConnections()).toBe(1);

    await client.patchDaemonConfig({
      relay: {
        endpoints: [
          { endpoint: firstRelay.endpoint, useTls: false },
          { endpoint: secondRelay.endpoint, useTls: false },
        ],
      },
    });

    const multiRelayStatus = await client.getDaemonStatus();
    expect(multiRelayStatus.relay?.endpoints).toEqual([
      { endpoint: firstRelay.endpoint, useTls: false },
      { endpoint: secondRelay.endpoint, useTls: false },
    ]);
    await expect.poll(() => secondRelay.activeControlConnections()).toBe(1);

    await client.patchDaemonConfig({
      relay: {
        endpoints: [{ endpoint: secondRelay.endpoint, useTls: false }],
      },
    });

    const switchedStatus = await client.getDaemonStatus();
    expect(switchedStatus.relay?.endpoint).toBe(secondRelay.endpoint);
    await expect.poll(() => firstRelay.activeControlConnections()).toBe(0);
    expect(secondRelay.activeControlConnections()).toBe(1);

    await client.patchDaemonConfig({ relay: { endpoints: [] } });

    const disabledStatus = await client.getDaemonStatus();
    expect(disabledStatus.relay?.enabled).toBe(false);
    expect(disabledStatus.relay?.endpoints).toEqual([]);
    await expect.poll(() => secondRelay.activeControlConnections()).toBe(0);
  } finally {
    await client.close().catch(() => undefined);
  }
});
