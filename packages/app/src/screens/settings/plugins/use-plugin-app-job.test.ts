import type { PluginHttpJob } from "@getpaseo/protocol/messages";
import { describe, expect, it } from "vitest";
import {
  isTerminalPluginAppJob,
  loadPluginAppJob,
  pluginAppJobPollInterval,
} from "./use-plugin-app-job";

function createJob(status: PluginHttpJob["status"]): PluginHttpJob {
  return {
    id: "job-1",
    pluginId: "byte-development",
    serviceName: "development",
    status,
    input: {},
    result: null,
    workflowRunId: null,
    error: null,
    errorCode: null,
    createdAt: "2026-08-19T12:00:00.000Z",
    startedAt: null,
    endedAt: null,
  };
}

describe("plugin app job polling", () => {
  it("continues polling queued and running jobs", () => {
    expect(pluginAppJobPollInterval(createJob("queued"), false)).toBe(1_000);
    expect(pluginAppJobPollInterval(createJob("running"), false)).toBe(1_000);
  });

  it("stops polling terminal jobs and exhausted query failures", () => {
    for (const status of ["draft", "succeeded", "failed", "cancelled", "timed_out"] as const) {
      const job = createJob(status);
      expect(isTerminalPluginAppJob(job)).toBe(true);
      expect(pluginAppJobPollInterval(job, false)).toBe(false);
    }
    expect(pluginAppJobPollInterval(createJob("running"), true)).toBe(false);
  });

  it("loads the latest persisted job", async () => {
    const failedJob = { ...createJob("failed"), error: "node failed" };
    const client = {
      getPluginAppJob: async () => ({ job: failedJob, error: null }),
    };

    await expect(loadPluginAppJob(client, failedJob.id)).resolves.toEqual(failedJob);
  });

  it("reports missing and failed job queries", async () => {
    await expect(
      loadPluginAppJob(
        {
          getPluginAppJob: async () => ({ job: null, error: null }),
        },
        "missing",
      ),
    ).rejects.toThrow("任务不存在，可能是 daemon 已重启。");

    await expect(
      loadPluginAppJob(
        {
          getPluginAppJob: async () => ({ job: null, error: "daemon disconnected" }),
        },
        "job-1",
      ),
    ).rejects.toThrow("daemon disconnected");
  });
});
