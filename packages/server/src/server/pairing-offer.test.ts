import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  ConnectionOfferSchema,
  getConnectionOfferRelays,
} from "@getpaseo/protocol/connection-offer";

import { generateLocalPairingOffer } from "./pairing-offer.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function decodeOffer(url: string) {
  const encoded = url.split("#offer=")[1];
  if (!encoded) throw new Error("Expected pairing offer fragment");
  return ConnectionOfferSchema.parse(
    JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
  );
}

describe("generateLocalPairingOffer", () => {
  test("generates every Relay and pairing frontend combination", async () => {
    const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-pairing-offer-"));
    tempDirs.push(paseoHome);

    const pairing = await generateLocalPairingOffer({
      paseoHome,
      relayEnabled: true,
      relayEndpoints: [
        {
          endpoint: "relay.internal:6769",
          useTls: false,
          publicEndpoint: "relay.example.com:443",
          publicUseTls: true,
        },
        {
          endpoint: "192.168.1.20:6769",
          useTls: false,
        },
      ],
      relayPairingBaseUrls: [
        "https://connect.example.com:8443/paseo",
        "http://192.168.1.20:6769/app",
      ],
      appBaseUrl: "https://app.example.test",
      includeQr: false,
    });

    expect(pairing.offers).toHaveLength(4);
    expect(pairing.offers.map(({ endpoint, useTls }) => ({ endpoint, useTls }))).toEqual([
      { endpoint: "relay.example.com:443", useTls: true },
      { endpoint: "relay.example.com:443", useTls: true },
      { endpoint: "192.168.1.20:6769", useTls: false },
      { endpoint: "192.168.1.20:6769", useTls: false },
    ]);
    expect(pairing.offers.every((offer) => offer.qr === null)).toBe(true);
    expect(pairing.offers.map((offer) => offer.pairingBaseUrl)).toEqual([
      "https://connect.example.com:8443/paseo",
      "http://192.168.1.20:6769/app",
      "https://connect.example.com:8443/paseo",
      "http://192.168.1.20:6769/app",
    ]);
    expect(pairing.offers[0]?.url).toMatch(/^https:\/\/connect\.example\.com:8443\/paseo\/#offer=/);
    expect(pairing.offers[1]?.url).toMatch(/^http:\/\/192\.168\.1\.20:6769\/app\/#offer=/);

    for (const relayOffer of pairing.offers) {
      const relays = getConnectionOfferRelays(decodeOffer(relayOffer.url));
      expect(relays).toEqual([
        {
          endpoint: relayOffer.endpoint,
          useTls: relayOffer.useTls,
        },
      ]);
    }

    expect(pairing.url).toMatch(/^https:\/\/connect\.example\.com:8443\/paseo\/#offer=/);
    expect(getConnectionOfferRelays(decodeOffer(pairing.url!))).toHaveLength(2);
  });

  test("keeps discovered and local pairing addresses scoped to their own Relay", async () => {
    const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-pairing-offer-"));
    tempDirs.push(paseoHome);

    const pairing = await generateLocalPairingOffer({
      paseoHome,
      relayEnabled: true,
      relayEndpoints: [
        {
          endpoint: "relay.paseo.sh:443",
          useTls: true,
          pairingBaseUrl: "https://relay.paseo.sh",
        },
        {
          endpoint: "10.71.95.148:6769",
          useTls: false,
          pairingBaseUrl: "http://10.71.95.148:6769",
        },
        {
          endpoint: "10.71.95.148:6769",
          useTls: false,
          publicEndpoint: "10.71.95.148:6769",
          publicUseTls: false,
          pairingBaseUrl: "http://10.71.95.148:6769/app",
        },
      ],
      includeQr: false,
    });

    expect(
      pairing.offers.map(({ endpoint, useTls, pairingBaseUrl }) => ({
        endpoint,
        useTls,
        pairingBaseUrl,
      })),
    ).toEqual([
      {
        endpoint: "relay.paseo.sh:443",
        useTls: true,
        pairingBaseUrl: "https://relay.paseo.sh",
      },
      {
        endpoint: "10.71.95.148:6769",
        useTls: false,
        pairingBaseUrl: "http://10.71.95.148:6769/app",
      },
    ]);
    expect(pairing.offers).toHaveLength(2);
    expect(pairing.offers[1]?.url).toMatch(/^http:\/\/10\.71\.95\.148:6769\/app\/#offer=/);
    expect(getConnectionOfferRelays(decodeOffer(pairing.url!))).toHaveLength(2);
  });

  test("derives pairing links from Relay addresses instead of the Paseo app URL", async () => {
    const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-pairing-offer-"));
    tempDirs.push(paseoHome);

    const pairing = await generateLocalPairingOffer({
      paseoHome,
      relayEnabled: true,
      relayEndpoints: [
        {
          endpoint: "relay.paseo.sh:443",
          useTls: true,
        },
        {
          endpoint: "10.71.95.148:6769",
          useTls: false,
        },
      ],
      appBaseUrl: "https://app.paseo.sh",
      includeQr: false,
    });

    expect(pairing.offers.map((offer) => offer.pairingBaseUrl)).toEqual([
      "https://relay.paseo.sh",
      "http://10.71.95.148:6769",
    ]);
    expect(pairing.offers[0]?.url).toMatch(/^https:\/\/relay\.paseo\.sh\/#offer=/);
    expect(pairing.offers[1]?.url).toMatch(/^http:\/\/10\.71\.95\.148:6769\/#offer=/);
    expect(pairing.url).toContain("relay.paseo.sh");
    expect(pairing.url).not.toContain("app.paseo.sh");
  });
});
