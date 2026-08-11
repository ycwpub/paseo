import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import http from "node:http";
import { WebSocket, type RawData } from "ws";

import { startLocalRelayServer, type LocalRelayServerController } from "./local-server.js";

const controllers: LocalRelayServerController[] = [];
const sockets: WebSocket[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(controllers.splice(0).map((controller) => controller.stop()));
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

function createSocket(url: string): { socket: WebSocket; opened: Promise<void> } {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const opened = new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { socket, opened };
}

async function openSocket(url: string): Promise<WebSocket> {
  const created = createSocket(url);
  await created.opened;
  return created.socket;
}

function getHttpBody(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .once("error", reject);
  });
}

async function createWebAppDist(): Promise<string> {
  const distDir = await mkdtemp(path.join(os.tmpdir(), "paseo-relay-web-app-"));
  tempDirs.push(distDir);
  await writeFile(path.join(distDir, "index.html"), "<html><body>Paseo browser app</body></html>");
  await writeFile(path.join(distDir, "app.js"), "window.PASEO_WEB_APP = true;");
  return distDir;
}

function nextMessage(socket: WebSocket): Promise<{ data: RawData; isBinary: boolean }> {
  return new Promise((resolve) => {
    socket.once("message", (data, isBinary) => resolve({ data, isBinary }));
  });
}

test("forwards binary frames between a client and daemon data socket", async () => {
  const relay = await startLocalRelayServer({ listen: "127.0.0.1:0" });
  controllers.push(relay);
  expect(relay.useTls).toBe(false);
  expect(relay.pairingBaseUrl).toBe(`http://${relay.publicEndpoint}`);
  expect(await getHttpBody(relay.pairingBaseUrl)).toContain("paseo://pair/");
  const baseUrl = `ws://${relay.connectEndpoint}/ws?serverId=server-test&v=2`;

  const controlConnection = createSocket(
    `${baseUrl}&role=server&hostname=paseo-server.local&deviceType=mac`,
  );
  const controlSync = nextMessage(controlConnection.socket);
  await controlConnection.opened;
  const control = controlConnection.socket;
  expect(JSON.parse((await controlSync).data.toString())).toEqual({
    type: "sync",
    pairingBaseUrl: relay.pairingBaseUrl,
    connectionIds: [],
    connections: [],
  });

  const connectedMessage = nextMessage(control);
  const client = await openSocket(
    `${baseUrl}&role=client&connectionId=client-test&clientId=cid_test&clientHostname=shared-host&deviceType=android`,
  );
  const connectedPayload = JSON.parse((await connectedMessage).data.toString()) as Record<
    string,
    unknown
  >;
  expect(connectedPayload).toMatchObject({
    type: "connected",
    connectionId: "client-test",
    remoteAddress: "127.0.0.1",
    remotePort: expect.any(Number),
  });
  expect(connectedPayload).not.toHaveProperty("clientId");
  expect(connectedPayload).not.toHaveProperty("clientHostname");
  expect(connectedPayload).not.toHaveProperty("identityLabel");
  expect(connectedPayload).not.toHaveProperty("userAgent");

  const daemonSocket = await openSocket(
    `${baseUrl}&role=server&connectionId=client-test&deviceType=mac`,
  );
  expect(relay.getStatus()).toMatchObject({
    listen: relay.connectEndpoint,
    publicEndpoint: relay.publicEndpoint,
    pairingBaseUrl: relay.pairingBaseUrl,
    connections: [
      {
        serverId: "server-test",
        hostname: null,
        deviceType: "android",
        clientId: "cid_test",
        clientHostname: "shared-host",
        role: "client",
        connectionId: "client-test",
      },
      {
        serverId: "server-test",
        hostname: "paseo-server.local",
        deviceType: "mac",
        role: "server_control",
        connectionId: null,
      },
      {
        serverId: "server-test",
        hostname: "paseo-server.local",
        deviceType: "mac",
        clientId: "cid_test",
        clientHostname: "shared-host",
        role: "server_data",
        connectionId: "client-test",
      },
    ],
  });
  const clientPayload = Buffer.from([0, 1, 2, 255]);
  const daemonMessage = nextMessage(daemonSocket);
  client.send(clientPayload);
  const forwardedToDaemon = await daemonMessage;
  expect(forwardedToDaemon.isBinary).toBe(true);
  expect(Buffer.from(forwardedToDaemon.data as Buffer)).toEqual(clientPayload);

  const daemonPayload = Buffer.from([9, 8, 7, 6]);
  const clientMessage = nextMessage(client);
  daemonSocket.send(daemonPayload);
  const forwardedToClient = await clientMessage;
  expect(forwardedToClient.isBinary).toBe(true);
  expect(Buffer.from(forwardedToClient.data as Buffer)).toEqual(daemonPayload);
});

