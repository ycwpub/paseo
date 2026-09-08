import { useMemo } from "react";
import type { PluginState } from "@getpaseo/protocol/messages";
import { pluginsQueryKey } from "@/data/plugin";
import { useReplicaQueries } from "@/data/query";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import {
  prioritizePluginSidebarHosts,
  projectPluginSidebarCatalogs,
  selectPluginSidebarHost,
  type PluginHostCatalog,
} from "@/plugins/sidebar-panel/host-selection";
import { useHostFeatureMap } from "@/runtime/host-features";
import {
  getHostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  useHosts,
} from "@/runtime/host-runtime";

export function usePluginSidebarHost(
  currentServerId: string | null | undefined,
): PluginHostCatalog | null {
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const hostIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const candidateServerIds = useMemo(
    () => prioritizePluginSidebarHosts(currentServerId, localServerId, hostIds),
    [currentServerId, hostIds, localServerId],
  );
  const featureMap = useHostFeatureMap(candidateServerIds, "plugins");
  const connectionStatuses = useHostRuntimeConnectionStatuses(candidateServerIds);
  const runtimeStore = getHostRuntimeStore();
  const queries = useReplicaQueries<PluginState>(
    candidateServerIds.map((serverId) => {
      const client = runtimeStore.getSnapshot(serverId)?.client ?? null;
      const enabled =
        featureMap.get(serverId) === true && connectionStatuses.get(serverId) === "online";
      return {
        queryKey: pluginsQueryKey(serverId),
        pushEvent: "plugin.changed",
        enabled: enabled && Boolean(client),
        queryFn: async () => {
          if (!client) throw new Error("Host is disconnected");
          const result = await client.listUnifiedPlugins();
          if (result.error) throw new Error(result.error);
          return { plugins: result.plugins, marketplaces: result.marketplaces };
        },
      };
    }),
  );

  return useMemo(
    () =>
      selectPluginSidebarHost(
        projectPluginSidebarCatalogs(
          candidateServerIds,
          queries.map((query) => query.data),
          new Set(
            candidateServerIds.filter((serverId) => connectionStatuses.get(serverId) === "online"),
          ),
        ),
      ),
    [candidateServerIds, connectionStatuses, queries],
  );
}
