import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LarkSubstituteTask } from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

function queryKey(serverId: string) {
  return ["lark-substitute-tasks", serverId] as const;
}

export function useLarkSubstituteTasks(serverId: string, enabled = true) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const key = useMemo(() => queryKey(serverId), [serverId]);
  const query = useFetchQuery({
    queryKey: key,
    enabled: enabled && connected && Boolean(client),
    refetchInterval: 3_000,
    dataShape: "list",
    staleTimeMs: 2_000,
    queryFn: async () => {
      if (!client) throw new Error("主机未连接");
      const result = await client.listLarkSubstituteTasks();
      if (result.error) throw new Error(result.error);
      return result.tasks;
    },
  });
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<LarkSubstituteTask[]>) => operation(),
    onSuccess: (tasks) => queryClient.setQueryData(key, tasks),
  });
  const scanMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("主机未连接");
      const result = await client.scanLarkSubstituteTasks();
      if (result.error) throw new Error(result.error);
      queryClient.setQueryData(key, result.tasks);
      return {
        enabledModeCount: result.enabledModeCount,
        groupScanCount: result.groupScanCount,
        privateScanCount: result.privateScanCount,
      };
    },
  });

  const pauseTasks = useCallback(
    async (taskIds: string[]) => {
      if (!client) throw new Error("主机未连接");
      return mutation.mutateAsync(async () => {
        const result = await client.pauseLarkSubstituteTasks({ taskIds });
        if (result.error) throw new Error(result.error);
        return result.tasks;
      });
    },
    [client, mutation],
  );

  const deleteTasks = useCallback(
    async (taskIds: string[]) => {
      if (!client) throw new Error("主机未连接");
      return mutation.mutateAsync(async () => {
        const result = await client.deleteLarkSubstituteTasks({ taskIds });
        if (result.error) throw new Error(result.error);
        return result.tasks;
      });
    },
    [client, mutation],
  );

  return {
    tasks: (query.data ?? []) as LarkSubstituteTask[],
    isLoading: query.isLoading,
    isMutating: mutation.isPending,
    error: query.error ?? mutation.error,
    isScanning: scanMutation.isPending,
    scanError: scanMutation.error,
    scanNow: scanMutation.mutateAsync,
    pauseTasks,
    deleteTasks,
  };
}
