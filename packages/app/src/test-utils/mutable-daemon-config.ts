import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";

export function createMutableDaemonConfig(
  overrides: Partial<MutableDaemonConfig> = {},
): MutableDaemonConfig {
  return {
    relay: {
      enabled: false,
      endpoints: [],
      pairingBaseUrls: [],
      local: {
        enabled: false,
        listen: "0.0.0.0:6769",
      },
    },
    mcp: { injectIntoAgents: false },
    browserTools: { enabled: false },
    externalProxy: { enabled: false },
    clientAccess: { requireApproval: true },
    projectIndexing: { updateIntervalMinutes: 1440 },
    providers: {},
    metadataGeneration: { providers: [] },
    autoArchiveAfterMerge: false,
    enableTerminalAgentHooks: false,
    appendSystemPrompt: "",
    ...overrides,
  };
}
