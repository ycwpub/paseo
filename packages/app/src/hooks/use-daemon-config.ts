import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";
import { useReplicaQuery } from "@/data/query";
import { daemonConfigQueryKey, normalizeMutableDaemonConfig } from "@/data/daemon-config";
import { daemonPairingQueryKey } from "@/data/daemon-pairing";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

interface UseDaemonConfigResult {
  config: MutableDaemonConfig | null;
  isLoading: boolean;
  patchConfig: (patch: MutableDaemonConfigPatch) => Promise<MutableDaemonConfig | undefined>;
}

export function useDaemonConfig(serverId: string | null): UseDaemonConfigResult {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(serverId ?? "");
  const isConnected = useHostRuntimeIsConnected(serverId ?? "");
  const queryKey = useMemo(() => daemonConfigQueryKey(serverId), [serverId]);

  const configQuery = useReplicaQuery({
    queryKey,
    enabled: Boolean(serverId && client && isConnected),
    pushEvent: "status:daemon_config_changed",
    queryFn: async () => {
      if (!client) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      const result = await client.getDaemonConfig();
      return normalizeMutableDaemonConfig(result.config);
    },
  });

  const patchConfig = useCallback(
    async (patch: MutableDaemonConfigPatch) => {
      if (!client) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      const result = await client.patchDaemonConfig(patch);
      const config = normalizeMutableDaemonConfig(result.config);
      queryClient.setQueryData(queryKey, config);
      if (patch.relay !== undefined) {
        void queryClient.invalidateQueries({ queryKey: daemonPairingQueryKey(serverId) });
      }
      return config;
    },
    [client, queryClient, queryKey, serverId, t],
  );
  const config = useMemo(
    () => (configQuery.data ? normalizeMutableDaemonConfig(configQuery.data) : null),
    [configQuery.data],
  );

  return {
    config,
    isLoading: configQuery.isLoading,
    patchConfig,
  };
}
