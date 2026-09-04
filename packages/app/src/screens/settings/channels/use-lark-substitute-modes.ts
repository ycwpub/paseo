import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LarkSubstituteMode,
  LarkSubstituteModeCreateInput,
  LarkSubstituteModeUpdateInput,
} from "@getpaseo/protocol/messages";
import { useReplicaQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

function queryKey(serverId: string) {
  return ["lark-substitute-modes", serverId] as const;
}

export function useLarkSubstituteModes(serverId: string, queryEnabled = true) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const key = useMemo(() => queryKey(serverId), [serverId]);
  const query = useReplicaQuery({
    queryKey: key,
    pushEvent: "channel.lark.substitute.changed",
    enabled: queryEnabled && connected && Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error("主机未连接");
      const result = await client.listLarkSubstituteModes();
      if (result.error) throw new Error(result.error);
      return result.modes;
    },
  });

  useEffect(() => {
    if (!client || !queryEnabled) return;
    return client.on("channel.lark.substitute.changed", (message) => {
      queryClient.setQueryData(key, message.payload.modes);
    });
  }, [client, key, queryClient, queryEnabled]);

  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<LarkSubstituteMode[]>) => operation(),
    onSuccess: (modes) => queryClient.setQueryData(key, modes),
  });

  const create = useCallback(
    async (input: LarkSubstituteModeCreateInput) => {
      if (!client) throw new Error("主机未连接");
      let created: LarkSubstituteMode | null = null;
      await mutation.mutateAsync(async () => {
        const result = await client.createLarkSubstituteMode(input);
        if (result.error || !result.mode) {
          throw new Error(result.error ?? "替身模式创建失败");
        }
        created = result.mode;
        return result.modes;
      });
      if (!created) throw new Error("服务端未返回新建的替身模式");
      return created;
    },
    [client, mutation],
  );

  const update = useCallback(
    async (modeId: string, input: LarkSubstituteModeUpdateInput) => {
      if (!client) throw new Error("主机未连接");
      let updated: LarkSubstituteMode | null = null;
      await mutation.mutateAsync(async () => {
        const result = await client.updateLarkSubstituteMode({ modeId, mode: input });
        if (result.error || !result.mode) {
          throw new Error(result.error ?? "替身模式更新失败");
        }
        updated = result.mode;
        return result.modes;
      });
      if (!updated) throw new Error("服务端未返回更新后的替身模式");
      return updated;
    },
    [client, mutation],
  );

  const setEnabled = useCallback(
    async (modeId: string, nextEnabled: boolean) => {
      if (!client) throw new Error("主机未连接");
      let updated: LarkSubstituteMode | null = null;
      await mutation.mutateAsync(async () => {
        const result = await client.setLarkSubstituteModeEnabled({ modeId, enabled: nextEnabled });
        if (result.error || !result.mode) {
          throw new Error(result.error ?? "替身模式状态更新失败");
        }
        updated = result.mode;
        return result.modes;
      });
      if (!updated) throw new Error("服务端未返回更新后的替身模式");
      return updated;
    },
    [client, mutation],
  );

  const deleteMode = useCallback(
    async (modeId: string) => {
      if (!client) throw new Error("主机未连接");
      await mutation.mutateAsync(async () => {
        const result = await client.deleteLarkSubstituteMode({ modeId });
        if (result.error || !result.ok) {
          throw new Error(result.error ?? "替身模式删除失败");
        }
        return result.modes;
      });
    },
    [client, mutation],
  );

  return {
    modes: query.data ?? [],
    isLoading: query.isLoading,
    isMutating: mutation.isPending,
    error: query.error ?? mutation.error,
    create,
    update,
    setEnabled,
    deleteMode,
  };
}
