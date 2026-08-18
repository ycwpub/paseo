import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PaseoMemoryState, PaseoMemoryUpdateInput } from "@getpaseo/protocol/messages";
import { memoryQueryKey } from "@/data/memory";
import { useReplicaQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

export function useMemory(serverId: string, options: { enabled?: boolean } = {}) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => memoryQueryKey(serverId), [serverId]);
  const query = useReplicaQuery({
    queryKey,
    pushEvent: "memory.changed",
    refetchInterval: 5_000,
    enabled: Boolean((options.enabled ?? true) && client && isConnected),
    queryFn: async () => {
      if (!client) throw new Error("Host is disconnected");
      const result = await client.getMemoryState();
      if (result.error || !result.memory) {
        throw new Error(result.error ?? "Memory is unavailable");
      }
      return result.memory;
    },
  });
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<PaseoMemoryState>) => operation(),
    onSuccess: (memory) => queryClient.setQueryData(queryKey, memory),
  });

  const updateMemory = useCallback(
    async (update: PaseoMemoryUpdateInput) => {
      if (!client) throw new Error("Host is disconnected");
      return mutation.mutateAsync(async () => {
        const result = await client.updateMemoryState(update);
        if (result.error || !result.memory) {
          throw new Error(result.error ?? "Memory update failed");
        }
        return result.memory;
      });
    },
    [client, mutation],
  );

  const clearMemory = useCallback(async () => {
    if (!client) throw new Error("Host is disconnected");
    return mutation.mutateAsync(async () => {
      const result = await client.clearMemory();
      if (result.error || !result.memory) {
        throw new Error(result.error ?? "Memory clear failed");
      }
      return result.memory;
    });
  }, [client, mutation]);

  return {
    memory: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    isConnected,
    updateMemory,
    clearMemory,
    isMutating: mutation.isPending,
    mutationError: mutation.error,
  };
}
