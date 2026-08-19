import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

export function pluginProjectsQueryKey(serverId: string, pluginId: string, appId: string) {
  return ["plugin-projects", serverId, pluginId, appId] as const;
}

export function usePluginProjects({
  active,
  supported,
  serverId,
  pluginId,
  appId,
}: {
  active: boolean;
  supported: boolean;
  serverId: string;
  pluginId: string | null | undefined;
  appId: string;
}) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  return useFetchQuery({
    queryKey: pluginProjectsQueryKey(serverId, pluginId ?? "", appId),
    enabled: active && supported && connected && Boolean(client && pluginId),
    dataShape: "list",
    queryFn: async () => {
      if (!client || !pluginId) throw new Error("Host is disconnected");
      const result = await client.listPluginAppProjects(pluginId, appId);
      if (result.error) throw new Error(result.error);
      return result.projects;
    },
    staleTimeMs: 5_000,
  });
}
