export interface HostPortParts {
  host: string;
  port: number;
  isIpv6: boolean;
}

export interface ConnectionUriParts extends HostPortParts {
  useTls: boolean;
}

export interface ParsedConnectionUri extends ConnectionUriParts {
  password?: string;
}

export type RelayRole = "server" | "client";
export type RelayProtocolVersion = "1" | "2";
export const RELAY_DEVICE_TYPES = [
  "mac",
  "windows",
  "linux",
  "android",
  "ios",
  "web",
  "cli",
  "mcp",
] as const;
export type RelayDeviceType = (typeof RELAY_DEVICE_TYPES)[number];

export const CURRENT_RELAY_PROTOCOL_VERSION: RelayProtocolVersion = "2";
export const DEFAULT_RELAY_ENDPOINT = "relay.paseo.sh:443";
export const DEFAULT_PUBLIC_RELAY_ENDPOINTS = [DEFAULT_RELAY_ENDPOINT] as const;
export const DEFAULT_RELAY_PAIRING_BASE_URL = "https://app.paseo.sh";

export interface RelayEndpointConfig {
  [key: string]: unknown;
  endpoint: string;
  useTls: boolean;
  publicEndpoint?: string;
  publicUseTls?: boolean;
  pairingBaseUrl?: string;
}

export function normalizeRelayProtocolVersion(
  value: unknown,
  fallback: RelayProtocolVersion = CURRENT_RELAY_PROTOCOL_VERSION,
): RelayProtocolVersion {
  if (value == null) {
    return fallback;
  }

  let normalized = "";
  if (typeof value === "string") {
    normalized = value.trim();
  } else if (typeof value === "number") {
    normalized = String(value);
  }
  if (!normalized) {
    return fallback;
  }
  if (normalized === "1" || normalized === "2") {
    return normalized;
  }
  throw new Error('Relay version must be "1" or "2"');
}

function parsePort(portStr: string, context: string): number {
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${context}: port must be between 1 and 65535`);
  }
  return port;
}

export function parseHostPort(input: string): HostPortParts {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Host is required");
  }

  // IPv6: [::1]:6767
  if (trimmed.startsWith("[")) {
    const match = trimmed.match(/^\[([^\]]+)\]:(\d{1,5})$/);
    if (!match) {
      throw new Error("Invalid host:port (expected [::1]:6767)");
    }
    const host = match[1].trim();
    if (!host) throw new Error("Host is required");
    const port = parsePort(match[2], "Invalid host:port");
    return { host, port, isIpv6: true };
  }

  const match = trimmed.match(/^(.+):(\d{1,5})$/);
  if (!match) {
    throw new Error("Invalid host:port (expected localhost:6767)");
  }
  const host = match[1].trim();
  if (!host) throw new Error("Host is required");
  const port = parsePort(match[2], "Invalid host:port");
  return { host, port, isIpv6: false };
}

export function normalizeHostPort(input: string): string {
  const { host, port, isIpv6 } = parseHostPort(input);
  return isIpv6 ? `[${host}]:${port}` : `${host}:${port}`;
}

export function parseRelayEndpointInput(input: string): RelayEndpointConfig {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Relay endpoint is required");
  }

  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
    const parsed = new URL(trimmed);
    if (parsed.pathname !== "/" && parsed.pathname !== "/ws") {
      throw new Error("Relay URL path must be /ws");
    }
    if (parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error("Relay URL must not include credentials, query parameters, or fragments");
    }
    const endpoint = extractHostPortFromWebSocketUrl(`${parsed.protocol}//${parsed.host}/ws`);
    return { endpoint, useTls: parsed.protocol === "wss:" };
  }

  const endpoint = normalizeHostPort(trimmed);
  return { endpoint, useTls: shouldUseTlsForDefaultHostedRelay(endpoint) };
}

export function formatRelayEndpointInput(config: RelayEndpointConfig): string {
  return `${config.useTls ? "wss" : "ws"}://${config.endpoint}`;
}

