import type { Logger } from "pino";
import { TRAEX_MODES } from "@getpaseo/protocol/provider-manifest";

import type { ProviderRuntimeSettings } from "../provider-launch-config.js";
import { TraeACPAgentClient } from "./trae-acp-agent.js";

export const TRAEX_DEFAULT_COMMAND: [string, ...string[]] = ["traex", "acp", "serve"];

interface TraexACPAgentClientOptions {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
  providerParams?: unknown;
}

export function resolveTraexACPCommand(
  runtimeSettings: ProviderRuntimeSettings | undefined,
): [string, ...string[]] {
  const command = runtimeSettings?.command;
  if (command?.mode === "replace") {
    const [executable, ...args] = command.argv;
    return [executable, ...args];
  }
  if (command?.mode === "append") {
    return [TRAEX_DEFAULT_COMMAND[0], ...TRAEX_DEFAULT_COMMAND.slice(1), ...(command.args ?? [])];
  }
  return [TRAEX_DEFAULT_COMMAND[0], ...TRAEX_DEFAULT_COMMAND.slice(1)];
}

/**
 * Built-in TraeX ACP provider.
 *
 * The transport and delayed command discovery behavior stay shared with the
 * legacy TRAE CLI adapter, while the built-in provider owns its launch command,
 * runtime overrides, identity, and current permission-mode fallback.
 */
export class TraexACPAgentClient extends TraeACPAgentClient {
  protected override readonly defaultModes = TRAEX_MODES;

  constructor(options: TraexACPAgentClientOptions) {
    super({
      logger: options.logger,
      command: resolveTraexACPCommand(options.runtimeSettings),
      env: options.runtimeSettings?.env,
      providerId: "traex",
      label: "TraeX",
      providerParams: options.providerParams,
    });
  }
}
