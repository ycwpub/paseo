import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { McpStore } from "../mcp/mcp-store.js";
import { SkillMaterializer } from "../skill/skill-materializer.js";
import { SkillStore } from "../skill/skill-store.js";
import { PluginService } from "./plugin-service.js";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import type { PluginAppRuntime } from "./plugin-app-runtime-types.js";
import type {
  PluginHttpServiceBinding,
  PluginHttpServiceRuntime,
} from "./plugin-http-runtime-types.js";

function writePlugin(pluginRoot: string, version = "1.0.0"): void {
  mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  writeFileSync(
    path.join(pluginRoot, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: "demo-plugin",
      version,
      description: "Demo plugin",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: {
        displayName: "Demo Plugin",
        category: "Productivity",
      },
    }),
    "utf8",
  );
  mkdirSync(path.join(pluginRoot, "skills", "review", "scripts"), { recursive: true });
  writeFileSync(
    path.join(pluginRoot, "skills", "review", "SKILL.md"),
    "---\nname: review\ndescription: Review changes\n---\n\nReview the code.\n",
    "utf8",
  );
  writeFileSync(
    path.join(pluginRoot, "skills", "review", "scripts", "check.sh"),
    "echo ok\n",
    "utf8",
  );
  writeFileSync(
    path.join(pluginRoot, ".mcp.json"),
    JSON.stringify({
      docs: {
        command: "node",
        args: ["${PLUGIN_ROOT}/server.js"],
        env: { DATA: "${PLUGIN_DATA}" },
      },
    }),
    "utf8",
  );
  writeFileSync(path.join(pluginRoot, "server.js"), "console.log('ok')\n", "utf8");
}

function createService(tempRoot: string, options: { bundledMarketplacePaths?: string[] } = {}) {
  const paseoHome = path.join(tempRoot, "paseo-home");
  const logger = createTestLogger();
  const skillStore = new SkillStore({ paseoHome, logger });
  const mcpStore = new McpStore({ paseoHome, logger });
  const service = new PluginService({
    paseoHome,
    logger,
    skillStore,
    mcpStore,
    bundledMarketplacePaths: options.bundledMarketplacePaths,
  });
  service.initialize();
  return { paseoHome, service, skillStore, mcpStore, logger };
}

function writeMarketplace(marketplaceRoot: string): string {
  const marketplaceFile = path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
  mkdirSync(path.dirname(marketplaceFile), { recursive: true });
  writeFileSync(
    marketplaceFile,
    JSON.stringify({
      name: "bundled-test",
      plugins: [
        {
          name: "demo-plugin",
          source: { source: "local", path: "./plugins/demo-plugin" },
          policy: { installation: "AVAILABLE" },
        },
      ],
    }),
    "utf8",
  );
  return marketplaceFile;
}

function declarePluginApp(pluginRoot: string): void {
  const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.apps = "./.app.json";
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  writeFileSync(
    path.join(pluginRoot, ".app.json"),
    JSON.stringify({
      apps: {
        "service-console": {
          id: "service-console",
          category: "Infrastructure",
        },
      },
    }),
    "utf8",
  );
}

