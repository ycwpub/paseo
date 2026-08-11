import { z } from "zod";

const ConnectionOfferRelaySchema = z.object({
  endpoint: z.string().min(1),
  useTls: z.boolean().optional(),
});

/**
 * Relay-only pairing offer.
 *
 * `serverId` is a stable daemon identifier scoped to `PASEO_HOME`, and is also
 * used as the relay session identifier.
 */
export const ConnectionOfferV2Schema = z
  .object({
    v: z.literal(2),
    serverId: z.string().min(1),
    daemonPublicKeyB64: z.string().min(1),
    // `relay` remains for older clients. New clients use every entry in `relays`.
    relay: ConnectionOfferRelaySchema.optional(),
    relays: z.array(ConnectionOfferRelaySchema).min(1).optional(),
  })
  .refine((offer) => offer.relay !== undefined || offer.relays !== undefined, {
    message: "At least one relay endpoint is required",
  });

export type ConnectionOfferV2 = z.infer<typeof ConnectionOfferV2Schema>;

export const ConnectionOfferSchema = ConnectionOfferV2Schema;
export type ConnectionOffer = ConnectionOfferV2;

export function getConnectionOfferRelays(
  offer: ConnectionOffer,
): Array<z.infer<typeof ConnectionOfferRelaySchema>> {
  const relays = offer.relays ?? (offer.relay ? [offer.relay] : []);
  const seen = new Set<string>();
  return relays.filter((relay) => {
    const key = `${relay.useTls === true ? "wss" : "ws"}://${relay.endpoint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBase64UrlInput(input: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(input.trim());
  } catch {
    throw new Error("Pairing offer contains invalid URL encoding");
  }

  // Links copied from wrapped messages or terminal tables can contain line
  // breaks, invisible formatting marks, and box-drawing borders such as `│`.
  // None of those are part of Base64URL.
  const compact = decoded.replace(/[\s\u200B-\u200D\u2060\u2500-\u257F\uFEFF]/gu, "");
  const token = compact.match(/^[A-Za-z0-9+/_-]+={0,2}/u)?.[0] ?? "";
  if (!token) {
    throw new Error("Pairing offer payload is empty or invalid");
  }
  return token;
}

function decodeBase64UrlToUtf8(input: string): string {
  const normalized = normalizeBase64UrlInput(input);
  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  let binary: string;
  try {
    binary = globalThis.atob(padded);
  } catch {
    throw new Error("Pairing offer contains invalid Base64URL data");
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Pairing offer contains invalid UTF-8 data");
  }
}

export function decodeOfferFragmentPayload(encoded: string): unknown {
  const json = decodeBase64UrlToUtf8(encoded);
  return JSON.parse(json) as unknown;
}

const OFFER_FRAGMENT_PREFIX = "#offer=";

function extractOfferFragmentEncoded(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fragmentIndex = trimmed.indexOf(OFFER_FRAGMENT_PREFIX);
  if (fragmentIndex === -1) return null;
  const encoded = trimmed.slice(fragmentIndex + OFFER_FRAGMENT_PREFIX.length).trim();
  return encoded.length > 0 ? encoded : null;
}

/**
 * Parse a pairing-offer URL of the form `https://app.paseo.sh/#offer=<base64url>`.
 *
 * Returns `null` if the input has no `#offer=` fragment. Throws if the fragment
 * exists but the payload is malformed or fails schema validation.
 */
export function parseConnectionOfferFromUrl(input: string): ConnectionOffer | null {
  const encoded = extractOfferFragmentEncoded(input);
  if (!encoded) return null;
  const payload = decodeOfferFragmentPayload(encoded);
  return ConnectionOfferSchema.parse(payload);
}
