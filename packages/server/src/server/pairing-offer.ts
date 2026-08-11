import type { Logger } from "pino";
import { resolveRelayPairingBaseUrl } from "@getpaseo/protocol/daemon-endpoints";

import { createConnectionOfferV2, encodeOfferToFragmentUrl } from "./connection-offer.js";
import { loadOrCreateDaemonKeyPair } from "./daemon-keypair.js";
import { renderPairingQr } from "./pairing-qr.js";
import { getOrCreateServerId } from "./server-id.js";

export interface LocalPairingOffer {
  relayEnabled: boolean;
  url: string | null;
  qr: string | null;
  offers: LocalRelayPairingOffer[];
}

export interface LocalRelayPairingOffer {
  endpoint: string;
  useTls: boolean;
  pairingBaseUrl: string;
  url: string;
  qr: string | null;
}

export async function generateLocalPairingOffer(args: {
  paseoHome: string;
  relayEnabled?: boolean;
  relayEndpoints?: Array<{
    endpoint: string;
    useTls: boolean;
    publicEndpoint?: string;
    publicUseTls?: boolean;
    pairingBaseUrl?: string;
  }>;
  relayPairingBaseUrls?: string[];
  relayEndpoint?: string;
  relayPublicEndpoint?: string;
  relayUseTls?: boolean;
  relayPublicUseTls?: boolean;
  appBaseUrl?: string;
  includeQr?: boolean;
  logger?: Logger;
}): Promise<LocalPairingOffer> {
  const configuredRelayEndpoints =
    args.relayEndpoints ??
    (args.relayEndpoint
      ? [
          {
            endpoint: args.relayEndpoint,
            useTls: args.relayUseTls ?? args.relayEndpoint === "relay.paseo.sh:443",
            publicEndpoint: args.relayPublicEndpoint,
            publicUseTls: args.relayPublicUseTls,
          },
        ]
      : []);
  const relayEndpoints = dedupeRelayEndpoints(configuredRelayEndpoints);
  const relayEnabled =
    (args.relayEnabled ?? relayEndpoints.length > 0) && relayEndpoints.length > 0;
  if (!relayEnabled) {
    return {
      relayEnabled: false,
      url: null,
      qr: null,
      offers: [],
    };
  }

  const serverId = getOrCreateServerId(args.paseoHome, { logger: args.logger });
  const daemonKeyPair = await loadOrCreateDaemonKeyPair(args.paseoHome, args.logger);
  const resolveFallbackPairingBaseUrl = (relay: (typeof relayEndpoints)[number]): string =>
    relay.pairingBaseUrl?.trim() || resolveRelayPairingBaseUrl(relay);
  // Only explicitly configured pairing frontends are shared by every Relay.
  // Discovered and local Relay URLs belong to their own endpoint and must not
  // leak into offers generated for unrelated Relays.
  const sharedPairingBaseUrls = dedupePairingBaseUrls(args.relayPairingBaseUrls ?? []);
  const primaryPairingBaseUrl =
    sharedPairingBaseUrls[0] ?? resolveFallbackPairingBaseUrl(relayEndpoints[0]!);
  const offer = await createConnectionOfferV2({
    serverId,
    daemonPublicKeyB64: daemonKeyPair.publicKeyB64,
    relays: relayEndpoints.map((relay) => ({
      endpoint: relay.publicEndpoint ?? relay.endpoint,
      useTls: relay.publicUseTls ?? relay.useTls,
    })),
  });
  const url = encodeOfferToFragmentUrl({
    offer,
    appBaseUrl: primaryPairingBaseUrl,
  });
  const offers = await Promise.all(
    relayEndpoints.flatMap((relay) => {
      const pairingBaseUrls =
        sharedPairingBaseUrls.length > 0
          ? sharedPairingBaseUrls
          : [resolveFallbackPairingBaseUrl(relay)];
      return pairingBaseUrls.map(async (pairingBaseUrl): Promise<LocalRelayPairingOffer> => {
        const endpoint = relay.publicEndpoint ?? relay.endpoint;
        const useTls = relay.publicUseTls ?? relay.useTls;
        const relayOffer = await createConnectionOfferV2({
          serverId,
          daemonPublicKeyB64: daemonKeyPair.publicKeyB64,
          relay: { endpoint, useTls },
        });
        const relayUrl = encodeOfferToFragmentUrl({
          offer: relayOffer,
          appBaseUrl: pairingBaseUrl,
        });
        return {
          endpoint,
          useTls,
          pairingBaseUrl,
          url: relayUrl,
          qr: args.includeQr === false ? null : await renderPairingQrSafely(relayUrl, args.logger),
        };
      });
    }),
  );

  if (args.includeQr === false) {
    return {
      relayEnabled: true,
      url,
      qr: null,
      offers,
    };
  }

  return {
    relayEnabled: true,
    url,
    qr: await renderPairingQrSafely(url, args.logger),
    offers,
  };
}

async function renderPairingQrSafely(url: string, logger?: Logger): Promise<string | null> {
  try {
    return await renderPairingQr(url);
  } catch (error) {
    logger?.debug({ error }, "Failed to render pairing QR");
    return null;
  }
}

function dedupeRelayEndpoints(
  endpoints: NonNullable<Parameters<typeof generateLocalPairingOffer>[0]["relayEndpoints"]>,
) {
  const unique = new Map<string, (typeof endpoints)[number]>();
  for (const relay of endpoints) {
    const endpoint = relay.publicEndpoint ?? relay.endpoint;
    const useTls = relay.publicUseTls ?? relay.useTls;
    const key = `${useTls ? "wss" : "ws"}://${endpoint}`;
    // Preserve the first occurrence's order while allowing later, more
    // authoritative runtime metadata (notably the local Relay's /app URL) to
    // replace a matching configured row.
    unique.set(key, relay);
  }
  return [...unique.values()];
}

function dedupePairingBaseUrls(urls: string[]): string[] {
  const unique = new Set<string>();
  for (const url of urls) {
    const trimmed = url.trim();
    if (trimmed) unique.add(trimmed);
  }
  return [...unique];
}
