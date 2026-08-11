import { afterEach, expect, test, vi } from "vitest";

import { getCompleteDaemonPairingOffer } from "./pair.js";

type PairingClient = Parameters<typeof getCompleteDaemonPairingOffer>[0];

afterEach(() => {
  vi.useRealTimers();
});

function createClient(input: {
  endpoints: Array<{
    endpoint: string;
    useTls: boolean;
    publicEndpoint?: string;
  }>;
  local: {
    enabled: boolean;
    listen: string;
    publicEndpoint?: string;
  };
  offers: Array<Array<{ endpoint: string; useTls: boolean }>>;
}) {
  let offerIndex = 0;
  const getDaemonPairingOffer = vi.fn(async () => {
    const offers = input.offers[Math.min(offerIndex, input.offers.length - 1)] ?? [];
    offerIndex += 1;
    return {
      relayEnabled: offers.length > 0,
      url: "https://app.paseo.sh/#offer=test",
      qr: null,
      offers: offers.map((offer) => ({
        endpoint: offer.endpoint,
        useTls: offer.useTls,
        url: `https://app.paseo.sh/#offer=${offer.endpoint}`,
        qr: null,
      })),
    };
  });
  return {
    client: {
      getDaemonConfig: vi.fn(async () => ({
        config: {
          relay: {
            endpoints: input.endpoints,
            local: input.local,
          },
        },
      })),
      getDaemonPairingOffer,
    },
    getDaemonPairingOffer,
  };
}

test("does not double-count a configured Relay replaced by the local WS Relay", async () => {
  const { client, getDaemonPairingOffer } = createClient({
    endpoints: [
      { endpoint: "relay.paseo.sh:443", useTls: true },
      { endpoint: "10.71.95.148:6769", useTls: false },
    ],
    local: {
      enabled: true,
      listen: "10.71.95.148:6769",
    },
    offers: [
      [
        { endpoint: "relay.paseo.sh:443", useTls: true },
        { endpoint: "10.71.95.148:6769", useTls: false },
      ],
    ],
  });

  const result = await getCompleteDaemonPairingOffer(client as PairingClient, 100);

  expect(result.offers).toHaveLength(2);
  expect(result.offers[1]).toMatchObject({
    endpoint: "10.71.95.148:6769",
    useTls: false,
  });
  expect(getDaemonPairingOffer).toHaveBeenCalledTimes(1);
});

test("waits for the local Relay to appear in the runtime pairing offer", async () => {
  vi.useFakeTimers();
  const { client, getDaemonPairingOffer } = createClient({
    endpoints: [{ endpoint: "relay.paseo.sh:443", useTls: true }],
    local: {
      enabled: true,
      listen: "10.71.95.148:6769",
    },
    offers: [
      [{ endpoint: "relay.paseo.sh:443", useTls: true }],
      [
        { endpoint: "relay.paseo.sh:443", useTls: true },
        { endpoint: "10.71.95.148:6769", useTls: false },
      ],
    ],
  });

  const resultPromise = getCompleteDaemonPairingOffer(client as PairingClient, 1_000);
  await vi.advanceTimersByTimeAsync(100);
  const result = await resultPromise;

  expect(result.offers).toHaveLength(2);
  expect(getDaemonPairingOffer).toHaveBeenCalledTimes(2);
});
