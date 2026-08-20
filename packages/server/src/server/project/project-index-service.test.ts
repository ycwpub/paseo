import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DaemonConfigStore } from "../daemon-config-store.js";
import type { ProjectRegistry } from "../workspace-registry.js";
import { buildProjectIndexSkillDocument, ProjectIndexService } from "./project-index-service.js";

describe("buildProjectIndexSkillDocument", () => {
  it("generates a standard Skill with project and mandatory knowledge entries", () => {
    const document = buildProjectIndexSkillDocument({
      project: {
        projectId: "prj_123",
        displayName: "Checkout",
        customName: null,
        rootPath: "/repo/checkout",
      },
      projectDirectories: ["/repo/checkout"],
      knowledgeDirectories: ["/repo/checkout/docs/rules"],
      entries: [
        { kind: "project", root: "/repo/checkout", path: "packages/api" },
        {
          kind: "knowledge",
          root: "/repo/checkout/docs/rules",
          path: "security.md",
        },
      ],
      truncated: false,
    });

    expect(document).toContain('name: "project-index-prj_123"');
    expect(document).toContain("knowledge roots are mandatory");
    expect(document).toContain("[project] packages/api");
    expect(document).toContain("[knowledge] security.md");
  });

  it("writes SKILL.md for an enabled Project index", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-index-"));
    mkdirSync(path.join(root, "src"), { recursive: true });
    mkdirSync(path.join(root, "docs"), { recursive: true });
    writeFileSync(path.join(root, "src", "main.ts"), "export {};\n");
    writeFileSync(path.join(root, "docs", "rules.md"), "# Rules\n");
    writeFileSync(
      path.join(root, "paseo.json"),
      JSON.stringify({
        project: {
          directories: {
            project: ["src"],
            knowledge: ["docs"],
            indexSkill: [".paseo/index"],
          },
          indexSkill: { autoGenerate: true, updateIntervalMinutes: 1 },
        },
      }),
    );
    const project = {
      projectId: "prj_test",
      rootPath: root,
      kind: "git" as const,
      displayName: "Test",
      customName: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
    };
    const logger = {
      child() {
        return this;
      },
      info() {},
      warn() {},
    };
    const service = new ProjectIndexService({
      projectRegistry: {
        list: async () => [project],
      } as Pick<ProjectRegistry, "list">,
      daemonConfigStore: {
        get: () => ({ projectIndexing: { updateIntervalMinutes: 1440 } }),
      } as DaemonConfigStore,
      paseoHome: root,
      logger: logger as never,
    });

    await service.runOnce();

    const generated = readFileSync(path.join(root, ".paseo/index/SKILL.md"), "utf8");
    expect(generated).toContain("[project] main.ts");
    expect(generated).toContain("[knowledge] rules.md");
  });

  it("generates isolated indexes for every Git branch and removes deleted branches", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-branch-index-"));
    execFileSync("git", ["init", "-b", "main", root]);
    writeFileSync(path.join(root, "main.txt"), "main\n");
    execFileSync("git", ["-C", root, "add", "main.txt"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Paseo Test",
      "-c",
      "user.email=paseo@example.com",
      "commit",
      "-m",
      "main",
    ]);
    execFileSync("git", ["-C", root, "checkout", "-b", "feature/index"]);
    writeFileSync(path.join(root, "feature.txt"), "feature\n");
    execFileSync("git", ["-C", root, "add", "feature.txt"]);
    execFileSync("git", [
      "-C",
      root,
      "-c",
      "user.name=Paseo Test",
      "-c",
      "user.email=paseo@example.com",
      "commit",
      "-m",
      "feature",
    ]);
    execFileSync("git", ["-C", root, "checkout", "main"]);
    writeFileSync(
      path.join(root, "paseo.json"),
      JSON.stringify({
        project: {
          directories: {
            project: ["."],
            knowledge: [],
            indexSkill: [".paseo/index"],
          },
          indexSkill: { autoGenerate: true, updateIntervalMinutes: 1440 },
        },
      }),
    );
    const project = {
      projectId: "prj_branches",
      rootPath: root,
      kind: "git" as const,
      displayName: "Branches",
      customName: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
    };
    const service = new ProjectIndexService({
      projectRegistry: { list: async () => [project] } as Pick<ProjectRegistry, "list">,
      daemonConfigStore: {
        get: () => ({ projectIndexing: { updateIntervalMinutes: 1440 } }),
      } as DaemonConfigStore,
      paseoHome: root,
      logger: {
        child() {
          return this;
        },
        info() {},
        warn() {},
      } as never,
    });

    await service.runOnce();

    const branchRoot = path.join(root, ".paseo/index/branches");
    const files = readdirSync(branchRoot, { recursive: true, encoding: "utf8" }).filter((entry) =>
      entry.endsWith("SKILL.md"),
    );
    expect(files).toHaveLength(2);
    const documents = files.map((file) => readFileSync(path.join(branchRoot, file), "utf8"));
    expect(documents.some((document) => document.includes("Git branch: `main`"))).toBe(true);
    expect(
      documents.some(
        (document) =>
          document.includes("Git branch: `feature/index`") &&
          document.includes("[project] feature.txt"),
      ),
    ).toBe(true);

    execFileSync("git", ["-C", root, "branch", "-D", "feature/index"]);
    await service.runOnce();

    const remaining = readdirSync(branchRoot, { recursive: true, encoding: "utf8" }).filter(
      (entry) => entry.endsWith("SKILL.md"),
    );
    expect(remaining).toHaveLength(1);
    expect(readFileSync(path.join(branchRoot, remaining[0]!), "utf8")).toContain(
      "Git branch: `main`",
    );
  });
});
