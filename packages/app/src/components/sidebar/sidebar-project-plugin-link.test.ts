import { describe, expect, it } from "vitest";
import type { PluginAppState, PluginSummary } from "@getpaseo/protocol/messages";
import {
  buildSidebarProjectPluginTargets,
  selectLatestSidebarProjectPluginLink,
  sidebarPluginLinkFromAppState,
} from "./sidebar-project-plugin-link";

function plugin(overrides: Partial<PluginSummary> = {}): PluginSummary {
  return {
    id: "plugin:web-app",
    pluginId: "web-app",
    name: "web-app",
    displayName: "网页应用",
    version: "1.0.0",
    description: "网页应用插件",
    keywords: [],
    sourceType: "local",
    sourcePath: "/tmp/web-app",
    installed: true,
    enabled: true,
    installable: true,
    updateAvailable: false,
    skills: [],
    mcpServers: [],
    httpServices: [],
    apps: [
      {
        id: "main",
        initialDocument: { version: 1, title: "网页应用", components: [] },
      },
    ],
    unsupportedComponents: [],
    warnings: [],
    ...overrides,
  };
}

function appState(overrides: Partial<PluginAppState> = {}): PluginAppState {
  return {
    pluginId: "web-app",
    appId: "main",
    projectId: "project-1",
    defaultAgent: { provider: "codex", model: "gpt-5.3-codex" },
    knowledge: "",
    data: {},
    document: null,
    conversation: [],
    createdAt: "2026-08-30T01:00:00.000Z",
    updatedAt: "2026-08-30T02:00:00.000Z",
    ...overrides,
  };
}

describe("sidebar Project plugin link", () => {
  it("keeps enabled installed plugin apps and only the primary development app", () => {
    expect(
      buildSidebarProjectPluginTargets([
        plugin(),
        plugin({
          id: "plugin:disabled",
          pluginId: "disabled",
          enabled: false,
        }),
        plugin({
          id: "plugin:byte-development",
          pluginId: "byte-development",
          displayName: "字节开发",
          apps: [{ id: "main" }, { id: "secondary" }],
        }),
      ]),
    ).toEqual([
      {
        pluginId: "web-app",
        pluginName: "网页应用",
        appId: "main",
        appName: "网页应用",
        development: false,
      },
      {
        pluginId: "byte-development",
        pluginName: "字节开发",
        appId: "main",
        appName: "main",
        development: true,
      },
    ]);
  });

  it("only creates a link for the configured state bound to this Project", () => {
    const target = buildSidebarProjectPluginTargets([plugin()])[0]!;

    expect(sidebarPluginLinkFromAppState(target, "project-1", appState())).toMatchObject({
      pluginId: "web-app",
      appId: "main",
      projectId: "project-1",
      title: "网页应用",
    });
    expect(
      sidebarPluginLinkFromAppState(target, "project-1", appState({ projectId: "project-2" })),
    ).toBeNull();
    expect(
      sidebarPluginLinkFromAppState(target, "project-1", appState({ defaultAgent: null })),
    ).toBeNull();
  });

  it("selects the latest binding when stale duplicate bindings exist", () => {
    expect(
      selectLatestSidebarProjectPluginLink([
        {
          pluginId: "older",
          pluginName: "旧插件",
          appId: "main",
          projectId: "project-1",
          title: "旧项目",
          updatedAt: "2026-08-29T01:00:00.000Z",
        },
        {
          pluginId: "newer",
          pluginName: "新插件",
          appId: "main",
          projectId: "project-1",
          title: "新项目",
          updatedAt: "2026-08-30T01:00:00.000Z",
        },
      ])?.pluginId,
    ).toBe("newer");
  });
});
