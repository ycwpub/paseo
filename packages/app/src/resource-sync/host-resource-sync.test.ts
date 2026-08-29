import { describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { Assistant, McpServer, MutableDaemonConfig, Skill } from "@getpaseo/protocol/messages";
import {
  syncHostResourcesOneWay,
  syncHostResourcesTwoWay,
  type ResourceSyncHost,
} from "./host-resource-sync";

const LOCAL_SNAPSHOT = {
  version: 1 as const,
  rootKind: "directory" as const,
  entries: [],
  totalFiles: 0,
  totalDirectories: 0,
  totalBytes: 0,
  skippedPaths: [],
};

function appliedLocalResult() {
  return {
    result: {
      status: "applied" as const,
      created: 1,
      updated: 0,
      skipped: 0,
      conflicts: 0,
      bytesWritten: 10,
      conflictPaths: [],
    },
    error: null,
  };
}

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-1",
    name: "代码审查",
    source: "user",
    enabled: true,
    content: "# Review",
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  };
}

function mcp(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "mcp-1",
    name: "文档服务",
    enabled: true,
    transport: { type: "stdio", command: "node", args: ["server.js"] },
    createdAt: 1,
    updatedAt: 10,
    originalJson: "{}",
    ...overrides,
  };
}

function assistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    id: "assistant-1",
    name: "开发助手",
    description: "",
    prompt: "完成开发任务",
    memoryEnabled: false,
    memory: "",
    memorySummary: "",
    memoryFiles: { summaryPath: "", detailFiles: [] },
    resourceSelection: {
      mode: "custom",
      selectedMcpServerIds: ["source-mcp"],
      selectedSkillIds: ["source-skill"],
    },
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

function host(serverId: string, client: Record<string, unknown>): ResourceSyncHost {
  return {
    serverId,
    label: serverId,
    client: client as unknown as DaemonClient,
  };
}

