import {
  buildRelayWebSocketUrl as buildSharedRelayWebSocketUrl,
  deriveRelayPairingBaseUrl,
  DEFAULT_PUBLIC_RELAY_ENDPOINTS,
  DEFAULT_RELAY_PAIRING_BASE_URL,
  formatRelayEndpointInput,
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  normalizeRelayPairingBaseUrl,
  parseRelayEndpointInput,
  resolveRelayPairingBaseUrl,
  type RelayDeviceType,
} from "@getpaseo/protocol/relay-endpoint-config";

export {
  deriveRelayPairingBaseUrl,
  DEFAULT_PUBLIC_RELAY_ENDPOINTS,
  DEFAULT_RELAY_PAIRING_BASE_URL,
  formatRelayEndpointInput,
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  normalizeRelayPairingBaseUrl,
  parseRelayEndpointInput,
  resolveRelayPairingBaseUrl,
};

export function buildRelayWebSocketUrl(params: {
  endpoint: string;
  serverId: string;
  useTls: boolean;
  clientId?: string;
  clientHostname?: string;
  deviceType?: RelayDeviceType;
}): string {
  return buildSharedRelayWebSocketUrl({ ...params, role: "client" });
}
