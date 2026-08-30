import {
  buildRelayWebSocketUrl as buildBaseRelayWebSocketUrl,
  DEFAULT_RELAY_ENDPOINT,
  extractHostPortFromWebSocketUrl,
  normalizeHostPort,
  shouldUseTlsForDefaultHostedRelay,
  type RelayProtocolVersion,
  type RelayRole,
} from "./daemon-endpoints.js";

export { normalizeHostPort, shouldUseTlsForDefaultHostedRelay };

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
  return config.pairingBaseUrl?.trim() || deriveRelayPairingBaseUrl(config);
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
  if (
    !trimmed.startsWith("/") ||
    trimmed.includes("?") ||
    trimmed.includes("#") ||
    trimmed.includes("\\")
  ) {
    throw new Error("LAN Relay web app path must be a URL path such as /app");
  }

  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("LAN Relay web app path must be a URL path such as /app");
  }
  return `/${segments.join("/")}`;
}

export function buildRelayWebSocketUrl(params: {
  endpoint: string;
  useTls: boolean;
  serverId: string;
  role: RelayRole;
  hostname?: string;
  clientId?: string;
  clientHostname?: string;
  deviceType?: RelayDeviceType;
  connectionId?: string;
  version?: RelayProtocolVersion | 1 | 2;
}): string {
  const url = new URL(buildBaseRelayWebSocketUrl(params));
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
