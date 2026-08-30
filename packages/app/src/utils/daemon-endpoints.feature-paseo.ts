import {
  buildDaemonWebSocketUrl,
  buildRelayWebSocketUrl as buildSharedRelayWebSocketUrl,
  deriveLabelFromEndpoint,
  deriveRelayPairingBaseUrl,
  DEFAULT_PUBLIC_RELAY_ENDPOINTS,
  DEFAULT_RELAY_PAIRING_BASE_URL,
  extractHostPortFromWebSocketUrl,
  formatRelayEndpointInput,
  normalizeHostPort,
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  normalizeRelayPairingBaseUrl,
  parseConnectionUri,
  parseHostPort,
  parseRelayEndpointInput,
  resolveRelayPairingBaseUrl,
  serializeConnectionUri,
  serializeConnectionUriForStorage,
  shouldUseTlsForDefaultHostedRelay,
  type HostPortParts,
  type RelayDeviceType,
} from "@getpaseo/protocol/daemon-endpoints";

export { decodeOfferFragmentPayload } from "@getpaseo/protocol/connection-offer";

export type { HostPortParts };

export {
  buildDaemonWebSocketUrl,
  deriveLabelFromEndpoint,
  deriveRelayPairingBaseUrl,
  DEFAULT_PUBLIC_RELAY_ENDPOINTS,
  DEFAULT_RELAY_PAIRING_BASE_URL,
  extractHostPortFromWebSocketUrl,
  formatRelayEndpointInput,
  normalizeHostPort,
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  normalizeRelayPairingBaseUrl,
  parseConnectionUri,
  parseHostPort,
  parseRelayEndpointInput,
  resolveRelayPairingBaseUrl,
  serializeConnectionUri,
  serializeConnectionUriForStorage,
  shouldUseTlsForDefaultHostedRelay,
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