export function deriveRelayPairingBaseUrl(
  config: Pick<RelayEndpointConfig, "endpoint" | "useTls" | "publicEndpoint" | "publicUseTls">,
): string {
  const endpoint = config.publicEndpoint ?? config.endpoint;
  const useTls = config.publicUseTls ?? config.useTls;
  return new URL(`${useTls ? "https" : "http"}://${endpoint}`).origin;
}

export function resolveRelayPairingBaseUrl(config: RelayEndpointConfig): string {
  const configured = config.pairingBaseUrl?.trim();
  if (configured) {
    return configured;
  }
  return deriveRelayPairingBaseUrl(config);
}

export function normalizeRelayPairingBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Relay HTTP/HTTPS connection address is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("Invalid Relay HTTP/HTTPS connection address");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Relay connection address must use http:// or https://");
  }
  if (!parsed.hostname) {
    throw new Error("Relay HTTP/HTTPS connection address must include a host");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Relay HTTP/HTTPS connection address must not include credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new Error(
      "Relay HTTP/HTTPS connection address must not include query parameters or fragments",
    );
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  return pathname ? `${parsed.origin}${pathname}` : parsed.origin;
}

export function normalizeLocalRelayPairingBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("LAN Relay HTTP connection address is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
  } catch {
    throw new Error("Invalid LAN Relay HTTP connection address");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("LAN Relay connection address must use http://");
  }
  if (
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error("LAN Relay HTTP connection address must contain only a host and optional port");
  }
  parsed.protocol = "http:";
  return parsed.origin;
}

export function normalizeLocalRelayWebAppPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("LAN Relay web app path is required");
  }

  const pathInput = trimmed;
  if (
    !pathInput.startsWith("/") ||
    pathInput.includes("?") ||
    pathInput.includes("#") ||
    pathInput.includes("\\")
  ) {
    throw new Error("LAN Relay web app path must be a URL path such as /app");
  }

  const segments = pathInput.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("LAN Relay web app path must be a URL path such as /app");
  }

  return `/${segments.join("/")}`;
}

export function parseConnectionUri(input: string): ParsedConnectionUri {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Connection URI is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid connection URI");
  }

  if (parsed.protocol !== "tcp:") {
    throw new Error("Connection URI protocol must be tcp:");
  }
  if (!parsed.hostname) {
    throw new Error("Connection URI host is required");
  }
  if (!parsed.port) {
    throw new Error("Connection URI port is required");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Connection URI userinfo is not supported");
  }

  const isIpv6 = parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]");
  const host = isIpv6 ? parsed.hostname.slice(1, -1) : parsed.hostname;
  const password = parsed.searchParams.get("password") || undefined;

  return {
    host,
    port: parsePort(parsed.port, "Invalid connection URI"),
    isIpv6,
    useTls: parsed.searchParams.get("ssl") === "true",
    ...(password ? { password } : {}),
  };
}

export function serializeConnectionUri(parts: ConnectionUriParts): string {
  return createConnectionUri(parts).toString();
}

export function serializeConnectionUriForStorage(parts: ParsedConnectionUri): string {
  const url = createConnectionUri(parts);
  if (parts.password) {
    url.searchParams.set("password", parts.password);
  }
  return url.toString();
}

function createConnectionUri(parts: ConnectionUriParts): URL {
  const hostPart = parts.isIpv6 ? `[${parts.host}]` : parts.host;
  const url = new URL(`tcp://${hostPart}:${parts.port}`);
  if (parts.useTls) {
    url.searchParams.set("ssl", "true");
  }
  return url;
}

export function normalizeLoopbackToLocalhost(endpoint: string): string {
  const { host, port, isIpv6 } = parseHostPort(endpoint);
  if (host === "127.0.0.1" || (!isIpv6 && host === "0.0.0.0")) {
    return `localhost:${port}`;
  }
  if (isIpv6 && (host === "::1" || host === "::")) {
    return `localhost:${port}`;
  }
  return endpoint;
}

