import { describe, expect, test } from "vitest";
import { relayPairingOffersEqual } from "./daemon-pairing";

const offer = {
  endpoint: "10.37.55.187:6769",
  useTls: false,
  pairingBaseUrl: "http://10.37.55.187:6769/app",
  url: "http://10.37.55.187:6769/app/#offer=payload",
  qr: "<svg />",
};

describe("relayPairingOffersEqual", () => {
  test("keeps an unchanged relay list stable across background fetches", () => {
    expect(relayPairingOffersEqual([offer], [{ ...offer }])).toBe(true);
  });

  test("detects pairing URL and relay list changes", () => {
    expect(
      relayPairingOffersEqual(
        [offer],
        [
          {
            ...offer,
            pairingBaseUrl: "http://10.37.55.187:6769/new-app",
            url: "http://10.37.55.187:6769/new-app/#offer=payload",
          },
        ],
      ),
    ).toBe(false);
    expect(
      relayPairingOffersEqual([offer], [offer, { ...offer, endpoint: "relay.paseo.sh:443" }]),
    ).toBe(false);
  });
});
