import type { LocalPairingOffer } from "@getpaseo/server";

export type LegacyLocalPairingOffer = Omit<LocalPairingOffer, "offers"> & {
  offers?: LocalPairingOffer["offers"] | null;
};

export function normalizeOnboardPairingOffer(pairing: LegacyLocalPairingOffer): LocalPairingOffer {
  return {
    ...pairing,
    offers: Array.isArray(pairing.offers) ? pairing.offers : [],
  };
}
