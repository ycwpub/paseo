import { describe, expect, it } from "vitest";
import {
  PaseoConfigRawSchema,
  PaseoConfigSchema,
  resolvePaseoProjectDirectoryValues,
} from "@getpaseo/protocol/paseo-config-schema";
describe("paseo config schema", () => {
  it("provides cross-agent knowledge and workspace-data directory defaults", () => {
    expect(resolvePaseoProjectDirectoryValues(undefined)).toEqual({
      project: ["{{workspaceDirectory}}"],
      knowledge: [],
      indexSkill: [],
      workspaceData: ["~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}"],
    });
  });
  it("keeps explicitly configured empty directory lists", () => {
    expect(
      resolvePaseoProjectDirectoryValues({
        project: [],
        knowledge: [],
        indexSkill: [],
        workspaceData: [],
      }),
    ).toEqual({
      project: [],
      knowledge: [],
      indexSkill: [],
      workspaceData: [],
    });
  });
  it("accepts enabled directory entries and excludes unchecked entries", () => {
    const directories = {
      project: [
        { path: "/repo/a", enabled: true },
        { path: "/repo/b", enabled: false },
      ],
      knowledge: ["docs"],
    };
    expect(resolvePaseoProjectDirectoryValues(directories)).toMatchObject({
      project: ["/repo/a"],
      knowledge: ["docs"],
    });
    expect(
      PaseoConfigSchema.parse({
        project: { directoryMode: "multiple", directories },
      }),
    ).toMatchObject({
      project: { directoryMode: "multiple", directories },
    });
  });
  it("merges legacy reference directories into knowledge directories", () => {
    expect(
      resolvePaseoProjectDirectoryValues({
        reference: ["../legacy", { path: "docs", enabled: false }],
        knowledge: ["docs", "/opt/company/standards"],
      }),
    ).toEqual({
      project: ["{{workspaceDirectory}}"],
      knowledge: ["docs", "/opt/company/standards", "../legacy"],
      indexSkill: [],
      workspaceData: ["~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}"],
    });
  });
  it.each([
    "~/.paseo/{{projectId}}/workspaces/{{workspaceId}}",
    "~/.paseo/workspaces/{{workspaceId}}",
  ])("upgrades the legacy default Workspace data directory %s", (legacyPath) => {
    expect(
      resolvePaseoProjectDirectoryValues({
        workspaceData: [legacyPath],
      }).workspaceData,
    ).toEqual(["~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}"]);
  });
  it("parses project directories, knowledge, indexing, variables, legacy Lark documents, and instruction templates", () => {
    const project = {
      directories: {
        project: [".", "../shared-source"],
        reference: ["../legacy-source", "/opt/company/examples"],
        knowledge: ["docs/rules", "/opt/company/standards"],
        indexSkill: [".paseo/project-index"],
        workspaceData: [".paseo/workspaces"],
      },
      indexSkill: {
        autoGenerate: true,
        updateIntervalMinutes: 30,
      },
      variables: {
        serviceName: "checkout",
        owner: "payments",
      },
      knowledge: {
        general: [
          { type: "local-directory", source: "docs/background" },
          { type: "local-document", source: "README.md", enabled: false },
          { type: "cloud-document", source: "https://example.com/domain" },
        ],
        standards: [
          { type: "local-document", source: "docs/standards.md" },
          { type: "cloud-document", source: "https://example.com/standards" },
        ],
        projectSpecific: [
          { type: "local-document", source: "docs/architecture.md" },
          { type: "cloud-document", source: "https://example.com/architecture" },
        ],
      },
      larkDocumentLinks: [
        "https://example.feishu.cn/wiki/architecture",
        "https://example.larksuite.com/docx/release",
      ],
      instructionTemplates: [
        {
          id: "review",
          name: "Review changes",
          description: "Review the current workspace",
          content: "Review {{serviceName}} for {{owner}}.",
        },
      ],
    };
    expect(PaseoConfigRawSchema.parse({ project })).toEqual({ project });
    expect(PaseoConfigSchema.parse({ project })).toEqual({ project });
  });
  it("allows automatic index generation to be disabled with empty index directories", () => {
    expect(
      PaseoConfigSchema.parse({
        project: {
          directories: { indexSkill: [] },
          indexSkill: { autoGenerate: false },
        },
      }),
    ).toEqual({
      project: {
        directories: { indexSkill: [] },
        indexSkill: { autoGenerate: false },
      },
    });
  });
});
