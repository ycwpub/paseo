import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LarkUserOAuthStatus } from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

function oauthQueryKey(serverId: string, appId: string) {
  return ["lark-user-oauth", serverId, appId] as const;
}

export function useLarkUserOAuth(serverId: string, appId: string) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const normalizedAppId = appId.trim();
  const queryKey = useMemo(
    () => oauthQueryKey(serverId, normalizedAppId),
    [normalizedAppId, serverId],
  );
  const queryClient = useQueryClient();
  const query = useFetchQuery({
    queryKey,
    enabled: Boolean(client && isConnected && normalizedAppId),
    retry: false,
    dataShape: "value",
    staleTimeMs: 30_000,
    queryFn: async () => {
      if (!client) throw new Error("主机未连接");
      const result = await client.getLarkUserOAuthStatus({ appId: normalizedAppId });
      if (result.error) throw new Error(result.error);
      if (!result.status) throw new Error("无法获取飞书用户授权状态");
      return result.status;
    },
  });

  const applyStatus = useCallback(
    (status: LarkUserOAuthStatus) => {
      queryClient.setQueryData(queryKey, status);
      return status;
    },
    [queryClient, queryKey],
  );

  const startMutation = useMutation({
    mutationFn: async (redirectUri: string) => {
      if (!client) throw new Error("主机未连接");
      const result = await client.startLarkUserOAuth({
        appId: normalizedAppId,
        redirectUri,
      });
      if (result.error) throw new Error(result.error);
      if (!result.authorizationUrl || !result.state) {
        throw new Error("飞书 OAuth 授权地址生成失败");
      }
      return { authorizationUrl: result.authorizationUrl, state: result.state };
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (input: { codeOrCallbackUrl: string; state: string }) => {
      if (!client) throw new Error("主机未连接");
      const result = await client.completeLarkUserOAuth({
        appId: normalizedAppId,
        codeOrCallbackUrl: input.codeOrCallbackUrl,
        state: input.state,
      });
      if (result.error) throw new Error(result.error);
      if (!result.status) throw new Error("飞书用户授权状态缺失");
      return result.status;
    },
    onSuccess: applyStatus,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("主机未连接");
      const result = await client.disconnectLarkUserOAuth({ appId: normalizedAppId });
      if (result.error) throw new Error(result.error);
      if (!result.status) throw new Error("飞书用户授权状态缺失");
      return result.status;
    },
    onSuccess: applyStatus,
  });

  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    start: startMutation.mutateAsync,
    complete: completeMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    isMutating:
      startMutation.isPending || completeMutation.isPending || disconnectMutation.isPending,
    mutationError:
      startMutation.error ?? completeMutation.error ?? disconnectMutation.error ?? null,
  };
}
