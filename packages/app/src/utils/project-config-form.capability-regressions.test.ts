import { describe, expect, it } from "vitest";
import { PaseoConfigRawSchema } from "@getpaseo/protocol/paseo-config-schema";
import type { PaseoConfigRaw } from "@getpaseo/protocol/messages";
import { createProjectKnowledgeResourceDraft } from "@/projects/knowledge/model";
import {
  applyDraftToConfig,
  configToDraft,
  instructionTemplateDraftsToConfig,
  projectDirectoryPathForDisplay,
  type ProjectDirectoryDraft,
} from "../projects/config/project-config-editor-model";
function directory(id: string, path: string, enabled = true): ProjectDirectoryDraft {
  return { id, path, enabled };
}
describe("projectDirectoryPathForDisplay", () => {
  it("shows the workspace directory placeholder as an absolute path", () => {
    expect(
      projectDirectoryPathForDisplay("{{workspaceDirectory}}", "/Users/dev/projects/miniapp"),
    ).toBe("/Users/dev/projects/miniapp");
    expect(
      projectDirectoryPathForDisplay(
        "{{ workspaceDirectory }}/packages/app",
        "/Users/dev/projects/miniapp",
      ),
    ).toBe("/Users/dev/projects/miniapp/packages/app");
  });
  it("leaves other variables unchanged", () => {
    expect(projectDirectoryPathForDisplay("{{docs}}", "/Users/dev/projects/miniapp")).toBe(
      "{{docs}}",
    );
  });
});
describe("configToDraft", () => {
  it("returns an empty draft for null config", () => {
    const draft = configToDraft(null);
    expect(draft).toMatchObject({
      setupText: "",
      teardownText: "",
      projectDirectoryMode: "single",
      projectIndexAutoGenerate: false,
      projectIndexUpdateIntervalText: "",
      projectVariables: [],
      projectKnowledge: {
        general: [],
        standards: [],
        projectSpecific: [],
      },
      instructionTemplates: [],
    });
    expect(draft.projectDirectories.project).toEqual([
      expect.objectContaining({ path: "{{workspaceDirectory}}", enabled: true }),
    ]);
    expect(draft.projectDirectories.workspaceData).toEqual([
      expect.objectContaining({
        path: "~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}",
        enabled: true,
      }),
    ]);
  });
  it("projects project resources, variables, indexing, and templates into the draft", () => {
    const draft = configToDraft({
      project: {
        directories: {
          project: [".", "../shared"],
          reference: ["../legacy", "/opt/company/examples"],
          knowledge: ["docs/rules"],
          indexSkill: [".paseo/index"],
          workspaceData: [".paseo/workspaces"],
        },
        indexSkill: { autoGenerate: true, updateIntervalMinutes: 45 },
        variables: { service: "billing" },
        larkDocumentLinks: [
          "https://example.feishu.cn/wiki/architecture",
          "https://example.feishu.cn/docx/release",
        ],
        knowledge: {
          standards: [{ type: "local-document", source: "docs/standards.md" }],
          projectSpecific: [{ type: "cloud-document", source: "https://example.com/architecture" }],
        },
        instructionTemplates: [
          {
            id: "review",
            name: "Review",
            description: "Review changes",
            content: "Review {{service}}.",
          },
        ],
      },
    });
    expect(
      draft.projectDirectories.project.map(({ path, enabled }) => ({ path, enabled })),
    ).toEqual([
      { path: ".", enabled: true },
      { path: "../shared", enabled: true },
    ]);
    expect(
      draft.projectKnowledge.general.map(({ type, source, enabled }) => ({
        type,
        source,
        enabled,
      })),
    ).toEqual([
      { type: "local-directory", source: "docs/rules", enabled: true },
      { type: "local-directory", source: "../legacy", enabled: true },
      { type: "local-directory", source: "/opt/company/examples", enabled: true },
      {
        type: "cloud-document",
        source: "https://example.feishu.cn/wiki/architecture",
        enabled: true,
      },
      {
        type: "cloud-document",
        source: "https://example.feishu.cn/docx/release",
        enabled: true,
      },
    ]);
    expect(draft.projectIndexAutoGenerate).toBe(true);
    expect(draft.projectIndexUpdateIntervalText).toBe("45");
    expect(draft.projectVariables[0]).toMatchObject({ name: "service", value: "billing" });
    expect(draft.projectKnowledge.standards[0]).toMatchObject({
      type: "local-document",
      source: "docs/standards.md",
    });
    expect(draft.projectKnowledge.projectSpecific[0]).toMatchObject({
      type: "cloud-document",
      source: "https://example.com/architecture",
    });
    expect(draft.instructionTemplates[0]).toMatchObject({
      id: "review",
      name: "Review",
      description: "Review changes",
      content: "Review {{service}}.",
    });
  });
});
describe("applyDraftToConfig", () => {
  it("migrates legacy knowledge directories into general knowledge when saving", () => {
    const base = PaseoConfigRawSchema.parse({
      project: {
        directories: {
          project: ["."],
          reference: ["../legacy", { path: "docs/shared", enabled: false }],
          knowledge: ["docs/rules", "docs/shared"],
        },
      },
    });
    const draft = configToDraft(base);
    const next = applyDraftToConfig({ draft, base });
    const directories = next.project?.directories as Record<string, unknown>;
    expect(directories.reference).toBeUndefined();
    expect(directories.knowledge).toBeUndefined();
    expect(next.project?.knowledge?.general).toEqual([
      { type: "local-directory", source: "docs/rules", enabled: true },
      { type: "local-directory", source: "docs/shared", enabled: true },
      { type: "local-directory", source: "../legacy", enabled: true },
    ]);
  });
  it("writes project directories, variables, and indexing without project-local templates", () => {
    const draft = configToDraft({});
    draft.projectDirectories = {
      project: [directory("p1", "."), directory("p2", " packages/api ")],
      indexSkill: [directory("i1", ".paseo/index")],
      workspaceData: [directory("w1", ".paseo/workspaces")],
    };
    draft.projectIndexAutoGenerate = true;
    draft.projectIndexUpdateIntervalText = "60";
    draft.projectVariables = [{ id: "v1", name: " service ", value: "billing" }];
    draft.projectKnowledge.general = [
      createProjectKnowledgeResourceDraft({
        type: "local-directory",
        source: " docs/rules ",
      }),
      createProjectKnowledgeResourceDraft({
        type: "cloud-document",
        source: " https://example.com/architecture ",
      }),
    ];
    draft.projectKnowledge.standards = [
      createProjectKnowledgeResourceDraft({
        type: "local-document",
        source: " docs/standards.md ",
      }),
    ];
    draft.instructionTemplates = [
      {
        rowId: "t1",
        id: " review ",
        name: " Review changes ",
        description: "",
        content: "Review {{service}}.",
        rawEntry: { id: "review", name: "Review", content: "" },
      },
    ];
    expect(applyDraftToConfig({ draft, base: {} }).project).toEqual({
      directoryMode: "single",
      directories: {
        project: [
          { path: ".", enabled: true },
          { path: "packages/api", enabled: true },
        ],
        indexSkill: [{ path: ".paseo/index", enabled: true }],
        workspaceData: [{ path: ".paseo/workspaces", enabled: true }],
      },
      indexSkill: { autoGenerate: true, updateIntervalMinutes: 60 },
      variables: { service: "billing" },
      knowledge: {
        general: [
          { type: "local-directory", source: "docs/rules", enabled: true },
          { type: "cloud-document", source: "https://example.com/architecture", enabled: true },
        ],
        standards: [{ type: "local-document", source: "docs/standards.md", enabled: true }],
        projectSpecific: [],
      },
    });
  });
  it("migrates and removes legacy Project Lark document links when saving", () => {
    const base: PaseoConfigRaw = {
      project: {
        larkDocumentLinks: ["https://example.feishu.cn/wiki/architecture"],
      },
    };
    const draft = configToDraft(base);
    const project = applyDraftToConfig({ draft, base }).project;
    expect(project?.larkDocumentLinks).toBeUndefined();
    expect(project?.knowledge?.general).toEqual([
      {
        type: "cloud-document",
        source: "https://example.feishu.cn/wiki/architecture",
        enabled: true,
      },
    ]);
  });
  it("preserves legacy project-local instruction templates when saving", () => {
    const base: PaseoConfigRaw = {
      project: {
        instructionTemplates: [{ id: "review", name: "Review", content: "Review this." }],
      },
    };
    expect(applyDraftToConfig({ draft: configToDraft(base), base }).project).toMatchObject({
      instructionTemplates: [{ id: "review", name: "Review", content: "Review this." }],
    });
  });
  it("converts global instruction template drafts independently from project config", () => {
    expect(
      instructionTemplateDraftsToConfig([
        {
          rowId: "template-1",
          id: " review ",
          name: " Review changes ",
          description: " ",
          content: "Review {{service}}.",
          rawEntry: {
            id: "legacy",
            name: "Legacy",
            description: "Remove me",
            content: "",
            futureField: "keep",
          },
        },
      ]),
    ).toEqual([
      {
        id: "review",
        name: "Review changes",
        content: "Review {{service}}.",
        futureField: "keep",
      },
    ]);
  });
  it("preserves unknown project configuration fields", () => {
    const base = PaseoConfigRawSchema.parse({
      project: {
        futureField: { keep: true },
        directories: { project: ["."], futureDirectoryKind: ["generated"] },
        indexSkill: { autoGenerate: false, futureIndexFlag: "keep" },
      },
    });
    const draft = configToDraft(base);
    draft.projectKnowledge.general = [
      createProjectKnowledgeResourceDraft({ type: "local-directory", source: "docs" }),
    ];
    const next = applyDraftToConfig({ draft, base });
    expect(next.project).toMatchObject({
      futureField: { keep: true },
      directories: {
        project: [{ path: ".", enabled: true }],
        futureDirectoryKind: ["generated"],
      },
      knowledge: {
        general: [{ type: "local-directory", source: "docs", enabled: true }],
      },
      indexSkill: { autoGenerate: false, futureIndexFlag: "keep" },
    });
  });
});
