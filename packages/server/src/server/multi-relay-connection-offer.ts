import { ConnectionOfferV2Schema, type ConnectionOffer } from "@getpaseo/protocol/connection-offer";

export async function createMultiRelayConnectionOfferV2(args: {
  serverId: string;
  daemonPublicKeyB64: string;
  relays: Array<{ endpoint: string; useTls?: boolean }>;
}): Promise<ConnectionOffer> {
  if (args.relays.length === 0) {
    throw new Error("At least one relay endpoint is required");
  }
  return ConnectionOfferV2Schema.parse({
    v: 2,
    serverId: args.serverId,
    daemonPublicKeyB64: args.daemonPublicKeyB64,
    relay: args.relays[0],
    relays: args.relays,
  });
}
