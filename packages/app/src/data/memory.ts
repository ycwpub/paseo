export const MEMORY_QUERY_ROOT = "memory";

export function memoryQueryKey(serverId: string | null) {
  return [MEMORY_QUERY_ROOT, serverId] as const;
}
