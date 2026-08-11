import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePaseoNodeEnv } from "./paseo-env.js";
import { z } from "zod";
import { expandTilde } from "../utils/path.js";

import type { PaseoDaemonConfig } from "./bootstrap.js";
import {
  loadPersistedConfig,
  LogFormatSchema,
  LogLevelSchema,
  type PersistedConfig,
} from "./persisted-config.js";
import type { AgentProvider } from "./agent/agent-sdk-types.js";
import type {
  AgentProviderRuntimeSettingsMap,
  ProviderOverride,
} from "./agent/provider-launch-config.js";
import { ProviderOverrideSchema } from "./agent/provider-launch-config.js";
import { AgentProviderSchema } from "@getpaseo/protocol/provider-manifest";
import { hashDaemonPassword } from "./auth.js";
import { resolveSpeechConfig } from "./speech/speech-config-resolver.js";
import { mergeHostnames, parseHostnamesEnv, type HostnamesConfig } from "./hostnames.js";
import {
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  normalizeRelayPairingBaseUrl,
  parseRelayEndpointInput,
  shouldUseTlsForDefaultHostedRelay,
  type RelayEndpointConfig,
} from "@getpaseo/protocol/daemon-endpoints";
import { resolveGitProcessPolicy } from "../utils/git-process-scheduler.js";

const DEFAULT_PORT = 6767;
const DEFAULT_APP_BASE_URL = "https://app.paseo.sh";
const DEFAULT_TRUSTED_PROXIES = ["loopback"];

interface ResolveBundledWebUiDistDirInput {
  moduleUrl?: string | URL;
  resourcesPath?: string;
}

export function resolveBundledWebUiDistDir(input: ResolveBundledWebUiDistDirInput = {}): string {
  const moduleUrl = input.moduleUrl ?? import.meta.url;
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));

  if (path.basename(moduleDir) === "server" && path.basename(path.dirname(moduleDir)) === "src") {
    return path.resolve(moduleDir, "..", "..", "dist", "server", "web-ui");
  }

  if (
    path.basename(moduleDir) === "server" &&
    path.basename(path.dirname(moduleDir)) === "server" &&
    path.basename(path.dirname(path.dirname(moduleDir))) === "dist"
  ) {
    const appDistDir = input.resourcesPath ? path.join(input.resourcesPath, "app-dist") : null;

    if (appDistDir && existsSync(appDistDir)) {
      return appDistDir;
    }

    return path.resolve(moduleDir, "..", "web-ui");
  }

  return path.resolve(moduleDir, "web-ui");
}

const processResourcesPath = "resourcesPath" in process ? process.resourcesPath : undefined;
const BUNDLED_WEB_UI_DIST_DIR = resolveBundledWebUiDistDir({
  resourcesPath: typeof processResourcesPath === "string" ? processResourcesPath : undefined,
});

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function normalizeLogEnv(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.trim().toLowerCase();
}

function resolveGitProcessConfig(
  env: NodeJS.ProcessEnv,
  persisted: ReturnType<typeof loadPersistedConfig>,
): NonNullable<PaseoDaemonConfig["git"]> {
  return resolveGitProcessPolicy({
    env,
    persisted: persisted.daemon?.git,
  });
}

export type CliConfigOverrides = Partial<{
  listen: string;
  relayEnabled: boolean;
  relayUseTls: boolean;
  mcpEnabled: boolean;
  mcpInjectIntoAgents: boolean;
  webUiEnabled: boolean;
  hostnames: HostnamesConfig;
}>;

type TrustedProxiesConfig = true | string[];

function resolveLogConfigFromEnv(
  env: NodeJS.ProcessEnv,
  persisted: ReturnType<typeof loadPersistedConfig>,
): PersistedConfig["log"] {
  const envLogLevel = LogLevelSchema.safeParse(normalizeLogEnv(env.PASEO_LOG_LEVEL));
  const envLogFormat = LogFormatSchema.safeParse(normalizeLogEnv(env.PASEO_LOG_FORMAT));

  if (!envLogLevel.success && !envLogFormat.success) {
    return persisted.log;
  }

  return {
    ...persisted.log,
    ...(envLogLevel.success ? { level: envLogLevel.data } : {}),
    ...(envLogFormat.success ? { format: envLogFormat.data } : {}),
  };
}

const OptionalVoiceLlmProviderSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value): string | null =>
    typeof value === "string" ? value.trim().toLowerCase() : null,
  )
  .pipe(z.union([AgentProviderSchema, z.null()]));

function parseOptionalVoiceLlmProvider(value: unknown): AgentProvider | null {
  const parsed = OptionalVoiceLlmProviderSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function extractProviderOverrides(
  providers: Record<string, unknown> | undefined,
): Record<string, ProviderOverride> | undefined {
  if (!providers) {
    return undefined;
  }

  const providerOverrides = Object.entries(providers).flatMap(([providerId, provider]) => {
    const parsed = ProviderOverrideSchema.safeParse(provider);
    return parsed.success ? [[providerId, parsed.data] as const] : [];
  });

  return providerOverrides.length > 0 ? Object.fromEntries(providerOverrides) : undefined;
}

function extractAgentProviderSettings(
  providerOverrides: Record<string, ProviderOverride> | undefined,
): AgentProviderRuntimeSettingsMap | undefined {
  if (!providerOverrides) {
    return undefined;
  }

  const runtimeSettings = Object.entries(providerOverrides).flatMap(([providerId, provider]) => {
    const parsedProviderId = AgentProviderSchema.safeParse(providerId);
    if (!parsedProviderId.success || (!provider.command && !provider.env)) {
      return [];
    }

    return [
      [
        parsedProviderId.data,
        {
          command: provider.command
            ? {
                mode: "replace" as const,
                argv: provider.command,
              }
            : undefined,
          env: provider.env,
        },
      ] as const,
    ];
  });

  return runtimeSettings.length > 0
    ? (Object.fromEntries(runtimeSettings) as AgentProviderRuntimeSettingsMap)
    : undefined;
}

interface ResolveRelayInput {
  env: NodeJS.ProcessEnv;
  persisted: ReturnType<typeof loadPersistedConfig>;
  cliRelayEnabled: boolean | undefined;
  cliRelayUseTls: boolean | undefined;
}

interface ResolvedRelay {
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

interface ResolvedServiceProxy {
  publicBaseUrl: string | null;
  standaloneListen: string | null;
}

function resolveTlsFromEnv(
  envValue: string | undefined,
  persistedValue: boolean | undefined,
  fallback: boolean,
): boolean {
  if (envValue !== undefined) {
    return parseBooleanEnv(envValue) ?? false;
  }
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

function normalizeConfiguredRelayPairingBaseUrl(value: string): string {
  return normalizeRelayPairingBaseUrl(value);
}

function dedupeRelayPairingBaseUrls(values: string[]): string[] {
  return [...new Set(values)];
}

function parseRelayPairingBaseUrlsEnv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return [];

  let entries: unknown[];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("PASEO_RELAY_PAIRING_BASE_URLS must be a JSON array");
    }
    entries = parsed;
  } else {
    entries = trimmed.split(/[\n,]+/);
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
      const record = entry as {
        endpoint: string;
        pairingBaseUrl?: unknown;
      };
      const endpoint = parseRelayEndpointInput(record.endpoint);
      const pairingBaseUrl =
        typeof record.pairingBaseUrl === "string"
          ? normalizeConfiguredRelayPairingBaseUrl(record.pairingBaseUrl)
          : undefined;
      return {
        endpoint: endpoint.endpoint,
        useTls: endpoint.useTls,
        pairingBaseUrl,
      };
    });
  } else {
    entries = trimmed.split(/[\n,]+/).map(parseRelayEndpointInput);
  }
  return dedupeRelayEndpoints(entries);
}

