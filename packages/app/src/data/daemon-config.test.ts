import { describe, expect, it } from "vitest";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { normalizeMutableDaemonConfig } from "@/data/daemon-config";

const daemonConfig: MutableDaemonConfig = {
  mcp: { injectIntoAgents: true },
  browserTools: { enabled: false },
  clientAccess: { requireApproval: true },
  projectIndexing: { updateIntervalMinutes: 1440 },
  relay: {
    endpoints: [],
    pairingBaseUrls: [],
    local: { enabled: false, listen: "0.0.0.0:6769" },
  },
  providers: {},
  metadataGeneration: { providers: [] },
  autoArchiveAfterMerge: false,
  enableTerminalAgentHooks: false,
  appendSystemPrompt: "",
};

describe("normalizeMutableDaemonConfig", () => {
  it("fills relay arrays omitted by older daemons", () => {
    const legacyConfig = {
      ...daemonConfig,
      relay: {
        local: daemonConfig.relay.local,
      },
    } as unknown as MutableDaemonConfig;

    expect(normalizeMutableDaemonConfig(legacyConfig).relay).toEqual({
      endpoints: [],
      pairingBaseUrls: [],
      local: daemonConfig.relay.local,
    });
  });

  it("fills an omitted local relay config", () => {
    const legacyConfig = {
      ...daemonConfig,
      relay: {
        endpoints: daemonConfig.relay.endpoints,
        pairingBaseUrls: daemonConfig.relay.pairingBaseUrls,
      },
    } as unknown as MutableDaemonConfig;

    expect(normalizeMutableDaemonConfig(legacyConfig).relay.local).toEqual({
      enabled: false,
      listen: "0.0.0.0:6769",
    });
  });

  it("preserves current relay configuration and unknown fields", () => {
    const currentConfig = {
      ...daemonConfig,
      relay: {
        endpoints: [{ endpoint: "relay.example.com:443", useTls: true }],
        pairingBaseUrls: ["https://pairing.example.com"],
        local: {
          enabled: true,
          listen: "10.0.0.8:6769",
          pairingBaseUrl: "https://local.example.com",
        },
        futureRelayOption: "preserved",
      },
      futureDaemonOption: "preserved",
    } as MutableDaemonConfig;

    expect(normalizeMutableDaemonConfig(currentConfig)).toEqual(currentConfig);
  });
});