export function deriveLabelFromEndpoint(endpoint: string): string {
  try {
    const { host } = parseHostPort(endpoint);
    return host || "Unnamed Host";
  } catch {
    return "Unnamed Host";
  }
}

export interface WebSocketUrlOptions {
  useTls: boolean;
}

export function buildDaemonWebSocketUrl(endpoint: string, opts: WebSocketUrlOptions): string {
  const { host, port, isIpv6 } = parseHostPort(endpoint);
  const protocol = opts.useTls ? "wss" : "ws";
  const hostPart = isIpv6 ? `[${host}]` : host;
  return new URL(`${protocol}://${hostPart}:${port}/ws`).toString();
}

export function buildRelayWebSocketUrl(params: {
  endpoint: string;
  useTls: boolean;
  serverId: string;
  role: RelayRole;
  /**
   * Optional daemon hostname reported to Relay implementations that expose
   * connection-management information.
   */
  hostname?: string;
  /** Opaque client identity ID exposed only to self-hosted Relay management. */
  clientId?: string;
  clientHostname?: string;
  /** Coarse app/runtime type exposed to self-hosted Relay management. */
  deviceType?: RelayDeviceType;
  /**
   * Per-connection routing identifier used by the daemon to open server data sockets.
   * Clients should NOT provide this — the relay assigns a routing ID on connect.
   */
  connectionId?: string;
  version?: RelayProtocolVersion | 1 | 2;
}): string {
  const { host, port, isIpv6 } = parseHostPort(params.endpoint);
  const protocol = params.useTls ? "wss" : "ws";
  const hostPart = isIpv6 ? `[${host}]` : host;
  const url = new URL(`${protocol}://${hostPart}:${port}/ws`);
  url.searchParams.set("serverId", params.serverId);
  url.searchParams.set("role", params.role);
  url.searchParams.set("v", normalizeRelayProtocolVersion(params.version));
  if (params.connectionId) {
    url.searchParams.set("connectionId", params.connectionId);
  }
  if (params.deviceType) {
    url.searchParams.set("deviceType", params.deviceType);
  }
  if (params.role === "server" && params.hostname?.trim()) {
    url.searchParams.set("hostname", params.hostname.trim());
  }
  if (params.role === "client") {
    const clientId = params.clientId?.trim();
    if (clientId?.startsWith("cid_")) {
      url.searchParams.set("clientId", clientId);
    }
    if (params.clientHostname?.trim()) {
      url.searchParams.set("clientHostname", params.clientHostname.trim());
    }
  }
  return url.toString();
}

/**
 * @deprecated Migration fallback for stored relay connections/offers that predate
 * explicit relay useTls. Delete after two release cycles.
 */
export function shouldUseTlsForDefaultHostedRelay(endpoint: string): boolean {
  try {
    const { port } = parseHostPort(endpoint);
    return port === 443;
  } catch {
    return false;
  }
}

export function extractHostPortFromWebSocketUrl(wsUrl: string): string {
  const parsed = new URL(wsUrl);
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("Invalid WebSocket URL protocol");
  }
  if (parsed.pathname.replace(/\/+$/, "") !== "/ws") {
    throw new Error("Invalid WebSocket URL (expected /ws path)");
  }

  const host = parsed.hostname;
  let port: number;
  if (parsed.port) {
    port = Number(parsed.port);
  } else if (parsed.protocol === "wss:") {
    port = 443;
  } else {
    port = 80;
  }
  if (!host) {
    throw new Error("Invalid WebSocket URL (missing hostname)");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid WebSocket URL (invalid port)");
  }

  const isIpv6 = host.includes(":") && !host.startsWith("[") && !host.endsWith("]");
  return isIpv6 ? `[${host}]:${port}` : `${host}:${port}`;
}

export function isRelayClientWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("role") === "client" && parsed.searchParams.has("serverId");
  } catch {
    return false;
  }
}
