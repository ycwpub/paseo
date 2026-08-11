import { describe, expect, test } from "vitest";

import { normalizeOnboardPairingOffer } from "./onboard.js";

describe("normalizeOnboardPairingOffer", () => {
  test("supports legacy pairing offers without a relay offers list", () => {
    const pairing = normalizeOnboardPairingOffer({
      relayEnabled: true,
      url: "https://app.paseo.sh/#offer=legacy",
      qr: null,
    });

    expect(pairing).toEqual({
      relayEnabled: true,
      url: "https://app.paseo.sh/#offer=legacy",
      qr: null,
      offers: [],
    });
  });

  test("preserves relay offers returned by current daemons", () => {
    const offers = [
      {
        endpoint: "relay.paseo.sh:443",
        useTls: true,
        pairingBaseUrl: "https://app.paseo.sh",
        url: "https://app.paseo.sh/#offer=current",
        qr: null,
      },
    ];

    expect(
      normalizeOnboardPairingOffer({
        relayEnabled: true,
        url: offers[0]!.url,
        qr: null,
        offers,
      }).offers,
    ).toBe(offers);
  });
});
