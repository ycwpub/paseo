import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LarkSubstituteTask, LarkSubstituteTaskScanRange } from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

function queryKey(serverId: string, modeId: string) {
  return ["lark-substitute-tasks", serverId, modeId] as const;
}

export function useLarkSubstituteTasks(serverId: string, modeId: string, enabled = true) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const key = useMemo(() => queryKey(serverId, modeId), [modeId, serverId]);
  const query = useFetchQuery({
    queryKey: key,
    enabled: enabled && connected && Boolean(client) && Boolean(modeId),
    refetchInterval: 3_000,
    dataShape: "list",
    staleTimeMs: 2_000,
    queryFn: async () => {
      if (!client) throw new Error("主机未连接");
      const result = await client.listLarkSubstituteTasks({ modeId });
      if (result.error) throw new Error(result.error);
      return result.tasks;
    },
  });
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<LarkSubstituteTask[]>) => operation(),
    onSuccess: (tasks) => queryClient.setQueryData(key, tasks),
  });
  const scanMutation = useMutation({
    mutationFn: async (scanRange: LarkSubstituteTaskScanRange) => {
      if (!client) throw new Error("主机未连接");
      const result = await client.scanLarkSubstituteTasks({ modeId, scanRange });
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
        const result = await client.pauseLarkSubstituteTasks({ modeId, taskIds });
        if (result.error) throw new Error(result.error);
        return result.tasks;
      });
    },
    [client, modeId, mutation],
  );

  const deleteTasks = useCallback(
    async (taskIds: string[]) => {
      if (!client) throw new Error("主机未连接");
      return mutation.mutateAsync(async () => {
        const result = await client.deleteLarkSubstituteTasks({ modeId, taskIds });
        if (result.error) throw new Error(result.error);
        return result.tasks;
      });
    },
    [client, modeId, mutation],
  );

  const retryTasks = useCallback(
    async (taskIds: string[]) => {
      if (!client) throw new Error("主机未连接");
      return mutation.mutateAsync(async () => {
        const result = await client.retryLarkSubstituteTasks({ modeId, taskIds });
        if (result.error) throw new Error(result.error);
        return result.tasks;
      });
    },
    [client, modeId, mutation],
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
    retryTasks,
    deleteTasks,
  };
}
