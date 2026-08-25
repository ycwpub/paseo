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
} from "./project-config-form";

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

  it("renders a string lifecycle command as a single textarea text and remembers the kind", () => {
    const draft = configToDraft({
      worktree: { setup: "npm install" },
    });
    expect(draft.setupText).toBe("npm install");
    expect(draft.setupOriginalKind).toBe("string");
    expect(draft.teardownText).toBe("");
    expect(draft.teardownOriginalKind).toBe("missing");
  });

  it("renders an array lifecycle command as newline-separated text", () => {
    const draft = configToDraft({
      worktree: { teardown: ["docker compose down", "rm -rf .cache"] },
    });
    expect(draft.teardownText).toBe("docker compose down\nrm -rf .cache");
    expect(draft.teardownOriginalKind).toBe("array");
  });

  it("converts a scripts record into draft rows with stable local ids", () => {
    const draft = configToDraft({
      scripts: {
        dev: { type: "long-running", command: "npm run dev", port: 3000 },
        build: { command: ["npm", "run", "build"] },
      },
    });
    expect(draft.scripts).toHaveLength(2);
    const [devRow, buildRow] = draft.scripts;
    expect(devRow.name).toBe("dev");
    expect(devRow.commandText).toBe("npm run dev");
    expect(devRow.commandOriginalKind).toBe("string");
    expect(devRow.type).toBe("long-running");
    expect(devRow.portText).toBe("3000");
    expect(devRow.id).toMatch(/^script-draft-\d+$/);
    expect(buildRow.name).toBe("build");
    expect(buildRow.commandText).toBe("npm\nrun\nbuild");
    expect(buildRow.commandOriginalKind).toBe("array");
    expect(buildRow.portText).toBe("");
    expect(buildRow.id).not.toBe(devRow.id);
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

  it("preserves the original string kind when editing an existing setup field", () => {
    const base: PaseoConfigRaw = { worktree: { setup: "npm install" } };
    const draft = configToDraft(base);
    draft.setupText = "npm install\nnpm run prepare";
    const next = applyDraftToConfig({ draft, base });
    expect(next.worktree?.setup).toBe("npm install\nnpm run prepare");
  });

  it("preserves the original array kind when editing an existing teardown field", () => {
    const base: PaseoConfigRaw = {
      worktree: { teardown: ["docker compose down"] },
    };
    const draft = configToDraft(base);
    draft.teardownText = "docker compose down\nrm -rf .cache";
    const next = applyDraftToConfig({ draft, base });
    expect(next.worktree?.teardown).toEqual(["docker compose down", "rm -rf .cache"]);
  });

  it("writes a string for a newly added lifecycle field with one non-empty line", () => {
    const base: PaseoConfigRaw = {};
    const draft = configToDraft(base);
    draft.setupText = "npm install";
    const next = applyDraftToConfig({ draft, base });
    expect(next.worktree?.setup).toBe("npm install");
  });

  it("writes an array for a newly added lifecycle field with multiple non-empty lines", () => {
    const base: PaseoConfigRaw = {};
    const draft = configToDraft(base);
    draft.setupText = "npm install\nnpm run prepare";
    const next = applyDraftToConfig({ draft, base });
    expect(next.worktree?.setup).toEqual(["npm install", "npm run prepare"]);
  });

  it("omits a lifecycle field whose draft text is empty", () => {
    const base: PaseoConfigRaw = { worktree: { setup: "npm install" } };
    const draft = configToDraft(base);
    draft.setupText = "";
    const next = applyDraftToConfig({ draft, base });
    expect(next.worktree?.setup).toBeUndefined();
  });

  it("preserves unknown top-level, worktree, and script entry fields on round-trip", () => {
    const base = PaseoConfigRawSchema.parse({
      worktree: {
        setup: "npm install",
        terminals: [{ name: "dev", command: "npm run dev" }],
        customWorktreeField: "keep",
      },
      scripts: {
        dev: {
          type: "long-running",
          command: "npm run dev",
          port: 3000,
          customScriptField: { nested: true },
        },
      },
      customTopLevel: "preserved",
    });

    const draft = configToDraft(base);
    const next = applyDraftToConfig({ draft, base });

    expect((next as Record<string, unknown>).customTopLevel).toBe("preserved");
    expect((next.worktree as Record<string, unknown>).customWorktreeField).toBe("keep");
    expect((next.worktree as Record<string, unknown>).terminals).toEqual([
      { name: "dev", command: "npm run dev" },
    ]);
    const devEntry = (next.scripts ?? {}).dev as Record<string, unknown>;
    expect(devEntry.customScriptField).toEqual({ nested: true });
  });

  it("preserves all scripts on round-trip, including ones never edited in this session", () => {
    const base = PaseoConfigRawSchema.parse({
      scripts: {
        dev: { type: "long-running", command: "npm run dev", port: 3000, customDevField: "keep" },
        build: { command: ["npm", "run", "build"], customBuildField: { nested: 1 } },
        lint: { command: "npm run lint", type: "task" },
      },
    });

    const draft = configToDraft(base);
    // Edit only "dev". Leave "build" and "lint" untouched.
    const devRow = draft.scripts.find((row) => row.name === "dev");
    if (!devRow) throw new Error("expected dev row in draft");
    devRow.commandText = "npm run dev -- --watch";

    const next = applyDraftToConfig({ draft, base });
    const scripts = next.scripts ?? {};
    expect(Object.keys(scripts).sort()).toEqual(["build", "dev", "lint"]);

    const devEntry = scripts.dev as Record<string, unknown>;
    expect(devEntry.command).toBe("npm run dev -- --watch");
    expect(devEntry.type).toBe("long-running");
    expect(devEntry.port).toBe(3000);
    expect(devEntry.customDevField).toBe("keep");

    const buildEntry = scripts.build as Record<string, unknown>;
    expect(buildEntry.command).toEqual(["npm", "run", "build"]);
    expect(buildEntry.customBuildField).toEqual({ nested: 1 });

    const lintEntry = scripts.lint as Record<string, unknown>;
    expect(lintEntry.command).toBe("npm run lint");
    expect(lintEntry.type).toBe("task");
  });

  it("normalizes script command text into the original command kind", () => {
    const base = PaseoConfigRawSchema.parse({
      scripts: {
        build: { command: ["npm", "run", "build"] },
      },
    });
    const draft = configToDraft(base);
    const buildRow = draft.scripts[0];
    buildRow.commandText = "npm run build";
    const next = applyDraftToConfig({ draft, base });
    const buildEntry = (next.scripts ?? {}).build as Record<string, unknown>;
    expect(buildEntry.command).toEqual(["npm run build"]);
  });

  it("parses script port as a number when numeric and writes string for non-numeric input", () => {
    const base = PaseoConfigRawSchema.parse({});
    const draft = configToDraft(base);
    draft.scripts = [
      {
        id: "row-1",
        name: "dev",
        commandText: "npm run dev",
        commandOriginalKind: "missing",
        type: "long-running",
        portText: "3000",
        rawEntry: {},
      },
      {
        id: "row-2",
        name: "tunnel",
        commandText: "ngrok",
        commandOriginalKind: "missing",
        type: "long-running",
        portText: "auto",
        rawEntry: {},
      },
    ];
    const next = applyDraftToConfig({ draft, base });
    const dev = (next.scripts ?? {}).dev as Record<string, unknown>;
    const tunnel = (next.scripts ?? {}).tunnel as Record<string, unknown>;
    expect(dev.port).toBe(3000);
    expect(tunnel.port).toBe("auto");
  });

  it("reads metadata prompt instructions for visible keys", () => {
    const draft = configToDraft({
      metadataGeneration: {
        branchName: { instructions: "feat/<slug>" },
        commitMessage: { instructions: "Conventional commits." },
        pullRequest: { instructions: "Include risk notes." },
      },
    });
    expect(draft.metadataPrompts).toEqual({
      branchName: "feat/<slug>",
      commitMessage: "Conventional commits.",
      pullRequest: "Include risk notes.",
    });
  });

  it("defaults metadata prompts to empty strings when not present", () => {
    const draft = configToDraft({
      metadataGeneration: { branchName: { instructions: "feat/<slug>" } },
    });
    expect(draft.metadataPrompts).toEqual({
      branchName: "feat/<slug>",
      commitMessage: "",
      pullRequest: "",
    });
  });

  it("does not expose legacy agentTitle as a metadata prompt", () => {
    const draft = configToDraft(
      PaseoConfigRawSchema.parse({
        metadataGeneration: {
          agentTitle: { instructions: "Use mb/." },
          branchName: { instructions: "feat/<slug>" },
        },
      }),
    );

    expect(draft.metadataPrompts).toEqual({
      branchName: "feat/<slug>",
      commitMessage: "",
      pullRequest: "",
    });
  });

  it("writes only metadata prompt entries with non-empty text", () => {
    const base: PaseoConfigRaw = {};
    const draft = configToDraft(base);
    draft.metadataPrompts.branchName = "Use mb/.";
    draft.metadataPrompts.commitMessage = "Conventional commits.";
    const next = applyDraftToConfig({ draft, base });
    expect(next.metadataGeneration).toEqual({
      branchName: { instructions: "Use mb/." },
      commitMessage: { instructions: "Conventional commits." },
    });
  });

  it("drops the metadataGeneration field when all prompts are empty", () => {
    const base = PaseoConfigRawSchema.parse({
      metadataGeneration: {
        branchName: { instructions: "Use mb/." },
      },
    });
    const draft = configToDraft(base);
    draft.metadataPrompts.branchName = "";
    const next = applyDraftToConfig({ draft, base });
    expect(next.metadataGeneration).toBeUndefined();
  });

  it("preserves legacy and unknown sibling fields inside metadataGeneration on round-trip", () => {
    const base = PaseoConfigRawSchema.parse({
      metadataGeneration: {
        agentTitle: { instructions: "Use mb/." },
        futureField: 42,
      },
    });
    const draft = configToDraft(base);
    draft.metadataPrompts.branchName = "Use prefix mb/ on branches.";
    const next = applyDraftToConfig({ draft, base });
    const metadata = next.metadataGeneration as Record<string, unknown>;
    expect(metadata.agentTitle).toEqual({ instructions: "Use mb/." });
    expect(metadata.branchName).toEqual({ instructions: "Use prefix mb/ on branches." });
    expect(metadata.futureField).toBe(42);
  });

  it("preserves unknown fields inside a metadata prompt entry on round-trip", () => {
    const base = PaseoConfigRawSchema.parse({
      metadataGeneration: {
        branchName: { instructions: "Use mb/.", model: "haiku" },
      },
    });
    const draft = configToDraft(base);
    draft.metadataPrompts.branchName = "Updated.";
    const next = applyDraftToConfig({ draft, base });
    const metadata = next.metadataGeneration as Record<string, unknown>;
    expect(metadata.branchName).toEqual({ instructions: "Updated.", model: "haiku" });
  });

  it("clears instructions but preserves unknown sibling fields when text becomes empty", () => {
    const base = PaseoConfigRawSchema.parse({
      metadataGeneration: {
        branchName: { instructions: "Use mb/.", model: "haiku" },
      },
    });
    const draft = configToDraft(base);
    draft.metadataPrompts.branchName = "";
    const next = applyDraftToConfig({ draft, base });
    const metadata = next.metadataGeneration as Record<string, unknown>;
    expect(metadata.branchName).toEqual({ model: "haiku" });
  });

  it("drops scripts with an empty name and removes scripts no longer present in the draft", () => {
    const base = PaseoConfigRawSchema.parse({
      scripts: {
        dev: { command: "npm run dev" },
        build: { command: "npm run build" },
      },
    });
    const draft = configToDraft(base);
    // remove build, add a row with empty name.
    draft.scripts = draft.scripts
      .filter((row) => row.name !== "build")
      .concat({
        id: "row-empty",
        name: "   ",
        commandText: "echo hi",
        commandOriginalKind: "missing",
        type: "",
        portText: "",
        rawEntry: {},
      });
    const next = applyDraftToConfig({ draft, base });
    const scripts = next.scripts ?? {};
    expect(Object.keys(scripts)).toEqual(["dev"]);
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
