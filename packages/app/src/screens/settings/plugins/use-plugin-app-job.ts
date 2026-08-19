import type { PluginHttpJob } from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";

const POLL_INTERVAL_MS = 1_000;
const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "cancelled", "timed_out"]);

interface PluginAppJobClient {
  getPluginAppJob(processId: string): Promise<{ job: PluginHttpJob | null; error: string | null }>;
}

interface UsePluginAppJobInput {
  active: boolean;
  client: PluginAppJobClient | null;
  initialJob: PluginHttpJob | null;
  serverId: string;
}

export function isTerminalPluginAppJob(job: PluginHttpJob): boolean {
  return TERMINAL_JOB_STATUSES.has(job.status);
}

export function pluginAppJobPollInterval(
  job: PluginHttpJob | null,
  hasQueryError: boolean,
): number | false {
  if (hasQueryError || (job && isTerminalPluginAppJob(job))) {
    return false;
  }
  return POLL_INTERVAL_MS;
}

export async function loadPluginAppJob(
  client: PluginAppJobClient,
  processId: string,
): Promise<PluginHttpJob> {
  const response = await client.getPluginAppJob(processId);
  if (response.error) {
    throw new Error(response.error);
  }
  if (!response.job) {
    throw new Error("任务不存在，可能是 daemon 已重启。");
  }
  return response.job;
}

export function usePluginAppJob({ active, client, initialJob, serverId }: UsePluginAppJobInput) {
  const processId = initialJob?.id ?? null;
  return useFetchQuery({
    queryKey: ["plugin-app-job", serverId, processId],
    queryFn: async () => {
      if (!client || !processId) {
        throw new Error("插件任务查询不可用。");
      }
      return loadPluginAppJob(client, processId);
    },
    enabled: Boolean(active && client && processId),
    dataShape: "value",
    refetchInterval: (query) =>
      pluginAppJobPollInterval(query.state.data ?? null, query.state.status === "error"),
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 500,
    staleTimeMs: 0,
  });
}
