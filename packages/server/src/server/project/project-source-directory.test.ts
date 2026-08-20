import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPersistedProjectRecord } from "../workspace-registry.js";
import { writeProjectConfigForProject } from "./project-config-storage.js";
import {
  resolveManagedProjectSourceDirectory,
  resolveProjectSourceDirectory,
} from "./project-source-directory.js";

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

describe("project source directory", () => {
  it("uses the registered root for a single-directory Project", () => {
    const paseoHome = makeDirectory("paseo-source-home-");
    const projectRoot = makeDirectory("paseo-source-project-");
    const project = createPersistedProjectRecord({
      projectId: "prj_single",
      rootPath: projectRoot,
      kind: "non_git",
      displayName: "Single",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    });

    expect(resolveProjectSourceDirectory({ paseoHome, project })).toEqual({
      kind: "project",
      path: projectRoot,
    });
  });

  it("uses the first configured writable directory for a multi-directory Project", () => {
    const paseoHome = makeDirectory("paseo-source-home-");
    const first = makeDirectory("paseo-source-first-");
    const second = makeDirectory("paseo-source-second-");
    const project = createPersistedProjectRecord({
      projectId: "prj_multiple",
      rootPath: null,
      kind: "non_git",
      displayName: "Multiple",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    });
    const result = writeProjectConfigForProject({
      paseoHome,
      project,
      config: {
        project: {
          directoryMode: "multiple",
          directories: {
            project: [{ path: first }, { path: second }],
          },
        },
      },
      expectedRevision: null,
    });
    expect(result.ok).toBe(true);

    expect(resolveProjectSourceDirectory({ paseoHome, project })).toEqual({
      kind: "project",
      path: first,
    });
  });

  it("uses a stable host-managed directory when no source directory is configured", () => {
    const paseoHome = makeDirectory("paseo-source-home-");
    const project = createPersistedProjectRecord({
      projectId: "prj_empty",
      rootPath: null,
      kind: "non_git",
      displayName: "Empty",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    });

    expect(resolveProjectSourceDirectory({ paseoHome, project })).toEqual({
      kind: "managed",
      path: resolveManagedProjectSourceDirectory(paseoHome, project.projectId),
    });
  });
});