describe("host resource sync", () => {
  it("only syncs user skills and respects newer target versions", async () => {
    const createSkill = vi.fn(async () => ({
      skill: skill({ id: "created" }),
      error: null,
    }));
    const updateSkill = vi.fn(async () => ({
      skill: skill({ id: "target-old" }),
      error: null,
    }));
    const source = host("source", {
      listSkills: vi.fn(async () => ({
        skills: [
          skill({ id: "new-skill", name: "新增技能", enabled: false }),
          skill({
            id: "source-old",
            name: "旧目标",
            updatedAt: 20,
            content: "new",
          }),
          skill({
            id: "source-newer",
            name: "新目标",
            updatedAt: 20,
            content: "old source",
          }),
          skill({ id: "builtin", name: "内置技能", source: "builtin" }),
        ],
        error: null,
      })),
    });
    const target = host("target", {
      listSkills: vi.fn(async () => ({
        skills: [
          skill({
            id: "target-old",
            name: "旧目标",
            updatedAt: 10,
            content: "old",
          }),
          skill({
            id: "target-newer",
            name: "新目标",
            updatedAt: 30,
            content: "new target",
          }),
        ],
        error: null,
      })),
      createSkill,
      updateSkill,
    });

    const result = await syncHostResourcesOneWay({
      source,
      target,
      kind: "skills",
    });

    expect(result).toMatchObject({
      scanned: 3,
      created: 1,
      updated: 1,
      skipped: 1,
    });
    expect(createSkill).toHaveBeenCalledTimes(1);
    expect(createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: "新增技能", content: "# Review" }),
    );
    expect(updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "target-old", content: "new" }),
    );
  });

  it("captures both snapshots before two-way skill sync", async () => {
    const firstCreate = vi.fn(async () => ({
      skill: skill({ id: "first-created" }),
      error: null,
    }));
    const secondCreate = vi.fn(async () => ({
      skill: skill({ id: "second-created" }),
      error: null,
    }));
    const firstList = vi.fn(async () => ({
      skills: [skill({ id: "first", name: "A" })],
      error: null,
    }));
    const secondList = vi.fn(async () => ({
      skills: [skill({ id: "second", name: "B" })],
      error: null,
    }));
    const first = host("first", {
      listSkills: firstList,
      createSkill: firstCreate,
    });
    const second = host("second", {
      listSkills: secondList,
      createSkill: secondCreate,
    });

    const result = await syncHostResourcesTwoWay({
      first,
      second,
      kind: "skills",
    });

    expect(result.firstToSecond.created).toBe(1);
    expect(result.secondToFirst.created).toBe(1);
    expect(firstList).toHaveBeenCalledTimes(1);
    expect(secondList).toHaveBeenCalledTimes(1);
    expect(firstCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "B" }));
    expect(secondCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "A" }));
  });

  it("copies complete MCP transport configuration", async () => {
    const createMcpServer = vi.fn(async () => ({
      server: mcp({ id: "target-mcp" }),
      error: null,
    }));
    const source = host("source", {
      listMcpServers: vi.fn(async () => ({
        servers: [
          mcp({
            transport: {
              type: "http",
              url: "https://mcp.example.com",
              headers: { Authorization: "Bearer secret" },
            },
          }),
          mcp({ id: "builtin", name: "内置 MCP", builtin: true }),
          mcp({ id: "plugin", name: "插件 MCP", pluginId: "plugin-1" }),
        ],
        error: null,
      })),
    });
    const target = host("target", {
      listMcpServers: vi.fn(async () => ({ servers: [], error: null })),
      createMcpServer,
    });

    const result = await syncHostResourcesOneWay({
      source,
      target,
      kind: "mcp",
    });

    expect(result).toMatchObject({ scanned: 1, created: 1 });
    expect(createMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: {
          type: "http",
          url: "https://mcp.example.com",
          headers: { Authorization: "Bearer secret" },
        },
      }),
    );
  });

  it("remaps assistant MCP and skill selections by name", async () => {
    const createAssistant = vi.fn(async () => ({
      assistant: assistant({ id: "target-assistant" }),
      error: null,
    }));
    const source = host("source", {
      listAssistants: vi.fn(async () => ({
        assistants: [assistant()],
        error: null,
      })),
      listMcpServers: vi.fn(async () => ({
        servers: [mcp({ id: "source-mcp", name: "文档服务" })],
        error: null,
      })),
      listSkills: vi.fn(async () => ({
        skills: [skill({ id: "source-skill", name: "代码审查" })],
        error: null,
      })),
    });
    const target = host("target", {
      listAssistants: vi.fn(async () => ({ assistants: [], error: null })),
      listMcpServers: vi.fn(async () => ({
        servers: [mcp({ id: "target-mcp", name: "文档服务" })],
        error: null,
      })),
      listSkills: vi.fn(async () => ({
        skills: [skill({ id: "target-skill", name: "代码审查" })],
        error: null,
      })),
      createAssistant,
    });

    const result = await syncHostResourcesOneWay({
      source,
      target,
      kind: "assistants",
    });

    expect(result.created).toBe(1);
    expect(createAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceSelection: {
          mode: "custom",
          selectedMcpServerIds: ["target-mcp"],
          selectedSkillIds: ["target-skill"],
        },
      }),
    );
  });

  it("reinstalls git and directory plugins on the target host", async () => {
    const installPluginSource = vi.fn(async () => ({
      id: "git-plugin",
      path: "/plugins/git",
      enabled: true,
      status: "running" as const,
    }));
    const installPlugin = vi.fn(async () => ({
      plugin: null,
      state: { plugins: [], marketplaces: [] },
      error: null,
    }));
    const setPluginEnabled = vi.fn(async () => ({
      plugin: null,
      state: { plugins: [], marketplaces: [] },
      error: null,
    }));
    const source = host("source", {
      listUnifiedPlugins: vi.fn(async () => ({
        error: null,
        marketplaces: [],
        plugins: [
          {
            id: "runtime:git-plugin",
            pluginId: "git-plugin",
            name: "git-plugin",
            displayName: "Git Plugin",
            version: "0.0.0",
            description: "Runtime plugin",
            keywords: [],
            sourceType: "git",
            sourcePath: "/plugins/git",
            installed: true,
            enabled: true,
            installable: false,
            updateAvailable: false,
            skills: [],
            mcpServers: [],
            httpServices: [],
            apps: [],
            unsupportedComponents: [],
            warnings: [],
            runtime: {
              path: "/plugins/git",
              enabled: true,
              status: "running",
              source: "git",
              remote: "https://example.com/plugin.git",
              ref: "main",
            },
          },
          {
            id: "runtime:dir-plugin",
            pluginId: "dir-plugin",
            name: "dir-plugin",
            displayName: "Directory Plugin",
            version: "0.0.0",
            description: "Runtime plugin",
            keywords: [],
            sourceType: "local",
            sourcePath: "/plugins/local",
            installed: true,
            enabled: false,
            installable: false,
            updateAvailable: false,
            skills: [],
            mcpServers: [],
            httpServices: [],
            apps: [],
            unsupportedComponents: [],
            warnings: [],
            runtime: {
              path: "/plugins/local",
              enabled: false,
              status: "disabled",
              source: "directory",
            },
          },
        ],
      })),
      exportLocalResource: vi.fn(async () => ({ snapshot: LOCAL_SNAPSHOT, error: null })),
    });
    const target = host("target", {
      listUnifiedPlugins: vi.fn(async () => ({
        error: null,
        marketplaces: [],
        plugins: [],
      })),
      installPluginSource,
      installPlugin,
      setPluginEnabled,
      applyLocalResource: vi.fn(async () => appliedLocalResult()),
    });

    const result = await syncHostResourcesOneWay({
      source,
      target,
      kind: "plugins",
    });

    expect(result.created).toBe(2);
    expect(installPluginSource).toHaveBeenCalledWith({
      source: "https://example.com/plugin.git",
      id: "git-plugin",
      ref: "main",
    });
    expect(installPlugin).toHaveBeenCalledWith({
      type: "local",
      path: "/plugins/local",
    });
    expect(setPluginEnabled).toHaveBeenCalledWith("dir-plugin", false);
  });

  it("merges global knowledge without deleting target-only entries", async () => {
    const sourceConfig = {
      knowledge: {
        general: [{ type: "cloud-document" as const, source: "https://docs/source" }],
        standards: [{ type: "local-document" as const, source: "/rules/source.md" }],
      },
    } as MutableDaemonConfig;
    const targetConfig = {
      knowledge: {
        general: [{ type: "cloud-document" as const, source: "https://docs/target" }],
      },
    } as MutableDaemonConfig;
    const patchDaemonConfig = vi.fn(async (patch) => ({
      requestId: "patch",
      config: { ...targetConfig, ...patch },
    }));
    const source = {
      ...host("source", {
        getDaemonConfig: vi.fn(async () => ({
          requestId: "source",
          config: sourceConfig,
        })),
        exportLocalResource: vi.fn(async () => ({ snapshot: LOCAL_SNAPSHOT, error: null })),
      }),
      knowledgeTarget: { scope: "global" as const },
    };
    const target = {
      ...host("target", {
        getDaemonConfig: vi.fn(async () => ({
          requestId: "target",
          config: targetConfig,
        })),
        patchDaemonConfig,
        applyLocalResource: vi.fn(async () => appliedLocalResult()),
      }),
      knowledgeTarget: { scope: "global" as const },
    };

    const result = await syncHostResourcesOneWay({
      source,
      target,
      kind: "knowledge",
    });

    expect(result.created).toBe(2);
    expect(patchDaemonConfig).toHaveBeenCalledWith({
      knowledge: {
        general: [
          { type: "cloud-document", source: "https://docs/target" },
          { type: "cloud-document", source: "https://docs/source" },
        ],
        standards: [{ type: "local-document", source: "/rules/source.md" }],
      },
    });
  });

  it("passes the selected local content policy to the target host", async () => {
    const applyLocalResource = vi.fn(async () => appliedLocalResult());
    const source = host("source", {
      listUnifiedPlugins: vi.fn(async () => ({
        error: null,
        marketplaces: [],
        plugins: [
          {
            id: "runtime:local",
            pluginId: "local",
            name: "local",
            displayName: "Local",
            version: "0.0.0",
            description: "",
            keywords: [],
            sourceType: "local",
            sourcePath: "/plugins/local",
            installed: true,
            enabled: true,
            installable: false,
            updateAvailable: false,
            skills: [],
            mcpServers: [],
            httpServices: [],
            apps: [],
            unsupportedComponents: [],
            warnings: [],
            runtime: {
              path: "/plugins/local",
              enabled: true,
              status: "running",
              source: "directory",
            },
          },
        ],
      })),
      exportLocalResource: vi.fn(async () => ({ snapshot: LOCAL_SNAPSHOT, error: null })),
    });
    const target = host("target", {
      listUnifiedPlugins: vi.fn(async () => ({
        error: null,
        marketplaces: [],
        plugins: [],
      })),
      applyLocalResource,
      installPlugin: vi.fn(async () => ({
        plugin: null,
        state: { plugins: [], marketplaces: [] },
        error: null,
      })),
    });

    await syncHostResourcesOneWay({
      source,
      target,
      kind: "plugins",
      localContentPolicy: { missing: "create", existing: "overwrite" },
    });

    expect(applyLocalResource).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/plugins/local",
        missingPolicy: "create",
        existingPolicy: "overwrite",
        sourceLabel: "source",
      }),
    );
  });
});
