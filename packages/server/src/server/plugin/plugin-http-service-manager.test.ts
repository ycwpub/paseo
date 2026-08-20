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

  it("manages multiple listeners, runs a selected node, and exposes submit/query/delete APIs", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-managed-"));
    let now = new Date("2026-08-20T08:00:00.000Z");
    const runScript = vi.fn(async () => ({ id: "workflow-run-managed" }));
    manager = new PluginHttpServiceManager({
      paseoHome: tempRoot,
      logger: createTestLogger(),
      workflowService: {
        runScript,
        waitForRun: async () => ({
          status: "succeeded",
          outputPayload: JSON.stringify({ data: { answer: "ok" } }),
          error: null,
          errorCode: null,
          endedAt: now.toISOString(),
        }),
      },
      now: () => now,
    });
    await manager.reconcile([binding()]);

    const saved = await manager.saveProjectConfig({
      version: 1,
      pluginId: "demo-plugin",
      projectId: "project-1",
      listeners: [
        {
          id: "listener-1",
          name: "处理服务",
          enabled: true,
          host: "127.0.0.1",
          port: 0,
          defaultJobApi: {
            enabled: true,
            submitPath: "/jobs",
            queryPath: "/jobs/{requestId}",
            deletePath: "/jobs/{requestId}",
            workflowPath: "/tmp/processor.json",
            targetNodeId: "review",
            requestTemplate: '{"data":"{{request}}"}',
            responseTemplate: "",
          },
          routes: [],
          retention: {
            enabled: true,
            maxAgeSeconds: 60,
            statuses: ["succeeded"],
          },
        },
        {
          id: "listener-2",
          name: "停用服务",
          enabled: false,
          host: "127.0.0.1",
          port: 0,
          routes: [],
          retention: {
            enabled: false,
            maxAgeSeconds: 3600,
            statuses: ["succeeded"],
          },
        },
      ],
    });
    expect(saved.runtimes).toEqual([
      expect.objectContaining({ listenerId: "listener-1", status: "running" }),
      expect.objectContaining({ listenerId: "listener-2", status: "stopped" }),
    ]);
    const boundPort = saved.runtimes[0]!.boundPort!;
    const submit = await fetch(`http://127.0.0.1:${boundPort}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "hello" }),
    });
    const accepted = (await submit.json()) as { processId: string; statusUrl: string };
    await waitForSucceeded(accepted.statusUrl);
    expect(runScript).toHaveBeenCalledWith({
      scriptPath: "/tmp/processor.json",
      inputPayload: JSON.stringify({ data: { question: "hello" } }),
      targetNodeId: "review",
    });

    const remove = await fetch(`http://127.0.0.1:${boundPort}/jobs/${accepted.processId}`, {
      method: "DELETE",
    });
    expect(remove.status).toBe(200);
    expect(manager.getJob(accepted.processId)).toBeNull();

    const retained = await manager.submit("demo-plugin", "project-1:listener-1:default", {
      question: "cleanup",
    });
    for (
      let attempt = 0;
      attempt < 50 && manager.getJob(retained.id)?.status !== "succeeded";
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    now = new Date("2026-08-20T08:02:00.000Z");
    await expect(manager.cleanupProjectJobs("demo-plugin", "project-1")).resolves.toEqual([
      retained.id,
    ]);
  });
});
