import { describe, expect, it } from "vitest";
import { decodeOfferFragmentPayload, parseConnectionOfferFromUrl } from "./connection-offer.js";
function encodeBase64UrlNoPadUtf8(input: string): string {
    return Buffer.from(input, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
describe("connection offer", () => {
    it("ignores invisible formatting characters introduced while copying a link", () => {
        const payload = {
            v: 2,
            serverId: "server-123",
            daemonPublicKeyB64: "pubkey",
            relay: { endpoint: "relay.paseo.sh:443" },
        };
        const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(payload));
        const midpoint = Math.floor(encoded.length / 2);
        const copied = `${encoded.slice(0, midpoint)}\u200B\n${encoded.slice(midpoint)}`;
        expect(decodeOfferFragmentPayload(copied)).toEqual(payload);
    });
    it("ignores terminal table borders inserted into a wrapped pairing link", () => {
        const copiedUrl = "http://10.37.55.187:6769/#offer=" +
            "eyJ2IjoyLCJzZXJ2ZXJJZCI6InNydl9YVXgzUHduZ3RxNzciLCJkYWVtb25QdWJsaWNLZXlCNjQi  │ │  " +
            "OiJJVFk0d1R0WEFzRkxyMFl5VmRRV3M0RGJWdytscXUvdStYUU1IcWs1bGdNPSIsInJlbGF5Ijp7ImVuZHBvaW50IjoiMTAuMzcuNTUuMTg3  │ │  " +
            "OjY3NjkiLCJ1c2VUbHMiOmZhbHNlfSwicmVsYXlzIjpbeyJlbmRwb2ludCI6IjEwLjM3LjU1LjE4Nzo2NzY5IiwidXNlVGxzIjpmYWxzZX1d  │ │  " +
            "fQ";
        expect(parseConnectionOfferFromUrl(copiedUrl)).toEqual({
            v: 2,
            serverId: "srv_XUx3Pwngtq77",
            daemonPublicKeyB64: "ITY4wTtXAsFLr0YyVdQWs4DbVw+lqu/u+XQMHqk5lgM=",
            relay: { endpoint: "10.37.55.187:6769", useTls: false },
            relays: [{ endpoint: "10.37.55.187:6769", useTls: false }],
        });
    });
    it("ignores prose punctuation copied after a pairing link", () => {
        const payload = {
            v: 2,
            serverId: "server-123",
            daemonPublicKeyB64: "pubkey",
            relay: { endpoint: "relay.paseo.sh:443" },
        };
        const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(payload));
        expect(decodeOfferFragmentPayload(`${encoded}。`)).toEqual(payload);
    });
    it("accepts percent-encoded Base64URL fragments", () => {
        const payload = {
            v: 2,
            serverId: "server-123",
            daemonPublicKeyB64: "pubkey",
            relay: { endpoint: "relay.paseo.sh:443" },
        };
        const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(payload));
        expect(decodeOfferFragmentPayload(encodeURIComponent(encoded))).toEqual(payload);
    });
});
