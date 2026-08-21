import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginAppStore } from "./plugin-app-store.js";

describe("PluginAppStore HTML preview", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("writes preview.html beside the Project-scoped app state", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-app-html-"));
    const store = new PluginAppStore(tempRoot);
    const saved = store.save({
      pluginId: "agent-web-app",
      appId: "web-app-builder",
      projectId: "project-1",
      defaultAgent: { provider: "codex", model: "gpt-5.6" },
      document: {
        version: 1,
        title: "计算器",
        components: [{ id: "result", type: "result", label: "计算结果" }],
      },
      conversation: [],
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    });

    expect(saved.htmlPath).toBeDefined();
    expect(existsSync(saved.htmlPath!)).toBe(true);
    expect(readFileSync(saved.htmlPath!, "utf8")).toContain("<title>计算器</title>");
    expect(store.getHtmlPreview("agent-web-app", { id: "web-app-builder" }, "project-1")).toEqual({
      html: expect.stringContaining("计算结果"),
      htmlPath: saved.htmlPath,
    });
  });
});
