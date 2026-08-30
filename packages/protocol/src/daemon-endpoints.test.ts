import { describe, expect, test } from "vitest";

import {
  buildDaemonWebSocketUrl,
  buildRelayWebSocketUrl,
  CURRENT_RELAY_PROTOCOL_VERSION,
  deriveRelayPairingBaseUrl,
  extractHostPortFromWebSocketUrl,
  formatRelayEndpointInput,
  normalizeLocalRelayPairingBaseUrl,
  normalizeLocalRelayWebAppPath,
  normalizeRelayProtocolVersion,
  parseConnectionUri,
  parseRelayEndpointInput,
  normalizeRelayPairingBaseUrl,
  resolveRelayPairingBaseUrl,
  serializeConnectionUri,
  serializeConnectionUriForStorage,
  shouldUseTlsForDefaultHostedRelay,
} from "./daemon-endpoints.js";

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

describe("connection URI parsing", () => {
  test("round-trips a tcp host and port", () => {
    const parsed = parseConnectionUri("tcp://localhost:6767");

    expect(parsed).toEqual({
      host: "localhost",
      port: 6767,
      isIpv6: false,
      useTls: false,
    });
    expect(serializeConnectionUri(parsed)).toBe("tcp://localhost:6767");
  });

  test("round-trips an SSL-enabled tcp host and port", () => {
    const parsed = parseConnectionUri("tcp://example.com:443?ssl=true");

    expect(parsed).toEqual({
      host: "example.com",
      port: 443,
      isIpv6: false,
      useTls: true,
    });
    expect(serializeConnectionUri(parsed)).toBe("tcp://example.com:443?ssl=true");
  });

  test("round-trips an IPv6 host", () => {
    const parsed = parseConnectionUri("tcp://[::1]:6767?ssl=true");

    expect(parsed).toEqual({
      host: "::1",
      port: 6767,
      isIpv6: true,
      useTls: true,
    });
    expect(serializeConnectionUri(parsed)).toBe("tcp://[::1]:6767?ssl=true");
  });

  test("rejects a missing port", () => {
    expect(() => parseConnectionUri("tcp://localhost")).toThrow("Connection URI port is required");
  });

  test("rejects an invalid scheme", () => {
    expect(() => parseConnectionUri("http://localhost:6767")).toThrow(
      "Connection URI protocol must be tcp:",
    );
  });

  test("parses password without including it in the public serializer", () => {
    const parsed = parseConnectionUri("tcp://localhost:6767?ssl=true&password=secret");

    expect(parsed).toEqual({
      host: "localhost",
      port: 6767,
      isIpv6: false,
      useTls: true,
      password: "secret",
    });
    expect(serializeConnectionUri(parsed)).toBe("tcp://localhost:6767?ssl=true");
    expect(serializeConnectionUriForStorage(parsed)).toBe(
      "tcp://localhost:6767?ssl=true&password=secret",
    );
  });

  test("rejects userinfo passwords", () => {
    expect(() => parseConnectionUri("tcp://:secret@localhost:6767?ssl=true")).toThrow(
      "Connection URI userinfo is not supported",
    );
  });
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

describe("daemon websocket URLs", () => {
  test("uses ws for port 443 when TLS is disabled", () => {
    expect(buildDaemonWebSocketUrl("example.com:443", { useTls: false })).toBe(
      "ws://example.com:443/ws",
    );
  });

  test("uses wss for non-443 ports when TLS is enabled", () => {
    expect(buildDaemonWebSocketUrl("example.com:6767", { useTls: true })).toBe(
      "wss://example.com:6767/ws",
    );
  });
});

describe("relay websocket URL versioning", () => {
  test("defaults relay URLs to v2", () => {
    const url = new URL(
      buildRelayWebSocketUrl({
        endpoint: "relay.paseo.sh:443",
        useTls: true,
        serverId: "srv_test",
        role: "client",
      }),
    );

    expect(url.searchParams.get("v")).toBe(CURRENT_RELAY_PROTOCOL_VERSION);
    expect(url.searchParams.has("connectionId")).toBe(false);
  });

  test("includes connectionId when provided (server data sockets)", () => {
    const url = new URL(
      buildRelayWebSocketUrl({
        endpoint: "relay.paseo.sh:443",
        useTls: true,
        serverId: "srv_test",
        role: "server",
        connectionId: "conn_abc123",
      }),
    );

    expect(url.searchParams.get("connectionId")).toBe("conn_abc123");
  });

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

  test("allows explicitly requesting v1 relay URLs", () => {
    const url = new URL(
      buildRelayWebSocketUrl({
        endpoint: "relay.paseo.sh:443",
        useTls: true,
        serverId: "srv_test",
        role: "server",
        version: "1",
      }),
    );

    expect(url.searchParams.get("v")).toBe("1");
  });

  test("normalizes numeric relay versions", () => {
    expect(normalizeRelayProtocolVersion(2)).toBe("2");
    expect(normalizeRelayProtocolVersion(1)).toBe("1");
  });

  test("rejects unsupported relay versions", () => {
    expect(() => normalizeRelayProtocolVersion("3")).toThrow('Relay version must be "1" or "2"');
  });
});

describe("relay websocket URLs", () => {
  test("uses ws for port 443 when TLS is disabled", () => {
    const url = new URL(
      buildRelayWebSocketUrl({
        endpoint: "relay.paseo.sh:443",
        useTls: false,
        serverId: "srv_test",
        role: "client",
      }),
    );

    expect(url.protocol).toBe("ws:");
  });

  test("uses wss for non-443 ports when TLS is enabled", () => {
    const url = new URL(
      buildRelayWebSocketUrl({
        endpoint: "relay.paseo.sh:6767",
        useTls: true,
        serverId: "srv_test",
        role: "client",
      }),
    );

    expect(url.protocol).toBe("wss:");
  });

  test("round-trips IPv6 relay endpoints with TLS enabled", () => {
    const wsUrl = buildRelayWebSocketUrl({
      endpoint: "[::1]:443",
      useTls: true,
      serverId: "srv_test",
      role: "client",
    });
    const url = new URL(wsUrl);

    expect(url.protocol).toBe("wss:");
    expect(extractHostPortFromWebSocketUrl(wsUrl)).toBe("[::1]:443");
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

describe("shouldUseTlsForDefaultHostedRelay", () => {
  test("returns true for the hosted Paseo relay on port 443", () => {
    expect(shouldUseTlsForDefaultHostedRelay("relay.paseo.sh:443")).toBe(true);
  });

  test("returns true for any self-hosted relay on port 443", () => {
    expect(shouldUseTlsForDefaultHostedRelay("relay.example.com:443")).toBe(true);
  });

  test("returns true for an IPv6 relay on port 443", () => {
    expect(shouldUseTlsForDefaultHostedRelay("[::1]:443")).toBe(true);
  });

  test("returns false for a relay on a non-443 port", () => {
    expect(shouldUseTlsForDefaultHostedRelay("relay.example.com:8080")).toBe(false);
  });

  test("returns false for malformed endpoints", () => {
    expect(shouldUseTlsForDefaultHostedRelay("not-an-endpoint")).toBe(false);
  });
});
