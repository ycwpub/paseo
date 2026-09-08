import { useMemo } from "react";
import type { PluginState } from "@getpaseo/protocol/messages";
import { pluginsQueryKey } from "@/data/plugin";
import { useAuthoritativeReplicaQueries } from "@/data/query";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import {
  prioritizePluginSidebarHosts,
  projectPluginSidebarCatalogs,
  selectPluginSidebarHost,
  type PluginHostCatalog,
} from "@/plugins/sidebar-panel/host-selection";
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
  const connectionStatuses = useHostRuntimeConnectionStatuses(candidateServerIds);
  const runtimeStore = getHostRuntimeStore();
  // The sidebar is a navigation surface, so it must reconcile persisted replicas on mount instead
  // of letting an old empty catalog hide every plugin after an App restart.
  const queries = useAuthoritativeReplicaQueries<PluginState>(
    candidateServerIds.map((serverId) => {
      const client = runtimeStore.getSnapshot(serverId)?.client ?? null;
      // Read capability support from the live client. During a cold desktop start the Host runtime
      // can already be online while the separate Session store still has no server-info replica;
      // gating on that replica permanently skipped this query until the whole App was restarted.
      const advertisedPlugins = client?.getLastServerInfoMessage()?.features?.plugins;
      const enabled =
        Boolean(client) &&
        connectionStatuses.get(serverId) === "online" &&
        advertisedPlugins !== false;
      return {
        queryKey: pluginsQueryKey(serverId),
        pushEvent: "plugin.changed",
        enabled,
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
