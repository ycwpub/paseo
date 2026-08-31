import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { MutableDaemonConfig, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { daemonConfigQueryKey } from "@/data/daemon-config";
import { daemonPairingQueryKey } from "@/data/daemon-pairing-model";
import {
  invalidateFeatureServerDataQueriesAfterReconnect,
  mountFeatureServerDataPushRouter,
} from "@/data/feature-push-router";
import { larkChannelQueryKey } from "@/data/lark-channel";
import { mcpServersQueryKey } from "@/data/mcp";
import { pluginsQueryKey } from "@/data/plugin";
import { skillsQueryKey } from "@/data/skill";
import { teamsQueryKey } from "@/data/team";

type FeatureMessage = Extract<
  SessionOutboundMessage,
  { type: "status" | "channel.lark.status_changed" }
>;
type FeatureMessageType = FeatureMessage["type"];

function createFeaturePushClient() {
  const handlers = new Map<FeatureMessageType, Set<(message: never) => void>>();
  return {
    client: {
      on<TType extends FeatureMessageType>(
        type: TType,
        handler: (message: Extract<FeatureMessage, { type: TType }>) => void,
      ) {
        const listeners = handlers.get(type) ?? new Set();
        listeners.add(handler as (message: never) => void);
        handlers.set(type, listeners);
        return () => listeners.delete(handler as (message: never) => void);
      },
    },
    emit(message: FeatureMessage) {
      for (const handler of handlers.get(message.type) ?? []) {
        handler(message as never);
      }
    },
  };
}

describe("feature server data push router", () => {
  it("normalizes daemon config and routes Lark status until detached", () => {
    const queryClient = new QueryClient();
    const fake = createFeaturePushClient();
    const serverId = "server-1";
    const pairingKey = daemonPairingQueryKey(serverId);
    queryClient.setQueryData(pairingKey, []);
    const unmount = mountFeatureServerDataPushRouter({
      client: fake.client,
      queryClient,
      serverId,
    });
    const legacyConfig = {
      mcp: { injectIntoAgents: true },
      browserTools: { enabled: false },
      clientAccess: { requireApproval: true },
      projectIndexing: { updateIntervalMinutes: 1440 },
      relay: { local: { enabled: true, listen: "10.0.0.8:6769" } },
      providers: {},
      metadataGeneration: { providers: [] },
      autoArchiveAfterMerge: false,
      enableTerminalAgentHooks: false,
      appendSystemPrompt: "",
    } as unknown as MutableDaemonConfig;

    fake.emit({
      type: "status",
      payload: { status: "daemon_config_changed", config: legacyConfig },
    });
    fake.emit({
      type: "channel.lark.status_changed",
      payload: {
        status: {
          enabled: true,
          connectionStatus: "connected",
          error: null,
          appId: null,
          hasAppSecret: false,
          hasEncryptKey: false,
          hasVerificationToken: false,
          domain: "feishu",
          target: { kind: "workspace", cwd: null, workspaceId: null },
          substitute: { enabled: false, openId: null, name: null },
          bot: null,
          pendingPairings: [],
          authorizedUsers: [],
          activeBotId: null,
          bots: [],
        },
      },
    });

    expect(
      queryClient.getQueryData<MutableDaemonConfig>(daemonConfigQueryKey(serverId))?.relay,
    ).toEqual({
      endpoints: [],
      pairingBaseUrls: [],
      local: { enabled: true, listen: "10.0.0.8:6769" },
    });
    expect(queryClient.getQueryState(pairingKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(larkChannelQueryKey(serverId))).toMatchObject({
      connectionStatus: "connected",
    });

    unmount();
  });

  it("invalidates feature-owned query roots after reconnect", () => {
    const queryClient = new QueryClient();
    const serverId = "server-1";
    const keys = [
      daemonPairingQueryKey(serverId),
      larkChannelQueryKey(serverId),
      teamsQueryKey(serverId),
      mcpServersQueryKey(serverId),
      skillsQueryKey(serverId),
      pluginsQueryKey(serverId),
    ];
    for (const key of keys) queryClient.setQueryData(key, {});

    invalidateFeatureServerDataQueriesAfterReconnect({ queryClient, serverId });

    for (const key of keys) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
