import { describe, expect, test, vi } from "vitest";
import {
  resolveSubstituteModeProject,
  rollbackSubstituteModeProject,
  type SubstituteModeProjectClient,
} from "./lark-substitute-mode-project";

function project() {
  return {
    projectId: "prj_substitute",
    projectDisplayName: "研发替身",
    projectCustomName: null,
    projectRootPath: "/Users/test/.paseo/projects/prj_substitute",
    projectSourceDirectory: "/Users/test/.paseo/projects/prj_substitute",
    projectDirectoryless: true,
    projectKind: "directory" as const,
  };
}

describe("substitute mode Project resolution", () => {
  test("keeps the explicitly selected Project directory", async () => {
    const createDirectorylessProject = vi.fn();
    const result = await resolveSubstituteModeProject({
      name: "研发替身",
      cwd: " /repo/existing ",
      supportsDirectorylessProjects: true,
      client: { createDirectorylessProject } as unknown as SubstituteModeProjectClient,
      registerProject: vi.fn(),
    });

    expect(result).toEqual({ cwd: "/repo/existing", createdProjectId: null });
    expect(createDirectorylessProject).not.toHaveBeenCalled();
  });

  test("creates and registers a Project named after the substitute mode", async () => {
    const created = project();
    const createDirectorylessProject = vi.fn().mockResolvedValue({
      project: created,
      error: null,
    });
    const registerProject = vi.fn();

    const result = await resolveSubstituteModeProject({
      name: " 研发替身 ",
      cwd: "",
      supportsDirectorylessProjects: true,
      client: {
        createDirectorylessProject,
        removeProject: vi.fn(),
      },
      registerProject,
    });

    expect(createDirectorylessProject).toHaveBeenCalledWith({ name: "研发替身" });
    expect(registerProject).toHaveBeenCalledWith(created);
    expect(result).toEqual({
      cwd: "/Users/test/.paseo/projects/prj_substitute",
      createdProjectId: "prj_substitute",
    });
  });

  test("rolls back an automatically created Project when mode persistence fails", async () => {
    const removeProject = vi.fn().mockResolvedValue({ removedWorkspaceIds: [] });
    const unregisterProject = vi.fn();

    await expect(
      rollbackSubstituteModeProject({
        projectId: "prj_substitute",
        client: {
          createDirectorylessProject: vi.fn(),
          removeProject,
        },
        unregisterProject,
      }),
    ).resolves.toBe(true);
    expect(removeProject).toHaveBeenCalledWith("prj_substitute");
    expect(unregisterProject).toHaveBeenCalledWith("prj_substitute");
  });
});
