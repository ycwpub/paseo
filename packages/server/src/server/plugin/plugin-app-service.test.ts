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
        definition: {
          id: "dashboard",
          category: "Productivity",
          project: {
            idField: "projectId",
            selectorLabel: "Project",
            selectorDescription: "Project context",
            createNameLabel: "New Project name",
            createNamePlaceholder: "Name",
          },
        },
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

    const configured = service.configure({
      pluginId: "ui-plugin",
      appId: "dashboard",
      projectId: "project-1",
      defaultAgent: { provider: "codex", model: "gpt-5.6" },
    });
    expect(configured.defaultAgent).toEqual({ provider: "codex", model: "gpt-5.6" });

    const generated = await service.generate({
      pluginId: "ui-plugin",
      appId: "dashboard",
      projectId: "project-1",
      prompt: "Build a troubleshooting form",
    });

    expect(generated.document?.title).toBe("Troubleshooting");
    expect(generated.conversation).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Build a troubleshooting form",
      }),
      expect.objectContaining({
        role: "assistant",
        content: "Created from: Build a troubleshooting form",
      }),
    ]);
    expect(service.get("ui-plugin", "dashboard", "project-1")).toEqual(generated);
    expect(generated.projectId).toBe("project-1");
    expect(service.get("ui-plugin", "dashboard", "project-2")).toMatchObject({
      projectId: "project-2",
      defaultAgent: null,
      document: null,
      conversation: [],
    });
    expect(service.listProjects("ui-plugin", "dashboard")).toEqual([generated]);
    expect(service.deleteProject("ui-plugin", "dashboard", "project-1")).toBe(true);
    expect(service.listProjects("ui-plugin", "dashboard")).toEqual([]);
  });

  it("does not run Agent generation before the plugin project is saved", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-app-unconfigured-"));
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
        definition: { id: "dashboard" },
        pluginRoot: tempRoot!,
      }),
      listHttpTargets: () => [],
      generate: async () => {
        throw new Error("generation should not start");
      },
    });

    await expect(
      service.generate({
        pluginId: "ui-plugin",
        appId: "dashboard",
        projectId: "project-1",
        prompt: "Build it",
      }),
    ).rejects.toThrow("Configure the plugin project's default provider and model first");
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
        definition: {
          id: "dashboard",
          project: {
            idField: "projectId",
            selectorLabel: "Project",
            selectorDescription: "Project context",
            createNameLabel: "New Project name",
            createNamePlaceholder: "Name",
          },
        },
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
                input: {
                  projectId: "untrusted-project",
                  projectName: "untrusted-name",
                  question: "{{form.question}}",
                  source: "app",
                },
              },
            },
          ],
        },
      }),
    });
    service.configure({
      pluginId: "ui-plugin",
      appId: "dashboard",
      projectId: "project-1",
      defaultAgent: { provider: "codex", model: "gpt-5.6" },
    });
    await service.generate({
      pluginId: "ui-plugin",
      appId: "dashboard",
      projectId: "project-1",
      prompt: "Create it",
    });

    await expect(
      service.submit({
        pluginId: "ui-plugin",
        appId: "dashboard",
        projectId: "project-1",
        componentId: "submit",
        form: {},
      }),
    ).rejects.toThrow("Required field is empty: Question");

    const job = await service.submit({
      pluginId: "ui-plugin",
      appId: "dashboard",
      projectId: "project-1",
      componentId: "submit",
      form: {
        projectName: "Project One",
        projectSourceDirectory: "/repo/project-one",
        question: "Why is this failing?",
      },
    });
    expect(job.status).toBe("queued");
    expect(submit).toHaveBeenCalledWith("processor-plugin", "processor", {
      projectId: "project-1",
      projectName: "Project One",
      projectSourceDirectory: "/repo/project-one",
      defaultAgentProvider: "codex",
      defaultAgentModel: "gpt-5.6",
      agent_provider: "codex",
      agent_model: "gpt-5.6",
      question: "Why is this failing?",
      source: "app",
    });
  });
});
