export function daemonPairingQueryKey(serverId: string | null) {
  return ["daemon-pairing", serverId] as const;
}

export interface RelayPairingOfferView {
  endpoint: string;
  useTls: boolean;
  pairingBaseUrl?: string | null;
  url: string;
  qr?: string | null;
}

export function relayPairingOffersEqual(
  left: readonly RelayPairingOfferView[],
  right: readonly RelayPairingOfferView[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((offer, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      offer.endpoint === candidate.endpoint &&
      offer.useTls === candidate.useTls &&
      offer.pairingBaseUrl === candidate.pairingBaseUrl &&
      offer.url === candidate.url &&
      offer.qr === candidate.qr
    );
  });
}
