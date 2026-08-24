import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProjectRepositoryClassificationPrompt,
  classifyManagedProjectRepositories,
  listManagedProjectRepositories,
  reconcileManagedProjectRepositories,
} from "./project-repository-classification.js";
import {
  resolveGlobalProjectConfigPath,
  writeProjectConfigForProject,
} from "./project-config-storage.js";
import { resolveManagedProjectStorageRoot } from "./project-storage-paths.js";

const temporaryDirectories: string[] = [];

function makeDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("managed Project repository classification", () => {
  it("lists only visible first-level repository directories", () => {
    const projectRoot = makeDirectory("paseo-project-repositories-");
    const repositoriesRoot = path.join(projectRoot, "repos");
    mkdirSync(path.join(repositoriesRoot, "service-b", "nested"), { recursive: true });
    mkdirSync(path.join(repositoriesRoot, "service-a"), { recursive: true });
    mkdirSync(path.join(repositoriesRoot, ".partial"), { recursive: true });
    writeFileSync(path.join(repositoriesRoot, "README.md"), "not a repository");

    expect(listManagedProjectRepositories(projectRoot)).toEqual([
      path.join(repositoriesRoot, "service-a"),
      path.join(repositoriesRoot, "service-b"),
    ]);
  });

  it("adds unclassified repositories to general knowledge", () => {
    const projectRoot = path.resolve("/managed/projects/prj_reference");
    const repository = path.join(projectRoot, "repos/reference-service");

    const classification = classifyManagedProjectRepositories({
      config: {
        project: {
          directoryMode: "multiple",
          variables: { owner: "payments" },
        },
      },
      project: { projectId: "prj_reference", rootPath: null },
      projectRoot,
      repositories: [repository],
    });

    expect(classification).toEqual({
      config: {
        project: {
          directoryMode: "multiple",
          variables: { owner: "payments" },
          knowledge: {
            general: [
              {
                type: "local-directory",
                source: "{{projectRoot}}/repos/reference-service",
              },
            ],
          },
        },
      },
      changed: true,
      addedToGeneralKnowledge: ["{{projectRoot}}/repos/reference-service"],
    });
  });

  it("keeps explicitly writable repositories out of general knowledge", () => {
    const projectRoot = path.resolve("/managed/projects/prj_editable");
    const repository = path.join(projectRoot, "repos/editable-service");
    const classification = classifyManagedProjectRepositories({
      config: {
        project: {
          directoryMode: "multiple",
          directories: {
            project: ["{{projectRoot}}/repos/editable-service"],
          },
          knowledge: {
            general: [
              {
                type: "local-directory",
                source: "{{projectRoot}}/repos/editable-service",
              },
              {
                type: "local-document",
                source: "architecture.md",
              },
            ],
          },
        },
      },
      project: { projectId: "prj_editable", rootPath: null },
      projectRoot,
      repositories: [repository],
    });

    expect(classification.config.project?.knowledge?.general).toEqual([
      {
        type: "local-document",
        source: "architecture.md",
      },
    ]);
    expect(classification.addedToGeneralKnowledge).toEqual([]);
  });

  it("does not re-enable an explicitly disabled knowledge repository", () => {
    const projectRoot = path.resolve("/managed/projects/prj_disabled");
    const config = {
      project: {
        knowledge: {
          general: [
            {
              type: "local-directory" as const,
              source: "{{projectRoot}}/repos/disabled-service",
              enabled: false,
            },
          ],
        },
      },
    };

    const classification = classifyManagedProjectRepositories({
      config,
      project: { projectId: "prj_disabled", rootPath: null },
      projectRoot,
      repositories: [path.join(projectRoot, "repos/disabled-service")],
    });

    expect(classification).toEqual({
      config,
      changed: false,
      addedToGeneralKnowledge: [],
    });
  });

  it("persists discovered repositories in the managed Project config", () => {
    const paseoHome = makeDirectory("paseo-project-home-");
    const project = { projectId: "prj_persisted", rootPath: null };
    const projectRoot = resolveManagedProjectStorageRoot(paseoHome, project.projectId);
    mkdirSync(path.join(projectRoot, "repos/reference-service"), { recursive: true });
    const initialWrite = writeProjectConfigForProject({
      paseoHome,
      project,
      config: {
        project: {
          directoryMode: "multiple",
          variables: { owner: "payments" },
        },
      },
      expectedRevision: null,
    });
    expect(initialWrite.ok).toBe(true);

    reconcileManagedProjectRepositories({ paseoHome, project });

    expect(
      JSON.parse(
        readFileSync(resolveGlobalProjectConfigPath(paseoHome, project.projectId), "utf8"),
      ),
    ).toEqual({
      project: {
        directoryMode: "multiple",
        variables: { owner: "payments" },
        knowledge: {
          general: [
            {
              type: "local-directory",
              source: "{{projectRoot}}/repos/reference-service",
            },
          ],
        },
      },
    });
  });

  it("instructs Agents to classify repositories before using them", () => {
    const prompt = buildProjectRepositoryClassificationPrompt(
      "/Users/example/.paseo/projects/prj_1",
    );

    expect(prompt).toContain("/Users/example/.paseo/projects/prj_1/repos");
    expect(prompt).toContain("project.directories.project");
    expect(prompt).toContain("project.knowledge.general");
    expect(prompt).toContain("If files in the repository need to be changed");
    expect(prompt).toContain("only used as reference material");
  });
});
