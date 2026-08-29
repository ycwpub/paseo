import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import type { PluginProjectSnapshot } from "../../plugin/plugin-project-binding-store.js";
import { createPaseoToolCatalog } from "./paseo-tools.js";

const SNAPSHOT: PluginProjectSnapshot = {
  projectId: "prj_current",
  pluginProjectId: "app:web-app:main:prj_current",
  pluginId: "web-app",
  kind: "app",
  appId: "main",
  name: "结算工具",
  knowledge: "结算项目知识",
  data: { owner: "settlement" },
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

function createCatalog() {
  const getPluginProjectForProject = vi.fn(() => SNAPSHOT);
  const updatePluginProjectForProject = vi.fn(
    async (_projectId: string, update: Record<string, unknown>) => ({
      ...SNAPSHOT,
      ...update,
      data: {
        ...SNAPSHOT.data,
        ...(typeof update.data === "object" && update.data !== null ? update.data : {}),
      },
    }),
  );
  const catalog = createPaseoToolCatalog({
    agentManager: {
      getAgent: vi.fn(() => ({
        id: "agent_current",
        workspaceId: "wks_current",
      })),
    } as never,
    agentStorage: {} as never,
    providerSnapshotManager: {} as never,
    workspaceRegistry: {
      get: vi.fn(async () => ({
        workspaceId: "wks_current",
        projectId: "prj_current",
        archivedAt: null,
      })),
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
    } as never,
    pluginProjectService: {
      getPluginProjectForProject,
      updatePluginProjectForProject,
    } as never,
    callerAgentId: "agent_current",
    logger: createTestLogger(),
  });
  return {
    catalog,
    getPluginProjectForProject,
    updatePluginProjectForProject,
  };
}

describe("Paseo plugin project tools", () => {
  it("queries the plugin project bound to the caller Agent Project", async () => {
    const { catalog, getPluginProjectForProject } = createCatalog();

    const result = await catalog.executeTool("get_plugin_project", {});

    expect(getPluginProjectForProject).toHaveBeenCalledWith("prj_current");
    expect(result.structuredContent).toMatchObject({
      projectId: "prj_current",
      pluginProjectId: "app:web-app:main:prj_current",
      knowledge: "结算项目知识",
    });
  });

  it("updates only the plugin project bound to the caller Agent Project", async () => {
    const { catalog, updatePluginProjectForProject } = createCatalog();

    const result = await catalog.executeTool("update_plugin_project", {
      projectId: "prj_other",
      knowledge: "新的项目知识",
      data: { status: "ready" },
    });

    expect(updatePluginProjectForProject).toHaveBeenCalledWith("prj_current", {
      knowledge: "新的项目知识",
      data: { status: "ready" },
    });
    expect(result.structuredContent).toMatchObject({
      projectId: "prj_current",
      knowledge: "新的项目知识",
      data: { owner: "settlement", status: "ready" },
    });
  });

  it("rejects empty updates", async () => {
    const { catalog } = createCatalog();

    await expect(catalog.executeTool("update_plugin_project", {})).rejects.toThrow("至少需要提供");
  });
});
