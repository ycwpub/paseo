import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentManager } from "../agent/agent-manager.js";
import type { ProviderSnapshotManager } from "../agent/provider-snapshot-manager.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { PluginAppService } from "./plugin-app-service.js";
import type { PluginHttpServiceRuntime } from "./plugin-http-runtime-types.js";

describe("PluginAppService", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("keeps an Agent conversation and stores the generated declarative interface", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-app-"));
    const service = new PluginAppService({
      paseoHome: tempRoot,
      logger: createTestLogger(),
      agentManager: {} as AgentManager,
      providerSnapshotManager: {} as Pick<ProviderSnapshotManager, "listProviders">,
      readDaemonConfig: () => ({}),
      httpRuntime: {
        reconcile: async () => undefined,
        getStatus: () => null,
        submit: async () => {
          throw new Error("unused");
        },
        getJob: () => null,
        listJobs: () => [],
        updateJob: async () => null,
        deleteJob: async () => false,
        stop: async () => undefined,
      },
      resolveApp: () => ({
        definition: { id: "dashboard", category: "Productivity" },
        pluginRoot: tempRoot!,
      }),
      listHttpTargets: () => [{ pluginId: "processor-plugin", serviceName: "processor" }],
      generate: async ({ prompt }) => ({
        message: `Created from: ${prompt}`,
        document: {
          version: 1,
          title: "Troubleshooting",
          components: [
            {
              id: "question",
              type: "text_input",
              label: "Question",
              required: true,
            },
            {
              id: "submit",
              type: "button",
              label: "Run",
              action: {
                type: "http_service",
                pluginId: "processor-plugin",
                serviceName: "processor",
                input: { question: "{{form.question}}" },
              },
            },
          ],
        },
      }),
      now: () => new Date("2026-08-18T10:00:00.000Z"),
    });

    const generated = await service.generate({
      pluginId: "ui-plugin",
      appId: "dashboard",
      prompt: "Build a troubleshooting form",
    });

    expect(generated.document?.title).toBe("Troubleshooting");
    expect(generated.conversation).toEqual([
      expect.objectContaining({ role: "user", content: "Build a troubleshooting form" }),
      expect.objectContaining({
        role: "assistant",
        content: "Created from: Build a troubleshooting form",
      }),
    ]);
    expect(service.get("ui-plugin", "dashboard")).toEqual(generated);
  });

  it("validates form fields and invokes a bound HTTP service action", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-app-action-"));
    const submit = vi.fn(async (pluginId: string, serviceName: string, input: unknown) => ({
      id: "00000000-0000-4000-8000-000000000001",
      pluginId,
      serviceName,
      status: "queued" as const,
      input,
      result: null,
      workflowRunId: null,
      error: null,
      errorCode: null,
      createdAt: "2026-08-18T10:00:00.000Z",
      startedAt: null,
      endedAt: null,
    }));
    const httpRuntime: PluginHttpServiceRuntime = {
      reconcile: async () => undefined,
      getStatus: () => null,
      submit,
      getJob: () => null,
      listJobs: () => [],
      updateJob: async () => null,
      deleteJob: async () => false,
      stop: async () => undefined,
    };
    const service = new PluginAppService({
      paseoHome: tempRoot,
      logger: createTestLogger(),
      agentManager: {} as AgentManager,
      providerSnapshotManager: {} as Pick<ProviderSnapshotManager, "listProviders">,
      readDaemonConfig: () => ({}),
      httpRuntime,
      resolveApp: () => ({
        definition: { id: "dashboard" },
        pluginRoot: tempRoot!,
      }),
      listHttpTargets: () => [],
      generate: async () => ({
        message: "Ready",
        document: {
          version: 1,
          title: "Form",
          components: [
            {
              id: "question",
              type: "text_input",
              label: "Question",
              required: true,
            },
            {
              id: "submit",
              type: "button",
              label: "Run",
              action: {
                type: "http_service",
                pluginId: "processor-plugin",
                serviceName: "processor",
                input: { question: "{{form.question}}", source: "app" },
              },
            },
          ],
        },
      }),
    });
    await service.generate({
      pluginId: "ui-plugin",
      appId: "dashboard",
      prompt: "Create it",
    });

    await expect(
      service.submit({
        pluginId: "ui-plugin",
        appId: "dashboard",
        componentId: "submit",
        form: {},
      }),
    ).rejects.toThrow("Required field is empty: Question");

    const job = await service.submit({
      pluginId: "ui-plugin",
      appId: "dashboard",
      componentId: "submit",
      form: { question: "Why is this failing?" },
    });
    expect(job.status).toBe("queued");
    expect(submit).toHaveBeenCalledWith("processor-plugin", "processor", {
      question: "Why is this failing?",
      source: "app",
    });
  });
});
