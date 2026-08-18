export const PLUGINS_QUERY_ROOT = "plugins";

export function pluginsQueryKey(serverId: string | null) {
  return [PLUGINS_QUERY_ROOT, serverId] as const;
}
