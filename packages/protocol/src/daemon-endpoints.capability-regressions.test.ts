import { describe, expect, test } from "vitest";
import {
  buildRelayWebSocketUrl,
  deriveRelayPairingBaseUrl,
  formatRelayEndpointInput,
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  parseRelayEndpointInput,
  normalizeRelayPairingBaseUrl,
  resolveRelayPairingBaseUrl,
} from "./relay-endpoint-config.js";
describe("deriveRelayPairingBaseUrl", () => {
  test("derives HTTPS from a WSS Relay and removes the default port", () => {
    expect(
      deriveRelayPairingBaseUrl({
        endpoint: "relay.paseo.sh:443",
        useTls: true,
      }),
    ).toBe("https://relay.paseo.sh");
  });
  test("derives HTTP from a WS Relay and preserves a custom port", () => {
    expect(
      deriveRelayPairingBaseUrl({
        endpoint: "10.71.95.148:6769",
        useTls: false,
      }),
    ).toBe("http://10.71.95.148:6769");
  });
  test("uses the public Relay address when one is configured", () => {
    expect(
      deriveRelayPairingBaseUrl({
        endpoint: "relay.internal:6769",
        useTls: false,
        publicEndpoint: "relay.example.com:443",
        publicUseTls: true,
      }),
    ).toBe("https://relay.example.com");
  });
  test("derives HTTPS from the default hosted WSS Relay when no pairing address is configured", () => {
    expect(
      resolveRelayPairingBaseUrl({
        endpoint: "relay.paseo.sh:443",
        useTls: true,
      }),
    ).toBe("https://relay.paseo.sh");
  });
  test("keeps an explicitly configured pairing address", () => {
    expect(
      resolveRelayPairingBaseUrl({
        endpoint: "relay.paseo.sh:443",
        useTls: true,
        pairingBaseUrl: "https://connect.example.com",
      }),
    ).toBe("https://connect.example.com");
  });
  test("accepts independent HTTP and HTTPS pairing frontend addresses", () => {
    expect(normalizeRelayPairingBaseUrl("http://10.71.95.148:6769")).toBe(
      "http://10.71.95.148:6769",
    );
    expect(normalizeRelayPairingBaseUrl("https://app.example.com")).toBe("https://app.example.com");
  });
});
test("Relay client URLs include stable management identity, hostname, and device type", () => {
  const url = new URL(
    buildRelayWebSocketUrl({
      endpoint: "relay.example.com:443",
      useTls: true,
      serverId: "srv_test",
      role: "client",
      clientId: "cid_test",
      clientHostname: "macbook",
      deviceType: "mac",
    }),
  );
  expect(url.searchParams.get("clientId")).toBe("cid_test");
  expect(url.searchParams.get("clientHostname")).toBe("macbook");
  expect(url.searchParams.get("deviceType")).toBe("mac");
  expect(url.searchParams.has("identityLabel")).toBe(false);
});
test("Relay server URLs include the daemon device type", () => {
  const url = new URL(
    buildRelayWebSocketUrl({
      endpoint: "relay.example.com:443",
      useTls: true,
      serverId: "srv_test",
      role: "server",
      hostname: "daemon.local",
      deviceType: "cli",
    }),
  );
  expect(url.searchParams.get("hostname")).toBe("daemon.local");
  expect(url.searchParams.get("deviceType")).toBe("cli");
});
test("Relay client URLs omit non-opaque client identifiers", () => {
  const url = new URL(
    buildRelayWebSocketUrl({
      endpoint: "relay.example.com:443",
      useTls: true,
      serverId: "srv_test",
      role: "client",
      clientId: "person@example.com",
    }),
  );
  expect(url.searchParams.has("clientId")).toBe(false);
});
describe("normalizeRelayPairingBaseUrl", () => {
  test("accepts HTTP/HTTPS domains, IP addresses, and frontend paths", () => {
    expect(normalizeRelayPairingBaseUrl("https://connect.example.com:8443")).toBe(
      "https://connect.example.com:8443",
    );
    expect(normalizeRelayPairingBaseUrl("http://10.71.95.148:6769")).toBe(
      "http://10.71.95.148:6769",
    );
    expect(normalizeRelayPairingBaseUrl("10.71.95.148:6769")).toBe("https://10.71.95.148:6769");
    expect(normalizeRelayPairingBaseUrl("http://10.71.95.148:6769/app/")).toBe(
      "http://10.71.95.148:6769/app",
    );
    expect(normalizeRelayPairingBaseUrl("https://connect.example.com/paseo/app")).toBe(
      "https://connect.example.com/paseo/app",
    );
  });
  test("rejects non-HTTP protocols, credentials, queries, and fragments", () => {
    expect(() => normalizeRelayPairingBaseUrl("ftp://10.71.95.148:6769")).toThrow(
      "must use http:// or https://",
    );
    expect(() => normalizeRelayPairingBaseUrl("https://user@connect.example.com/app")).toThrow(
      "must not include credentials",
    );
    expect(() => normalizeRelayPairingBaseUrl("https://connect.example.com/app?offer=1")).toThrow(
      "must not include query parameters or fragments",
    );
    expect(() => normalizeRelayPairingBaseUrl("https://connect.example.com/app#offer=1")).toThrow(
      "must not include query parameters or fragments",
    );
  });
});
describe("normalizeLocalRelayPairingBaseUrl", () => {
  test("accepts HTTP domains and IP addresses with ports", () => {
    expect(normalizeLocalRelayPairingBaseUrl("http://relay.local:6769")).toBe(
      "http://relay.local:6769",
    );
    expect(normalizeLocalRelayPairingBaseUrl("10.71.95.148:6769")).toBe("http://10.71.95.148:6769");
  });
  test("migrates a previously persisted HTTPS LAN Relay address to HTTP", () => {
    expect(normalizeLocalRelayPairingBaseUrl("https://10.71.95.148:6769")).toBe(
      "http://10.71.95.148:6769",
    );
  });
  test("rejects non-HTTP or path-based addresses", () => {
    expect(() => normalizeLocalRelayPairingBaseUrl("wss://10.71.95.148:6769")).toThrow(
      "must use http://",
    );
    expect(() => normalizeLocalRelayPairingBaseUrl("http://relay.local/pair")).toThrow(
      "only a host",
    );
  });
});
describe("normalizeLocalRelayWebAppPath", () => {
  test("normalizes a standard URL path", () => {
    expect(normalizeLocalRelayWebAppPath("/app/")).toBe("/app");
  });
  test("rejects empty, non-standard, traversal, query, and fragment paths", () => {
    for (const value of ["", "/", "app", "?app/", "../app", "/app?x=1", "/app#offer"]) {
      expect(() => normalizeLocalRelayWebAppPath(value)).toThrow();
    }
  });
});
describe("relay websocket URL versioning", () => {
  test("includes a daemon hostname for server connections", () => {
    const url = new URL(
      buildRelayWebSocketUrl({
        endpoint: "relay.paseo.sh:443",
        useTls: true,
        serverId: "srv_test",
        role: "server",
        hostname: "paseo-host.local",
      }),
    );
    expect(url.searchParams.get("hostname")).toBe("paseo-host.local");
  });
});
describe("Relay domain input", () => {
  test("parses a public wss Relay domain", () => {
    expect(parseRelayEndpointInput("wss://relay.paseo.sh:443")).toEqual({
      endpoint: "relay.paseo.sh:443",
      useTls: true,
    });
  });
  test("parses a LAN ws Relay IP", () => {
    const parsed = parseRelayEndpointInput("ws://10.71.95.148:6769");
    expect(parsed).toEqual({
      endpoint: "10.71.95.148:6769",
      useTls: false,
    });
    expect(formatRelayEndpointInput(parsed)).toBe("ws://10.71.95.148:6769");
  });
});
