import { describe, expect, it } from "vitest";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import {
  buildManagedPluginProjects,
  removePluginProjectState,
  resolveInitialManagedPluginProjectId,
  upsertPluginProjectState,
} from "./plugin-project-management-model";
import type { PluginProjectOption } from "./plugin-project-model";

const APP_STATE: PluginAppState = {
  pluginId: "demo",
  appId: "console",
  projectId: "project-1",
  defaultAgent: { provider: "codex", model: "gpt-5.6" },
  document: null,
  conversation: [],
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const OPTION: PluginProjectOption = {
  id: "project-1",
  value: "project-1",
  label: "支付对账",
  projectName: "支付对账",
  description: "/repo/payment",
  sourceDirectory: "/repo/payment",
};

describe("plugin project management model", () => {
  it("joins persisted plugin projects with current Project metadata", () => {
    expect(buildManagedPluginProjects([APP_STATE], [OPTION])).toEqual([
      expect.objectContaining({
        projectId: "project-1",
        projectName: "支付对账",
        sourceDirectory: "/repo/payment",
      }),
    ]);
  });

  it("keeps a deleted or disconnected Project visible by its ID", () => {
    expect(buildManagedPluginProjects([APP_STATE], [])[0]).toMatchObject({
      projectId: "project-1",
      projectName: "project-1",
      option: null,
    });
  });

  it("selects current, active, then first configured plugin project", () => {
    const projects = buildManagedPluginProjects([APP_STATE], [OPTION]);
    expect(
      resolveInitialManagedPluginProjectId({
        currentProjectId: null,
        activeProjectId: "project-1",
        projects,
      }),
    ).toBe("project-1");
  });

  it("upserts and removes cached project states", () => {
    const updated = { ...APP_STATE, updatedAt: "2026-08-20T01:00:00.000Z" };
    expect(upsertPluginProjectState([APP_STATE], updated)).toEqual([updated]);
    expect(removePluginProjectState([APP_STATE], "project-1")).toEqual([]);
  });
});
