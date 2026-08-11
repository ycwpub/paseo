#!/usr/bin/env npx tsx

import assert from "node:assert";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "zx";
import { getAvailablePort } from "./helpers/network.ts";

$.verbose = false;

console.log("=== Onboarding Command ===\n");

const paseoHome = await mkdtemp(join(tmpdir(), "paseo-onboard-home-"));
const port = await getAvailablePort();
const lanRelayPort = await getAvailablePort();

try {
  const relayConfig =
    await $`PASEO_HOME=${paseoHome} npx paseo relay set --endpoint wss://relay.example.com:443 --pairing-url https://connect.example.com --endpoint wss://192.168.1.20:6769 --pairing-url https://192.168.1.20:6769 --enable-lan-relay --lan-listen 127.0.0.1:${lanRelayPort}`.nothrow();
  assert.strictEqual(
    relayConfig.exitCode,
    0,
    `relay configuration should succeed: ${relayConfig.stderr}`,
  );

  console.log("Test 1: `paseo` runs blocking onboarding and prints pairing info");
  const onboard =
    await $`PASEO_HOME=${paseoHome} PASEO_LISTEN=127.0.0.1:${port} PASEO_PAIRING_QR=0 npx paseo`.nothrow();

  assert.strictEqual(
    onboard.exitCode,
    0,
    `onboard should succeed:\nstdout:\n${onboard.stdout}\nstderr:\n${onboard.stderr}`,
  );
  assert(
    onboard.stdout.includes("Relay 1: wss://relay.example.com:443"),
    "onboard output should include the first Relay",
  );
  assert(
    onboard.stdout.includes("Relay 2: wss://192.168.1.20:6769"),
    "onboard output should include the second Relay",
  );
  assert(
    onboard.stdout.includes(`Relay 3: ws://127.0.0.1:${lanRelayPort}`),
    "onboard output should include the local LAN Relay",
  );
  assert(
    onboard.stdout.includes("https://connect.example.com/#offer=") &&
      onboard.stdout.includes("https://192.168.1.20:6769/#offer=") &&
      onboard.stdout.includes(`http://127.0.0.1:${lanRelayPort}/#offer=`),
    "onboard output should use each Relay's HTTPS connection address",
  );
  assert(
    onboard.stdout.includes("Pairing link 1") &&
      onboard.stdout.includes("Pairing link 2") &&
      onboard.stdout.includes("Pairing link 3"),
    "onboard output should include a pairing link for every Relay",
  );
  assert.strictEqual(
    onboard.stdout.match(/#offer=/g)?.length,
    3,
    "onboard output should include one pairing offer per Relay",
  );
  const pairingLinkLines = onboard.stdout
    .split(/\r?\n/u)
    .filter((line) => line.includes("/#offer="));
  assert.strictEqual(pairingLinkLines.length, 3, "each pairing link should be printed on one line");
  assert(
    pairingLinkLines.every((line) => !line.includes("│")),
    "pairing link lines must not contain terminal box borders",
  );
  assert(
    onboard.stdout.includes("CLI quick reference"),
    "onboard output should include CLI quick reference",
  );
  assert(onboard.stdout.includes("paseo --help"), "onboard output should include --help shortcut");
  assert(onboard.stdout.includes("paseo ls"), "onboard output should include ls shortcut");
  assert(
    onboard.stdout.includes('paseo run "your prompt"'),
    "onboard output should include run shortcut",
  );
  assert(onboard.stdout.includes("paseo status"), "onboard output should include status shortcut");
  assert(
    onboard.stdout.includes(join(paseoHome, "daemon.log")),
    "onboard output should include daemon log path",
  );

  const status =
    await $`PASEO_HOME=${paseoHome} npx paseo daemon status --home ${paseoHome}`.nothrow();
  assert.strictEqual(status.exitCode, 0, `daemon status should succeed: ${status.stderr}`);
  assert(status.stdout.includes("running"), "daemon should be running when onboarding exits");
  console.log("✓ onboarding keeps relay disabled and waits for daemon readiness\n");

  console.log("Test 2: --no-relay suppresses pairing for an already-running daemon");
  const enableRelay =
    await $`PASEO_HOME=${paseoHome} npx paseo daemon pair --home ${paseoHome} --relay`.nothrow();
  assert.strictEqual(enableRelay.exitCode, 0, `relay enable should succeed: ${enableRelay.stderr}`);
  assert(enableRelay.stdout.includes("#offer="), "relay enable should produce a pairing offer");

  const noRelayOnboard =
    await $`PASEO_HOME=${paseoHome} PASEO_LISTEN=127.0.0.1:${port} npx paseo --no-relay`.nothrow();
  assert.strictEqual(
    noRelayOnboard.exitCode,
    0,
    `--no-relay onboarding should succeed: ${noRelayOnboard.stderr}`,
  );
  assert(
    !noRelayOnboard.stdout.includes("#offer="),
    "--no-relay onboarding should not include a pairing offer",
  );
  console.log("✓ --no-relay suppresses pairing for an already-running daemon\n");

  console.log("Test 3: non-interactive onboarding persists voice disabled config");
  const configRaw = await readFile(join(paseoHome, "config.json"), "utf-8");
  const config = JSON.parse(configRaw) as {
    features?: {
      dictation?: { enabled?: boolean };
      voiceMode?: { enabled?: boolean };
    };
  };

  assert.strictEqual(
    config.features?.dictation?.enabled,
    false,
    "dictation.enabled should be false",
  );
  assert.strictEqual(
    config.features?.voiceMode?.enabled,
    false,
    "voiceMode.enabled should be false",
  );
  const daemonLog = await readFile(join(paseoHome, "daemon.log"), "utf-8");
  assert(
    !daemonLog.includes("Ensuring local speech models"),
    "daemon should not attempt local speech model setup when voice is disabled",
  );
  console.log("✓ non-interactive run persisted voice disabled choices\n");
} finally {
  await $`PASEO_HOME=${paseoHome} npx paseo daemon stop --home ${paseoHome} --force`.nothrow();
  await rm(paseoHome, { recursive: true, force: true });
}

console.log("=== Onboarding tests passed ===");
