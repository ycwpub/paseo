import { tryConnectToDaemon } from "../../utils/client.js";

const PAIRING_RECONCILE_POLL_MS = 100;

type ConnectedDaemonClient = NonNullable<Awaited<ReturnType<typeof tryConnectToDaemon>>>;

export async function getCompleteDaemonPairingOffer(
  client: ConnectedDaemonClient,
  timeoutMs: number,
) {
  const config = await client.getDaemonConfig();
  const expectedEndpoints = new Set(
    config.config.relay.endpoints.map((relay) => relay.publicEndpoint ?? relay.endpoint),
  );
  if (config.config.relay.local.enabled) {
    expectedEndpoints.add(
      config.config.relay.local.publicEndpoint ?? config.config.relay.local.listen,
    );
  }
  const pairingBaseUrlCount = Math.max(1, config.config.relay.pairingBaseUrls.length);
  const expectedOfferCount = expectedEndpoints.size * pairingBaseUrlCount;
  const deadline = Date.now() + timeoutMs;
  let offer = await client.getDaemonPairingOffer({ timeout: Math.max(1, timeoutMs) });

  while (offer.offers.length < expectedOfferCount && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, PAIRING_RECONCILE_POLL_MS));
    offer = await client.getDaemonPairingOffer({
      timeout: Math.max(1, deadline - Date.now()),
    });
  }

  return offer;
}
