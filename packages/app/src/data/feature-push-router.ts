import type { QueryClient } from "@tanstack/react-query";
import type { MutableDaemonConfig, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { daemonConfigQueryKey } from "@/data/daemon-config";
import { normalizeMutableDaemonConfig } from "@/data/daemon-config-normalization";
import { daemonPairingQueryKey } from "@/data/daemon-pairing-model";
import { larkChannelQueryKey } from "@/data/lark-channel";
import { mcpServersQueryKey } from "@/data/mcp";
import { pluginsQueryKey } from "@/data/plugin";
import { skillsQueryKey } from "@/data/skill";
import { teamsQueryKey } from "@/data/team";

type StatusMessage = Extract<SessionOutboundMessage, { type: "status" }>;
type LarkChannelStatusChangedMessage = Extract<
  SessionOutboundMessage,
  { type: "channel.lark.status_changed" }
>;
type FeaturePushEventType = StatusMessage["type"] | LarkChannelStatusChangedMessage["type"];

interface FeaturePushClient {
  on<TType extends FeaturePushEventType>(
    type: TType,
    handler: (message: Extract<SessionOutboundMessage, { type: TType }>) => void,
  ): () => void;
}

export function mountFeatureServerDataPushRouter(input: {
  client: FeaturePushClient;
  queryClient: QueryClient;
  serverId: string;
}): () => void {
  const unsubscribeDaemonConfig = input.client.on("status", (message) => {
    const payload = message.payload;
    if (!isDaemonConfigChangedPayload(payload)) return;
    input.queryClient.setQueryData<MutableDaemonConfig>(
      daemonConfigQueryKey(input.serverId),
      normalizeMutableDaemonConfig(payload.config),
    );
    void input.queryClient.invalidateQueries({
      queryKey: daemonPairingQueryKey(input.serverId),
    });
  });
  const unsubscribeLarkChannel = input.client.on("channel.lark.status_changed", (message) => {
    input.queryClient.setQueryData(larkChannelQueryKey(input.serverId), message.payload.status);
  });

  return () => {
    unsubscribeDaemonConfig();
    unsubscribeLarkChannel();
  };
}

export function invalidateFeatureServerDataQueriesAfterReconnect(input: {
  queryClient: QueryClient;
  serverId: string;
}): void {
  for (const queryKey of [
    daemonPairingQueryKey(input.serverId),
    larkChannelQueryKey(input.serverId),
    teamsQueryKey(input.serverId),
    mcpServersQueryKey(input.serverId),
    skillsQueryKey(input.serverId),
    pluginsQueryKey(input.serverId),
  ]) {
    void input.queryClient.invalidateQueries({ queryKey });
  }
}

function isDaemonConfigChangedPayload(
  payload: StatusMessage["payload"],
): payload is { status: "daemon_config_changed"; config: MutableDaemonConfig } {
  return (
    payload.status === "daemon_config_changed" &&
    typeof payload.config === "object" &&
    payload.config !== null
  );
}
