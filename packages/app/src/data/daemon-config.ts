import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";

const DEFAULT_LOCAL_RELAY_LISTEN = "0.0.0.0:6769";

export function daemonConfigQueryKey(serverId: string | null) {
  return ["daemon-config", serverId] as const;
}

/**
 * Daemons and cached responses from older releases can omit relay fields that
 * are required by the current protocol type. Normalize at the cache boundary
 * so every consumer receives the current shape.
 */
export function normalizeMutableDaemonConfig(config: MutableDaemonConfig): MutableDaemonConfig {
  const relay: Record<string, unknown> = isRecord(config.relay) ? config.relay : {};
  const local: Record<string, unknown> = isRecord(relay.local) ? relay.local : {};

  return {
    ...config,
    relay: {
      ...relay,
      endpoints: Array.isArray(relay.endpoints)
        ? (relay.endpoints as MutableDaemonConfig["relay"]["endpoints"])
        : [],
      pairingBaseUrls: Array.isArray(relay.pairingBaseUrls)
        ? (relay.pairingBaseUrls as MutableDaemonConfig["relay"]["pairingBaseUrls"])
        : [],
      local: {
        ...local,
        enabled: typeof local.enabled === "boolean" ? local.enabled : false,
        listen:
          typeof local.listen === "string" && local.listen.trim().length > 0
            ? local.listen
            : DEFAULT_LOCAL_RELAY_LISTEN,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
