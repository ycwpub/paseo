export interface PairingOfferEndpoint {
  endpoint: string;
  useTls: boolean;
  pairingBaseUrl?: string;
  url: string;
  qr?: string | null;
}

export interface PairingOffer {
  relayEnabled: boolean;
  url: string | null;
  qr: string | null;
  offers?: PairingOfferEndpoint[];
}

export function formatPairingOfferJson(pairing: PairingOffer): string {
  return JSON.stringify(
    {
      relayEnabled: pairing.relayEnabled,
      url: pairing.url,
      qr: pairing.qr,
      offers: pairing.offers ?? [],
    },
    null,
    2,
  );
}

export function formatPairingOfferText(pairing: PairingOffer): string {
  const offerBlocks = (pairing.offers ?? [])
    .map((offer) => {
      const qrBlock = offer.qr ? `${offer.qr}\n` : "";
      const scheme = offer.useTls ? "wss" : "ws";
      return `\nRelay ${scheme}://${offer.endpoint}\n${qrBlock}${offer.url}\n`;
    })
    .join("");
  return offerBlocks || `\nScan to pair:\n${pairing.qr ?? ""}\n${pairing.url}\n`;
}
