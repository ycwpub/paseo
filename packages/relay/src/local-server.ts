import { randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocket, WebSocketServer, type RawData } from "ws";

export interface LocalRelayLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

export type LocalRelayConnectionRole = "client" | "server_control" | "server_data";
export type LocalRelayDeviceType =
  | "mac"
  | "windows"
  | "linux"
  | "android"
  | "ios"
  | "web"
  | "cli"
  | "mcp";

export interface LocalRelayConnectionInfo {
  serverId: string;
  hostname: string | null;
  deviceType: LocalRelayDeviceType | null;
  clientId: string | null;
  clientHostname: string | null;
  role: LocalRelayConnectionRole;
  connectionId: string | null;
  remoteAddress: string | null;
  remotePort: number | null;
  connectedAt: string;
}

export interface LocalRelayConnectionHistoryRecord extends LocalRelayConnectionInfo {
  id: string;
  disconnectedAt: string | null;
}

export interface LocalRelayStatus {
  listen: string;
  publicEndpoint: string;
  pairingBaseUrl: string;
  connections: LocalRelayConnectionInfo[];
  history: LocalRelayConnectionHistoryRecord[];
  historyRetentionDays: number;
}

export interface LocalRelayServerController {
  connectEndpoint: string;
  publicEndpoint: string;
  pairingBaseUrl: string;
  useTls: false;
  getStatus(): LocalRelayStatus;
  deleteHistory(historyId: string): boolean;
  stop(): Promise<void>;
}

export interface LocalRelayWebAppConfig {
  enabled: boolean;
  path: string;
  distDir: string | null;
}

interface QueuedFrame {
  data: RawData;
  isBinary: boolean;
}

interface RelaySession {
  control: WebSocket | null;
  hostname: string | null;
  deviceType: LocalRelayDeviceType | null;
  clients: Map<string, WebSocket>;
  servers: Map<string, WebSocket>;
  pendingFrames: Map<string, QueuedFrame[]>;
}

interface PersistedRelayHistory {
  version: 1;
  history: LocalRelayConnectionHistoryRecord[];
}

const HISTORY_RETENTION_DAYS = 30;
const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function parseListen(listen: string): { host: string; port: number } {
  const trimmed = listen.trim();
  const ipv6 = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
  const match = ipv6 ?? trimmed.match(/^(.+):(\d+)$/);
  if (!match) throw new Error(`Invalid LAN relay listen address: ${listen}`);
  const host = match[1]?.trim();
  const port = Number(match[2]);
  if (!host || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid LAN relay listen address: ${listen}`);
  }
  return { host, port };
}

function formatEndpoint(host: string, port: number): string {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

function normalizeRemoteAddress(address: string | undefined): string | null {
  if (!address) return null;
  return address.toLowerCase().startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function normalizeHostname(hostname: string | null): string | null {
  const normalized = hostname?.trim();
  return normalized ? normalized.slice(0, 255) : null;
}

function normalizeMetadataValue(value: string | null, maxLength = 255): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeClientIdentityId(value: string | null): string | null {
  const normalized = normalizeMetadataValue(value);
  return normalized?.startsWith("cid_") ? normalized : null;
}

function normalizeDeviceType(value: string | null): LocalRelayDeviceType | null {
  const normalized = normalizeMetadataValue(value)?.toLowerCase();
  if (
    normalized === "mac" ||
    normalized === "windows" ||
    normalized === "linux" ||
    normalized === "android" ||
    normalized === "ios" ||
    normalized === "web" ||
    normalized === "cli" ||
    normalized === "mcp"
  ) {
    return normalized;
  }
  return null;
}

// oxlint-disable-next-line complexity
function normalizeHistoryRecord(value: unknown): LocalRelayConnectionHistoryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const role = record.role;
  if (
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.serverId !== "string" ||
    !record.serverId ||
    (role !== "client" && role !== "server_control" && role !== "server_data") ||
    typeof record.connectedAt !== "string" ||
    !record.connectedAt
  ) {
    return null;
  }
  return {
    id: record.id,
    serverId: record.serverId,
    hostname: typeof record.hostname === "string" ? record.hostname : null,
    deviceType:
      typeof record.deviceType === "string" ? normalizeDeviceType(record.deviceType) : null,
    clientId:
      typeof record.clientId === "string" ? normalizeClientIdentityId(record.clientId) : null,
    clientHostname: typeof record.clientHostname === "string" ? record.clientHostname : null,
    role,
    connectionId: typeof record.connectionId === "string" ? record.connectionId : null,
    remoteAddress: typeof record.remoteAddress === "string" ? record.remoteAddress : null,
    remotePort:
      typeof record.remotePort === "number" &&
      Number.isInteger(record.remotePort) &&
      record.remotePort >= 0 &&
      record.remotePort <= 65535
        ? record.remotePort
        : null,
    connectedAt: record.connectedAt,
    disconnectedAt:
      typeof record.disconnectedAt === "string" && record.disconnectedAt
        ? record.disconnectedAt
        : null,
  };
}

function getPrimaryLanIp(): string | null {
  const networks = os.networkInterfaces();
  for (const name of Object.keys(networks).sort()) {
    for (const address of networks[name] ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return null;
}

function resolvePublicHost(listenHost: string): string {
  if (listenHost === "0.0.0.0" || listenHost === "::") {
    return getPrimaryLanIp() ?? "127.0.0.1";
  }
  return listenHost;
}

function normalizeHttpBaseUrl(input: string): string {
  const parsed = new URL(input.includes("://") ? input : `http://${input}`);
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error("LAN Relay HTTP connection address must be an http:// host and port");
  }
  parsed.protocol = "http:";
  return parsed.origin;
}

