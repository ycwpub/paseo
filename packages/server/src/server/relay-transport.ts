import { WebSocket } from "ws";
import type pino from "pino";
import type { KeyPair } from "@getpaseo/relay/e2ee";
import { buildRelayWebSocketUrl, type RelayDeviceType } from "@getpaseo/protocol/daemon-endpoints";
import type { ExternalSocketMetadata } from "./websocket-server.js";
import {
  wrapDaemonEncryptedWebSocket,
  type EncryptedWebSocketLike,
} from "./encrypted-websocket.js";

export interface RelayTransportOptions {
  logger: pino.Logger;
  attachSocket: (ws: RelaySocketLike, metadata?: ExternalSocketMetadata) => Promise<void>;
  relayEndpoint: string; // "host:port"
  relayUseTls: boolean;
  serverId: string;
  serverHostname?: string;
  serverDeviceType?: RelayDeviceType;
  daemonKeyPair?: KeyPair;
  onPairingBaseUrl?: (pairingBaseUrl: string) => void;
  createWebSocket?: RelayWebSocketFactory;
}

export interface RelayTransportController {
  stop: () => Promise<void>;
}

type RelaySocketLike = EncryptedWebSocketLike;

interface RelayWebSocketLike extends RelaySocketLike {
  terminate: () => void;
  ping: () => void;
  on: (
    event: "open" | "message" | "close" | "error" | "pong",
    listener: (...args: unknown[]) => void,
  ) => void;
}

type RelayWebSocketFactory = (url: string) => RelayWebSocketLike;

interface RelayClientPeer {
  connectionId: string;
  remoteAddress: string | null;
  remotePort: number | null;
}

type ControlMessage =
  | { type: "sync"; connections: RelayClientPeer[]; pairingBaseUrl: string | null }
  | ({ type: "connected" } & RelayClientPeer)
  | { type: "disconnected"; connectionId: string }
  | { type: "ping" }
  | { type: "pong" };

const CONTROL_PING_INTERVAL_MS = 10_000;
const CONTROL_STALE_TIMEOUT_MS = 30_000;
const CONTROL_READY_TIMEOUT_MS = 8_000;
const RELAY_WEBSOCKET_OPTIONS = { handshakeTimeout: 10_000, perMessageDeflate: false } as const;

