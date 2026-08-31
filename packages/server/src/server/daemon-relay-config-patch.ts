import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";

const DEFAULT_HOSTED_RELAY = {
  endpoint: "relay.paseo.sh:443",
  useTls: true,
} as const;

type RelayPatch = NonNullable<MutableDaemonConfigPatch["relay"]> & {
  enabled?: boolean;
};

/**
 * Keeps the legacy relay.enabled patch compatible with the multi-Relay model.
 * Modern endpoint/local patches also update the legacy enabled summary so old
 * clients and status consumers continue to observe the expected state.
 */
export function normalizeMutableRelayPatch(
  current: MutableDaemonConfig["relay"],
  patch: MutableDaemonConfigPatch["relay"],
): RelayPatch | undefined {
  if (patch === undefined) return undefined;

  const relayPatch = patch as RelayPatch;
  const explicitEnabled = typeof relayPatch.enabled === "boolean" ? relayPatch.enabled : undefined;
  const endpoints =
    explicitEnabled === true && relayPatch.endpoints === undefined && current.endpoints.length === 0
      ? [DEFAULT_HOSTED_RELAY]
      : relayPatch.endpoints;
  const endpointEnabled =
    endpoints !== undefined ? endpoints.length > 0 : current.endpoints.length > 0;
  const enabled =
    explicitEnabled ??
    (relayPatch.endpoints !== undefined
      ? endpointEnabled
      : (current.enabled as boolean | undefined));

  return {
    ...relayPatch,
    ...(endpoints !== undefined ? { endpoints } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  };
}

export function resolveEnabledRelayEndpoints(
  relay: MutableDaemonConfig["relay"],
): MutableDaemonConfig["relay"]["endpoints"] {
  return relay.enabled === false ? [] : relay.endpoints;
}
