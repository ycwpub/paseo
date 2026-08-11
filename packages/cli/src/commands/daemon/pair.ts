import { confirm, isCancel, log } from "@clack/prompts";
import { Command } from "commander";
import chalk from "chalk";
import {
  generateLocalPairingOffer,
  getOrCreateServerId,
  loadConfig,
  resolvePaseoHome,
} from "@getpaseo/server";
import { tryConnectToDaemon } from "../../utils/client.js";
import { resolveLocalDaemonState } from "./local-daemon.js";
import { addJsonOption } from "../../utils/command-options.js";
import { formatPairingInstructions } from "../../output/pairing.js";

interface PairOptions {
  home?: string;
  json?: boolean;
  relay?: boolean;
}

export interface PairCommandDependencies {
  resolveOffer: typeof resolveLocalPairingOffer;
  confirmRelay: typeof confirmRelayPairing;
  printDirectGuidance: typeof printDirectConnectionGuidance;
  isInteractive: () => boolean;
  output: PairCommandOutput;
}

export interface PairCommandOutput {
  columns: number | undefined;
  writeStdout(message: string): void;
  writeStderr(message: string): void;
  setExitCode(code: number): void;
  success(message: string): void;
}

export interface PairingOffer {
  relayEnabled: boolean;
  url: string | null;
  qr: string | null;
}

const PAIRING_DAEMON_RPC_TIMEOUT_MS = 10_000;
const PAIRING_RECONCILE_POLL_MS = 100;

type ConnectedDaemonClient = NonNullable<Awaited<ReturnType<typeof tryConnectToDaemon>>>;