function resolveConfiguredRelayEndpoints(input: ResolveRelayInput): RelayEndpointConfig[] {
  const persistedRelay = input.persisted.daemon?.relay;
  const envEndpoints = parseRelayEndpointsEnv(input.env.PASEO_RELAY_ENDPOINTS);

  if (envEndpoints !== undefined) {
    return envEndpoints;
  }
  if (input.env.PASEO_RELAY_ENDPOINT) {
    const endpoint = input.env.PASEO_RELAY_ENDPOINT;
    const useTls =
      input.cliRelayUseTls ??
      resolveTlsFromEnv(
        input.env.PASEO_RELAY_USE_TLS,
        persistedRelay?.useTls,
        shouldUseTlsForDefaultHostedRelay(endpoint),
      );
    const publicUseTls = resolveTlsFromEnv(
      input.env.PASEO_RELAY_PUBLIC_USE_TLS,
      persistedRelay?.publicUseTls,
      useTls,
    );
    return [
      {
        endpoint,
        useTls,
        publicEndpoint: input.env.PASEO_RELAY_PUBLIC_ENDPOINT ?? endpoint,
        publicUseTls,
        ...(input.env.PASEO_RELAY_PAIRING_BASE_URL
          ? {
              pairingBaseUrl: normalizeConfiguredRelayPairingBaseUrl(
                input.env.PASEO_RELAY_PAIRING_BASE_URL,
              ),
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
      const publicUseTls = hasExplicitPublicUseTls
        ? resolveTlsFromEnv(input.env.PASEO_RELAY_PUBLIC_USE_TLS, entry.publicUseTls, useTls)
        : useTls;
      return {
        endpoint: entry.endpoint,
        useTls,
        ...(entry.publicEndpoint ? { publicEndpoint: entry.publicEndpoint } : {}),
        ...(hasExplicitPublicUseTls ? { publicUseTls } : {}),
        ...(entry.pairingBaseUrl
          ? {
              pairingBaseUrl: normalizeConfiguredRelayPairingBaseUrl(entry.pairingBaseUrl),
            }
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
    const publicUseTls = resolveTlsFromEnv(
      input.env.PASEO_RELAY_PUBLIC_USE_TLS,
      persistedRelay.publicUseTls,
      useTls,
    );
    return [
      {
        endpoint: persistedRelay.endpoint,
        useTls,
        publicEndpoint: persistedRelay.publicEndpoint ?? persistedRelay.endpoint,
        publicUseTls,
        ...(input.env.PASEO_RELAY_PAIRING_BASE_URL
          ? {
              pairingBaseUrl: normalizeConfiguredRelayPairingBaseUrl(
                input.env.PASEO_RELAY_PAIRING_BASE_URL,
              ),
            }
          : {}),
      },
    ];
  }
  return [];
}

function resolveConfiguredRelayPairingBaseUrls(
  input: ResolveRelayInput,
  endpoints: RelayEndpointConfig[],
): string[] {
  const persistedRelay = input.persisted.daemon?.relay;
  const envPairingBaseUrls = parseRelayPairingBaseUrlsEnv(input.env.PASEO_RELAY_PAIRING_BASE_URLS);
  if (envPairingBaseUrls !== undefined) {
    return envPairingBaseUrls;
  }
  if (input.env.PASEO_RELAY_PAIRING_BASE_URL) {
    return [normalizeRelayPairingBaseUrl(input.env.PASEO_RELAY_PAIRING_BASE_URL)];
  }
  if (persistedRelay?.pairingBaseUrls) {
    return dedupeRelayPairingBaseUrls(
      persistedRelay.pairingBaseUrls.map(normalizeRelayPairingBaseUrl),
    );
  }

  // COMPAT(relay-pairing-list): migrate the old per-endpoint pairing address
  // into the independent HTTP/HTTPS address list.
  return dedupeRelayPairingBaseUrls(
    endpoints.flatMap((endpoint) =>
      endpoint.pairingBaseUrl ? [normalizeRelayPairingBaseUrl(endpoint.pairingBaseUrl)] : [],
    ),
  );
}

function resolveLocalRelayConfig(input: ResolveRelayInput): ResolvedRelay["local"] {
  const persistedLocal = input.persisted.daemon?.relay?.local;
  const publicEndpoint =
    input.env.PASEO_LAN_RELAY_PUBLIC_ENDPOINT ?? persistedLocal?.publicEndpoint;
  const pairingBaseUrl =
    input.env.PASEO_LAN_RELAY_PAIRING_BASE_URL ?? persistedLocal?.pairingBaseUrl;
  const webApp = resolveLocalRelayWebAppConfig(input.env, persistedLocal?.webApp);
  return {
    enabled: parseBooleanEnv(input.env.PASEO_LAN_RELAY_ENABLED) ?? persistedLocal?.enabled ?? false,
    listen: input.env.PASEO_LAN_RELAY_LISTEN ?? persistedLocal?.listen ?? "0.0.0.0:6769",
    ...(publicEndpoint ? { publicEndpoint } : {}),
    ...(pairingBaseUrl
      ? { pairingBaseUrl: normalizeLocalRelayPairingBaseUrl(pairingBaseUrl) }
      : {}),
    webApp,
  };
}

function resolveLocalRelayWebAppConfig(
  env: NodeJS.ProcessEnv,
  persistedWebApp: { enabled?: boolean; path?: string } | undefined,
): ResolvedRelay["local"]["webApp"] {
  const webAppEnabled =
    parseBooleanEnv(env.PASEO_LAN_RELAY_WEB_APP_ENABLED) ?? persistedWebApp?.enabled ?? false;
  const webAppPath = normalizeLocalRelayWebAppPath(
    env.PASEO_LAN_RELAY_WEB_APP_PATH ?? persistedWebApp?.path ?? "/app",
  );
  return {
    enabled: webAppEnabled,
    path: webAppPath,
  };
}

function resolveRelayConfig(input: ResolveRelayInput): ResolvedRelay {
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

function resolveLegacyRelaySummary(endpoints: RelayEndpointConfig[]): {
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

interface ResolvedVoiceLlm {
  provider: AgentProvider | null;
  providerExplicit: boolean;
  model: string | null;
}

function resolveServiceProxyPublicBaseUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid PASEO_SERVICE_PROXY_PUBLIC_BASE_URL: ${value}`);
  }
}

function resolveServiceProxyConfig(
  env: NodeJS.ProcessEnv,
  persisted: ReturnType<typeof loadPersistedConfig>,
): ResolvedServiceProxy {
  const enabledShim =
    parseBooleanEnv(env.PASEO_SERVICE_PROXY_ENABLED) ?? persisted.daemon?.serviceProxy?.enabled;
  // COMPAT(serviceProxyEnabled): added 2026-06-02, remove after 2026-12-02.
  // `enabled=false` used to disable the separate service proxy listener. Localhost
  // service proxying is now always enabled; this only suppresses optional layers.
  const optionalLayersEnabled = enabledShim !== false;
  const publicBaseUrl = optionalLayersEnabled
    ? resolveServiceProxyPublicBaseUrl(
        env.PASEO_SERVICE_PROXY_PUBLIC_BASE_URL ??
          persisted.daemon?.serviceProxy?.publicBaseUrl ??
          null,
      )
    : null;
  const standaloneListen = optionalLayersEnabled
    ? (env.PASEO_SERVICE_PROXY_LISTEN ?? persisted.daemon?.serviceProxy?.listen ?? null)
    : null;

  return { publicBaseUrl, standaloneListen };
}

interface ResolvedWebUi {
  enabled: boolean;
  distDir: string | null;
}

function resolveWebUiConfig(
  paseoHome: string,
  env: NodeJS.ProcessEnv,
  cli: CliConfigOverrides | undefined,
  persisted: ReturnType<typeof loadPersistedConfig>,
): ResolvedWebUi {
  const enabled =
    cli?.webUiEnabled ??
    parseBooleanEnv(env.PASEO_WEB_UI_ENABLED) ??
    persisted.features?.webUi?.enabled ??
    false;
  const rawDistDir = env.PASEO_WEB_UI_DIST_DIR ?? persisted.features?.webUi?.distDir;
  const trimmedDistDir = rawDistDir?.trim();
  const distDir = trimmedDistDir
    ? path.resolve(path.isAbsolute(trimmedDistDir) ? trimmedDistDir : paseoHome, trimmedDistDir)
    : BUNDLED_WEB_UI_DIST_DIR;
  return {
    enabled,
    distDir,
  };
}

function resolveVoiceLlmConfig(
  env: NodeJS.ProcessEnv,
  persisted: ReturnType<typeof loadPersistedConfig>,
): ResolvedVoiceLlm {
  const envVoiceLlmProvider = parseOptionalVoiceLlmProvider(env.PASEO_VOICE_LLM_PROVIDER);
  const persistedVoiceLlmProvider = parseOptionalVoiceLlmProvider(
    persisted.features?.voiceMode?.llm?.provider,
  );
  return {
    provider: envVoiceLlmProvider ?? persistedVoiceLlmProvider ?? null,
    providerExplicit: envVoiceLlmProvider !== null || persistedVoiceLlmProvider !== null,
    model: persisted.features?.voiceMode?.llm?.model ?? null,
  };
}

function resolveCorsAllowedOrigins(
  env: NodeJS.ProcessEnv,
  persisted: ReturnType<typeof loadPersistedConfig>,
): string[] {
  const envCorsOrigins = env.PASEO_CORS_ORIGINS
    ? env.PASEO_CORS_ORIGINS.split(",").map((s) => s.trim())
    : [];
  const persistedCorsOrigins = persisted.daemon?.cors?.allowedOrigins ?? [];
  return Array.from(
    new Set([...persistedCorsOrigins, ...envCorsOrigins].filter((s) => s.length > 0)),
  );
}

function parseTrustedProxiesEnv(value: string | undefined): TrustedProxiesConfig | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return [];
  }

  return trimmed
    .split(",")
    .map((proxy) => proxy.trim())
    .filter((proxy) => proxy.length > 0);
}

function resolveTrustedProxiesConfig(
  env: NodeJS.ProcessEnv,
  persisted: ReturnType<typeof loadPersistedConfig>,
): TrustedProxiesConfig {
  return (
    parseTrustedProxiesEnv(env.PASEO_TRUSTED_PROXIES) ??
    persisted.daemon?.trustedProxies ??
    DEFAULT_TRUSTED_PROXIES
  );
}

// PASEO_LISTEN can be:
// - host:port (TCP)
// - /path/to/socket (Unix socket)
// - unix:///path/to/socket (Unix socket)
// Default is TCP at 127.0.0.1:6767
function resolveListenAddress(
  env: NodeJS.ProcessEnv,
  cli: CliConfigOverrides | undefined,
  persisted: ReturnType<typeof loadPersistedConfig>,
): string {
  return (
    cli?.listen ??
    env.PASEO_LISTEN ??
    persisted.daemon?.listen ??
    `127.0.0.1:${env.PORT ?? DEFAULT_PORT}`
  );
}

function resolveAuthConfig(
  env: NodeJS.ProcessEnv,
  persisted: ReturnType<typeof loadPersistedConfig>,
): PaseoDaemonConfig["auth"] {
  const envPassword = env.PASEO_PASSWORD?.trim();
  if (envPassword) {
    return { password: hashDaemonPassword(envPassword) };
  }
  return persisted.daemon?.auth?.password
    ? { password: persisted.daemon.auth.password }
    : undefined;
}

function resolveWorktreesRoot(
  paseoHome: string,
  persisted: ReturnType<typeof loadPersistedConfig>,
): string | undefined {
  const configuredRoot = persisted.worktrees?.root?.trim();
  if (!configuredRoot) {
    return undefined;
  }

  const expandedRoot = expandTilde(configuredRoot);
  return path.isAbsolute(expandedRoot)
    ? path.resolve(expandedRoot)
    : path.resolve(paseoHome, expandedRoot);
}

function resolveAppendSystemPrompt(persisted: ReturnType<typeof loadPersistedConfig>): string {
  return persisted.daemon?.appendSystemPrompt ?? "";
}

function resolveBrowserToolsEnabled(persisted: ReturnType<typeof loadPersistedConfig>): boolean {
  return persisted.daemon?.browserTools?.enabled ?? false;
}

/**
 * Both profile lists stay `undefined` when absent rather than defaulting to an
 * empty array: for terminal profiles that is what selects the built-in
 * defaults, so an empty array has to keep meaning "the user removed them all".
 */
function resolveProfileLists(persisted: ReturnType<typeof loadPersistedConfig>) {
  return {
    terminalProfiles: persisted.daemon?.terminalProfiles,
    agentProfiles: persisted.daemon?.agentProfiles,
  };
}

function resolveClientAccessRequireApproval(
  persisted: ReturnType<typeof loadPersistedConfig>,
): boolean {
  return persisted.daemon?.clientAccess?.requireApproval ?? false;
}

// oxlint-disable-next-line complexity -- Static configuration precedence is intentionally centralized.
function resolveStaticLoadConfigSettings(
  env: NodeJS.ProcessEnv,
  cli: CliConfigOverrides | undefined,
  persisted: ReturnType<typeof loadPersistedConfig>,
) {
  return {
    mcpEnabled: cli?.mcpEnabled ?? persisted.daemon?.mcp?.enabled ?? true,
    mcpInjectIntoAgents:
      cli?.mcpInjectIntoAgents ?? persisted.daemon?.mcp?.injectIntoAgents ?? false,
    browserToolsEnabled: resolveBrowserToolsEnabled(persisted),
    clientAccessRequireApproval: resolveClientAccessRequireApproval(persisted),
    projectIndexUpdateIntervalMinutes:
      persisted.daemon?.projectIndexing?.updateIntervalMinutes ?? 1440,
    instructionTemplates: persisted.daemon?.instructionTemplates,
    autoArchiveAfterMerge: persisted.daemon?.autoArchiveAfterMerge ?? false,
    appendSystemPrompt: resolveAppendSystemPrompt(persisted),
    ...resolveProfileLists(persisted),
    hostnames: mergeHostnames([
      persisted.daemon?.hostnames,
      parseHostnamesEnv(env.PASEO_HOSTNAMES ?? env.PASEO_ALLOWED_HOSTS),
      cli?.hostnames,
    ]),
    trustedProxies: resolveTrustedProxiesConfig(env, persisted),
    appBaseUrl: env.PASEO_APP_BASE_URL ?? persisted.app?.baseUrl ?? DEFAULT_APP_BASE_URL,
  };
}

export function loadConfig(
  paseoHome: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    cli?: CliConfigOverrides;
  },
): PaseoDaemonConfig {
  const env = options?.env ?? process.env;
  const persisted = loadPersistedConfig(paseoHome);

  const listen = resolveListenAddress(env, options?.cli, persisted);
  const {
    mcpEnabled,
    mcpInjectIntoAgents,
    browserToolsEnabled,
    clientAccessRequireApproval,
    projectIndexUpdateIntervalMinutes,
    instructionTemplates,
    autoArchiveAfterMerge,
    appendSystemPrompt,
    terminalProfiles,
    agentProfiles,
    hostnames,
    trustedProxies,
    appBaseUrl,
  } = resolveStaticLoadConfigSettings(env, options?.cli, persisted);

  const relay = resolveRelayConfig({
    env,
    persisted,
    cliRelayEnabled: options?.cli?.relayEnabled,
    cliRelayUseTls: options?.cli?.relayUseTls,
  });
  const serviceProxy = resolveServiceProxyConfig(env, persisted);
  const webUi = resolveWebUiConfig(paseoHome, env, options?.cli, persisted);

  const { openai, speech } = resolveSpeechConfig({
    paseoHome,
    env,
    persisted,
  });

  const voiceLlm = resolveVoiceLlmConfig(env, persisted);
  const providerOverrides = extractProviderOverrides(
    persisted.agents?.providers as Record<string, unknown> | undefined,
  );

  return {
    listen,
    paseoHome,
    desktopManaged: env.PASEO_DESKTOP_MANAGED === "1",
    worktreesRoot: resolveWorktreesRoot(paseoHome, persisted),
    corsAllowedOrigins: resolveCorsAllowedOrigins(env, persisted),
    hostnames,
    trustedProxies,
    mcpEnabled,
    mcpInjectIntoAgents,
    browserToolsEnabled,
    git: resolveGitProcessConfig(env, persisted),
    clientAccessRequireApproval,
    projectIndexUpdateIntervalMinutes,
    instructionTemplates,
    autoArchiveAfterMerge,
    enableTerminalAgentHooks: persisted.daemon?.enableTerminalAgentHooks ?? false,
    appendSystemPrompt,
    terminalProfiles,
    agentProfiles,
    mcpDebug: env.MCP_DEBUG === "1",
    isDev: resolvePaseoNodeEnv(env) === "development",
    agentStoragePath: path.join(paseoHome, "agents"),
    staticDir: "public",
    agentClients: {},
    relayEnabled: relay.enabled,
    relayEnabledMutable: true,
    relayEndpoints: relay.endpoints,
    relayPairingBaseUrls: relay.pairingBaseUrls,
    ...resolveLegacyRelaySummary(relay.endpoints),
    lanRelay: relay.local,
    serviceProxy,
    webUi,
    appBaseUrl,
    auth: resolveAuthConfig(env, persisted),
    openai,
    speech,
    voiceLlmProvider: voiceLlm.provider,
    voiceLlmProviderExplicit: voiceLlm.providerExplicit,
    voiceLlmModel: voiceLlm.model,
    agentProviderSettings: extractAgentProviderSettings(providerOverrides),
    metadataGeneration: persisted.agents?.metadataGeneration,
    providerOverrides,
    log: resolveLogConfigFromEnv(env, persisted),
  };
}
