import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { generateLocalPairingOffer } from "./pairing-offer.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("generateLocalPairingOffer compatibility", () => {
  test("uses a legacy custom appBaseUrl when no pairing frontend is configured", async () => {
    const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-pairing-offer-"));
    tempDirs.push(paseoHome);

    const pairing = await generateLocalPairingOffer({
      paseoHome,
      relayEnabled: true,
      relayEndpoints: [{ endpoint: "relay.example.test:443", useTls: true }],
      appBaseUrl: "https://legacy-app.example.test/paseo",
      includeQr: false,
    });

    expect(pairing.url).toMatch(/^https:\/\/legacy-app\.example\.test\/paseo\/#offer=/);
    expect(pairing.offers).toHaveLength(1);
    expect(pairing.offers[0]?.pairingBaseUrl).toBe("https://legacy-app.example.test/paseo");
    expect(pairing.offers[0]?.url).toMatch(/^https:\/\/legacy-app\.example\.test\/paseo\/#offer=/);
  });

  test("prefers explicit pairing frontends over the legacy appBaseUrl", async () => {
    const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-pairing-offer-"));
    tempDirs.push(paseoHome);

    const pairing = await generateLocalPairingOffer({
      paseoHome,
      relayEnabled: true,
      relayEndpoints: [{ endpoint: "relay.example.test:443", useTls: true }],
      relayPairingBaseUrls: ["https://connect.example.test"],
      appBaseUrl: "https://legacy-app.example.test",
      includeQr: false,
    });

    expect(pairing.url).toMatch(/^https:\/\/connect\.example\.test\/#offer=/);
    expect(pairing.offers[0]?.pairingBaseUrl).toBe("https://connect.example.test");
  });
});