export async function getCompleteDaemonPairingOffer(
  client: ConnectedDaemonClient,
  timeoutMs: number = PAIRING_DAEMON_RPC_TIMEOUT_MS,
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
  const expectedOfferCount = expectedEndpoints.size;
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

export function pairCommand(): Command {
  return addJsonOption(new Command("pair").description("Print the daemon pairing QR code and link"))
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .option("--relay", "Enable relay without prompting")
    .action(async (_options: PairOptions, command: Command) => {
      await runPairCommand(command.optsWithGlobals());
    });
}

export async function resolveLocalPairingOffer(options: {
  paseoHome: string;
  enableRelay?: boolean;
}): Promise<PairingOffer> {
  const state = resolveLocalDaemonState({ home: options.paseoHome });
  const serverId = getOrCreateServerId(state.home);
  const daemonOffer = await resolveDaemonPairingOffer(state.listen, serverId, options.enableRelay);
  if (daemonOffer) return daemonOffer;

  if (state.running) {
    throw new Error(
      "The running daemon did not provide a pairing offer. Check daemon connectivity or update the daemon.",
    );
  }

  const paseoHome = resolvePaseoHome();
  const state = resolveLocalDaemonState({ home: paseoHome });

  // Try to get the pairing offer from the running daemon first.
  if (state.running) {
    const client = await tryConnectToDaemon({ host: state.listen, timeout: 1500 });
    if (client) {
      const supportsDaemonStatusRpc =
        client.getLastServerInfoMessage()?.features?.daemonStatusRpc === true;
      if (supportsDaemonStatusRpc) {
        try {
          const offer = await getCompleteDaemonPairingOffer(client, PAIRING_DAEMON_RPC_TIMEOUT_MS);
          await client.close().catch(() => {});
          outputPairingResult(
            {
              relayEnabled: offer.relayEnabled,
              url: offer.url,
              qr: offer.qr ?? null,
              offers: offer.offers,
            },
            options,
          );
          return;
        } catch {
          // COMPAT(daemon-rpc-rollout): fall back to CLI-side pairing generation while
          // old daemons lack daemonStatusRpc. Remove once the daemon floor is past
          // v0.1.76; pairing should come from daemon.get_pairing_offer.
        }
      }
      await client.close().catch(() => {});
    }
  }

  return generateLocalPairingOffer({
    paseoHome: options.paseoHome,
    relayEnabled: config.relayEnabled,
    relayEndpoints: config.relayEndpoints,
    relayPairingBaseUrls: config.relayPairingBaseUrls,
    relayEndpoint: config.relayEndpoint,
    relayPublicEndpoint: config.relayPublicEndpoint,
    relayUseTls: config.relayUseTls,
    relayPublicUseTls: config.relayPublicUseTls,
    appBaseUrl: config.appBaseUrl,
    includeQr: true,
  });
}

async function resolveDaemonPairingOffer(
  listen: string,
  expectedServerId: string,
  enableRelay: boolean | undefined,
): Promise<PairingOffer | null> {
  const client = await tryConnectToDaemon({
    host: listen,
    timeout: PAIRING_DAEMON_RPC_TIMEOUT_MS,
  });
  if (!client) return null;

  try {
    const serverInfo = client.getLastServerInfoMessage();
    if (serverInfo?.serverId.trim() !== expectedServerId) {
      throw new Error(
        "The reachable daemon belongs to a different Paseo home. Check --home or the daemon listen configuration.",
      );
    }
    if (serverInfo?.features?.daemonStatusRpc !== true) {
      throw new Error("Update the Paseo daemon before pairing from this command.");
    }

    let offer = await client.getDaemonPairingOffer({
      timeout: PAIRING_DAEMON_RPC_TIMEOUT_MS,
    });
    if (!offer.relayEnabled && enableRelay) {
      if (serverInfo.features.relayConfig !== true) {
        throw new Error("Update the Paseo daemon before enabling relay from this command.");
      }
      await client.patchDaemonConfig({ relay: { enabled: true } });
      offer = await client.getDaemonPairingOffer({
        timeout: PAIRING_DAEMON_RPC_TIMEOUT_MS,
      });
    }
    return {
      relayEnabled: offer.relayEnabled,
      url: offer.url || null,
      qr: offer.qr ?? null,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function confirmRelayPairing(): Promise<boolean> {
  log.message("Your connection is end-to-end encrypted. Paseo cannot read your code or messages.");
  log.message(`Learn how it works: ${RELAY_DOCS_URL}`);
  const answer = await confirm({
    message: "Enable relay to pair a device?",
    initialValue: false,
  });
  return !isCancel(answer) && answer;
}

export function printDirectConnectionGuidance(): void {
  console.log("Daemon is running with relay off.");
  console.log(
    "To connect another device directly, use the daemon's TCP address over your LAN, Tailscale, or another VPN.",
  );
  console.log(`Learn more: ${RELAY_DOCS_URL}#direct-connections`);
}

export async function runPairCommand(
  options: PairOptions,
  dependencyOverrides: Partial<PairCommandDependencies> = {},
): Promise<void> {
  if (options.home) process.env.PASEO_HOME = options.home;
  const dependencies: PairCommandDependencies = {
    resolveOffer: resolveLocalPairingOffer,
    confirmRelay: confirmRelayPairing,
    printDirectGuidance: printDirectConnectionGuidance,
    isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    output: createProcessOutput(),
    ...dependencyOverrides,
  };

  const paseoHome = resolvePaseoHome();
  let pairing = await dependencies.resolveOffer({
    paseoHome,
    enableRelay: options.relay === true,
  });

  const canPrompt = dependencies.isInteractive() && options.json !== true;
  if (!pairing.relayEnabled && canPrompt) {
    const shouldEnable = await dependencies.confirmRelay();
    if (!shouldEnable) {
      dependencies.printDirectGuidance();
      dependencies.output.writeStderr(`${chalk.yellow("No pairing QR was created.")}\n`);
      dependencies.output.setExitCode(1);
      return;
    }
    pairing = await dependencies.resolveOffer({ paseoHome, enableRelay: true });
    dependencies.output.success("Relay enabled");
  }

  outputPairingResult(pairing, options, dependencies.output);
}

function outputPairingResult(
  pairing: {
    relayEnabled: boolean;
    url: string | null;
    qr: string | null;
    offers: Array<{
      endpoint: string;
      useTls: boolean;
      pairingBaseUrl?: string;
      url: string;
      qr?: string | null;
    }>;
  },
  options: PairOptions,
  output: PairCommandOutput,
): void {
  if (!pairing.relayEnabled || !pairing.url) {
    if (options.json) {
      output.writeStderr(
        `${JSON.stringify({
          code: "RELAY_DISABLED",
          message: "Relay pairing is disabled for this daemon.",
          action: "Run paseo daemon pair --relay --json to enable it explicitly.",
        })}\n`,
      );
    } else {
      output.writeStderr(`${chalk.red("Relay pairing is disabled for this daemon.")}\n`);
      output.writeStderr(`${chalk.yellow("Run paseo daemon pair --relay to enable it.")}\n`);
    }
    output.setExitCode(1);
    return;
  }

  if (options.json) {
    output.writeStdout(
      `${JSON.stringify(
        {
          relayEnabled: pairing.relayEnabled,
          url: pairing.url,
          qr: pairing.qr,
          offers: pairing.offers,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const offerBlocks = pairing.offers
    .map((offer) => {
      const qrBlock = offer.qr ? `${offer.qr}\n` : "";
      const scheme = offer.useTls ? "wss" : "ws";
      return `\nRelay ${scheme}://${offer.endpoint}\n${qrBlock}${offer.url}\n`;
    })
    .join("");
  process.stdout.write(offerBlocks || `\nScan to pair:\n${pairing.qr ?? ""}\n${pairing.url}\n`);
}