function createDefaultRelayWebSocket(url: string): RelayWebSocketLike {
  return new WebSocket(url, RELAY_WEBSOCKET_OPTIONS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRelayClientPeer(value: unknown): RelayClientPeer | null {
  if (!isRecord(value) || typeof value.connectionId !== "string" || !value.connectionId.trim()) {
    return null;
  }
  return {
    connectionId: value.connectionId.trim(),
    remoteAddress:
      typeof value.remoteAddress === "string" && value.remoteAddress.trim()
        ? value.remoteAddress.trim()
        : null,
    remotePort:
      typeof value.remotePort === "number" &&
      Number.isInteger(value.remotePort) &&
      value.remotePort >= 0 &&
      value.remotePort <= 65535
        ? value.remotePort
        : null,
  };
}

// oxlint-disable-next-line complexity
function tryParseControlMessage(raw: unknown): ControlMessage | null {
  try {
    let text: string;
    if (typeof raw === "string") {
      text = raw;
    } else if (Buffer.isBuffer(raw)) {
      text = raw.toString("utf8");
    } else {
      text = String(raw);
    }
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) return null;
    if (parsed.type === "ping") return { type: "ping" };
    if (parsed.type === "pong") return { type: "pong" };
    if (parsed.type === "sync" && Array.isArray(parsed.connectionIds)) {
      const peers = Array.isArray(parsed.connections)
        ? parsed.connections
            .map((connection) => parseRelayClientPeer(connection))
            .filter((connection): connection is RelayClientPeer => connection !== null)
        : [];
      const peersById = new Map(peers.map((peer) => [peer.connectionId, peer]));
      for (const id of parsed.connectionIds) {
        if (typeof id !== "string" || !id.trim() || peersById.has(id.trim())) continue;
        peersById.set(id.trim(), {
          connectionId: id.trim(),
          remoteAddress: null,
          remotePort: null,
        });
      }
      return {
        type: "sync",
        connections: [...peersById.values()],
        pairingBaseUrl:
          typeof parsed.pairingBaseUrl === "string" && parsed.pairingBaseUrl.trim()
            ? parsed.pairingBaseUrl.trim()
            : null,
      };
    }
    if (
      parsed.type === "connected" &&
      typeof parsed.connectionId === "string" &&
      parsed.connectionId.trim()
    ) {
      return {
        type: "connected",
        ...(parseRelayClientPeer(parsed) ?? {
          connectionId: parsed.connectionId.trim(),
          remoteAddress: null,
          remotePort: null,
        }),
      };
    }
    if (
      parsed.type === "disconnected" &&
      typeof parsed.connectionId === "string" &&
      parsed.connectionId.trim()
    ) {
      return { type: "disconnected", connectionId: parsed.connectionId.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

export function startRelayTransport({
  logger,
  attachSocket,
  relayEndpoint,
  relayUseTls,
  serverId,
  serverHostname,
  serverDeviceType,
  daemonKeyPair,
  onPairingBaseUrl,
  createWebSocket = createDefaultRelayWebSocket,
}: RelayTransportOptions): RelayTransportController {
  const relayLogger = logger.child({ module: "relay-transport" });

  let stopped = false;
  let controlWs: RelayWebSocketLike | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  const dataSockets = new Map<string, RelayWebSocketLike>(); // connectionId -> ws
  let controlKeepaliveInterval: ReturnType<typeof setInterval> | null = null;
  let controlReadyTimeout: ReturnType<typeof setTimeout> | null = null;
  let controlLastSeenAt = 0;
  let controlConnectionSeq = 0;

  const stop = async (): Promise<void> => {
    stopped = true;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (controlKeepaliveInterval) {
      clearInterval(controlKeepaliveInterval);
      controlKeepaliveInterval = null;
    }
    if (controlReadyTimeout) {
      clearTimeout(controlReadyTimeout);
      controlReadyTimeout = null;
    }
    if (controlWs) {
      try {
        controlWs.close();
      } catch {
        // ignore
      }
      controlWs = null;
    }
    for (const ws of dataSockets.values()) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    dataSockets.clear();
  };

  const connectControl = (): void => {
    if (stopped) return;

    const connectionId = ++controlConnectionSeq;
    const url = buildRelayWebSocketUrl({
      endpoint: relayEndpoint,
      useTls: relayUseTls,
      serverId,
      role: "server",
      hostname: serverHostname,
      deviceType: serverDeviceType,
    });
    const socket = createWebSocket(url);
    controlWs = socket;
    let controlConnected = false;

    const markControlReady = () => {
      if (controlWs !== socket) return;
      if (controlConnected) return;
      controlConnected = true;
      reconnectAttempt = 0;
      if (controlReadyTimeout) {
        clearTimeout(controlReadyTimeout);
        controlReadyTimeout = null;
      }
      relayLogger.info({ connectionId }, "relay_control_connected");
    };

    socket.on("open", () => {
      if (controlWs !== socket) return;

      controlLastSeenAt = Date.now();
      if (controlKeepaliveInterval) {
        clearInterval(controlKeepaliveInterval);
        controlKeepaliveInterval = null;
      }
      if (controlReadyTimeout) {
        clearTimeout(controlReadyTimeout);
        controlReadyTimeout = null;
      }
      controlReadyTimeout = setTimeout(() => {
        if (stopped) return;
        if (controlWs !== socket) return;
        if (controlConnected) return;
        relayLogger.warn(
          { url, connectionId, waitedMs: CONTROL_READY_TIMEOUT_MS },
          "relay_control_ready_timeout_terminating",
        );
        try {
          socket.terminate();
        } catch {
          // ignore
        }
      }, CONTROL_READY_TIMEOUT_MS);
      controlKeepaliveInterval = setInterval(() => {
        if (stopped) return;
        if (controlWs !== socket) return;
        if (socket.readyState !== WebSocket.OPEN) return;

        const now = Date.now();
        const staleForMs = now - controlLastSeenAt;
        // If the control socket is half-open or silently dropped, ws may never emit "close".
        // Use a WebSocket protocol ping to detect staleness and force a reconnect.
        // Cloudflare's runtime auto-responds to protocol pings at the edge without waking the
        // hibernated relay Durable Object, so this keepalive does not incur DO CPU billing.
        if (staleForMs > CONTROL_STALE_TIMEOUT_MS) {
          relayLogger.warn(
            { url, staleForMs, connectionId, staleTimeoutMs: CONTROL_STALE_TIMEOUT_MS },
            "relay_control_stale_terminating",
          );
          try {
            socket.terminate();
          } catch {
            // ignore
          }
          return;
        }

        try {
          socket.ping();
        } catch (error) {
          relayLogger.warn({ err: error, connectionId }, "relay_control_ping_send_failed");
          try {
            socket.terminate();
          } catch {
            // ignore
          }
        }
      }, CONTROL_PING_INTERVAL_MS);
      try {
        socket.ping();
      } catch (error) {
        relayLogger.warn({ err: error, connectionId }, "relay_control_ping_send_failed");
        try {
          socket.terminate();
        } catch {
          // ignore
        }
      }
      relayLogger.debug({ connectionId }, "relay_control_open_waiting_for_ready");
    });

    socket.on("close", (code, reason) => {
      if (controlWs !== socket) return;
      relayLogger.warn(
        { code, reason: reason?.toString?.(), url, connectionId },
        "relay_control_disconnected",
      );
      controlWs = null;
      if (controlKeepaliveInterval) {
        clearInterval(controlKeepaliveInterval);
        controlKeepaliveInterval = null;
      }
      if (controlReadyTimeout) {
        clearTimeout(controlReadyTimeout);
        controlReadyTimeout = null;
      }
      scheduleReconnect();
    });

    socket.on("error", (err) => {
      if (controlWs !== socket) return;
      relayLogger.warn({ err, connectionId }, "relay_error");
      // close event will schedule reconnect
    });

    socket.on("pong", () => {
      if (controlWs !== socket) return;
      controlLastSeenAt = Date.now();
      relayLogger.debug({ connectionId }, "relay_control_pong_received");
    });

    socket.on("message", (data) => {
      if (controlWs !== socket) return;
      controlLastSeenAt = Date.now();
      const msg = tryParseControlMessage(data);
      if (msg) {
        markControlReady();
      }
      if (!msg) return;
      if (msg.type === "ping") {
        try {
          socket.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        } catch {
          // ignore
        }
        return;
      }
      if (msg.type === "pong") return;
      if (msg.type === "sync") {
        if (msg.pairingBaseUrl) {
          onPairingBaseUrl?.(msg.pairingBaseUrl);
        }
        for (const connection of msg.connections) {
          ensureClientDataSocket(connection.connectionId, connection);
        }
        return;
      }
      if (msg.type === "connected") {
        ensureClientDataSocket(msg.connectionId, msg);
        return;
      }
      if (msg.type === "disconnected") {
        const existing = dataSockets.get(msg.connectionId);
        if (existing) {
          try {
            existing.close(1001, "Client disconnected");
          } catch {
            // ignore
          }
          dataSockets.delete(msg.connectionId);
        }
      }
    });
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;
    if (reconnectTimeout) return;

    reconnectAttempt += 1;
    const delayMs = Math.min(30000, 1000 * reconnectAttempt);
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connectControl();
    }, delayMs);
  };

  const ensureClientDataSocket = (
    connectionId: string,
    peer: RelayClientPeer | null = null,
  ): void => {
    if (stopped) return;
    if (!connectionId) return;
    if (dataSockets.has(connectionId)) return;

    const url = buildRelayWebSocketUrl({
      endpoint: relayEndpoint,
      useTls: relayUseTls,
      serverId,
      role: "server",
      connectionId,
      hostname: serverHostname,
      deviceType: serverDeviceType,
    });
    const socket = createWebSocket(url);
    dataSockets.set(connectionId, socket);

    let attached = false;
    const openTimeout = setTimeout(() => {
      if (stopped) return;
      if (socket.readyState === WebSocket.OPEN) return;
      relayLogger.warn({ connectionId }, "relay_data_open_timeout_terminating");
      try {
        socket.terminate();
      } catch {
        // ignore
      }
    }, 15_000);

    socket.on("open", () => {
      clearTimeout(openTimeout);
      relayLogger.info({ connectionId }, "relay_data_connected");
      if (attached) return;
      attached = true;
      const relayConnectionKey = `${relayUseTls ? "wss" : "ws"}://${relayEndpoint}:${connectionId}`;
      const externalMetadata: ExternalSocketMetadata = {
        transport: "relay",
        externalSessionKey: `relay:${relayConnectionKey}`,
        relayConnectionId: relayConnectionKey,
        ...(peer?.remoteAddress ? { remoteAddress: peer.remoteAddress } : {}),
        ...(peer?.remotePort !== null && peer?.remotePort !== undefined
          ? { remotePort: peer.remotePort }
          : {}),
      };
      if (daemonKeyPair) {
        void attachEncryptedSocket(
          socket,
          daemonKeyPair,
          relayLogger.child({ connectionId }),
          attachSocket,
          externalMetadata,
        );
      } else {
        void attachSocket(socket, externalMetadata);
      }
    });

    socket.on("close", (code, reason) => {
      clearTimeout(openTimeout);
      relayLogger.warn(
        { code, reason: reason?.toString?.(), url, connectionId },
        "relay_data_disconnected",
      );
      if (dataSockets.get(connectionId) === socket) {
        dataSockets.delete(connectionId);
      }
    });

    socket.on("error", (err) => {
      relayLogger.warn({ err, connectionId }, "relay_data_error");
    });
  };

  connectControl();

  return { stop };
}

async function attachEncryptedSocket(
  socket: RelayWebSocketLike,
  daemonKeyPair: KeyPair,
  logger: pino.Logger,
  attachSocket: (ws: RelaySocketLike, metadata?: ExternalSocketMetadata) => Promise<void>,
  metadata?: ExternalSocketMetadata,
): Promise<void> {
  try {
    const encryptedSocket = await wrapDaemonEncryptedWebSocket(socket, daemonKeyPair, logger);
    await attachSocket(encryptedSocket, metadata);
  } catch (error) {
    logger.warn({ err: error }, "relay_e2ee_handshake_failed");
    try {
      socket.close(1011, "E2EE handshake failed");
    } catch {
      // ignore
    }
  }
}
