import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PluginHttpJob } from "@getpaseo/protocol/messages";

type DevelopmentMeegoClient = Pick<DaemonClient, "getPluginAppJob" | "submitPluginHttpService">;

const TERMINAL_STATUSES = new Set<PluginHttpJob["status"]>([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function jobError(job: PluginHttpJob): Error {
  return new Error(job.error ?? `Meego 请求失败：${job.status}`);
}

async function waitForPluginJob(
  client: DevelopmentMeegoClient,
  initialJob: PluginHttpJob,
): Promise<PluginHttpJob> {
  let job = initialJob;
  const deadline = Date.now() + 60_000;
  while (!TERMINAL_STATUSES.has(job.status)) {
    if (Date.now() >= deadline) throw new Error("Meego 请求超时，请重试");
    await sleep(500);
    const result = await client.getPluginAppJob(job.id);
    if (result.error || !result.job) {
      throw new Error(result.error ?? "Meego 请求记录不存在");
    }
    job = result.job;
  }
  if (job.status !== "succeeded") throw jobError(job);
  return job;
}

export async function runDevelopmentMeegoAction({
  client,
  pluginId,
  input,
}: {
  client: DevelopmentMeegoClient;
  pluginId: string;
  input: Record<string, unknown>;
}): Promise<unknown> {
  const submitted = await client.submitPluginHttpService({
    pluginId,
    serviceName: "meego-source",
    input,
  });
  if (submitted.error || !submitted.job) {
    throw new Error(submitted.error ?? "无法启动 Meego 请求");
  }
  const completed = await waitForPluginJob(client, submitted.job);
  return completed.result;
}