function createPluginAppRuntime(): PluginAppRuntime {
  const states = new Map<string, PluginAppState>();
  const key = (pluginId: string, appId: string, projectId: string) =>
    `${pluginId}\u0000${appId}\u0000${projectId}`;
  const createState = (
    pluginId: string,
    appId: string,
    projectId: string,
    defaultAgent: PluginAppState["defaultAgent"],
  ): PluginAppState => ({
    pluginId,
    appId,
    projectId,
    defaultAgent,
    name: `${pluginId}-${appId}`,
    knowledge: "",
    data: {},
    document: null,
    conversation: [],
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  });
  return {
    get: (pluginId, appId, projectId) => {
      const state = states.get(key(pluginId, appId, projectId));
      if (!state) throw new Error("插件项目不存在");
      return state;
    },
    configure: ({ pluginId, appId, projectId, defaultAgent }) => {
      const state =
        states.get(key(pluginId, appId, projectId)) ??
        createState(pluginId, appId, projectId, defaultAgent);
      const updated = { ...state, defaultAgent };
      states.set(key(pluginId, appId, projectId), updated);
      return updated;
    },
    updateProject: (pluginId, appId, projectId, update) => {
      const current = states.get(key(pluginId, appId, projectId));
      if (!current) throw new Error("插件项目不存在");
      const updated = {
        ...current,
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.knowledge !== undefined ? { knowledge: update.knowledge } : {}),
        ...(update.data !== undefined ? { data: { ...current.data, ...update.data } } : {}),
        updatedAt: "2026-08-29T00:01:00.000Z",
      };
      states.set(key(pluginId, appId, projectId), updated);
      return updated;
    },
    listProjects: (pluginId, appId) =>
      [...states.values()].filter((state) => state.pluginId === pluginId && state.appId === appId),
    getHtmlPreview: () => null,
    copyProject: () => {
      throw new Error("unused");
    },
    deleteProject: (pluginId, appId, projectId) => states.delete(key(pluginId, appId, projectId)),
    generate: async () => {
      throw new Error("unused");
    },
    submit: async () => {
      throw new Error("unused");
    },
    getJob: () => null,
    listJobs: () => [],
    updateJob: async () => null,
    deleteJob: async () => false,
  };
}

