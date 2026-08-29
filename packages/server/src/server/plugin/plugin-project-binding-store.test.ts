import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginProjectBindingStore } from "./plugin-project-binding-store.js";

describe("PluginProjectBindingStore", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function createStore(): {
    root: string;
    store: PluginProjectBindingStore;
  } {
    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-project-binding-"));
    roots.push(root);
    const store = new PluginProjectBindingStore(path.join(root, "bindings"));
    store.initialize();
    return { root, store };
  }

  it("persists one plugin project binding per Project", () => {
    const { root, store } = createStore();
    const first = store.claim(
      {
        projectId: "prj_1",
        pluginProjectId: "app:demo:main:prj_1",
        pluginId: "demo",
        kind: "app",
        appId: "main",
      },
      "2026-08-29T00:00:00.000Z",
    );

    expect(first.created).toBe(true);
    expect(store.get("prj_1")).toMatchObject({
      pluginProjectId: "app:demo:main:prj_1",
      kind: "app",
    });

    const reloaded = new PluginProjectBindingStore(path.join(root, "bindings"));
    reloaded.initialize();
    expect(reloaded.get("prj_1")).toEqual(store.get("prj_1"));
  });

  it("rejects a second plugin project until the original binding is released", () => {
    const { store } = createStore();
    store.claim(
      {
        projectId: "prj_1",
        pluginProjectId: "job_1",
        pluginId: "byte-development",
        kind: "job",
        serviceName: "development",
      },
      "2026-08-29T00:00:00.000Z",
    );

    expect(() =>
      store.claim(
        {
          projectId: "prj_1",
          pluginProjectId: "job_2",
          pluginId: "byte-reconciliation",
          kind: "job",
          serviceName: "reconciliation",
        },
        "2026-08-29T00:01:00.000Z",
      ),
    ).toThrow("一个 Project 只能绑定一个插件项目");

    expect(store.release("prj_1", "job_1")).toBe(true);
    expect(() =>
      store.claim(
        {
          projectId: "prj_1",
          pluginProjectId: "job_2",
          pluginId: "byte-reconciliation",
          kind: "job",
          serviceName: "reconciliation",
        },
        "2026-08-29T00:02:00.000Z",
      ),
    ).not.toThrow();
  });
});
