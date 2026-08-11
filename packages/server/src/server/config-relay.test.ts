import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "./config.js";

const roots: string[] = [];

async function createPaseoHome(config: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-config-relay-"));
  roots.push(root);
  const paseoHome = path.join(root, ".paseo");
  await mkdir(paseoHome, { recursive: true });
  await writeFile(path.join(paseoHome, "config.json"), JSON.stringify(config, null, 2));
  return paseoHome;
}

describe("daemon relay config", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  test("loads relay TLS from env and persisted legacy config", async () => {
    const persistedHome = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          endpoint: "relay.example.com:443",
          useTls: true,
        },
      },
    });
    expect(loadConfig(persistedHome, { env: {} }).relayUseTls).toBe(true);

    const envHome = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          endpoint: "relay.example.com:443",
          useTls: false,
        },
      },
    });
    expect(loadConfig(envHome, { env: { PASEO_RELAY_USE_TLS: "true" } }).relayUseTls).toBe(true);
  });

  test("keeps Relay endpoints empty by default", async () => {
    const home = await createPaseoHome({ version: 1 });
    const config = loadConfig(home, { env: {} });
    expect(config.relayEnabled).toBe(false);
    expect(config.relayEndpoints).toEqual([]);
    expect(config.relayPairingBaseUrls).toEqual([]);
    expect(config.relayEndpoint).toBeUndefined();
  });

  test("loads multiple Relay endpoints from PASEO_RELAY_ENDPOINTS", async () => {
    const home = await createPaseoHome({ version: 1 });
    const config = loadConfig(home, {
      env: {
        PASEO_RELAY_ENDPOINTS: "wss://relay.paseo.sh:443,ws://192.168.1.20:6769",
      },
    });
    expect(config.relayEnabled).toBe(true);
    expect(config.relayEndpoints).toEqual([
      { endpoint: "relay.paseo.sh:443", useTls: true },
      { endpoint: "192.168.1.20:6769", useTls: false },
    ]);
  });

  test("loads independent HTTP/HTTPS pairing addresses from the environment", async () => {
    const home = await createPaseoHome({ version: 1 });
    const config = loadConfig(home, {
      env: {
        PASEO_RELAY_ENDPOINTS: "wss://relay.paseo.sh:443,ws://192.168.1.20:6769",
        PASEO_RELAY_PAIRING_BASE_URLS:
          "https://app.paseo.sh,http://192.168.1.20:6769,https://app.paseo.sh",
      },
    });

    expect(config.relayPairingBaseUrls).toEqual([
      "https://app.paseo.sh",
      "http://192.168.1.20:6769",
    ]);
  });

  test("loads paired WSS and HTTPS Relay addresses from JSON", async () => {
    const home = await createPaseoHome({ version: 1 });
    const config = loadConfig(home, {
      env: {
        PASEO_RELAY_ENDPOINTS: JSON.stringify([
          {
            endpoint: "wss://relay.example.com:443",
            pairingBaseUrl: "https://connect.example.com:8443",
          },
          {
            endpoint: "wss://10.0.0.8:6769",
            pairingBaseUrl: "10.0.0.8:6769",
          },
        ]),
      },
    });
    expect(config.relayEndpoints).toEqual([
      {
        endpoint: "relay.example.com:443",
        useTls: true,
      },
      {
        endpoint: "10.0.0.8:6769",
        useTls: true,
      },
    ]);
    expect(config.relayPairingBaseUrls).toEqual([
      "https://connect.example.com:8443",
      "https://10.0.0.8:6769",
    ]);
  });

  test("loads paired WS and HTTP Relay addresses from JSON", async () => {
    const home = await createPaseoHome({ version: 1 });
    const config = loadConfig(home, {
      env: {
        PASEO_RELAY_ENDPOINTS: JSON.stringify([
          {
            endpoint: "ws://10.71.95.148:6769",
            pairingBaseUrl: "http://10.71.95.148:6769",
          },
        ]),
      },
    });
    expect(config.relayEndpoints).toEqual([
      {
        endpoint: "10.71.95.148:6769",
        useTls: false,
      },
    ]);
    expect(config.relayPairingBaseUrls).toEqual(["http://10.71.95.148:6769"]);
  });

  test("does not couple a legacy pairing frontend protocol to the Relay protocol", async () => {
    const home = await createPaseoHome({ version: 1 });
    const config = loadConfig(home, {
      env: {
        PASEO_RELAY_ENDPOINTS: JSON.stringify([
          {
            endpoint: "ws://10.71.95.148:6769",
            pairingBaseUrl: "https://app.example.com",
          },
        ]),
      },
    });

    expect(config.relayPairingBaseUrls).toEqual(["https://app.example.com"]);
  });

  test("loads persisted WS and HTTP Relay addresses saved by the settings UI", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          enabled: true,
          endpoints: [
            {
              endpoint: "10.71.95.148:6769",
              useTls: false,
              pairingBaseUrl: "http://10.71.95.148:6769",
            },
          ],
        },
      },
    });

    expect(loadConfig(home, { env: {} }).relayEndpoints).toEqual([
      {
        endpoint: "10.71.95.148:6769",
        useTls: false,
      },
    ]);
    expect(loadConfig(home, { env: {} }).relayPairingBaseUrls).toEqual([
      "http://10.71.95.148:6769",
    ]);
  });

  test("loads independent Relay pairing frontend addresses", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          enabled: true,
          endpoints: [{ endpoint: "relay.example.com:443", useTls: true }],
          pairingBaseUrls: [
            "https://app.example.com/paseo/",
            "http://10.71.95.148:6769/app",
            "https://app.example.com/paseo",
          ],
        },
      },
    });

    expect(loadConfig(home, { env: {} }).relayPairingBaseUrls).toEqual([
      "https://app.example.com/paseo",
      "http://10.71.95.148:6769/app",
    ]);
  });

  test("PASEO_RELAY_PUBLIC_USE_TLS overrides relayUseTls for public side", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: { relay: { endpoint: "relay.example.com:80" } },
    });
    const config = loadConfig(home, {
      env: { PASEO_RELAY_USE_TLS: "false", PASEO_RELAY_PUBLIC_USE_TLS: "true" },
    });
    expect(config.relayUseTls).toBe(false);
    expect(config.relayPublicUseTls).toBe(true);
  });

  test("relayPublicUseTls falls back to relayUseTls when only PASEO_RELAY_USE_TLS is set", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: { relay: { endpoint: "relay.example.com:80" } },
    });
    const config = loadConfig(home, { env: { PASEO_RELAY_USE_TLS: "false" } });
    expect(config.relayUseTls).toBe(false);
    expect(config.relayPublicUseTls).toBe(false);
  });

  test("persisted publicUseTls overrides relayUseTls fallback", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          endpoint: "relay.example.com:80",
          useTls: false,
          publicUseTls: true,
        },
      },
    });
    const config = loadConfig(home, { env: {} });
    expect(config.relayUseTls).toBe(false);
    expect(config.relayPublicUseTls).toBe(true);
  });

  test("loads LAN Relay settings without adding a public Relay", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          endpoints: [],
          local: { enabled: true, listen: "0.0.0.0:7788" },
        },
      },
    });
    const config = loadConfig(home, { env: {} });
    expect(config.relayEnabled).toBe(true);
    expect(config.relayEndpoints).toEqual([]);
    expect(config.lanRelay).toEqual({
      enabled: true,
      listen: "0.0.0.0:7788",
      webApp: {
        enabled: false,
        path: "/app",
      },
    });
  });

  test("loads a custom LAN Relay HTTP connection address", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          endpoints: [],
          local: {
            enabled: true,
            listen: "0.0.0.0:7788",
            pairingBaseUrl: "http://10.0.0.8:7788",
          },
        },
      },
    });
    expect(loadConfig(home, { env: {} }).lanRelay).toEqual({
      enabled: true,
      listen: "0.0.0.0:7788",
      pairingBaseUrl: "http://10.0.0.8:7788",
      webApp: {
        enabled: false,
        path: "/app",
      },
    });
  });

  test("loads and normalizes LAN Relay pairing web app settings", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          endpoints: [],
          local: {
            enabled: true,
            listen: "0.0.0.0:7788",
            webApp: {
              enabled: true,
              path: "/pair/",
            },
          },
        },
      },
    });

    expect(loadConfig(home, { env: {} }).lanRelay?.webApp).toEqual({
      enabled: true,
      path: "/pair",
    });
  });

  test("migrates a persisted LAN Relay HTTPS connection address to HTTP", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          endpoints: [],
          local: {
            enabled: true,
            listen: "0.0.0.0:7788",
            pairingBaseUrl: "https://10.0.0.8:7788",
          },
        },
      },
    });
    expect(loadConfig(home, { env: {} }).lanRelay?.pairingBaseUrl).toBe("http://10.0.0.8:7788");
  });
});

