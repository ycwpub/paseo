import { useMemo } from "react";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  DEVELOPMENT_PLUGIN_ID,
  DEVELOPMENT_SERVICE_NAME,
  developmentFlowFromJob,
  developmentFlowsFromJobs,
  developmentJobIsActive,
} from "./flow-model";

export function developmentFlowsQueryKey(serverId: string) {
  return ["plugin-development-flows", serverId, DEVELOPMENT_PLUGIN_ID] as const;
}

export function useDevelopmentFlows(input: {
  active: boolean;
  serverId: string;
  supported: boolean;
}) {
  const client = useHostRuntimeClient(input.serverId);
  const connected = useHostRuntimeIsConnected(input.serverId);
  const queryKey = useMemo(() => developmentFlowsQueryKey(input.serverId), [input.serverId]);
  return useFetchQuery({
    queryKey,
    enabled: input.active && input.supported && connected && Boolean(client),
    dataShape: "list",
    queryFn: async () => {
      if (!client) throw new Error("Host is disconnected");
      const result = await client.listPluginAppJobs({
        pluginId: DEVELOPMENT_PLUGIN_ID,
        serviceName: DEVELOPMENT_SERVICE_NAME,
        limit: 100,
      });
      if (result.error) throw new Error(result.error);
      return developmentFlowsFromJobs(result.jobs);
    },
    refetchInterval: (query) =>
      query.state.data?.some((flow) => developmentJobIsActive(flow.job)) ? 2_000 : false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    staleTimeMs: 5_000,
  });
}

export function prependDevelopmentFlow(
  current: ReturnType<typeof developmentFlowsFromJobs> | undefined,
  job: Parameters<typeof developmentFlowFromJob>[0],
) {
  const flow = developmentFlowFromJob(job);
  if (!flow) return current ?? [];
  return [flow, ...(current ?? []).filter((candidate) => candidate.id !== flow.id)];
}
