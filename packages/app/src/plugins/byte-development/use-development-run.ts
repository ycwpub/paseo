import { useMemo } from "react";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

export function useDevelopmentRun(input: {
  active: boolean;
  serverId: string;
  runId: string | null;
}) {
  const client = useHostRuntimeClient(input.serverId);
  const connected = useHostRuntimeIsConnected(input.serverId);
  const queryKey = useMemo(
    () => ["byte-development-workflow-run", input.serverId, input.runId] as const,
    [input.runId, input.serverId],
  );
  return useFetchQuery({
    queryKey,
    enabled: input.active && connected && Boolean(client && input.runId),
    dataShape: "value",
    queryFn: async () => {
      if (!client || !input.runId) throw new Error("Workflow Run 不可用");
      const result = await client.workflowGetRun({ runId: input.runId });
      if (result.error || !result.run) {
        throw new Error(result.error ?? "Workflow Run 不存在");
      }
      return result.run;
    },
    refetchInterval: (query) => (query.state.data?.status === "running" ? 2_000 : false),
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    staleTimeMs: 2_000,
  });
}
