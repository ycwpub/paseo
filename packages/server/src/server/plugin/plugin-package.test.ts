import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertPluginTreeSafe, loadPluginPackage } from "./plugin-package.js";

function writeManifest(pluginRoot: string, manifest: Record<string, unknown>): void {
  mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  writeFileSync(
    path.join(pluginRoot, ".codex-plugin", "plugin.json"),
    JSON.stringify(manifest),
    "utf8",
  );
}

describe("plugin package", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("loads Codex-compatible Skills and MCP servers", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-package-"));
    const pluginRoot = path.join(tempRoot, "demo");
    writeManifest(pluginRoot, {
      name: "demo-plugin",
      version: "1.2.3",
      description: "Demo plugin",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      hooks: "./hooks/hooks.json",
      interface: { displayName: "Demo Plugin" },
    });
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
        mcp_servers: {
          docs: {
            command: "node",
            args: ["${PLUGIN_ROOT}/server.js"],
            env: { DATA: "${PLUGIN_DATA}" },
          },
        },
      }),
      "utf8",
    );
    mkdirSync(path.join(pluginRoot, "hooks"), { recursive: true });
    writeFileSync(path.join(pluginRoot, "hooks", "hooks.json"), "{}", "utf8");

    const result = loadPluginPackage(pluginRoot);

    expect(result.manifest.name).toBe("demo-plugin");
    expect(result.skills.map((skill) => skill.name)).toEqual(["review"]);
    expect(result.mcpServers.map((server) => server.name)).toEqual(["docs"]);
    expect(result.unsupportedComponents).toEqual(["hooks"]);
  });

  it("rejects component paths and symlinks that escape the package", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-package-safe-"));
    const pluginRoot = path.join(tempRoot, "demo");
    writeManifest(pluginRoot, {
      name: "demo-plugin",
      version: "1.0.0",
      description: "Demo plugin",
      skills: "../outside",
    });
    mkdirSync(path.join(tempRoot, "outside"), { recursive: true });

    expect(() => loadPluginPackage(pluginRoot)).toThrow("must use a ./-prefixed path");

    writeManifest(pluginRoot, {
      name: "demo-plugin",
      version: "1.0.0",
      description: "Demo plugin",
    });
    writeFileSync(path.join(tempRoot, "outside.txt"), "secret", "utf8");
    symlinkSync(path.join(tempRoot, "outside.txt"), path.join(pluginRoot, "outside-link"));
    expect(() => assertPluginTreeSafe(pluginRoot)).toThrow("symbolic links");
  });

  it("discovers default components and inline MCP servers", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-package-defaults-"));
    const pluginRoot = path.join(tempRoot, "demo");
    writeManifest(pluginRoot, {
      name: "demo-plugin",
      version: "1.0.0",
      description: "Demo plugin",
      mcpServers: {
        inline: {
          type: "http",
          url: "https://example.com/mcp",
        },
      },
      interface: {
        logoDark: "./assets/logo-dark.png",
      },
    });
    mkdirSync(path.join(pluginRoot, "skills", "review"), { recursive: true });
    writeFileSync(
      path.join(pluginRoot, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review changes\n---\n\nReview the code.\n",
      "utf8",
    );
    writeFileSync(
      path.join(pluginRoot, ".mcp.json"),
      JSON.stringify({
        fileServer: {
          command: "node",
          args: ["server.js"],
        },
      }),
      "utf8",
    );
    writeFileSync(
      path.join(pluginRoot, ".app.json"),
      JSON.stringify({
        apps: {
          dashboard: {
            id: "dashboard",
            category: "Productivity",
          },
        },
      }),
      "utf8",
    );

    const result = loadPluginPackage(pluginRoot);

    expect(result.skills.map((skill) => skill.name)).toEqual(["review"]);
    expect(result.mcpServers.map((server) => server.name)).toEqual(["inline", "fileServer"]);
    expect(result.manifest.interface?.logoDark).toBe("./assets/logo-dark.png");
    expect(result.apps).toEqual([
      {
        id: "dashboard",
        category: "Productivity",
        project: {
          idField: "projectId",
          selectorLabel: "Project",
          selectorDescription: "插件页面、交互、流程和历史记录都归属于所选 Project。",
          createNameLabel: "新 Project 名称",
          createNamePlaceholder: "输入自定义 Project 名称",
        },
      },
    ]);
    expect(result.unsupportedComponents).toEqual([]);
  });

  it("requires semantic plugin versions", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-package-version-"));
    const pluginRoot = path.join(tempRoot, "demo");
    writeManifest(pluginRoot, {
      name: "demo-plugin",
      version: "latest",
      description: "Demo plugin",
    });

    expect(() => loadPluginPackage(pluginRoot)).toThrow("semantic versioning");
  });

  it("loads workflow-backed HTTP service definitions", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-package-http-"));
    const pluginRoot = path.join(tempRoot, "demo");
    writeManifest(pluginRoot, {
      name: "demo-plugin",
      version: "1.0.0",
      description: "Demo plugin",
      httpServices: "./.http.json",
    });
    mkdirSync(path.join(pluginRoot, "workflows"), { recursive: true });
    writeFileSync(path.join(pluginRoot, "workflows", "processor.json"), "{}", "utf8");
    writeFileSync(
      path.join(pluginRoot, ".http.json"),
      JSON.stringify({
        services: {
          processor: {
            port: 8123,
            path: "/process",
            workflow: "./workflows/processor.json",
            authTokenEnv: "PROCESSOR_TOKEN",
          },
        },
      }),
      "utf8",
    );

    const result = loadPluginPackage(pluginRoot);

    expect(result.httpServices).toEqual([
      expect.objectContaining({
        name: "processor",
        host: "127.0.0.1",
        port: 8123,
        path: "/process",
        workflowPath: expect.stringContaining("/workflows/processor.json"),
        authTokenEnv: "PROCESSOR_TOKEN",
        maxBodyBytes: 1024 * 1024,
      }),
    ]);
  });
});
