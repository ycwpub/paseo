import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LarkGroupMessageProcessor,
  LarkGroupMessageProcessorCreateInput,
  LarkGroupMessageProcessorUpdateInput,
} from "@getpaseo/protocol/messages";
import { useReplicaQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

function queryKey(serverId: string) {
  return ["lark-group-message-processors", serverId] as const;
}

export function useLarkGroupMessageProcessors(serverId: string, enabled = true) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const key = useMemo(() => queryKey(serverId), [serverId]);
  const query = useReplicaQuery({
    queryKey: key,
    pushEvent: "channel.lark.group_processor.changed",
    enabled: enabled && connected && Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error("主机未连接");
      const result = await client.listLarkGroupMessageProcessors();
      if (result.error) throw new Error(result.error);
      return result.processors;
    },
  });

  useEffect(() => {
    if (!client || !enabled) return;
    return client.on("channel.lark.group_processor.changed", (message) => {
      queryClient.setQueryData(key, message.payload.processors);
    });
  }, [client, enabled, key, queryClient]);

  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<LarkGroupMessageProcessor[]>) => operation(),
    onSuccess: (processors) => queryClient.setQueryData(key, processors),
  });

  const create = useCallback(
    async (input: LarkGroupMessageProcessorCreateInput) => {
      if (!client) throw new Error("主机未连接");
      let processor: LarkGroupMessageProcessor | null = null;
      await mutation.mutateAsync(async () => {
        const result = await client.createLarkGroupMessageProcessor(input);
        if (result.error || !result.processor) {
          throw new Error(result.error ?? "创建群消息处理器失败");
        }
        processor = result.processor;
        return result.processors;
      });
      if (!processor) throw new Error("服务端未返回新建的群消息处理器");
      return processor;
    },
    [client, mutation],
  );

  const update = useCallback(
    async (processorId: string, input: LarkGroupMessageProcessorUpdateInput) => {
      if (!client) throw new Error("主机未连接");
      let processor: LarkGroupMessageProcessor | null = null;
      await mutation.mutateAsync(async () => {
        const result = await client.updateLarkGroupMessageProcessor({
          processorId,
          processor: input,
        });
        if (result.error || !result.processor) {
          throw new Error(result.error ?? "更新群消息处理器失败");
        }
        processor = result.processor;
        return result.processors;
      });
      if (!processor) throw new Error("服务端未返回更新后的群消息处理器");
      return processor;
    },
    [client, mutation],
  );

  const setEnabled = useCallback(
    async (processorId: string, nextEnabled: boolean) => {
      if (!client) throw new Error("主机未连接");
      await mutation.mutateAsync(async () => {
        const result = await client.setLarkGroupMessageProcessorEnabled({
          processorId,
          enabled: nextEnabled,
        });
        if (result.error) throw new Error(result.error);
        return result.processors;
      });
    },
    [client, mutation],
  );

  const deleteProcessor = useCallback(
    async (processorId: string) => {
      if (!client) throw new Error("主机未连接");
      await mutation.mutateAsync(async () => {
        const result = await client.deleteLarkGroupMessageProcessor({ processorId });
        if (result.error || !result.ok) throw new Error(result.error ?? "删除群消息处理器失败");
        return result.processors;
      });
    },
    [client, mutation],
  );

  return {
    processors: query.data ?? [],
    isLoading: query.isLoading,
    isMutating: mutation.isPending,
    error: query.error ?? mutation.error,
    create,
    update,
    setEnabled,
    deleteProcessor,
  };
}
