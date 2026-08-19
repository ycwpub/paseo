import { describe, expect, it, vi } from "vitest";
import { resolveDevelopmentProjectSelection } from "./development-project-selection-model";

const CREATED_PROJECT = {
  projectId: "prj_new",
  projectDisplayName: "研发流程 · 支付优化",
  projectCustomName: null,
  projectCustomIconRevision: null,
  projectRootPath: "",
  projectDirectoryless: true,
  projectKind: "non_git" as const,
};

describe("development project selection", () => {
  it("uses an existing Project without creating another one", async () => {
    const createProject = vi.fn();

    await expect(
      resolveDevelopmentProjectSelection({
        selection: {
          mode: "existing",
          existingProjectId: "prj_existing",
        },
      }),
    ).resolves.toEqual({
      mode: "existing",
      projectId: "prj_existing",
      createdProject: null,
    });
    expect(createProject).not.toHaveBeenCalled();
  });

  it("cannot receive a Project creator when an existing Project is selected", async () => {
    await expect(
      resolveDevelopmentProjectSelection({
        selection: {
          mode: "existing",
          existingProjectId: "  prj_existing  ",
        },
      }),
    ).resolves.toEqual({
      mode: "existing",
      projectId: "prj_existing",
      createdProject: null,
    });
  });

  it("creates and returns a new Project", async () => {
    const createProject = vi.fn(async () => CREATED_PROJECT);

    await expect(
      resolveDevelopmentProjectSelection({
        selection: {
          mode: "new",
          newProjectName: "  支付优化项目  ",
        },
        createProject,
      }),
    ).resolves.toEqual({
      mode: "new",
      projectId: "prj_new",
      createdProject: CREATED_PROJECT,
    });
    expect(createProject).toHaveBeenCalledWith("支付优化项目");
  });

  it("rejects an empty existing Project selection", async () => {
    await expect(
      resolveDevelopmentProjectSelection({
        selection: {
          mode: "existing",
          existingProjectId: null,
        },
      }),
    ).rejects.toThrow("请选择用于承载开发流程的已有 Project");
  });
});