function normalizeWebAppPath(input: string): string {
  const trimmed = input.trim();
  const pathInput = trimmed;
  const segments = pathInput.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    !pathInput.startsWith("/") ||
    pathInput.includes("?") ||
    pathInput.includes("#") ||
    pathInput.includes("\\") ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("LAN Relay web app path must be a URL path such as /app");
  }
  return `/${segments.join("/")}`;
}

const WEB_CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveWebAppFile(
  distDir: string,
  requestPath: string,
  webAppPath: string,
): string | null {
  const isWebAppRoute =
    requestPath === webAppPath ||
    requestPath === `${webAppPath}/` ||
    requestPath.startsWith(`${webAppPath}/`);
  const candidates = isWebAppRoute
    ? [requestPath.slice(webAppPath.length), requestPath, "/index.html"]
    : [requestPath];
  const resolvedDistDir = path.resolve(distDir);

  for (const candidate of candidates) {
    const relativePath = candidate.replace(/^\/+/, "") || "index.html";
    const resolvedFile = path.resolve(resolvedDistDir, relativePath);
    if (
      (resolvedFile === resolvedDistDir ||
        resolvedFile.startsWith(`${resolvedDistDir}${path.sep}`)) &&
      isFile(resolvedFile)
    ) {
      return resolvedFile;
    }
  }
  return null;
}

