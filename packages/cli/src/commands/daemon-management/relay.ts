import path from "node:path";
import { Command } from "commander";
import {
  loadConfig,
  loadPersistedConfig,
  savePersistedConfig,
  type PersistedConfig,
} from "@getpaseo/server";
import {
  formatRelayEndpointInput,
  normalizeHostPort,
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  normalizeRelayPairingBaseUrl,
  parseRelayEndpointInput,
  resolveRelayPairingBaseUrl,
  type RelayEndpointConfig,
} from "@getpaseo/protocol/daemon-endpoints";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import type {
  CommandOptions,
  ListResult,
  OutputOptions,
  OutputSchema,
  SingleResult,
} from "../../output/index.js";
import { withOutput } from "../../output/index.js";
import { addJsonOption, collectMultiple } from "../../utils/command-options.js";
import { tryConnectToDaemon } from "../../utils/client.js";
import { resolveLocalDaemonState, resolveLocalPaseoHome } from "./local-daemon.js";

export interface RelaySetOptions extends CommandOptions {
  home?: string;
  endpoint?: string[];
  pairingUrl?: string[];
  clearEndpoints?: boolean;
  clearPairingUrls?: boolean;
  enableLanRelay?: boolean;
  disableLanRelay?: boolean;
  lanListen?: string;
  lanPairingUrl?: string;
  enableLanWebApp?: boolean;
  disableLanWebApp?: boolean;
  lanWebAppPath?: string;
}

interface RelayConfigResult {
  action: "relay_config_updated";
  applied: "live" | "next_start";
  configPath: string;
  endpoints: string[];
  pairingBaseUrls: string[];
  lanRelayEnabled: boolean;
  lanListen: string;
  lanPairingBaseUrl: string | null;
  lanWebAppEnabled: boolean;
  lanWebAppPath: string;
}

interface RelayStatusRow {
  kind: "public" | "lan";
  endpoint: string;
  pairingBaseUrl: string;
  enabled: boolean;
}

const relayConfigResultSchema: OutputSchema<RelayConfigResult> = {
  idField: "action",
  columns: [
    { header: "STATUS", field: "action" },
    { header: "APPLIED", field: "applied" },
    { header: "RELAY COUNT", field: (item) => item.endpoints.length },
    { header: "LAN RELAY", field: (item) => (item.lanRelayEnabled ? "enabled" : "disabled") },
  ],
  renderHuman: (result, _options: OutputOptions) => {
    const data = result.data as RelayConfigResult;
    const endpoints = data.endpoints.length > 0 ? data.endpoints.join("\n  ") : "(empty)";
    const applyText = data.applied === "live" ? "applied immediately" : "saved for next startup";
    return [
      `Relay configuration ${applyText}.`,
      `Relay domains:\n  ${endpoints}`,
      `HTTP/HTTPS connection addresses:\n  ${
        data.pairingBaseUrls.length > 0 ? data.pairingBaseUrls.join("\n  ") : "(empty)"
      }`,
      `LAN Relay: ${data.lanRelayEnabled ? `enabled (${data.lanListen})` : "disabled"}`,
      `LAN HTTP connection address: ${data.lanPairingBaseUrl ?? "(automatic)"}`,
      `LAN pairing web app: ${
        data.lanWebAppEnabled ? `enabled (${data.lanWebAppPath})` : "disabled"
      }`,
      `Config: ${data.configPath}`,
    ].join("\n");
  },
};

const relayStatusSchema: OutputSchema<RelayStatusRow> = {
  idField: "endpoint",
  columns: [
    { header: "TYPE", field: "kind" },
    { header: "ENDPOINT", field: "endpoint" },
    { header: "PAIRING URL", field: "pairingBaseUrl" },
    { header: "STATUS", field: (item) => (item.enabled ? "enabled" : "disabled") },
  ],
};

