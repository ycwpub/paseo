import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LarkGroupMessageProcessorTask,
  LarkGroupMessageProcessorTaskScanRange,
} from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

function queryKey(serverId: string, processorId: string) {
  return ["lark-group-message-processor-tasks", serverId, processorId] as const;
}

export function useLarkGroupMessageProcessorTasks(serverId: string, processorId: string) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const key = useMemo(() => queryKey(serverId, processorId), [processorId, serverId]);
  const query = useFetchQuery({
    queryKey: key,
    enabled: connected && Boolean(client) && Boolean(processorId),
    dataShape: "list",
    staleTimeMs: 2_000,
    refetchInterval: 3_000,
    queryFn: async () => {
      if (!client) throw new Error("主机未连接");
      const result = await client.listLarkGroupMessageProcessorTasks({ processorId });
      if (result.error) throw new Error(result.error);
      return result.tasks;
    },
  });
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<LarkGroupMessageProcessorTask[]>) => operation(),
    onSuccess: (tasks) => queryClient.setQueryData(key, tasks),
  });
  const scan = useMutation({
    mutationFn: async (scanRange: LarkGroupMessageProcessorTaskScanRange) => {
      if (!client) throw new Error("主机未连接");
      const result = await client.scanLarkGroupMessageProcessorTasks({ processorId, scanRange });
      if (result.error) throw new Error(result.error);
      queryClient.setQueryData(key, result.tasks);
      return result.scannedProcessorCount;
    },
  });
  const pauseTasks = useCallback(
    async (taskIds: string[]) => {
      if (!client) throw new Error("主机未连接");
      return mutation.mutateAsync(async () => {
        const result = await client.pauseLarkGroupMessageProcessorTasks({ processorId, taskIds });
        if (result.error) throw new Error(result.error);
        return result.tasks;
      });
    },
    [client, mutation, processorId],
  );
  const retryTasks = useCallback(
    async (taskIds: string[]) => {
      if (!client) throw new Error("主机未连接");
      return mutation.mutateAsync(async () => {
        const result = await client.retryLarkGroupMessageProcessorTasks({ processorId, taskIds });
        if (result.error) throw new Error(result.error);
        return result.tasks;
      });
    },
    [client, mutation, processorId],
  );
  const deleteTasks = useCallback(
    async (taskIds: string[]) => {
      if (!client) throw new Error("主机未连接");
      return mutation.mutateAsync(async () => {
        const result = await client.deleteLarkGroupMessageProcessorTasks({ processorId, taskIds });
        if (result.error) throw new Error(result.error);
        return result.tasks;
      });
    },
    [client, mutation, processorId],
  );
  return {
    tasks: (query.data ?? []) as LarkGroupMessageProcessorTask[],
    error: query.error ?? mutation.error ?? scan.error,
    isLoading: query.isLoading,
    isMutating: mutation.isPending,
    isScanning: scan.isPending,
    scanNow: scan.mutateAsync,
    pauseTasks,
    retryTasks,
    deleteTasks,
  };
}