describe("PluginService", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("installs, toggles, materializes, and uninstalls a local plugin", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-service-"));
    const pluginRoot = path.join(tempRoot, "plugin");
    writePlugin(pluginRoot);
    const { paseoHome, service, skillStore, mcpStore, logger } = createService(tempRoot);

    const installed = await service.install({ type: "local", path: pluginRoot });

    expect(installed.plugin.installed).toBe(true);
    expect(installed.plugin.skills).toEqual(["review"]);
    expect(installed.plugin.mcpServers).toEqual(["docs"]);
    const skill = skillStore.list()[0]!;
    const mcpServer = mcpStore.list()[0]!;
    expect(skill.pluginId).toBe("demo-plugin");
    expect(mcpServer.pluginId).toBe("demo-plugin");
    expect(mcpServer.transport).toMatchObject({
      type: "stdio",
      command: "node",
      env: {
        PLUGIN_ROOT: expect.stringContaining("/plugins/cache/"),
        PLUGIN_DATA: path.join(paseoHome, "plugins", "data", "demo-plugin"),
      },
    });
    expect(mcpServer.transport.type === "stdio" ? mcpServer.transport.args?.[0] : null).toContain(
      "/plugins/cache/",
    );

    const targetDir = path.join(tempRoot, "provider-skills");
    const materializer = new SkillMaterializer({
      paseoHome,
      logger,
      targetDirs: [targetDir],
    });
    materializer.sync(skillStore.list());
    const materializedTarget = path.resolve(
      targetDir,
      readlinkSync(path.join(targetDir, "review")),
    );
    expect(readFileSync(path.join(materializedTarget, "scripts", "check.sh"), "utf8")).toContain(
      "echo ok",
    );

    await service.setEnabled("demo-plugin", false);
    expect(skillStore.list()[0]?.enabled).toBe(false);
    expect(mcpStore.list()[0]?.enabled).toBe(false);
    await service.setEnabled("demo-plugin", true);
    expect(skillStore.list()[0]?.enabled).toBe(true);
    expect(mcpStore.list()[0]?.enabled).toBe(true);

    const cachePath = path.dirname(path.dirname(skill.path!));
    expect(existsSync(cachePath)).toBe(true);
    expect((await service.uninstall("demo-plugin")).ok).toBe(true);
    expect(skillStore.list()).toEqual([]);
    expect(mcpStore.list()).toEqual([]);
    expect(existsSync(cachePath)).toBe(false);
    expect(existsSync(path.join(paseoHome, "plugins", "data", "demo-plugin"))).toBe(true);
  });

  it("discovers and installs a plugin from a Codex marketplace", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-marketplace-"));
    const marketplaceRoot = path.join(tempRoot, "marketplace");
    const pluginRoot = path.join(marketplaceRoot, "plugins", "demo-plugin");
    writePlugin(pluginRoot);
    mkdirSync(path.join(marketplaceRoot, ".agents", "plugins"), { recursive: true });
    writeFileSync(
      path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"),
      JSON.stringify({
        name: "local-test",
        interface: { displayName: "Local Test" },
        plugins: [
          {
            name: "demo-plugin",
            source: { source: "local", path: "./plugins/demo-plugin" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          },
        ],
      }),
      "utf8",
    );
    const { service } = createService(tempRoot);

    const added = service.addMarketplace(marketplaceRoot);
    const available = added.state.plugins.find(
      (plugin) => plugin.marketplaceId === added.marketplace.id,
    );
    expect(available).toMatchObject({
      name: "demo-plugin",
      marketplaceName: "Local Test",
      installable: true,
      installed: false,
    });

    const installed = await service.install({
      type: "marketplace",
      marketplaceId: added.marketplace.id,
      pluginName: "demo-plugin",
    });
    expect(installed.plugin).toMatchObject({
      pluginId: "demo-plugin",
      installed: true,
      marketplaceName: "Local Test",
    });
  });

  it("synchronizes an installed bundled plugin when the packaged version changes", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-bundled-update-"));
    const marketplaceRoot = path.join(tempRoot, "marketplace");
    const pluginRoot = path.join(marketplaceRoot, "plugins", "demo-plugin");
    const marketplaceFile = writeMarketplace(marketplaceRoot);
    writePlugin(pluginRoot, "1.0.0");
    writeFileSync(path.join(pluginRoot, "version.txt"), "old", "utf8");

    const first = createService(tempRoot, { bundledMarketplacePaths: [marketplaceFile] });
    const marketplaceId = first.service.getState().marketplaces[0]!.id;
    await first.service.install({
      type: "marketplace",
      marketplaceId,
      pluginName: "demo-plugin",
    });

    writePlugin(pluginRoot, "1.0.1");
    writeFileSync(path.join(pluginRoot, "version.txt"), "new", "utf8");

    const second = createService(tempRoot, { bundledMarketplacePaths: [marketplaceFile] });
    const installed = second.service
      .getState()
      .plugins.find((plugin) => plugin.pluginId === "demo-plugin");

    expect(installed).toMatchObject({
      installed: true,
      version: "1.0.1",
      updateAvailable: false,
    });
    expect(installed?.sourcePath).toBe(realpathSync(pluginRoot));
    const installedSkill = second.skillStore
      .list()
      .find((skill) => skill.pluginId === "demo-plugin");
    expect(installedSkill?.path).toBeDefined();
    const cacheRoot = path.dirname(path.dirname(path.dirname(installedSkill!.path!)));
    expect(readFileSync(path.join(cacheRoot, "version.txt"), "utf8")).toBe("new");
  });

  it("synchronizes newly declared apps from an unchanged bundled plugin version", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-bundled-app-sync-"));
    const marketplaceRoot = path.join(tempRoot, "marketplace");
    const pluginRoot = path.join(marketplaceRoot, "plugins", "demo-plugin");
    const marketplaceFile = writeMarketplace(marketplaceRoot);
    writePlugin(pluginRoot, "1.0.0");

    const first = createService(tempRoot, { bundledMarketplacePaths: [marketplaceFile] });
    const marketplaceId = first.service.getState().marketplaces[0]!.id;
    await first.service.install({
      type: "marketplace",
      marketplaceId,
      pluginName: "demo-plugin",
    });
    expect(() => first.service.resolveAppContext("demo-plugin", "service-console")).toThrow(
      "Plugin app is not declared",
    );

    declarePluginApp(pluginRoot);
    const second = createService(tempRoot, { bundledMarketplacePaths: [marketplaceFile] });

    expect(
      second.service.resolveAppContext("demo-plugin", "service-console").definition,
    ).toMatchObject({
      id: "service-console",
      category: "Infrastructure",
    });
  });

  it("reconciles workflow-backed HTTP services with plugin lifecycle changes", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-lifecycle-"));
    const pluginRoot = path.join(tempRoot, "plugin");
    writePlugin(pluginRoot);
    const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.httpServices = "./.http.json";
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
    mkdirSync(path.join(pluginRoot, "workflows"), { recursive: true });
    writeFileSync(path.join(pluginRoot, "workflows", "processor.json"), "{}", "utf8");
    writeFileSync(
      path.join(pluginRoot, ".http.json"),
      JSON.stringify({
        processor: {
          port: 8123,
          path: "/process",
          workflow: "./workflows/processor.json",
        },
      }),
      "utf8",
    );
    const { service } = createService(tempRoot);
    let activeBindings: PluginHttpServiceBinding[] = [];
    const runtime: PluginHttpServiceRuntime = {
      reconcile: async (bindings) => {
        activeBindings = bindings;
      },
      getStatus: (pluginId, serviceName) => {
        const binding = activeBindings.find(
          (entry) => entry.pluginId === pluginId && entry.definition.name === serviceName,
        );
        if (!binding) return null;
        return {
          name: serviceName,
          host: binding.definition.host,
          configuredPort: binding.definition.port,
          boundPort: 8123,
          path: binding.definition.path,
          workflowPath: binding.definition.workflowPath,
          status: "running",
          submitUrl: "http://127.0.0.1:8123/process",
          resultUrlTemplate: "http://127.0.0.1:8123/process/{processId}",
          error: null,
        };
      },
      submit: async () => {
        throw new Error("unused");
      },
      getJob: () => null,
      listJobs: () => [],
      updateJob: async () => null,
      deleteJob: async () => false,
      stop: async () => undefined,
    };
    await service.attachHttpRuntime(runtime);

    const installed = await service.install({ type: "local", path: pluginRoot });

    expect(activeBindings).toHaveLength(1);
    expect(installed.plugin.httpServices[0]).toMatchObject({
      name: "processor",
      status: "running",
      boundPort: 8123,
    });

    await service.setEnabled("demo-plugin", false);
    expect(activeBindings).toEqual([]);
  });

  it("binds exactly one plugin project and exposes it to Project agents", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-project-service-"));
    const { service } = createService(tempRoot);
    service.attachAppRuntime(createPluginAppRuntime());

    service.configureApp("web-app", "main", "prj_1", {
      provider: "codex",
      model: "gpt-5.6",
    });

    expect(() =>
      service.configureApp("byte-reconciliation", "main", "prj_1", {
        provider: "codex",
        model: "gpt-5.6",
      }),
    ).toThrow("一个 Project 只能绑定一个插件项目");

    expect(service.getPluginProjectForProject("prj_1")).toMatchObject({
      projectId: "prj_1",
      pluginId: "web-app",
      name: "web-app-main",
      knowledge: "",
      data: {},
    });
    expect(service.buildProjectAgentContext("prj_1")).toContain("get_plugin_project");

    await expect(
      service.updatePluginProjectForProject("prj_1", {
        name: "结算工具",
        knowledge: "对账差异需要先核对账期。",
        data: { owner: "settlement" },
      }),
    ).resolves.toMatchObject({
      name: "结算工具",
      knowledge: "对账差异需要先核对账期。",
      data: { owner: "settlement" },
    });

    expect(service.deleteAppProject("web-app", "main", "prj_1")).toBe(true);
    expect(() =>
      service.configureApp("byte-reconciliation", "main", "prj_1", {
        provider: "codex",
        model: "gpt-5.6",
      }),
    ).not.toThrow();
  });
});
