import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PluginInstallSource, PluginState, PluginSummary } from "@getpaseo/protocol/messages";
import { pluginsQueryKey } from "@/data/plugin";
import { useReplicaQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

const EMPTY_PLUGIN_STATE: PluginState = { plugins: [], marketplaces: [] };

export function usePlugins(serverId: string, options: { enabled?: boolean } = {}) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => pluginsQueryKey(serverId), [serverId]);
  const enabled = options.enabled ?? true;

  const query = useReplicaQuery({
    queryKey,
    pushEvent: "plugin.changed",
    enabled: enabled && Boolean(client && isConnected),
    queryFn: async () => {
      if (!client) throw new Error("Host is disconnected");
      const result = await client.listPlugins();
      if (result.error) throw new Error(result.error);
      return { plugins: result.plugins, marketplaces: result.marketplaces };
    },
  });

  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<PluginState>) => operation(),
    onSuccess: (state) => queryClient.setQueryData(queryKey, state),
  });

  const refresh = useCallback(async () => {
    if (!client) return Promise.reject(new Error("Host is disconnected"));
    await mutation.mutateAsync(async () => {
      const result = await client.listPlugins({ refresh: true });
      if (result.error) throw new Error(result.error);
      return { plugins: result.plugins, marketplaces: result.marketplaces };
    });
  }, [client, mutation]);

  const addMarketplace = useCallback(
    async (path: string) => {
      if (!client) return Promise.reject(new Error("Host is disconnected"));
      await mutation.mutateAsync(async () => {
        const result = await client.addPluginMarketplace(path);
        if (result.error) throw new Error(result.error);
        return { plugins: result.plugins, marketplaces: result.marketplaces };
      });
    },
    [client, mutation],
  );

  const removeMarketplace = useCallback(
    async (marketplaceId: string) => {
      if (!client) return Promise.reject(new Error("Host is disconnected"));
      await mutation.mutateAsync(async () => {
        const result = await client.removePluginMarketplace(marketplaceId);
        if (result.error) throw new Error(result.error);
        return { plugins: result.plugins, marketplaces: result.marketplaces };
      });
    },
    [client, mutation],
  );

  const installPlugin = useCallback(
    async (source: PluginInstallSource): Promise<PluginSummary> => {
      if (!client) return Promise.reject(new Error("Host is disconnected"));
      let installed: PluginSummary | null = null;
      await mutation.mutateAsync(async () => {
        const result = await client.installPlugin(source);
        if (result.error) throw new Error(result.error);
        installed = result.plugin;
        return result.state;
      });
      if (!installed) throw new Error("Plugin is unavailable");
      return installed;
    },
    [client, mutation],
  );

  const setPluginEnabled = useCallback(
    async (pluginId: string, nextEnabled: boolean) => {
      if (!client) return Promise.reject(new Error("Host is disconnected"));
      await mutation.mutateAsync(async () => {
        const result = await client.setPluginEnabled(pluginId, nextEnabled);
        if (result.error) throw new Error(result.error);
        return result.state;
      });
    },
    [client, mutation],
  );

  const uninstallPlugin = useCallback(
    async (pluginId: string) => {
      if (!client) return Promise.reject(new Error("Host is disconnected"));
      await mutation.mutateAsync(async () => {
        const result = await client.uninstallPlugin(pluginId);
        if (result.error) throw new Error(result.error);
        return { plugins: result.plugins, marketplaces: result.marketplaces };
      });
    },
    [client, mutation],
  );

  const state = query.data ?? EMPTY_PLUGIN_STATE;
  return {
    ...state,
    isLoading: query.isLoading,
    isConnected,
    error: query.error,
    isMutating: mutation.isPending,
    mutationError: mutation.error,
    refresh,
    addMarketplace,
    removeMarketplace,
    installPlugin,
    setPluginEnabled,
    uninstallPlugin,
  };
}
