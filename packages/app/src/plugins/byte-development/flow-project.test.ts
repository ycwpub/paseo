import { describe, expect, it, vi } from "vitest";
import { createDevelopmentProject, developmentProjectName } from "./flow-project";

describe("byte development project", () => {
  it("creates one directoryless Project for each submitted flow", async () => {
    const createDirectorylessProject = vi.fn(async () => ({
      project: {
        projectId: "prj_flow",
        projectDisplayName: "研发流程 · 支付优化",
        projectCustomName: null,
        projectCustomIconRevision: null,
        projectRootPath: "",
        projectDirectoryless: true,
        projectKind: "non_git" as const,
      },
      error: null,
    }));
    await expect(
      createDevelopmentProject({
        client: { createDirectorylessProject },
        flowTitle: "支付优化",
      }),
    ).resolves.toMatchObject({ projectId: "prj_flow" });
    expect(createDirectorylessProject).toHaveBeenCalledWith({
      name: "研发流程 · 支付优化",
    });
  });

  it("caps generated Project names at the protocol limit", () => {
    expect(developmentProjectName("a".repeat(200))).toHaveLength(120);
  });

  it("uses a custom Project name when provided", async () => {
    const createDirectorylessProject = vi.fn(async ({ name }: { name: string }) => ({
      project: {
        projectId: "prj_flow",
        projectDisplayName: name,
        projectCustomName: null,
        projectCustomIconRevision: null,
        projectRootPath: "",
        projectDirectoryless: true,
        projectKind: "non_git" as const,
      },
      error: null,
    }));
    await createDevelopmentProject({
      client: { createDirectorylessProject },
      flowTitle: "支付优化",
      projectName: "支付研发项目",
    });
    expect(createDirectorylessProject).toHaveBeenCalledWith({
      name: "支付研发项目",
    });
  });
});
