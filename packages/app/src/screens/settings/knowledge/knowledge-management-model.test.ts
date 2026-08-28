import { describe, expect, it } from "vitest";
import { createProjectKnowledgeResourceDraft } from "@/projects/knowledge/model";
import type { ProjectSummary } from "@/utils/projects";
import {
  applyProjectKnowledgeToConfig,
  buildKnowledgeProjectTargets,
} from "./knowledge-management-model";

describe("knowledge management model", () => {
  it("builds host-scoped Project choices and removes duplicates", () => {
    const projects = [
      {
        viewKey: "project-1",
        projectName: "Project One",
        projectCustomName: "Alpha",
        totalWorkspaceCount: 0,
        hostCount: 2,
        onlineHostCount: 2,
        hosts: [
          {
            serverId: "host-1",
            projectId: "project-1",
            parentProjectId: null,
            projectName: "Project One",
            projectCustomName: "Alpha",
            serverName: "Host One",
            isOnline: true,
            projectPath: "/managed/project-1",
            repoRoot: "/repo/project-1",
            isDirectoryless: false,
            workspaceCount: 0,
            workspaces: [],
          },
          {
            serverId: "host-2",
            projectId: "project-1",
            parentProjectId: null,
            projectName: "Project One",
            projectCustomName: null,
            serverName: "Host Two",
            isOnline: true,
            projectPath: "/managed/project-1",
            repoRoot: "/other/project-1",
            isDirectoryless: false,
            workspaceCount: 0,
            workspaces: [],
          },
        ],
      },
    ] satisfies ProjectSummary[];

    expect(buildKnowledgeProjectTargets(projects, "host-1")).toEqual([
      {
        projectId: "project-1",
        label: "Alpha",
        description: "/repo/project-1",
        repoRoot: "/repo/project-1",
        isDirectoryless: false,
        isOnline: true,
      },
    ]);
  });

  it("updates only canonical Project knowledge fields", () => {
    const config = {
      version: 1,
      custom: { keep: true },
      project: {
        variables: { region: "cn" },
        directories: {
          project: [{ path: "src" }],
          knowledge: [{ path: "legacy-docs" }],
          reference: [{ path: "legacy-reference" }],
        },
        larkDocumentLinks: ["https://example.com/legacy"],
        knowledge: {
          general: [{ type: "local-directory", source: "old" }],
          custom: { keep: true },
        },
      },
    } satisfies import("@getpaseo/protocol/messages").PaseoConfigRaw;
    const next = applyProjectKnowledgeToConfig(config, {
      general: [
        createProjectKnowledgeResourceDraft({
          section: "general",
          source: "docs",
        }),
      ],
      standards: [
        createProjectKnowledgeResourceDraft({
          section: "standards",
          type: "cloud-document",
          source: "https://example.com/standard",
        }),
      ],
      projectSpecific: [],
    });

    expect(next).toMatchObject({
      version: 1,
      custom: { keep: true },
      project: {
        variables: { region: "cn" },
        directories: {
          project: [{ path: "src" }],
        },
        knowledge: {
          general: [{ type: "local-directory", source: "docs", enabled: true }],
          standards: [
            {
              type: "cloud-document",
              source: "https://example.com/standard",
              enabled: true,
            },
          ],
          custom: { keep: true },
        },
      },
    });
    expect(next.project).not.toHaveProperty("larkDocumentLinks");
  });
});
