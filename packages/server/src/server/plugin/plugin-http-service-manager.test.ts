import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { PluginHttpServiceManager } from "./plugin-http-service-manager.js";
import type { PluginHttpServiceBinding } from "./plugin-http-runtime-types.js";

function binding(overrides: Partial<PluginHttpServiceBinding["definition"]> = {}) {
  return {
    pluginId: "demo-plugin",
    pluginName: "Demo Plugin",
    definition: {
      name: "processor",
      host: "127.0.0.1",
      port: 0,
      path: "/process",
      workflowPath: "/tmp/processor.json",
      maxBodyBytes: 1024 * 1024,
      ...overrides,
    },
  } satisfies PluginHttpServiceBinding;
}

async function waitForSucceeded(statusUrl: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(statusUrl);
    const job = (await response.json()) as Record<string, unknown>;
    if (job.status === "succeeded") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("HTTP processing job did not finish");
}

describe("PluginHttpServiceManager", () => {
  let tempRoot: string | null = null;
  let manager: PluginHttpServiceManager | null = null;

  afterEach(async () => {
    await manager?.stop();
    manager = null;
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("accepts a request, returns a process ID, and persists the workflow result", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-manager-"));
    manager = new PluginHttpServiceManager({
      paseoHome: tempRoot,
      logger: createTestLogger(),
      workflowService: {
        runScript: async ({ inputPayload }) => {
          expect(JSON.parse(inputPayload)).toEqual({ question: "hello" });
          return { id: "workflow-run-1" };
        },
        waitForRun: async () => ({
          status: "succeeded",
          outputPayload: JSON.stringify({ data: { answer: "world" } }),
          error: null,
          errorCode: null,
          endedAt: "2026-08-18T08:05:00.000Z",
        }),
      },
      now: () => new Date("2026-08-18T08:00:00.000Z"),
    });

    await manager.reconcile([binding()]);
    const status = manager.getStatus("demo-plugin", "processor");
    expect(status).toMatchObject({ status: "running", boundPort: expect.any(Number) });

    const submit = await fetch(status!.submitUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "hello" }),
    });
    expect(submit.status).toBe(202);
    const accepted = (await submit.json()) as {
      processId: string;
      status: string;
      statusUrl: string;
    };
    expect(accepted).toMatchObject({
      processId: expect.any(String),
      status: "queued",
      statusUrl: expect.stringContaining("/process/"),
    });

    const job = await waitForSucceeded(accepted.statusUrl);
    expect(job).toMatchObject({
      id: accepted.processId,
      workflowRunId: "workflow-run-1",
      result: { data: { answer: "world" } },
      endedAt: "2026-08-18T08:05:00.000Z",
    });
  });

  it("requires bearer-token configuration for non-loopback listeners", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-auth-"));
    manager = new PluginHttpServiceManager({
      paseoHome: tempRoot,
      logger: createTestLogger(),
      workflowService: {
        runScript: async () => ({ id: "unused" }),
        waitForRun: async () => {
          throw new Error("unused");
        },
      },
    });

    await manager.reconcile([binding({ host: "0.0.0.0" })]);

    expect(manager.getStatus("demo-plugin", "processor")).toMatchObject({
      status: "error",
      error: "Non-loopback HTTP services require authTokenEnv",
    });
  });

  it("writes configured workflow memory only after a successful run", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-memory-"));
    const memoryWriter = { write: vi.fn(async () => undefined) };
    manager = new PluginHttpServiceManager({
      paseoHome: tempRoot,
      logger: createTestLogger(),
      workflowService: {
        runScript: async () => ({ id: "workflow-run-memory" }),
        waitForRun: async () => ({
          status: "succeeded",
          outputPayload: JSON.stringify({ memory: { targets: [], entries: [] } }),
          error: null,
          errorCode: null,
          endedAt: "2026-08-18T08:05:00.000Z",
        }),
      },
      memoryWriter,
    });

    await manager.reconcile([binding({ memory: { outputPath: "memory" } })]);
    const job = await manager.submit("demo-plugin", "processor", {});
    for (
      let attempt = 0;
      attempt < 50 && memoryWriter.write.mock.calls.length === 0;
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(manager.getJob(job.id)?.status).toBe("succeeded");
    expect(memoryWriter.write).toHaveBeenCalledWith({
      pluginId: "demo-plugin",
      serviceName: "processor",
      outputPath: "memory",
      result: { memory: { targets: [], entries: [] } },
    });
  });

  it("does not write workflow memory after a failed run", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-memory-failed-"));
    const memoryWriter = { write: vi.fn(async () => undefined) };
    manager = new PluginHttpServiceManager({
      paseoHome: tempRoot,
      logger: createTestLogger(),
      workflowService: {
        runScript: async () => ({ id: "workflow-run-failed" }),
        waitForRun: async () => ({
          status: "failed",
          outputPayload: null,
          error: "workflow failed",
          errorCode: "WORKFLOW_FAILED",
          endedAt: "2026-08-18T08:05:00.000Z",
        }),
      },
      memoryWriter,
    });

    await manager.reconcile([binding({ memory: { outputPath: "memory" } })]);
    const job = await manager.submit("demo-plugin", "processor", {});
    for (
      let attempt = 0;
      attempt < 50 && ["queued", "running"].includes(manager.getJob(job.id)?.status ?? "");
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(manager.getJob(job.id)?.status).toBe("failed");
    expect(memoryWriter.write).not.toHaveBeenCalled();
  });

  it("edits and deletes completed jobs but protects active jobs", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-mutation-"));
    let finishRun:
      | ((value: {
          status: "succeeded";
          outputPayload: string;
          error: null;
          errorCode: null;
          endedAt: string;
        }) => void)
      | null = null;
    const completedRun = new Promise<{
      status: "succeeded";
      outputPayload: string;
      error: null;
      errorCode: null;
      endedAt: string;
    }>((resolve) => {
      finishRun = resolve;
    });
    manager = new PluginHttpServiceManager({
      paseoHome: tempRoot,
      logger: createTestLogger(),
      workflowService: {
        runScript: async () => ({ id: "workflow-run-mutation" }),
        waitForRun: async () => completedRun,
      },
    });

    await manager.reconcile([binding()]);
    const job = await manager.submit("demo-plugin", "processor", { title: "旧标题" });
    for (
      let attempt = 0;
      attempt < 50 && manager.getJob(job.id)?.status !== "running";
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await expect(manager.updateJob(job.id, { title: "新标题" })).rejects.toThrow(
      "cannot be edited",
    );
    await expect(manager.deleteJob(job.id)).rejects.toThrow("cannot be deleted");

    finishRun?.({
      status: "succeeded",
      outputPayload: JSON.stringify({ data: { ok: true } }),
      error: null,
      errorCode: null,
      endedAt: "2026-08-19T12:00:00.000Z",
    });
    for (
      let attempt = 0;
      attempt < 50 && manager.getJob(job.id)?.status !== "succeeded";
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await expect(manager.updateJob(job.id, { title: "新标题" })).resolves.toMatchObject({
      input: { title: "新标题" },
    });
    await expect(manager.deleteJob(job.id)).resolves.toBe(true);
    expect(manager.getJob(job.id)).toBeNull();
  });
});