function dedupeRelayEndpoints(endpoints: RelayEndpointConfig[]): RelayEndpointConfig[] {
  const seen = new Set<string>();
  return endpoints.filter((endpoint) => {
    const key = formatRelayEndpointInput(endpoint);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupePairingBaseUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function validateRelaySetOptions(options: RelaySetOptions): void {
  if (options.clearEndpoints && (options.endpoint?.length ?? 0) > 0) {
    throw new Error("Cannot combine --clear-endpoints with --endpoint");
  }
  if (options.clearPairingUrls && (options.pairingUrl?.length ?? 0) > 0) {
    throw new Error("Cannot combine --clear-pairing-urls with --pairing-url");
  }
  if (options.enableLanRelay && options.disableLanRelay) {
    throw new Error("Cannot combine --enable-lan-relay with --disable-lan-relay");
  }
  if (options.enableLanWebApp && options.disableLanWebApp) {
    throw new Error("Cannot combine --enable-lan-web-app with --disable-lan-web-app");
  }
}

function resolveRelayEndpoints(
  current: RelayEndpointConfig[],
  options: RelaySetOptions,
): RelayEndpointConfig[] {
  if (options.clearEndpoints) {
    return [];
  }
  if (options.endpoint && options.endpoint.length > 0) {
    return dedupeRelayEndpoints(options.endpoint.map((value) => parseRelayEndpointInput(value)));
  }
  return current;
}

function resolvePairingBaseUrls(current: string[], options: RelaySetOptions): string[] {
  if (options.clearPairingUrls) {
    return [];
  }
  if (options.pairingUrl && options.pairingUrl.length > 0) {
    return dedupePairingBaseUrls(options.pairingUrl.map(normalizeRelayPairingBaseUrl));
  }
  return current;
}

function resolveLanRelay(
  current: MutableDaemonConfig["relay"]["local"],
  options: RelaySetOptions,
): MutableDaemonConfig["relay"]["local"] {
  let enabled = current.enabled;
  if (options.enableLanRelay) {
    enabled = true;
  } else if (options.disableLanRelay) {
    enabled = false;
  }
  const listen = options.lanListen ? normalizeHostPort(options.lanListen) : current.listen;
  const pairingBaseUrl = options.lanPairingUrl
    ? normalizeLocalRelayPairingBaseUrl(options.lanPairingUrl)
    : current.pairingBaseUrl;
  let webAppEnabled = current.webApp?.enabled ?? false;
  if (options.enableLanWebApp) {
    webAppEnabled = true;
  } else if (options.disableLanWebApp) {
    webAppEnabled = false;
  }
  const webAppPath = normalizeLocalRelayWebAppPath(
    options.lanWebAppPath ?? current.webApp?.path ?? "/app",
  );

  return {
    ...current,
    enabled,
    listen,
    ...(pairingBaseUrl ? { pairingBaseUrl } : {}),
    webApp: {
      enabled: webAppEnabled,
      path: webAppPath,
    },
  };
}

function resolveTargetRelayConfig(
  current: MutableDaemonConfig["relay"],
  options: RelaySetOptions,
): MutableDaemonConfig["relay"] {
  validateRelaySetOptions(options);
  return {
    endpoints: resolveRelayEndpoints(current.endpoints, options),
    pairingBaseUrls: resolvePairingBaseUrls(current.pairingBaseUrls, options),
    local: resolveLanRelay(current.local, options),
  };
}

function persistedRelayConfig(paseoHome: string): MutableDaemonConfig["relay"] {
  const config = loadConfig(paseoHome, { env: {} });
  return {
    endpoints: config.relayEndpoints ?? [],
    pairingBaseUrls: config.relayPairingBaseUrls ?? [],
    local: config.lanRelay ?? {
      enabled: false,
      listen: "0.0.0.0:6769",
      webApp: { enabled: false, path: "/app" },
    },
  };
}

function saveRelayConfig(paseoHome: string, relay: MutableDaemonConfig["relay"]): void {
  const persisted = loadPersistedConfig(paseoHome);
  const next: PersistedConfig = {
    ...persisted,
    daemon: {
      ...persisted.daemon,
      relay: {
        ...persisted.daemon?.relay,
        enabled: relay.endpoints.length > 0 || relay.local.enabled,
        endpoints: relay.endpoints,
        pairingBaseUrls: relay.pairingBaseUrls,
        local: relay.local,
        endpoint: undefined,
        publicEndpoint: undefined,
        useTls: undefined,
        publicUseTls: undefined,
      },
    },
  };
  savePersistedConfig(paseoHome, next);
}

async function loadLiveRelayConfig(paseoHome: string): Promise<{
  relay: MutableDaemonConfig["relay"];
  client: Awaited<ReturnType<typeof tryConnectToDaemon>>;
}> {
  const state = resolveLocalDaemonState({ home: paseoHome });
  if (!state.running) {
    return { relay: persistedRelayConfig(paseoHome), client: null };
  }
  const client = await tryConnectToDaemon({ host: state.listen, timeout: 1500 });
  if (!client) {
    return { relay: persistedRelayConfig(paseoHome), client: null };
  }
  try {
    const response = await client.getDaemonConfig();
    return { relay: response.config.relay, client };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

function hasRelayConfigChange(options: RelaySetOptions): boolean {
  return (
    (options.endpoint?.length ?? 0) > 0 ||
    (options.pairingUrl?.length ?? 0) > 0 ||
    options.clearEndpoints === true ||
    options.clearPairingUrls === true ||
    options.enableLanRelay === true ||
    options.disableLanRelay === true ||
    typeof options.lanListen === "string" ||
    typeof options.lanPairingUrl === "string" ||
    options.enableLanWebApp === true ||
    options.disableLanWebApp === true ||
    typeof options.lanWebAppPath === "string"
  );
}

export async function setRelayConfig(options: RelaySetOptions): Promise<RelayConfigResult> {
  const paseoHome = resolveLocalPaseoHome(
    typeof options.home === "string" ? options.home : undefined,
  );
  if (!hasRelayConfigChange(options)) {
    throw new Error("Specify Relay, LAN Relay, or LAN pairing web app options");
  }

  const { relay: current, client } = await loadLiveRelayConfig(paseoHome);
  const relay = resolveTargetRelayConfig(current, options);
  let applied: RelayConfigResult["applied"] = "next_start";
  if (client) {
    try {
      await client.patchDaemonConfig({ relay });
      applied = "live";
    } finally {
      await client.close().catch(() => undefined);
    }
  } else {
    saveRelayConfig(paseoHome, relay);
  }

  return {
    action: "relay_config_updated",
    applied,
    configPath: path.join(paseoHome, "config.json"),
    endpoints: relay.endpoints.map(formatRelayEndpointInput),
    pairingBaseUrls: relay.pairingBaseUrls,
    lanRelayEnabled: relay.local.enabled,
    lanListen: relay.local.listen,
    lanPairingBaseUrl: relay.local.pairingBaseUrl ?? null,
    lanWebAppEnabled: relay.local.webApp?.enabled ?? false,
    lanWebAppPath: relay.local.webApp?.path ?? "/app",
  };
}

export async function runRelaySetCommand(
  options: CommandOptions,
  _command: Command,
): Promise<SingleResult<RelayConfigResult>> {
  const result = await setRelayConfig(options as RelaySetOptions);
  return { type: "single", data: result, schema: relayConfigResultSchema };
}

export async function runRelayStatusCommand(
  options: CommandOptions,
  _command: Command,
): Promise<ListResult<RelayStatusRow>> {
  const paseoHome = resolveLocalPaseoHome(
    typeof options.home === "string" ? options.home : undefined,
  );
  const { relay, client } = await loadLiveRelayConfig(paseoHome);
  await client?.close().catch(() => undefined);
  const rows: RelayStatusRow[] = relay.endpoints.flatMap((endpoint) => {
    const pairingBaseUrls =
      relay.pairingBaseUrls.length > 0
        ? relay.pairingBaseUrls
        : [resolveRelayPairingBaseUrl(endpoint)];
    return pairingBaseUrls.map((pairingBaseUrl) => ({
      kind: "public",
      endpoint: formatRelayEndpointInput(endpoint),
      pairingBaseUrl,
      enabled: true,
    }));
  });
  rows.push({
    kind: "lan",
    endpoint: relay.local.listen,
    pairingBaseUrl: relay.local.webApp?.enabled
      ? `${relay.local.pairingBaseUrl ?? "(automatic)"}${relay.local.webApp.path}`
      : (relay.local.pairingBaseUrl ?? "(automatic)"),
    enabled: relay.local.enabled,
  });
  return { type: "list", data: rows, schema: relayStatusSchema };
}

export function createRelayCommand(): Command {
  const relay = new Command("relay").description("Configure Paseo Relay domains and LAN Relay");

  addJsonOption(relay.command("status").description("Show Relay configuration"))
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .action(withOutput(runRelayStatusCommand));

  addJsonOption(relay.command("set").description("Set Relay domains and LAN Relay mode"))
    .option(
      "--endpoint <endpoint>",
      "Relay WSS service URL; repeat for multiple Relays",
      collectMultiple,
      [],
    )
    .option(
      "--pairing-url <url>",
      "Relay HTTP/HTTPS connection address; repeat independently for multiple addresses",
      collectMultiple,
      [],
    )
    .option("--clear-endpoints", "Remove every configured upstream Relay domain")
    .option("--clear-pairing-urls", "Remove every configured HTTP/HTTPS connection address")
    .option("--enable-lan-relay", "Run this Paseo daemon as a LAN Relay")
    .option("--disable-lan-relay", "Stop running this Paseo daemon as a LAN Relay")
    .option("--lan-listen <host:port>", "LAN Relay listen address")
    .option("--lan-pairing-url <http-url>", "Public HTTP connection address for this LAN Relay")
    .option("--enable-lan-web-app", "Host the Paseo pairing web app on this LAN Relay")
    .option("--disable-lan-web-app", "Stop hosting the Paseo pairing web app")
    .option("--lan-web-app-path <path>", "Pairing web app path (default: /app)")
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .action(withOutput(runRelaySetCommand));

  return relay;
}