function serveWebApp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  webApp: LocalRelayWebAppConfig,
  normalizedWebAppPath: string,
): boolean {
  if (!webApp.enabled || (request.method !== "GET" && request.method !== "HEAD")) return false;

  const isConfiguredEntry =
    url.pathname === normalizedWebAppPath || url.pathname === `${normalizedWebAppPath}/`;
  if (url.pathname === "/" && !isConfiguredEntry) return false;
  const requestPath = url.pathname;
  const distDir = webApp.distDir;
  const filePath = distDir ? resolveWebAppFile(distDir, requestPath, normalizedWebAppPath) : null;

  if (!filePath) {
    if (!isConfiguredEntry) return false;
    response.writeHead(503, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end("Paseo web app bundle is unavailable\n");
    return true;
  }

  const isIndex = path.basename(filePath).toLowerCase() === "index.html";
  response.writeHead(200, {
    "content-type":
      WEB_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "cache-control": isIndex ? "no-store" : "public, max-age=3600",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  const stream = createReadStream(filePath);
  stream.once("error", () => response.end());
  stream.pipe(response);
  return true;
}

function createPairingLandingPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Paseo Relay</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #f7f7f8; color: #17171a; }
      main { max-width: 560px; margin: 12vh auto; padding: 28px; background: white; border: 1px solid #dedee3; border-radius: 18px; }
      a { display: inline-block; margin-top: 12px; color: #2563eb; }
    </style>
  </head>
  <body>
    <main>
      <h1>Paseo Relay</h1>
      <p id="status">Open this pairing link with Paseo to connect.</p>
      <a id="open" href="paseo://pair/">Open Paseo</a>
    </main>
    <script>
      (() => {
        const fragment = window.location.hash || "";
        const deepLink = "paseo://pair/" + fragment;
        document.getElementById("open").href = deepLink;
        if (fragment.startsWith("#offer=")) {
          document.getElementById("status").textContent = "Opening Paseo…";
          window.setTimeout(() => window.location.assign(deepLink), 50);
        }
      })();
    </script>
  </body>
</html>`;
}

function sendJson(socket: WebSocket | null, value: unknown): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(value));
  } catch {
    // The close handler owns cleanup.
  }
}

function closeSocket(socket: WebSocket | null, code = 1001, reason = "Relay stopped"): void {
  if (!socket) return;
  try {
    socket.close(code, reason);
  } catch {
    // Best effort.
  }
}

function terminateSocket(socket: WebSocket | null): void {
  if (!socket) return;
  try {
    socket.terminate();
  } catch {
    // Best effort.
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeIdleConnections();
    server.closeAllConnections();
  });
}

// oxlint-disable-next-line complexity
export async function startLocalRelayServer(input: {
  listen: string;
  publicEndpoint?: string;
  pairingBaseUrl?: string;
  webApp?: LocalRelayWebAppConfig;
  historyFilePath?: string;
  logger?: LocalRelayLogger;
}): Promise<LocalRelayServerController> {
  const { host, port } = parseListen(input.listen);
  const configuredPairingBaseUrl = input.pairingBaseUrl?.trim()
    ? normalizeHttpBaseUrl(input.pairingBaseUrl.trim())
    : null;
  const normalizedWebAppPath = input.webApp?.enabled
    ? normalizeWebAppPath(input.webApp.path)
    : null;
  const sessions = new Map<string, RelaySession>();
  const connectionInfo = new Map<WebSocket, LocalRelayConnectionInfo>();
  const history: LocalRelayConnectionHistoryRecord[] = [];
  const socketHistoryIds = new Map<WebSocket, string>();
  const clientHistoryIds = new Map<string, string>();
  let historyCleanupInterval: ReturnType<typeof setInterval> | null = null;

  const persistHistory = (): void => {
    if (!input.historyFilePath) return;
    try {
      const temporaryPath = `${input.historyFilePath}.tmp`;
      const payload: PersistedRelayHistory = { version: 1, history };
      writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporaryPath, input.historyFilePath);
    } catch (error) {
      input.logger?.warn({ error }, "Failed to persist LAN Relay connection history");
    }
  };

  const pruneHistory = (now = Date.now()): void => {
    const cutoff = now - HISTORY_RETENTION_MS;
    const retained = history.filter((record) => {
      if (!record.disconnectedAt) return true;
      const disconnectedAt = Date.parse(record.disconnectedAt);
      return !Number.isFinite(disconnectedAt) || disconnectedAt >= cutoff;
    });
    if (retained.length === history.length) return;
    history.splice(0, history.length, ...retained);
    persistHistory();
  };

  if (input.historyFilePath && existsSync(input.historyFilePath)) {
    try {
      const parsed = JSON.parse(readFileSync(input.historyFilePath, "utf8")) as {
        history?: unknown;
      };
      const loadedAt = new Date().toISOString();
      if (Array.isArray(parsed.history)) {
        for (const value of parsed.history) {
          const record = normalizeHistoryRecord(value);
          // oxlint-disable-next-line max-depth
          if (!record) continue;
          history.push({
            ...record,
            disconnectedAt: record.disconnectedAt ?? loadedAt,
          });
        }
      }
      pruneHistory();
      persistHistory();
    } catch (error) {
      input.logger?.warn({ error }, "Failed to load LAN Relay connection history");
    }
  }

  historyCleanupInterval = setInterval(() => pruneHistory(), 60 * 60 * 1000);
  historyCleanupInterval.unref?.();

  const startHistory = (
    info: LocalRelayConnectionInfo,
    socket?: WebSocket,
  ): LocalRelayConnectionHistoryRecord => {
    const record: LocalRelayConnectionHistoryRecord = {
      ...info,
      id: `rlyh_${randomUUID().split("-").join("")}`,
      disconnectedAt: null,
    };
    history.unshift(record);
    if (socket) socketHistoryIds.set(socket, record.id);
    persistHistory();
    return record;
  };

  const endHistoryById = (historyId: string | undefined): void => {
    if (!historyId) return;
    const record = history.find((candidate) => candidate.id === historyId);
    if (!record || record.disconnectedAt) return;
    record.disconnectedAt = new Date().toISOString();
    persistHistory();
  };

  const clientHistoryKey = (serverId: string, connectionId: string): string =>
    `${serverId}\u0000${connectionId}`;

  const endClientHistory = (serverId: string, connectionId: string): void => {
    const key = clientHistoryKey(serverId, connectionId);
    endHistoryById(clientHistoryIds.get(key));
    clientHistoryIds.delete(key);
  };
  const httpServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://relay.local");
    if (
      input.webApp &&
      normalizedWebAppPath &&
      serveWebApp(request, response, url, input.webApp, normalizedWebAppPath)
    ) {
      return;
    }
    if (request.method !== "GET" || url.pathname !== "/") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(createPairingLandingPage());
  });
  const websocketServer = new WebSocketServer({ noServer: true });

  const getSession = (serverId: string): RelaySession => {
    const existing = sessions.get(serverId);
    if (existing) return existing;
    const created: RelaySession = {
      control: null,
      hostname: null,
      deviceType: null,
      clients: new Map(),
      servers: new Map(),
      pendingFrames: new Map(),
    };
    sessions.set(serverId, created);
    return created;
  };

  // oxlint-disable-next-line complexity
  websocketServer.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "/", "http://relay.local");
    const serverId = url.searchParams.get("serverId")?.trim();
    const role = url.searchParams.get("role");
    const version = url.searchParams.get("v") ?? "2";
    if (!serverId || (role !== "server" && role !== "client") || version !== "2") {
      closeSocket(socket, 1008, "Invalid relay request");
      return;
    }

    const session = getSession(serverId);
    const reportedHostname =
      role === "server" ? normalizeHostname(url.searchParams.get("hostname")) : null;
    const reportedDeviceType = normalizeDeviceType(url.searchParams.get("deviceType"));
    if (reportedHostname) {
      session.hostname = reportedHostname;
    }
    if (role === "server" && reportedDeviceType) {
      session.deviceType = reportedDeviceType;
    }
    const createConnectionInfo = (
      roleValue: LocalRelayConnectionRole,
      connectionId: string | null,
    ): LocalRelayConnectionInfo => ({
      serverId,
      hostname: roleValue === "client" ? null : (reportedHostname ?? session.hostname),
      deviceType:
        roleValue === "client" ? reportedDeviceType : (reportedDeviceType ?? session.deviceType),
      clientId:
        roleValue === "client" ? normalizeClientIdentityId(url.searchParams.get("clientId")) : null,
      clientHostname:
        roleValue === "client"
          ? normalizeMetadataValue(url.searchParams.get("clientHostname"))
          : null,
      role: roleValue,
      connectionId,
      remoteAddress: normalizeRemoteAddress(request.socket.remoteAddress),
      remotePort: request.socket.remotePort ?? null,
      connectedAt: new Date().toISOString(),
    });
    if (role === "server" && !url.searchParams.get("connectionId")) {
      closeSocket(session.control, 1001, "Replaced by a new control connection");
      session.control = socket;
      connectionInfo.set(socket, createConnectionInfo("server_control", null));
      sendJson(socket, {
        type: "sync",
        pairingBaseUrl,
        connectionIds: [...session.clients.keys()],
        connections: [...session.clients.entries()].map(([connectionId, clientSocket]) => {
          const info = connectionInfo.get(clientSocket);
          return {
            connectionId,
            remoteAddress: info?.remoteAddress ?? null,
            remotePort: info?.remotePort ?? null,
          };
        }),
      });
      startHistory(connectionInfo.get(socket)!, socket);
      socket.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString()) as { type?: unknown };
          if (message.type === "ping") {
            sendJson(socket, { type: "pong" });
          }
        } catch {
          // Ignore unknown control messages.
        }
      });
      socket.once("close", () => {
        endHistoryById(socketHistoryIds.get(socket));
        socketHistoryIds.delete(socket);
        connectionInfo.delete(socket);
        if (session.control === socket) session.control = null;
      });
      return;
    }

    if (role === "client") {
      const connectionId = url.searchParams.get("connectionId")?.trim() || `clt_${randomUUID()}`;
      closeSocket(session.clients.get(connectionId) ?? null, 1001, "Replaced by a new client");
      session.clients.set(connectionId, socket);
      const info = createConnectionInfo("client", connectionId);
      connectionInfo.set(socket, info);
      sendJson(session.control, {
        type: "connected",
        connectionId,
        remoteAddress: info.remoteAddress,
        remotePort: info.remotePort,
      });
      socket.on("message", (data, isBinary) => {
        const serverSocket = session.servers.get(connectionId);
        if (serverSocket?.readyState === WebSocket.OPEN) {
          serverSocket.send(data, { binary: isBinary });
          return;
        }
        const pending = session.pendingFrames.get(connectionId) ?? [];
        if (pending.length < 32) {
          pending.push({ data, isBinary });
          session.pendingFrames.set(connectionId, pending);
        }
      });
      socket.once("close", () => {
        endClientHistory(serverId, connectionId);
        connectionInfo.delete(socket);
        if (session.clients.get(connectionId) !== socket) return;
        session.clients.delete(connectionId);
        session.pendingFrames.delete(connectionId);
        closeSocket(session.servers.get(connectionId) ?? null, 1001, "Client disconnected");
        session.servers.delete(connectionId);
        sendJson(session.control, { type: "disconnected", connectionId });
      });
      return;
    }

    const connectionId = url.searchParams.get("connectionId")?.trim();
    if (!connectionId) {
      closeSocket(socket, 1008, "Missing connectionId");
      return;
    }
    closeSocket(session.servers.get(connectionId) ?? null, 1001, "Replaced by a new server");
    session.servers.set(connectionId, socket);
    const serverDataInfo = createConnectionInfo("server_data", connectionId);
    const pairedClientSocket = session.clients.get(connectionId);
    const clientInfo = pairedClientSocket ? connectionInfo.get(pairedClientSocket) : null;
    serverDataInfo.clientId = clientInfo?.clientId ?? null;
    serverDataInfo.clientHostname = clientInfo?.clientHostname ?? null;
    connectionInfo.set(socket, serverDataInfo);
    startHistory(serverDataInfo, socket);
    if (clientInfo) {
      const key = clientHistoryKey(serverId, connectionId);
      endHistoryById(clientHistoryIds.get(key));
      clientHistoryIds.set(key, startHistory(clientInfo).id);
    }
    for (const frame of session.pendingFrames.get(connectionId) ?? []) {
      socket.send(frame.data, { binary: frame.isBinary });
    }
    session.pendingFrames.delete(connectionId);
    socket.on("message", (data, isBinary) => {
      const clientSocket = session.clients.get(connectionId);
      if (clientSocket?.readyState === WebSocket.OPEN) {
        clientSocket.send(data, { binary: isBinary });
      }
    });
    socket.once("close", () => {
      endHistoryById(socketHistoryIds.get(socket));
      socketHistoryIds.delete(socket);
      endClientHistory(serverId, connectionId);
      connectionInfo.delete(socket);
      if (session.servers.get(connectionId) !== socket) return;
      session.servers.delete(connectionId);
      if (session.clients.has(connectionId)) {
        sendJson(session.control, { type: "connected", connectionId });
      }
    });
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://relay.local");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    await closeServer(httpServer);
    throw new Error("LAN relay did not bind to a TCP port");
  }
  const boundPort = address.port;
  const connectEndpoint = formatEndpoint(
    host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host,
    boundPort,
  );
  const publicEndpoint =
    input.publicEndpoint?.trim() || formatEndpoint(resolvePublicHost(host), boundPort);
  const pairingOrigin =
    configuredPairingBaseUrl ?? normalizeHttpBaseUrl(`http://${publicEndpoint}`);
  const pairingBaseUrl = normalizedWebAppPath
    ? `${pairingOrigin}${normalizedWebAppPath}`
    : pairingOrigin;
  input.logger?.info(
    {
      listen: formatEndpoint(host, boundPort),
      publicEndpoint,
      pairingBaseUrl,
      webAppEnabled: input.webApp?.enabled ?? false,
    },
    "LAN relay listening with WS and HTTP pairing",
  );

  return {
    connectEndpoint,
    publicEndpoint,
    pairingBaseUrl,
    useTls: false,
    getStatus() {
      pruneHistory();
      return {
        listen: formatEndpoint(host, boundPort),
        publicEndpoint,
        pairingBaseUrl,
        connections: Array.from(connectionInfo.entries())
          .filter(([socket, info]) => {
            if (info.role !== "client" || !info.connectionId) return true;
            const session = sessions.get(info.serverId);
            return (
              session?.clients.get(info.connectionId) === socket &&
              session.servers.has(info.connectionId)
            );
          })
          .map(([, info]) => info)
          .sort((left, right) => {
            const serverOrder = left.serverId.localeCompare(right.serverId);
            if (serverOrder !== 0) return serverOrder;
            const roleOrder = left.role.localeCompare(right.role);
            if (roleOrder !== 0) return roleOrder;
            return (left.connectionId ?? "").localeCompare(right.connectionId ?? "");
          }),
        history: [...history].sort((left, right) =>
          right.connectedAt.localeCompare(left.connectedAt),
        ),
        historyRetentionDays: HISTORY_RETENTION_DAYS,
      };
    },
    deleteHistory(historyId) {
      const index = history.findIndex((record) => record.id === historyId.trim());
      if (index < 0) return false;
      history.splice(index, 1);
      persistHistory();
      return true;
    },
    async stop() {
      if (historyCleanupInterval) {
        clearInterval(historyCleanupInterval);
        historyCleanupInterval = null;
      }
      const disconnectedAt = new Date().toISOString();
      for (const record of history) {
        if (!record.disconnectedAt) record.disconnectedAt = disconnectedAt;
      }
      persistHistory();
      for (const session of sessions.values()) {
        terminateSocket(session.control);
        for (const socket of session.clients.values()) terminateSocket(socket);
        for (const socket of session.servers.values()) terminateSocket(socket);
      }
      sessions.clear();
      connectionInfo.clear();
      await new Promise<void>((resolve) => websocketServer.close(() => resolve()));
      await closeServer(httpServer).catch((error) => {
        input.logger?.warn({ error }, "Failed to stop LAN relay cleanly");
      });
    },
  };
}