test("does not report or retain clients that never establish a Relay data channel", async () => {
  const relay = await startLocalRelayServer({ listen: "127.0.0.1:0" });
  controllers.push(relay);
  const baseUrl = `ws://${relay.connectEndpoint}/ws?serverId=server-direct&v=2`;
  const controlConnection = createSocket(`${baseUrl}&role=server&hostname=daemon.local`);
  const sync = nextMessage(controlConnection.socket);
  await controlConnection.opened;
  expect(JSON.parse((await sync).data.toString())).toMatchObject({
    type: "sync",
    pairingBaseUrl: relay.pairingBaseUrl,
  });

  const client = await openSocket(
    `${baseUrl}&role=client&connectionId=client-direct&clientId=cid_1&clientHostname=macbook`,
  );
  expect(relay.getStatus().connections.filter((entry) => entry.role === "client")).toEqual([]);
  expect(relay.getStatus().history.filter((entry) => entry.role === "client")).toEqual([]);

  client.close();
});

test("records Relay client and server connection history and supports deletion", async () => {
  const relay = await startLocalRelayServer({ listen: "127.0.0.1:0" });
  controllers.push(relay);
  const baseUrl = `ws://${relay.connectEndpoint}/ws?serverId=server-history&v=2`;
  const control = await openSocket(`${baseUrl}&role=server&hostname=daemon.local&deviceType=cli`);
  const client = await openSocket(
    `${baseUrl}&role=client&connectionId=client-history&clientId=cid_history&clientHostname=pixel&deviceType=android&identityLabel=must-not-be-collected`,
  );
  const daemon = await openSocket(
    `${baseUrl}&role=server&connectionId=client-history&hostname=daemon.local&deviceType=cli&identityLabel=must-not-be-collected`,
  );

  const connections = relay.getStatus().connections;
  expect(connections).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "client",
        deviceType: "android",
        clientId: "cid_history",
        clientHostname: "pixel",
      }),
      expect.objectContaining({
        role: "server_data",
        deviceType: "cli",
        clientId: "cid_history",
        clientHostname: "pixel",
      }),
    ]),
  );
  for (const connection of connections) {
    expect(connection).not.toHaveProperty("identityLabel");
    expect(connection).not.toHaveProperty("userAgent");
  }
  const clientHistory = relay.getStatus().history.find((entry) => entry.role === "client");
  expect(clientHistory).toMatchObject({
    clientId: "cid_history",
    deviceType: "android",
    disconnectedAt: null,
  });
  expect(clientHistory).not.toHaveProperty("identityLabel");
  expect(clientHistory).not.toHaveProperty("userAgent");

  client.close();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const endedHistory = relay.getStatus().history.find((entry) => entry.id === clientHistory?.id);
  expect(endedHistory?.disconnectedAt).toEqual(expect.any(String));
  expect(relay.deleteHistory(clientHistory?.id ?? "")).toBe(true);
  expect(relay.getStatus().history.some((entry) => entry.id === clientHistory?.id)).toBe(false);

  daemon.close();
  control.close();
});

test("removes legacy client identifier fields from persisted Relay history", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "paseo-relay-history-"));
  tempDirs.push(tempDir);
  const historyFilePath = path.join(tempDir, "history.json");
  await writeFile(
    historyFilePath,
    JSON.stringify({
      version: 1,
      history: [
        {
          id: "rlyh_legacy",
          serverId: "srv_legacy",
          hostname: null,
          clientId: "cid_legacy",
          clientHostname: "shared-hostname",
          identityLabel: "Paseo Desktop",
          role: "client",
          connectionId: "clt_legacy",
          remoteAddress: "127.0.0.1",
          remotePort: 12345,
          userAgent: "Mozilla/5.0 private fingerprint",
          connectedAt: "2026-07-31T00:00:00.000Z",
          disconnectedAt: "2026-07-31T00:01:00.000Z",
        },
      ],
    }),
  );

  const relay = await startLocalRelayServer({
    listen: "127.0.0.1:0",
    historyFilePath,
  });
  controllers.push(relay);

  expect(relay.getStatus().history[0]).toMatchObject({
    clientId: "cid_legacy",
    clientHostname: "shared-hostname",
    deviceType: null,
  });
  expect(relay.getStatus().history[0]).not.toHaveProperty("identityLabel");
  expect(relay.getStatus().history[0]).not.toHaveProperty("userAgent");

  const persisted = JSON.parse(await readFile(historyFilePath, "utf8")) as {
    history: Array<Record<string, unknown>>;
  };
  expect(persisted.history[0]).not.toHaveProperty("identityLabel");
  expect(persisted.history[0]).not.toHaveProperty("userAgent");
});

test("hosts the Paseo pairing web app at the configured path", async () => {
  const distDir = await createWebAppDist();
  const relay = await startLocalRelayServer({
    listen: "127.0.0.1:0",
    pairingBaseUrl: "http://127.0.0.1:7788",
    webApp: { enabled: true, path: "/app", distDir },
  });
  controllers.push(relay);

  expect(relay.pairingBaseUrl).toBe("http://127.0.0.1:7788/app");
  expect(await getHttpBody(`http://${relay.connectEndpoint}/app/#offer=test`)).toContain(
    "Paseo browser app",
  );
  expect(await getHttpBody(`http://${relay.connectEndpoint}/?app/#offer=test`)).not.toContain(
    "Paseo browser app",
  );
  expect(await getHttpBody(`http://${relay.connectEndpoint}/app.js`)).toContain("PASEO_WEB_APP");
});
