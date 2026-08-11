import {
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  normalizeRelayPairingBaseUrl,
  parseRelayEndpointInput,
  shouldUseTlsForDefaultHostedRelay,
  type RelayEndpointConfig,
} from "@getpaseo/protocol/daemon-endpoints";

import type { PersistedConfig } from "../persisted-config.js";

export interface ResolveRelayConfigInput {
  env: NodeJS.ProcessEnv;
  persisted: PersistedConfig;
  cliRelayEnabled: boolean | undefined;
  cliRelayUseTls: boolean | undefined;
}

export interface ResolvedRelayConfig {
  enabled: boolean;
  endpoints: RelayEndpointConfig[];
  pairingBaseUrls: string[];
  local: {
    enabled: boolean;
    listen: string;
    publicEndpoint?: string;
    pairingBaseUrl?: string;
    webApp: {
      enabled: boolean;
      path: string;
    };
  };
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function resolveTlsFromEnv(
  envValue: string | undefined,
  persistedValue: boolean | undefined,
  fallback: boolean,
): boolean {
  if (envValue !== undefined) return parseBooleanEnv(envValue) ?? false;
  return persistedValue ?? fallback;
}

function dedupeRelayEndpoints(endpoints: RelayEndpointConfig[]): RelayEndpointConfig[] {
  const seen = new Set<string>();
  return endpoints.filter((entry) => {
    const key = `${entry.useTls ? "wss" : "ws"}://${entry.endpoint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeRelayPairingBaseUrls(values: string[]): string[] {
  return [...new Set(values)];
}

function parseRelayPairingBaseUrlsEnv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return [];
  const entries: unknown[] = trimmed.startsWith("[")
    ? (JSON.parse(trimmed) as unknown[])
    : trimmed.split(/[\n,]+/);
  if (!Array.isArray(entries)) {
    throw new Error("PASEO_RELAY_PAIRING_BASE_URLS must be a JSON array");
  }
  return dedupeRelayPairingBaseUrls(
    entries.map((entry) => {
      if (typeof entry !== "string") {
        throw new Error("PASEO_RELAY_PAIRING_BASE_URLS entries must be HTTP/HTTPS URLs");
      }
      return normalizeRelayPairingBaseUrl(entry);
    }),
  );
}

function parseRelayEndpointsEnv(value: string | undefined): RelayEndpointConfig[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return [];

  let entries: RelayEndpointConfig[];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("PASEO_RELAY_ENDPOINTS must be a JSON array");
    }
    entries = parsed.map((entry) => {
      if (typeof entry === "string") return parseRelayEndpointInput(entry);
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as { endpoint?: unknown }).endpoint !== "string"
      ) {
        throw new Error(
          "PASEO_RELAY_ENDPOINTS entries must be WSS strings or objects with endpoint and pairingBaseUrl",
        );
      }
      const record = entry as { endpoint: string; pairingBaseUrl?: unknown };
      const endpoint = parseRelayEndpointInput(record.endpoint);
      const resolved: RelayEndpointConfig = {
        endpoint: endpoint.endpoint,
        useTls: endpoint.useTls,
      };
      if (typeof record.pairingBaseUrl === "string") {
        resolved.pairingBaseUrl = normalizeRelayPairingBaseUrl(record.pairingBaseUrl);
      }
      return resolved;
    });
  } else {
    entries = trimmed.split(/[\n,]+/).map(parseRelayEndpointInput);
  }
  return dedupeRelayEndpoints(entries);
}

function resolveConfiguredRelayEndpoints(input: ResolveRelayConfigInput): RelayEndpointConfig[] {
  const persistedRelay = input.persisted.daemon?.relay;
  const envEndpoints = parseRelayEndpointsEnv(input.env.PASEO_RELAY_ENDPOINTS);
  if (envEndpoints !== undefined) return envEndpoints;

  if (input.env.PASEO_RELAY_ENDPOINT) {
    const endpoint = input.env.PASEO_RELAY_ENDPOINT;
    const useTls =
      input.cliRelayUseTls ??
      resolveTlsFromEnv(
        input.env.PASEO_RELAY_USE_TLS,
        persistedRelay?.useTls,
        shouldUseTlsForDefaultHostedRelay(endpoint),
      );
    return [
      {
        endpoint,
        useTls,
        publicEndpoint: input.env.PASEO_RELAY_PUBLIC_ENDPOINT ?? endpoint,
        publicUseTls: resolveTlsFromEnv(
          input.env.PASEO_RELAY_PUBLIC_USE_TLS,
          persistedRelay?.publicUseTls,
          useTls,
        ),
        ...(input.env.PASEO_RELAY_PAIRING_BASE_URL
          ? {
              pairingBaseUrl: normalizeRelayPairingBaseUrl(input.env.PASEO_RELAY_PAIRING_BASE_URL),
            }
          : {}),
      },
    ];
  }

  if (persistedRelay?.endpoints) {
    return persistedRelay.endpoints.map((entry) => {
      const useTls =
        input.cliRelayUseTls ??
        resolveTlsFromEnv(
          input.env.PASEO_RELAY_USE_TLS,
          entry.useTls,
          shouldUseTlsForDefaultHostedRelay(entry.endpoint),
        );
      const hasExplicitPublicUseTls =
        entry.publicUseTls !== undefined || input.env.PASEO_RELAY_PUBLIC_USE_TLS !== undefined;
      return {
        endpoint: entry.endpoint,
        useTls,
        ...(entry.publicEndpoint ? { publicEndpoint: entry.publicEndpoint } : {}),
        ...(hasExplicitPublicUseTls
          ? {
              publicUseTls: resolveTlsFromEnv(
                input.env.PASEO_RELAY_PUBLIC_USE_TLS,
                entry.publicUseTls,
                useTls,
              ),
            }
          : {}),
        ...(entry.pairingBaseUrl
          ? { pairingBaseUrl: normalizeRelayPairingBaseUrl(entry.pairingBaseUrl) }
          : {}),
      };
    });
  }

  if (persistedRelay?.endpoint) {
    const useTls =
      input.cliRelayUseTls ??
      resolveTlsFromEnv(
        input.env.PASEO_RELAY_USE_TLS,
        persistedRelay.useTls,
        shouldUseTlsForDefaultHostedRelay(persistedRelay.endpoint),
      );
    return [
      {
        endpoint: persistedRelay.endpoint,
        useTls,
        publicEndpoint: persistedRelay.publicEndpoint ?? persistedRelay.endpoint,
        publicUseTls: resolveTlsFromEnv(
          input.env.PASEO_RELAY_PUBLIC_USE_TLS,
          persistedRelay.publicUseTls,
          useTls,
        ),
        ...(input.env.PASEO_RELAY_PAIRING_BASE_URL
          ? {
              pairingBaseUrl: normalizeRelayPairingBaseUrl(input.env.PASEO_RELAY_PAIRING_BASE_URL),
            }
          : {}),
      },
    ];
  }
  return [];
}

function resolveConfiguredRelayPairingBaseUrls(
  input: ResolveRelayConfigInput,
  endpoints: RelayEndpointConfig[],
): string[] {
  const persistedRelay = input.persisted.daemon?.relay;
  const envValues = parseRelayPairingBaseUrlsEnv(input.env.PASEO_RELAY_PAIRING_BASE_URLS);
  if (envValues !== undefined) return envValues;
  if (input.env.PASEO_RELAY_PAIRING_BASE_URL) {
    return [normalizeRelayPairingBaseUrl(input.env.PASEO_RELAY_PAIRING_BASE_URL)];
  }
  if (persistedRelay?.pairingBaseUrls) {
    return dedupeRelayPairingBaseUrls(
      persistedRelay.pairingBaseUrls.map(normalizeRelayPairingBaseUrl),
    );
  }
  return dedupeRelayPairingBaseUrls(
    endpoints.flatMap((endpoint) =>
      endpoint.pairingBaseUrl ? [normalizeRelayPairingBaseUrl(endpoint.pairingBaseUrl)] : [],
    ),
  );
}

// oxlint-disable-next-line complexity -- Environment and persisted fallbacks are resolved field-by-field.
function resolveLocalRelayConfig(input: ResolveRelayConfigInput): ResolvedRelayConfig["local"] {
  const persistedLocal = input.persisted.daemon?.relay?.local;
  const publicEndpoint =
    input.env.PASEO_LAN_RELAY_PUBLIC_ENDPOINT ?? persistedLocal?.publicEndpoint;
  const pairingBaseUrl =
    input.env.PASEO_LAN_RELAY_PAIRING_BASE_URL ?? persistedLocal?.pairingBaseUrl;
  return {
    enabled: parseBooleanEnv(input.env.PASEO_LAN_RELAY_ENABLED) ?? persistedLocal?.enabled ?? false,
    listen: input.env.PASEO_LAN_RELAY_LISTEN ?? persistedLocal?.listen ?? "0.0.0.0:6769",
    ...(publicEndpoint ? { publicEndpoint } : {}),
    ...(pairingBaseUrl
      ? { pairingBaseUrl: normalizeLocalRelayPairingBaseUrl(pairingBaseUrl) }
      : {}),
    webApp: {
      enabled:
        parseBooleanEnv(input.env.PASEO_LAN_RELAY_WEB_APP_ENABLED) ??
        persistedLocal?.webApp?.enabled ??
        false,
      path: normalizeLocalRelayWebAppPath(
        input.env.PASEO_LAN_RELAY_WEB_APP_PATH ?? persistedLocal?.webApp?.path ?? "/app",
      ),
    },
  };
}

export function resolveRelayConfig(input: ResolveRelayConfigInput): ResolvedRelayConfig {
  const persistedRelay = input.persisted.daemon?.relay;
  let endpoints = resolveConfiguredRelayEndpoints(input);
  const pairingBaseUrls = resolveConfiguredRelayPairingBaseUrls(input, endpoints);
  endpoints = endpoints.map(({ pairingBaseUrl: _legacyPairingBaseUrl, ...endpoint }) => endpoint);
  const local = resolveLocalRelayConfig(input);
  const configuredEnabled =
    input.cliRelayEnabled ??
    parseBooleanEnv(input.env.PASEO_RELAY_ENABLED) ??
    persistedRelay?.enabled ??
    true;
  endpoints = configuredEnabled ? dedupeRelayEndpoints(endpoints) : [];
  return {
    enabled: endpoints.length > 0 || local.enabled,
    endpoints,
    pairingBaseUrls,
    local,
  };
}

export function resolveLegacyRelaySummary(endpoints: RelayEndpointConfig[]): {
  relayEndpoint?: string;
  relayPublicEndpoint?: string;
  relayUseTls?: boolean;
  relayPublicUseTls?: boolean;
} {
  const first = endpoints[0];
  if (!first) return {};
  return {
    relayEndpoint: first.endpoint,
    relayPublicEndpoint: first.publicEndpoint ?? first.endpoint,
    relayUseTls: first.useTls,
    relayPublicUseTls: first.publicUseTls ?? first.useTls,
  };
}
