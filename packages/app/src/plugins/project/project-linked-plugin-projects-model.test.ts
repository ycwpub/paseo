import { describe, expect, it } from "vitest";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import { buildLinkedPluginProjects } from "./project-linked-plugin-projects-model";

function appState(overrides: Partial<PluginAppState> = {}): PluginAppState {
  return {
    pluginId: "web-app",
    appId: "main",
    projectId: "project-a",
    defaultAgent: { provider: "codex", model: "gpt-5.6" },
    document: {
      version: 1,
      title: "结算计算器",
      components: [],
    },
    conversation: [],
    createdAt: "2026-08-21T01:00:00.000Z",
    updatedAt: "2026-08-21T02:00:00.000Z",
    ...overrides,
  };
}

describe("project linked plugin projects model", () => {
  it("keeps only plugin projects associated with the current Project", () => {
    const projects = buildLinkedPluginProjects({
      projectId: "project-a",
      appStateSources: [
        {
          target: {
            pluginId: "web-app",
            pluginName: "网页应用生成器",
            appId: "main",
            appName: "网页应用",
          },
          states: [
            appState(),
            appState({ projectId: "project-b" }),
            appState({ projectId: "project-a", defaultAgent: null }),
          ],
        },
      ],
      jobTargets: [
        {
          id: "flow-a",
          pluginId: "byte-development",
          pluginName: "字节开发",
          appId: "development",
          projectId: "project-a",
          title: "支付链路改造",
          description: "研发流程 · 进行中",
          updatedAt: "2026-08-21T03:00:00.000Z",
        },
        {
          id: "flow-b",
          pluginId: "byte-development",
          pluginName: "字节开发",
          appId: "development",
          projectId: "project-b",
          title: "其他流程",
          description: "研发流程 · 草稿",
          updatedAt: "2026-08-21T04:00:00.000Z",
        },
      ],
    });

    expect(projects).toEqual([
      expect.objectContaining({
        pluginId: "byte-development",
        pluginProjectId: "flow-a",
        title: "支付链路改造",
      }),
      expect.objectContaining({
        pluginId: "web-app",
        title: "结算计算器",
        description: "网页应用 · codex / gpt-5.6",
      }),
    ]);
  });

  it("sorts linked projects by latest update first", () => {
    const projects = buildLinkedPluginProjects({
      projectId: "project-a",
      appStateSources: [
        {
          target: {
            pluginId: "web-app",
            pluginName: "网页应用生成器",
            appId: "main",
            appName: "网页应用",
          },
          states: [appState({ updatedAt: "2026-08-21T05:00:00.000Z" })],
        },
      ],
      jobTargets: [
        {
          id: "flow-a",
          pluginId: "byte-development",
          pluginName: "字节开发",
          appId: "development",
          projectId: "project-a",
          title: "支付链路改造",
          description: "研发流程 · 草稿",
          updatedAt: "2026-08-21T03:00:00.000Z",
        },
      ],
    });

    expect(projects.map((project) => project.pluginId)).toEqual(["web-app", "byte-development"]);
  });
});
