import { describe, expect, it } from "vitest";
import type { ProjectDescriptor } from "@/stores/session-store";
import { buildProjects } from "./projects";

describe("blank Project summaries", () => {
  it("preserves the directoryless state without inventing a repository root", () => {
    const project: ProjectDescriptor = {
      projectId: "project-blank",
      projectKey: null,
      projectDisplayName: "Planning",
      projectCustomName: null,
      projectRootPath: "",
      projectDirectoryless: true,
      projectKind: "non_git",
    };

    const result = buildProjects({
      hosts: [
        {
          serverId: "host-a",
          serverName: "Host A",
          isOnline: true,
          projects: [project],
          workspaces: [],
        },
      ],
    });

    expect(result.projects[0]?.hosts[0]).toMatchObject({
      projectId: "project-blank",
      repoRoot: "",
      isDirectoryless: true,
    });
  });
});
