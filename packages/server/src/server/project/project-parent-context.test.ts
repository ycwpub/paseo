import { describe, expect, it } from "vitest";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import { EMPTY_PROJECT_KNOWLEDGE } from "./project-knowledge-context.js";
import { loadParentProjectKnowledge } from "./project-parent-context.js";

function createProject(projectId: string, parentProjectId: string | null): PersistedProjectRecord {
  return {
    projectId,
    parentProjectId,
    projectKey: null,
    rootPath: null,
    kind: "non_git",
    displayName: projectId,
    customName: null,
    customIconRevision: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    archivedAt: null,
  };
}

describe("loadParentProjectKnowledge", () => {
  it("loads ancestor layers from the root Project to the direct parent", async () => {
    const root = createProject("root", null);
    const parent = createProject("parent", root.projectId);
    const child = createProject("child", parent.projectId);
    const projects = new Map([
      [root.projectId, root],
      [parent.projectId, parent],
      [child.projectId, child],
    ]);

    const result = await loadParentProjectKnowledge({
      project: child,
      projectRegistry: {
        get: async (projectId: string) => projects.get(projectId) ?? null,
      },
      resolveLayer: async (project) => ({
        knowledgeDirectories: [`/${project.projectId}/knowledge`],
        knowledge: {
          ...EMPTY_PROJECT_KNOWLEDGE,
          general: {
            ...EMPTY_PROJECT_KNOWLEDGE.general,
            localDocuments: [project.projectId],
          },
        },
        authIssues: [],
      }),
    });

    expect(result.knowledgeDirectories).toEqual(["/root/knowledge", "/parent/knowledge"]);
    expect(result.knowledgeLayers.map((layer) => layer.general.localDocuments)).toEqual([
      ["root"],
      ["parent"],
    ]);
  });

  it("stops when a parent relationship contains a cycle", async () => {
    const child = createProject("child", "parent");
    const parent = createProject("parent", child.projectId);
    const projects = new Map([
      [child.projectId, child],
      [parent.projectId, parent],
    ]);

    const result = await loadParentProjectKnowledge({
      project: child,
      projectRegistry: {
        get: async (projectId: string) => projects.get(projectId) ?? null,
      },
      resolveLayer: async (project) => ({
        knowledgeDirectories: [project.projectId],
        knowledge: EMPTY_PROJECT_KNOWLEDGE,
        authIssues: [],
      }),
    });

    expect(result.knowledgeDirectories).toEqual(["parent"]);
  });
});
