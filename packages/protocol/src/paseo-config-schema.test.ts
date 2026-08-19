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
      workspaceData: ["~/.paseo/workspaces/{{workspaceId}}"],
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

  it("parses an empty config without metadata generation", () => {
    const parsed = PaseoConfigSchema.parse({});

    expect(parsed).toEqual({});
    expect(parsed.metadataGeneration).toBeUndefined();
  });

  it("parses old-style worktree and scripts config unchanged", () => {
    const config = {
      worktree: {
        setup: "npm install",
        teardown: ["npm run clean"],
      },
      scripts: {
        dev: {
          type: "service",
          command: "npm run dev",
          port: 5173,
        },
      },
    };

    expect(PaseoConfigSchema.parse(config)).toEqual({
      worktree: {
        setup: ["npm install"],
        teardown: ["npm run clean"],
      },
      scripts: config.scripts,
    });
  });

  it("parses service port allocation", () => {
    expect(
      PaseoConfigSchema.parse({
        worktree: {
          servicePorts: { range: "3000-4000", portScript: "/usr/bin/portmake" },
        },
      }),
    ).toEqual({
      worktree: {
        setup: [],
        teardown: [],
        servicePorts: { range: "3000-4000", portScript: "/usr/bin/portmake" },
      },
    });
  });

  it("rejects invalid service port ranges", () => {
    expect(() =>
      PaseoConfigRawSchema.parse({ worktree: { servicePorts: { range: "4000-3000" } } }),
    ).toThrow("Expected an inclusive TCP port range");
  });

  it("normalizes partial worktree lifecycle config without dropping present commands", () => {
    expect(
      PaseoConfigSchema.parse({
        worktree: {
          setup: 'echo "setup ran" > setup.log',
        },
      }),
    ).toEqual({
      worktree: {
        setup: ['echo "setup ran" > setup.log'],
        teardown: [],
      },
    });

    expect(
      PaseoConfigSchema.parse({
        worktree: {
          teardown: ["npm run clean"],
        },
      }),
    ).toEqual({
      worktree: {
        setup: [],
        teardown: ["npm run clean"],
      },
    });
  });

  it("parses all metadata generation instruction entries", () => {
    expect(
      PaseoConfigSchema.parse({
        metadataGeneration: {
          title: { instructions: "Keep titles to a few words." },
          branchName: { instructions: "Prefix branches with feat/." },
          commitMessage: { instructions: "Use imperative mood." },
          pullRequest: { instructions: "Include risk notes." },
        },
      }),
    ).toEqual({
      metadataGeneration: {
        title: { instructions: "Keep titles to a few words." },
        branchName: { instructions: "Prefix branches with feat/." },
        commitMessage: { instructions: "Use imperative mood." },
        pullRequest: { instructions: "Include risk notes." },
      },
    });
  });

  it("parses partial metadata generation instructions with missing entries undefined", () => {
    const parsed = PaseoConfigSchema.parse({
      metadataGeneration: {
        branchName: { instructions: "Keep it short." },
      },
    });

    expect(parsed.metadataGeneration).toEqual({
      branchName: { instructions: "Keep it short." },
    });
    expect(parsed.metadataGeneration?.commitMessage).toBeUndefined();
    expect(parsed.metadataGeneration?.pullRequest).toBeUndefined();
  });

  it("preserves legacy agentTitle metadata instructions as passthrough", () => {
    expect(
      PaseoConfigSchema.parse({
        metadataGeneration: {
          agentTitle: { instructions: "Use concise titles." },
        },
      }),
    ).toEqual({
      metadataGeneration: {
        agentTitle: { instructions: "Use concise titles." },
      },
    });
  });

  it("passes through unknown metadata generation fields", () => {
    expect(
      PaseoConfigSchema.parse({
        metadataGeneration: {
          futureField: 42,
        },
      }),
    ).toEqual({
      metadataGeneration: {
        futureField: 42,
      },
    });
  });

  it("passes through unknown metadata generator entry fields", () => {
    expect(
      PaseoConfigSchema.parse({
        metadataGeneration: {
          branchName: {
            instructions: "Use concise titles.",
            model: "haiku",
          },
        },
      }),
    ).toEqual({
      metadataGeneration: {
        branchName: {
          instructions: "Use concise titles.",
          model: "haiku",
        },
      },
    });
  });

  it("falls back to an empty metadata generator entry when instructions has an invalid type", () => {
    expect(
      PaseoConfigSchema.parse({
        metadataGeneration: {
          branchName: { instructions: 42 },
        },
      }),
    ).toEqual({
      metadataGeneration: {
        branchName: {},
      },
    });
  });

  it("raw schema preserves old-style config while accepting legacy agentTitle", () => {
    const config = {
      worktree: {
        setup: "npm install",
        teardown: ["npm run clean"],
      },
      scripts: {
        dev: {
          type: "service",
          command: "npm run dev",
        },
      },
      metadataGeneration: {
        agentTitle: { instructions: "Use concise titles." },
        branchName: { instructions: "Use concise branches." },
      },
    };

    expect(PaseoConfigRawSchema.parse(config)).toEqual(config);
  });

  it("raw schema falls back to an empty metadata generator entry when instructions has an invalid type", () => {
    expect(
      PaseoConfigRawSchema.parse({
        metadataGeneration: {
          branchName: { instructions: 42 },
        },
      }),
    ).toEqual({
      metadataGeneration: {
        branchName: {},
      },
    });
  });

  it("parses project directories, indexing, variables, Lark documents, and instruction templates", () => {
    const project = {
      directories: {
        project: [".", "../shared-source"],
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
