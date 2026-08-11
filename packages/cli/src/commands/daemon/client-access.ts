import path from "node:path";
import { Command } from "commander";
import {
  loadConfig,
  loadPersistedConfig,
  savePersistedConfig,
  type PersistedConfig,
} from "@getpaseo/server";
import type {
  CommandOptions,
  OutputOptions,
  OutputSchema,
  SingleResult,
} from "../../output/index.js";
import { withOutput } from "../../output/index.js";
import { addJsonOption } from "../../utils/command-options.js";
import { tryConnectToDaemon } from "../../utils/client.js";
import { resolveLocalDaemonState, resolveLocalPaseoHome } from "./local-daemon.js";

interface ClientAccessResult {
  action: "client_access_status" | "client_access_updated";
  applied: "live" | "next_start" | "current";
  requireApproval: boolean;
  configPath: string;
}

const clientAccessResultSchema: OutputSchema<ClientAccessResult> = {
  idField: "action",
  columns: [
    { header: "STATUS", field: "action" },
    {
      header: "CLIENT APPROVAL",
      field: (item) => (item.requireApproval ? "enabled" : "disabled"),
    },
    { header: "APPLIED", field: "applied" },
  ],
  renderHuman: (result, _options: OutputOptions) => {
    const data = result.data as ClientAccessResult;
    const state = data.requireApproval ? "enabled" : "disabled";
    if (data.action === "client_access_status") {
      return `Client approval validation is ${state}.\nConfig: ${data.configPath}`;
    }
    const applied =
      data.applied === "live" ? "applied immediately" : "saved for next daemon startup";
    return `Client approval validation ${state} (${applied}).\nConfig: ${data.configPath}`;
  },
};

function saveClientAccessConfig(paseoHome: string, requireApproval: boolean): void {
  const persisted = loadPersistedConfig(paseoHome);
  const next: PersistedConfig = {
    ...persisted,
    daemon: {
      ...persisted.daemon,
      clientAccess: {
        ...persisted.daemon?.clientAccess,
        requireApproval,
      },
    },
  };
  savePersistedConfig(paseoHome, next);
}

async function connectToRunningDaemon(paseoHome: string) {
  const state = resolveLocalDaemonState({ home: paseoHome });
  if (!state.running) return null;
  return tryConnectToDaemon({ host: state.listen, timeout: 1500 });
}

export async function getClientAccessConfig(options: {
  home?: string;
}): Promise<ClientAccessResult> {
  const paseoHome = resolveLocalPaseoHome(options.home);
  const client = await connectToRunningDaemon(paseoHome);
  let requireApproval: boolean;
  if (client) {
    try {
      requireApproval =
        (await client.getDaemonConfig()).config.clientAccess.requireApproval ?? false;
    } finally {
      await client.close().catch(() => undefined);
    }
  } else {
    requireApproval = loadConfig(paseoHome, { env: {} }).clientAccessRequireApproval ?? false;
  }
  return {
    action: "client_access_status",
    applied: "current",
    requireApproval,
    configPath: path.join(paseoHome, "config.json"),
  };
}

export async function setClientAccessConfig(
  requireApproval: boolean,
  options: { home?: string },
): Promise<ClientAccessResult> {
  const paseoHome = resolveLocalPaseoHome(options.home);
  const client = await connectToRunningDaemon(paseoHome);
  let applied: ClientAccessResult["applied"] = "next_start";
  if (client) {
    try {
      await client.patchDaemonConfig({ clientAccess: { requireApproval } });
      applied = "live";
    } finally {
      await client.close().catch(() => undefined);
    }
  } else {
    saveClientAccessConfig(paseoHome, requireApproval);
  }
  return {
    action: "client_access_updated",
    applied,
    requireApproval,
    configPath: path.join(paseoHome, "config.json"),
  };
}

async function runClientAccessStatusCommand(
  options: CommandOptions,
  _command: Command,
): Promise<SingleResult<ClientAccessResult>> {
  return {
    type: "single",
    data: await getClientAccessConfig({
      home: typeof options.home === "string" ? options.home : undefined,
    }),
    schema: clientAccessResultSchema,
  };
}

async function runClientAccessSetCommand(
  requireApproval: boolean,
  options: CommandOptions,
  _command: Command,
): Promise<SingleResult<ClientAccessResult>> {
  return {
    type: "single",
    data: await setClientAccessConfig(requireApproval, {
      home: typeof options.home === "string" ? options.home : undefined,
    }),
    schema: clientAccessResultSchema,
  };
}

async function runClientAccessEnableCommand(
  options: CommandOptions,
  command: Command,
): Promise<SingleResult<ClientAccessResult>> {
  return runClientAccessSetCommand(true, options, command);
}

async function runClientAccessDisableCommand(
  options: CommandOptions,
  command: Command,
): Promise<SingleResult<ClientAccessResult>> {
  return runClientAccessSetCommand(false, options, command);
}

export function createClientAccessCommand(): Command {
  const access = new Command("client-access").description("Configure client approval validation");

  addJsonOption(access.command("status").description("Show client approval validation status"))
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .action(withOutput(runClientAccessStatusCommand));

  addJsonOption(access.command("enable").description("Require approval for new external clients"))
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .action(withOutput(runClientAccessEnableCommand));

  addJsonOption(
    access.command("disable").description("Allow new external clients without approval"),
  )
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .action(withOutput(runClientAccessDisableCommand));

  return access;
}
