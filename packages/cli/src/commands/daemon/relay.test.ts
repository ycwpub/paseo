import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadConfig, loadPersistedConfig } from "@getpaseo/server";

import { setRelayConfig } from "./relay.js";

const tempDirs: string[] = [];

async function createPaseoHome(): Promise<string> {
  const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-relay-cli-"));
  tempDirs.push(paseoHome);
  return paseoHome;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("relay CLI configuration", () => {
  test("persists multiple Relay endpoints while the daemon is stopped", async () => {
    const paseoHome = await createPaseoHome();

    const result = await setRelayConfig({
      home: paseoHome,
      endpoint: [
        "wss://relay.example.com:443",
        "wss://192.168.1.20:6769",
        "wss://relay.example.com:443",
      ],
      pairingUrl: [
        "https://connect.example.com",
        "https://192.168.1.20:6769",
        "https://connect.example.com",
      ],
    });

    expect(result).toMatchObject({
      applied: "next_start",
      endpoints: ["wss://relay.example.com:443", "wss://192.168.1.20:6769"],
      pairingBaseUrls: ["https://connect.example.com", "https://192.168.1.20:6769"],
      lanRelayEnabled: false,
    });
    expect(loadConfig(paseoHome, { env: {} }).relayEndpoints).toEqual([
      {
        endpoint: "relay.example.com:443",
        useTls: true,
      },
      {
        endpoint: "192.168.1.20:6769",
        useTls: true,
      },
    ]);
    expect(loadConfig(paseoHome, { env: {} }).relayPairingBaseUrls).toEqual([
      "https://connect.example.com",
      "https://192.168.1.20:6769",
    ]);
  });

  test("clears upstream endpoints without changing LAN Relay settings", async () => {
    const paseoHome = await createPaseoHome();
    await setRelayConfig({
      home: paseoHome,
      endpoint: ["wss://relay.example.com:443"],
      pairingUrl: ["https://connect.example.com"],
      enableLanRelay: true,
      lanListen: "0.0.0.0:7788",
    });

    const result = await setRelayConfig({ home: paseoHome, clearEndpoints: true });

    expect(result.endpoints).toEqual([]);
    expect(result.lanRelayEnabled).toBe(true);
    expect(result.lanListen).toBe("0.0.0.0:7788");
    const persisted = loadPersistedConfig(paseoHome);
    expect(persisted.daemon?.relay?.endpoints).toEqual([]);
    expect(persisted.daemon?.relay?.pairingBaseUrls).toEqual(["https://connect.example.com"]);
    expect(persisted.daemon?.relay?.local).toEqual({
      enabled: true,
      listen: "0.0.0.0:7788",
      webApp: {
        enabled: false,
        path: "/app",
      },
    });
  });

  test("enables and configures the LAN Relay independently", async () => {
    const paseoHome = await createPaseoHome();

    const result = await setRelayConfig({
      home: paseoHome,
      enableLanRelay: true,
      lanListen: "127.0.0.1:8899",
      lanPairingUrl: "http://192.168.1.20:8899",
    });

    expect(result).toMatchObject({
      applied: "next_start",
      endpoints: [],
      lanRelayEnabled: true,
      lanListen: "127.0.0.1:8899",
      lanPairingBaseUrl: "http://192.168.1.20:8899",
      lanWebAppEnabled: false,
      lanWebAppPath: "/app",
    });
    expect(loadConfig(paseoHome, { env: {} }).lanRelay).toEqual({
      enabled: true,
      listen: "127.0.0.1:8899",
      pairingBaseUrl: "http://192.168.1.20:8899",
      webApp: {
        enabled: false,
        path: "/app",
      },
    });
  });

  test("enables the LAN pairing web app and normalizes its path", async () => {
    const paseoHome = await createPaseoHome();

    const result = await setRelayConfig({
      home: paseoHome,
      enableLanRelay: true,
      enableLanWebApp: true,
      lanPairingUrl: "http://192.168.1.20:6769",
      lanWebAppPath: "/app/",
    });

    expect(result).toMatchObject({
      lanRelayEnabled: true,
      lanWebAppEnabled: true,
      lanWebAppPath: "/app",
    });
    expect(loadConfig(paseoHome, { env: {} }).lanRelay?.webApp).toEqual({
      enabled: true,
      path: "/app",
    });
  });

  test("rejects conflicting endpoint options", async () => {
    const paseoHome = await createPaseoHome();

    await expect(
      setRelayConfig({
        home: paseoHome,
        endpoint: ["wss://relay.example.com:443"],
        pairingUrl: ["https://connect.example.com"],
        clearEndpoints: true,
      }),
    ).rejects.toThrow("Cannot combine --clear-endpoints with --endpoint");
  });

  test("updates pairing frontend addresses independently", async () => {
    const paseoHome = await createPaseoHome();

    const result = await setRelayConfig({
      home: paseoHome,
      pairingUrl: ["https://app.example.com/paseo/", "http://10.71.95.148:6769/app"],
    });

    expect(result.endpoints).toEqual([]);
    expect(result.pairingBaseUrls).toEqual([
      "https://app.example.com/paseo",
      "http://10.71.95.148:6769/app",
    ]);
  });

  test("accepts WS Relay service addresses independently from pairing addresses", async () => {
    const paseoHome = await createPaseoHome();

    const result = await setRelayConfig({
      home: paseoHome,
      endpoint: ["ws://192.168.1.20:6769"],
    });

    expect(result.endpoints).toEqual(["ws://192.168.1.20:6769"]);
  });

  test("rejects conflicting LAN Relay options", async () => {
    const paseoHome = await createPaseoHome();

    await expect(
      setRelayConfig({
        home: paseoHome,
        enableLanRelay: true,
        disableLanRelay: true,
      }),
    ).rejects.toThrow("Cannot combine --enable-lan-relay with --disable-lan-relay");
  });
});
