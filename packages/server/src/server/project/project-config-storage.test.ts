import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDirectorylessProjectConfig,
  readProjectConfigForProject,
  resolveProjectConfigDirectories,
  resolveGlobalProjectConfigPath,
  writeProjectConfigForProject,
} from "./project-config-storage.js";
import { statPaseoConfigPath } from "../../utils/paseo-config-file.js";
import { resolveManagedProjectStorageRoot } from "./project-storage-paths.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

describe("project config storage", () => {
  it("uses a safe global path and supplies a multiple-directory default for a blank Project", () => {
    const paseoHome = makeDirectory("project-config-home-");
    const project = { projectId: "../../legacy/project:id", rootPath: null };

    const result = readProjectConfigForProject({ paseoHome, project });

    expect(result).toEqual({
      ok: true,
      config: createDirectorylessProjectConfig(),
      revision: null,
      configPath: resolveGlobalProjectConfigPath(paseoHome, project.projectId),
      mode: "multiple",
    });
    expect(resolveGlobalProjectConfigPath(paseoHome, project.projectId)).toMatch(
      /legacy-[a-f0-9]{64}\/paseo\.json$/u,
    );
    expect(resolveGlobalProjectConfigPath(paseoHome, project.projectId)).not.toContain("..");
  });

  it("includes the private Project path before configured directories", () => {
    const paseoHome = makeDirectory("project-config-home-");
    const configuredDirectory = makeDirectory("project-config-source-");
    const project = { projectId: "prj_multiple", rootPath: null };

    expect(
      resolveProjectConfigDirectories({
        paseoHome,
        project,
        config: {
          project: {
            directoryMode: "multiple",
            directories: { project: [configuredDirectory] },
          },
        },
      }),
    ).toEqual([
      resolveManagedProjectStorageRoot(paseoHome, project.projectId),
      configuredDirectory,
    ]);
  });

  it("keeps a single-directory Project directory separate from its managed Project path", () => {
    const paseoHome = makeDirectory("project-config-home-");
    const projectRoot = makeDirectory("project-config-root-");
    const project = { projectId: "prj_single_directories", rootPath: projectRoot };

    expect(resolveProjectConfigDirectories({ paseoHome, project, config: null })).toEqual([
      projectRoot,
    ]);
    expect(
      resolveProjectConfigDirectories({
        paseoHome,
        project,
        config: {
          project: {
            directoryMode: "single",
            directories: { project: [".", "packages/app"] },
          },
        },
      }),
    ).toEqual([projectRoot, path.join(projectRoot, "packages/app")]);
  });

  it("migrates the complete config from a single Project directory into its managed path", () => {
    const paseoHome = makeDirectory("project-config-home-");
    const projectRoot = makeDirectory("project-config-root-");
    const project = { projectId: "prj_single_to_multiple", rootPath: projectRoot };
    const original = {
      worktree: { setup: "npm ci" },
      scripts: { dev: { command: "npm run dev" } },
      project: {
        directoryMode: "single" as const,
        directories: { project: [projectRoot] },
        variables: { service: "checkout" },
      },
    };
    writeFileSync(path.join(projectRoot, "paseo.json"), JSON.stringify(original));
    const expectedRevision = statPaseoConfigPath(projectRoot);

    const result = writeProjectConfigForProject({
      paseoHome,
      project,
      config: {
        ...original,
        project: { ...original.project, directoryMode: "multiple" },
      },
      expectedRevision,
    });

    expect(result).toEqual({
      ok: true,
      config: {
        ...original,
        project: { ...original.project, directoryMode: "multiple" },
      },
      revision: expect.objectContaining({
        mtimeMs: expect.any(Number),
        size: expect.any(Number),
      }),
      configPath: resolveGlobalProjectConfigPath(paseoHome, project.projectId),
      mode: "multiple",
      projectRoot,
    });
    expect(existsSync(path.join(projectRoot, "paseo.json"))).toBe(false);
    expect(
      JSON.parse(
        readFileSync(resolveGlobalProjectConfigPath(paseoHome, project.projectId), "utf8"),
      ),
    ).toEqual({
      ...original,
      project: { ...original.project, directoryMode: "multiple" },
    });
  });

  it("keeps config in the managed path when a multiple-directory Project becomes single", () => {
    const paseoHome = makeDirectory("project-config-home-");
    const originalRoot = makeDirectory("project-config-root-");
    const selectedRoot = path.join(originalRoot, "selected");
    mkdirSync(selectedRoot);
    const project = { projectId: "prj_multiple_to_single", rootPath: originalRoot };
    const globalPath = resolveGlobalProjectConfigPath(paseoHome, project.projectId);
    mkdirSync(path.dirname(globalPath), { recursive: true });
    writeFileSync(
      globalPath,
      JSON.stringify({
        worktree: { teardown: "npm run clean" },
        project: {
          directoryMode: "multiple",
          directories: { project: [originalRoot, selectedRoot] },
        },
      }),
    );
    const current = readProjectConfigForProject({ paseoHome, project });
    expect(current.ok).toBe(true);

    const result = writeProjectConfigForProject({
      paseoHome,
      project,
      config: {
        worktree: { teardown: "npm run clean" },
        project: {
          directoryMode: "single",
          directories: { project: [selectedRoot] },
        },
      },
      expectedRevision: current.ok ? current.revision : null,
    });

    expect(result).toEqual({
      ok: true,
      config: {
        worktree: { teardown: "npm run clean" },
        project: {
          directoryMode: "single",
          directories: { project: [selectedRoot] },
        },
      },
      revision: expect.objectContaining({
        mtimeMs: expect.any(Number),
        size: expect.any(Number),
      }),
      configPath: globalPath,
      mode: "single",
      projectRoot: selectedRoot,
    });
    expect(existsSync(path.join(selectedRoot, "paseo.json"))).toBe(false);
    expect(JSON.parse(readFileSync(globalPath, "utf8"))).toEqual({
      worktree: { teardown: "npm run clean" },
      project: {
        directoryMode: "single",
        directories: { project: [selectedRoot] },
      },
    });
  });

  it("reads the legacy hashed config and migrates it on the next write", () => {
    const paseoHome = makeDirectory("project-config-home-");
    const project = { projectId: "prj_legacy_config", rootPath: null };
    const projectKey = createHash("sha256").update(project.projectId).digest("hex");
    const legacyPath = path.join(paseoHome, "projects", "configs", projectKey, "paseo.json");
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      JSON.stringify({
        project: {
          directoryMode: "multiple",
          variables: { owner: "payments" },
        },
      }),
    );

    const current = readProjectConfigForProject({ paseoHome, project });
    expect(current).toMatchObject({
      ok: true,
      configPath: legacyPath,
      mode: "multiple",
    });

    const result = writeProjectConfigForProject({
      paseoHome,
      project,
      config: {
        project: {
          directoryMode: "multiple",
          variables: { owner: "commerce" },
        },
      },
      expectedRevision: current.ok ? current.revision : null,
    });

    expect(result).toMatchObject({
      ok: true,
      configPath: resolveGlobalProjectConfigPath(paseoHome, project.projectId),
      mode: "multiple",
    });
    expect(existsSync(legacyPath)).toBe(false);
    expect(
      JSON.parse(
        readFileSync(resolveGlobalProjectConfigPath(paseoHome, project.projectId), "utf8"),
      ),
    ).toEqual({
      project: {
        directoryMode: "multiple",
        variables: { owner: "commerce" },
      },
    });
  });

  it("reads the previous Project root config and migrates it on the next write", () => {
    const paseoHome = makeDirectory("project-config-home-");
    const project = { projectId: "prj_legacy_root", rootPath: null };
    const legacyPath = path.join(paseoHome, project.projectId, "paseo.json");
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      JSON.stringify({
        project: {
          directoryMode: "multiple",
          variables: { owner: "payments" },
        },
      }),
    );

    const current = readProjectConfigForProject({ paseoHome, project });
    expect(current).toMatchObject({
      ok: true,
      configPath: legacyPath,
      mode: "multiple",
    });

    const result = writeProjectConfigForProject({
      paseoHome,
      project,
      config: {
        project: {
          directoryMode: "multiple",
          variables: { owner: "commerce" },
        },
      },
      expectedRevision: current.ok ? current.revision : null,
    });

    const managedPath = resolveGlobalProjectConfigPath(paseoHome, project.projectId);
    expect(result).toMatchObject({
      ok: true,
      configPath: managedPath,
      mode: "multiple",
    });
    expect(existsSync(legacyPath)).toBe(false);
    expect(JSON.parse(readFileSync(managedPath, "utf8"))).toEqual({
      project: {
        directoryMode: "multiple",
        variables: { owner: "commerce" },
      },
    });
  });

  it("does not migrate when the editor revision is stale", () => {
    const paseoHome = makeDirectory("project-config-home-");
    const projectRoot = makeDirectory("project-config-root-");
    const project = { projectId: "prj_stale", rootPath: projectRoot };
    writeFileSync(
      path.join(projectRoot, "paseo.json"),
      JSON.stringify({ project: { directoryMode: "single" } }),
    );

    const result = writeProjectConfigForProject({
      paseoHome,
      project,
      config: { project: { directoryMode: "multiple" } },
      expectedRevision: { mtimeMs: 1, size: 1 },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "stale_project_config",
        currentRevision: expect.objectContaining({
          mtimeMs: expect.any(Number),
          size: expect.any(Number),
        }),
      },
    });
    expect(existsSync(path.join(projectRoot, "paseo.json"))).toBe(true);
    expect(existsSync(resolveGlobalProjectConfigPath(paseoHome, project.projectId))).toBe(false);
  });
});
