import { useMemo } from "react";
import { useFetchQuery } from "@/data/query";
import {
  getHostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  type HostRuntimeConnectionStatus,
} from "@/runtime/host-runtime";
import {
  loadPluginProjectHosts,
  type LoadedPluginProjectHosts,
  type PluginProjectLoadHost,
} from "./plugin-project-host-loader";

const EMPTY_RESULT: LoadedPluginProjectHosts = {
  availableHostIds: [],
  sources: [],
  hostErrors: [],
};

export function pluginProjectHostsQueryKey(
  serverIds: readonly string[],
  pluginId: string,
  appId: string,
) {
  return ["plugin-project-hosts", [...serverIds].sort().join("|"), pluginId, appId] as const;
}

function statusKey(
  serverIds: readonly string[],
  statuses: ReadonlyMap<string, HostRuntimeConnectionStatus>,
): string {
  return serverIds.map((serverId) => statuses.get(serverId) ?? "connecting").join("|");
}

export function usePluginProjectHosts(input: {
  active: boolean;
  hosts: readonly { serverId: string; label: string }[];
  pluginId: string | null | undefined;
  appId: string;
}) {
  const runtime = getHostRuntimeStore();
  const serverIds = useMemo(() => input.hosts.map((host) => host.serverId), [input.hosts]);
  const statuses = useHostRuntimeConnectionStatuses(serverIds);
  const connectionStatusKey = useMemo(() => statusKey(serverIds, statuses), [serverIds, statuses]);
  const loadHosts = useMemo<PluginProjectLoadHost[]>(
    () =>
      input.hosts.map((host) => ({
        ...host,
        online: statuses.get(host.serverId) === "online",
      })),
    [input.hosts, statuses],
  );
  const query = useFetchQuery({
    queryKey: [
      ...pluginProjectHostsQueryKey(serverIds, input.pluginId ?? "", input.appId),
      connectionStatusKey,
    ],
    enabled: input.active && Boolean(input.pluginId) && serverIds.length > 0,
    dataShape: "value",
    staleTimeMs: 5_000,
    queryFn: () =>
      loadPluginProjectHosts({
        hosts: loadHosts,
        pluginId: input.pluginId ?? "",
        appId: input.appId,
        getClient: (serverId) => {
          const client = runtime.getSnapshot(serverId)?.client;
          if (!client) return null;
          return {
            listUnifiedPlugins: () => client.listUnifiedPlugins(),
            listPluginAppProjects: (pluginId, appId) =>
              client.listPluginAppProjects(pluginId, appId),
          };
        },
      }),
  });

  return {
    ...query,
    data: query.data ?? EMPTY_RESULT,
  };
}