describe("daemon service proxy config", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  test("loads public base URL from env before persisted config", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        serviceProxy: {
          publicBaseUrl: "https://persisted.example.com",
        },
      },
    });

    const config = loadConfig(home, {
      env: { PASEO_SERVICE_PROXY_PUBLIC_BASE_URL: "https://env.example.com/" },
    });

    expect(config.serviceProxy).toEqual({
      publicBaseUrl: "https://env.example.com",
      standaloneListen: null,
    });
  });

  test("does not synthesize a standalone service listener from enabled true", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: { serviceProxy: { enabled: true } },
    });

    expect(loadConfig(home, { env: {} }).serviceProxy).toEqual({
      publicBaseUrl: null,
      standaloneListen: null,
    });
  });

  test("enabled false suppresses optional service proxy layers only", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        serviceProxy: {
          enabled: false,
          listen: "127.0.0.1:9999",
          publicBaseUrl: "https://persisted.example.com",
        },
      },
    });

    expect(loadConfig(home, { env: {} }).serviceProxy).toEqual({
      publicBaseUrl: null,
      standaloneListen: null,
    });
  });

  test("rejects invalid PASEO_SERVICE_PROXY_PUBLIC_BASE_URL values", async () => {
    const home = await createPaseoHome({ version: 1 });

    expect(() =>
      loadConfig(home, {
        env: { PASEO_SERVICE_PROXY_PUBLIC_BASE_URL: "not-a-url" },
      }),
    ).toThrow("Invalid PASEO_SERVICE_PROXY_PUBLIC_BASE_URL: not-a-url");
  });
});

