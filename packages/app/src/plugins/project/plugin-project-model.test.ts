import { describe, expect, it } from "vitest";
import type { PluginAppProjectBinding } from "@getpaseo/protocol/messages";
import {
  buildPluginProjectFormValues,
  pluginProjectBoundFieldIds,
  resolveInitialPluginProjectId,
  resolvePluginProjectBinding,
  type PluginProjectOption,
} from "./plugin-project-model";

const OPTIONS: PluginProjectOption[] = [
  {
    id: "project-a",
    value: "project-a",
    label: "项目 A",
    description: "/repo/a",
    projectName: "项目 A",
    sourceDirectory: "/repo/a",
  },
  {
    id: "project-b",
    value: "project-b",
    label: "项目 B",
    description: "project-b",
    projectName: "项目 B",
    sourceDirectory: null,
  },
];

const BINDING: PluginAppProjectBinding = {
  idField: "projectId",
  nameField: "projectName",
  sourceDirectoryField: "repository_path",
  selectorLabel: "Project",
  selectorDescription: "项目上下文",
  createNameLabel: "新 Project 名称",
  createNamePlaceholder: "输入名称",
};

describe("plugin project model", () => {
  it("uses the standard Project binding for older plugin definitions", () => {
    expect(resolvePluginProjectBinding(undefined)).toMatchObject({
      idField: "projectId",
      selectorLabel: "Project",
      createNameLabel: "新 Project 名称",
    });
  });

  it("prefers the current project, then the active project, then the first project", () => {
    expect(
      resolveInitialPluginProjectId({
        currentProjectId: "project-b",
        activeProjectId: "project-a",
        options: OPTIONS,
      }),
    ).toBe("project-b");
    expect(
      resolveInitialPluginProjectId({
        currentProjectId: "missing",
        activeProjectId: "project-a",
        options: OPTIONS,
      }),
    ).toBe("project-a");
    expect(
      resolveInitialPluginProjectId({
        currentProjectId: null,
        activeProjectId: null,
        options: OPTIONS,
      }),
    ).toBe("project-a");
  });

  it("maps standard Project context into plugin form fields", () => {
    expect(buildPluginProjectFormValues(BINDING, OPTIONS[0]!)).toEqual({
      projectId: "project-a",
      projectName: "项目 A",
      projectSourceDirectory: "/repo/a",
      repository_path: "/repo/a",
    });
    expect(buildPluginProjectFormValues(BINDING, OPTIONS[1]!)).toEqual({
      projectId: "project-b",
      projectName: "项目 B",
      projectSourceDirectory: "",
      repository_path: "",
    });
  });

  it("identifies document fields owned by the Project binding", () => {
    expect(pluginProjectBoundFieldIds(BINDING)).toEqual([
      "projectId",
      "projectName",
      "projectSourceDirectory",
      "repository_path",
    ]);
  });
});
