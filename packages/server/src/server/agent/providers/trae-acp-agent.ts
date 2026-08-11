import type { Logger } from "pino";

import { GenericACPAgentClient } from "./generic-acp-agent.js";
import { TRAE_MODES } from "./trae-acp-modes.js";

interface TraeACPAgentClientOptions {
  logger: Logger;
  command: [string, ...string[]];
  env?: Record<string, string>;
  providerId?: string;
  label?: string;
  providerParams?: unknown;
}

const TRAE_INITIAL_COMMANDS_WAIT_TIMEOUT_MS = 10_000;

export class TraeACPAgentClient extends GenericACPAgentClient {
  constructor(options: TraeACPAgentClientOptions) {
    super({
      logger: options.logger,
      command: options.command,
      env: options.env,
      providerId: options.providerId,
      label: options.label,
      providerParams: options.providerParams,
      // Some Trae CLI versions omit modes from ACP session/new even though
      // session/set_mode supports all three permission modes. Keep the known
      // CLI modes as a fallback so creation and mode switching remain usable.
      defaultModes: TRAE_MODES,
      // traecli publishes slash commands and skills asynchronously via available_commands_update.
      waitForInitialCommands: true,
      initialCommandsWaitTimeoutMs: TRAE_INITIAL_COMMANDS_WAIT_TIMEOUT_MS,
    });
  }
}
