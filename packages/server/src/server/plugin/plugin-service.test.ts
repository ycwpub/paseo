import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
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

function createService(tempRoot: string) {
  const paseoHome = path.join(tempRoot, "paseo-home");
  const logger = createTestLogger();
  const skillStore = new SkillStore({ paseoHome, logger });
  const mcpStore = new McpStore({ paseoHome, logger });
  const service = new PluginService({ paseoHome, logger, skillStore, mcpStore });
  service.initialize();
  return { paseoHome, service, skillStore, mcpStore, logger };
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
});