describe("daemon trusted proxy config", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  test("trusts loopback proxies by default", async () => {
    const home = await createPaseoHome({ version: 1 });

    expect(loadConfig(home, { env: {} }).trustedProxies).toEqual(["loopback"]);
  });

  test("loads trusted proxies from persisted config", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        trustedProxies: ["loopback", "10.0.0.0/8"],
      },
    });

    expect(loadConfig(home, { env: {} }).trustedProxies).toEqual(["loopback", "10.0.0.0/8"]);
  });

  test("PASEO_TRUSTED_PROXIES overrides persisted config", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        trustedProxies: ["loopback"],
      },
    });

    const config = loadConfig(home, {
      env: { PASEO_TRUSTED_PROXIES: "loopback,172.16.0.0/12" },
    });

    expect(config.trustedProxies).toEqual(["loopback", "172.16.0.0/12"]);
  });

  test("PASEO_TRUSTED_PROXIES supports explicit trust-all and trust-none modes", async () => {
    const trustAllHome = await createPaseoHome({ version: 1 });
    expect(
      loadConfig(trustAllHome, { env: { PASEO_TRUSTED_PROXIES: "true" } }).trustedProxies,
    ).toBe(true);

    const trustNoneHome = await createPaseoHome({ version: 1 });
    expect(
      loadConfig(trustNoneHome, { env: { PASEO_TRUSTED_PROXIES: "false" } }).trustedProxies,
    ).toEqual([]);
  });
});

describe("daemon worktree root config", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  test("resolves relative worktrees.root against PASEO_HOME", async () => {
    const home = await createPaseoHome({
      version: 1,
      worktrees: { root: "custom-worktrees" },
    });

    expect(loadConfig(home, { env: {} }).worktreesRoot).toBe(path.join(home, "custom-worktrees"));
  });

  test("keeps absolute worktrees.root absolute", async () => {
    const home = await createPaseoHome({
      version: 1,
      worktrees: { root: path.join(os.tmpdir(), "paseo-custom-worktrees") },
    });

    expect(loadConfig(home, { env: {} }).worktreesRoot).toBe(
      path.join(os.tmpdir(), "paseo-custom-worktrees"),
    );
  });
});
