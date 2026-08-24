#!/usr/bin/env npx tsx

/**
 * Phase 2: Daemon Command Tests
 *
 * Tests daemon commands with an isolated PASEO_HOME.
 *
 * Tests:
 * - daemon --help shows subcommands
 * - daemon pair does not create a relay offer without explicit consent
 * - daemon status reports stopped when daemon not running
 * - daemon status --json outputs valid JSON
 * - daemon stop handles daemon not running gracefully
 * - daemon restart starts the daemon and can be cleaned up
 * - daemon status probes the live relay state over local IPC
 */

import assert from "node:assert";
import { mkdtemp, readFile, rm, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runLocalPaseo } from "./helpers/local-cli.ts";
import { getAvailablePort } from "./helpers/network.ts";

console.log("=== Daemon Commands ===\n");

// Keep restart off default 6767 to avoid collisions with any existing daemon.
const port = await getAvailablePort();
const lanRelayPort = await getAvailablePort();
const paseoHome = await mkdtemp(join(tmpdir(), "paseo-test-home-"));

function daemonCommand(args: string[]) {
  return runLocalPaseo(["daemon", ...args], { PASEO_HOME: paseoHome });
}

try {
  // Test 1: daemon --help shows subcommands
  {
    console.log("Test 1: daemon --help shows subcommands");
    const result = await runLocalPaseo(["daemon", "--help"]);
    assert.strictEqual(result.exitCode, 0, "daemon --help should exit 0");
    assert(result.stdout.includes("start"), "help should mention start");
    assert(result.stdout.includes("status"), "help should mention status");
    assert(result.stdout.includes("stop"), "help should mention stop");
    assert(result.stdout.includes("restart"), "help should mention restart");
    assert(result.stdout.includes("pair"), "help should mention pair");
    assert(result.stdout.includes("relay"), "help should mention relay");
    console.log("✓ daemon --help shows subcommands\n");
  }

  // Test 2: non-interactive pairing keeps relay disabled by default
  {
    console.log("Test 2: relay config and daemon pair print every Relay");
    const configured = await runLocalPaseo(
      [
        "relay",
        "set",
        "--endpoint",
        "wss://relay.example.com:443",
        "--pairing-url",
        "https://connect.example.com",
        "--endpoint",
        "wss://192.168.1.20:6769",
        "--pairing-url",
        "https://192.168.1.20:6769",
      ],
      { PASEO_HOME: paseoHome },
    );
    assert.strictEqual(configured.exitCode, 0, "relay set should succeed");

    // Keep this isolated home away from a developer's already-running daemon.
    // Pairing intentionally rejects a reachable daemon owned by another home.
    const configPath = join(paseoHome, "config.json");
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    config.daemon = { ...config.daemon, listen: `127.0.0.1:${port}` };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

    const result = await daemonCommand(["pair"]);
    assert.strictEqual(result.exitCode, 0, "daemon pair should succeed");
    assert(
      result.stdout.includes("Relay wss://relay.example.com:443"),
      "output should include the public Relay",
    );
    assert(
      result.stdout.includes("Relay wss://192.168.1.20:6769"),
      "output should include the LAN Relay",
    );
    assert(
      result.stdout.includes("https://connect.example.com/#offer=") &&
        result.stdout.includes("https://192.168.1.20:6769/#offer="),
      "output should use each Relay's HTTPS connection address",
    );
    assert.strictEqual(
      result.stdout.match(/#offer=/g)?.length,
      4,
      "output should include every Relay and pairing frontend combination",
    );
    console.log("✓ relay config and daemon pair print every Relay\n");
  }

  // Test 3: daemon status reports stopped when daemon not running
  {
    console.log("Test 3: daemon status reports stopped when not running");
    const result = await daemonCommand(["status"]);
    assert.strictEqual(result.exitCode, 0, "status should succeed when daemon is stopped");
    const output = result.stdout.toLowerCase();
    assert(output.includes("local daemon"), "status table should include Local Daemon row");
    assert(output.includes("stopped"), "status should report stopped");
    console.log("✓ daemon status reports stopped when not running\n");
  }

  // Test 4: daemon pair --json exposes the machine-readable disabled state
  {
    console.log("Test 4: daemon pair --json reports relay disabled");
    const result = await daemonCommand(["pair", "--json"]);
    assert.strictEqual(result.exitCode, 0, "daemon pair --json should succeed");
    const pairing = JSON.parse(result.stdout);
    assert.strictEqual(pairing.relayEnabled, true, "pairing should report relay enabled");
    assert.match(pairing.url, /#offer=/, "pairing URL should include offer fragment");
    assert.strictEqual(typeof pairing.qr, "string", "pairing should include QR content");
    assert.strictEqual(
      pairing.offers.length,
      4,
      "pairing should include every Relay and pairing frontend combination",
    );
    assert.deepStrictEqual(
      pairing.offers.map(
        (offer: { endpoint: string; useTls: boolean; pairingBaseUrl: string }) => ({
          endpoint: offer.endpoint,
          useTls: offer.useTls,
          pairingBaseUrl: offer.pairingBaseUrl,
        }),
      ),
      [
        {
          endpoint: "relay.example.com:443",
          useTls: true,
          pairingBaseUrl: "https://connect.example.com",
        },
        {
          endpoint: "relay.example.com:443",
          useTls: true,
          pairingBaseUrl: "https://192.168.1.20:6769",
        },
        {
          endpoint: "192.168.1.20:6769",
          useTls: true,
          pairingBaseUrl: "https://connect.example.com",
        },
        {
          endpoint: "192.168.1.20:6769",
          useTls: true,
          pairingBaseUrl: "https://192.168.1.20:6769",
        },
      ],
    );
    assert(
      pairing.offers.every(
        (offer: { url?: unknown; qr?: unknown }) =>
          typeof offer.url === "string" &&
          offer.url.includes("#offer=") &&
          typeof offer.qr === "string",
      ),
      "every Relay should include its own pairing link and QR",
    );
    console.log("✓ daemon pair --json outputs valid JSON\n");
  }

  // Test 5: daemon status --json outputs valid JSON
  {
    console.log("Test 5: daemon status --json outputs JSON");
    const result = await daemonCommand(["status", "--json"]);
    assert.strictEqual(result.exitCode, 0, "--json status should succeed");
    const status = JSON.parse(result.stdout);
    assert.strictEqual(typeof status.serverId, "string", "json status should include serverId");
    assert.strictEqual(status.localDaemon, "stopped", "json status should report stopped");
    assert.strictEqual(status.home, paseoHome, "json status should reflect the isolated home");
    assert.strictEqual(
      status.hostname,
      null,
      "json status should include hostname when unavailable",
    );
    console.log("✓ daemon status --json outputs valid JSON\n");
  }

  // Test 6: daemon stop handles daemon not running gracefully
  {
    console.log("Test 6: daemon stop handles daemon not running");
    const result = await daemonCommand(["stop"]);
    // Stop should succeed even if daemon is not running (idempotent).
    assert.strictEqual(result.exitCode, 0, "stop should succeed when daemon not running");
    const output = result.stdout + result.stderr;
    const mentionsNotRunning =
      output.toLowerCase().includes("not running") ||
      output.toLowerCase().includes("was not running");
    assert(mentionsNotRunning, "output should mention daemon was not running");
    console.log("✓ daemon stop succeeds gracefully when daemon not running\n");
  }

  // Test 7: daemon restart starts daemon and can be stopped
  {
    console.log("Test 7: daemon restart starts daemon and can be stopped");
    const result = await daemonCommand(["restart", "--port", String(port)]);
    assert.strictEqual(result.exitCode, 0, "restart should succeed even when previously stopped");
    assert(result.stdout.toLowerCase().includes("restarted"), "output should report restart");

    const liveRelayUpdate = await daemonCommand([
      "relay",
      "set",
      "--enable-lan-relay",
      "--lan-listen",
      `127.0.0.1:${lanRelayPort}`,
      "--json",
    ]);
    assert.strictEqual(liveRelayUpdate.exitCode, 0, "live Relay update should succeed");
    assert.strictEqual(
      JSON.parse(liveRelayUpdate.stdout).applied,
      "live",
      "running daemon should apply Relay settings immediately",
    );

    let lanRelayPairing:
      | {
          offers?: Array<{ endpoint?: string }>;
        }
      | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const pairingResult = await daemonCommand(["pair", "--json"]);
      assert.strictEqual(pairingResult.exitCode, 0, "pairing should succeed after live update");
      lanRelayPairing = JSON.parse(pairingResult.stdout);
      if (lanRelayPairing.offers?.some((offer) => offer.endpoint === `127.0.0.1:${lanRelayPort}`)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(
      lanRelayPairing?.offers?.some((offer) => offer.endpoint === `127.0.0.1:${lanRelayPort}`),
      "pairing output should include the live LAN Relay",
    );

    const cleanup = await daemonCommand(["stop", "--force"]);
    assert.strictEqual(cleanup.exitCode, 0, "cleanup stop should succeed after restart");
    console.log("✓ daemon restart starts and stop cleanup succeeds\n");
  }

  // Test 8: status uses the running daemon as relay authority over local IPC
  {
    console.log("Test 8: daemon status probes live relay state over local IPC");
    const listen =
      process.platform === "win32"
        ? `\\\\.\\pipe\\paseo-status-${process.pid}-${Date.now()}`
        : join(paseoHome, "status.sock");
    const start = await daemonCommand(["start", "--listen", listen, "--relay"]);
    assert.strictEqual(start.exitCode, 0, `IPC daemon should start: ${start.stderr}`);

    const configPath = join(paseoHome, "config.json");
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    config.daemon = { ...config.daemon, listen };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
    const pidPath = join(paseoHome, "paseo.pid");
    const pidContents = await readFile(pidPath, "utf-8");
    await unlink(pidPath);
    const status = await daemonCommand(["status", "--json"]);
    const pairing = await daemonCommand(["pair", "--json"]);
    await writeFile(pidPath, pidContents, "utf-8");
    assert.strictEqual(status.exitCode, 0, `IPC daemon status should succeed: ${status.stderr}`);
    const payload = JSON.parse(status.stdout);
    assert.strictEqual(payload.connectedDaemon, "reachable", "IPC daemon should be reachable");
    assert.strictEqual(payload.localDaemon, "stopped", "missing PID should report stopped locally");
    assert.notStrictEqual(payload.relay, "disabled", "status should use live relay state");
    assert.strictEqual(pairing.exitCode, 0, `IPC daemon pairing should succeed: ${pairing.stderr}`);
    const pairingPayload = JSON.parse(pairing.stdout);
    assert.strictEqual(pairingPayload.relayEnabled, true, "pairing should use live relay state");
    assert.match(pairingPayload.url, /#offer=/, "pairing should use the live daemon offer");

    const foreignHome = await mkdtemp(join(tmpdir(), "paseo-test-foreign-home-"));
    try {
      await writeFile(
        join(foreignHome, "config.json"),
        `${JSON.stringify({ daemon: { listen } }, null, 2)}\n`,
        "utf-8",
      );
      const foreignPairing = await runLocalPaseo(
        ["daemon", "pair", "--home", foreignHome, "--json"],
        { PASEO_HOME: foreignHome },
      );
      assert.notStrictEqual(
        foreignPairing.exitCode,
        0,
        "pairing should reject a daemon owned by another home",
      );
      assert(
        foreignPairing.stderr.includes("different Paseo home"),
        "pairing should explain the daemon identity mismatch",
      );
      assert(!foreignPairing.stdout.includes("#offer="), "pairing should not expose another offer");
    } finally {
      await rm(foreignHome, { recursive: true, force: true });
    }

    const cleanup = await daemonCommand(["stop", "--force"]);
    assert.strictEqual(cleanup.exitCode, 0, "cleanup stop should succeed after IPC status");
    console.log("✓ daemon status probes live relay state over local IPC\n");
  }

  // Test 9: --relay accepts an already-enabled persisted relay while stopped
  {
    console.log("Test 9: daemon pair --relay accepts persisted relay while stopped");
    const configPath = join(paseoHome, "config.json");
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    config.daemon = {
      ...config.daemon,
      relay: { ...config.daemon?.relay, enabled: true },
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

    const pairing = await daemonCommand(["pair", "--relay", "--json"]);

    assert.strictEqual(
      pairing.exitCode,
      0,
      `persisted relay pairing should succeed while stopped: ${pairing.stderr}`,
    );
    const payload = JSON.parse(pairing.stdout);
    assert.strictEqual(payload.relayEnabled, true, "pairing should preserve persisted relay state");
    assert.match(payload.url, /#offer=/, "pairing should include the offline offer");
    console.log("✓ daemon pair --relay accepts persisted relay while stopped\n");
  }
} finally {
  // Best-effort daemon cleanup in case assertions fail before explicit stop.
  await daemonCommand(["stop", "--force"]);
  // Clean up temp directory
  await rm(paseoHome, { recursive: true, force: true });
}

console.log("=== All daemon tests passed ===");
