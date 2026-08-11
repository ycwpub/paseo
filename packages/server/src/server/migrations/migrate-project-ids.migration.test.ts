import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { FileBackedProjectRegistry, FileBackedWorkspaceRegistry } from "../workspace-registry.js";
import { migrateLegacyProjectIds } from "./migrate-project-ids.migration.js";

describe("migrateLegacyProjectIds", () => {
  let tmpDir: string;
  let projectRegistry: FileBackedProjectRegistry;
  let workspaceRegistry: FileBackedWorkspaceRegistry;
  const logger = createTestLogger();

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "project-id-migration-"));
    projectRegistry = new FileBackedProjectRegistry(path.join(tmpDir, "projects.json"), logger);
    workspaceRegistry = new FileBackedWorkspaceRegistry(
      path.join(tmpDir, "workspaces.json"),
      logger,
    );
    await Promise.all([projectRegistry.initialize(), workspaceRegistry.initialize()]);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("replaces legacy IDs and preserves workspace relationships", async () => {
    await projectRegistry.upsert({
      projectId: "remote:github.com/acme/repo",
      rootPath: "/repo",
      kind: "git",
      displayName: "acme/repo",
      customName: "Repo",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      archivedAt: null,
    });
    await projectRegistry.upsert({
      projectId: "/archived/project",
      rootPath: "/archived/project",
      kind: "non_git",
      displayName: "project",
      customName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      archivedAt: "2026-01-03T00:00:00.000Z",
    });
    await projectRegistry.upsert({
      projectId: "prj_aaaaaaaaaaaaaaaa",
      rootPath: "/already-opaque",
      kind: "non_git",
      displayName: "already-opaque",
      customName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
    });
    await workspaceRegistry.upsert({
      workspaceId: "wks_active",
      projectId: "remote:github.com/acme/repo",
      cwd: "/repo",
      kind: "local_checkout",
      displayName: "main",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      archivedAt: null,
    });
    await workspaceRegistry.upsert({
      workspaceId: "wks_archived",
      projectId: "/archived/project",
      cwd: "/archived/project",
      kind: "directory",
      displayName: "project",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      archivedAt: "2026-01-03T00:00:00.000Z",
    });

    const generatedIds = ["prj_aaaaaaaaaaaaaaaa", "prj_bbbbbbbbbbbbbbbb", "prj_cccccccccccccccc"];
    const replacements = await migrateLegacyProjectIds({
      projectRegistry,
      workspaceRegistry,
      logger,
      projectIdFactory: () => generatedIds.shift()!,
    });

    expect(replacements).toEqual(
      new Map([
        ["remote:github.com/acme/repo", "prj_bbbbbbbbbbbbbbbb"],
        ["/archived/project", "prj_cccccccccccccccc"],
      ]),
    );
    expect(await projectRegistry.get("remote:github.com/acme/repo")).toBeNull();
    expect(await projectRegistry.get("/archived/project")).toBeNull();
    expect(await projectRegistry.get("prj_bbbbbbbbbbbbbbbb")).toMatchObject({
      rootPath: "/repo",
      customName: "Repo",
      archivedAt: null,
    });
    expect(await projectRegistry.get("prj_cccccccccccccccc")).toMatchObject({
      rootPath: "/archived/project",
      archivedAt: "2026-01-03T00:00:00.000Z",
    });
    expect((await workspaceRegistry.get("wks_active"))?.projectId).toBe("prj_bbbbbbbbbbbbbbbb");
    expect((await workspaceRegistry.get("wks_archived"))?.projectId).toBe("prj_cccccccccccccccc");
    expect(await projectRegistry.get("prj_aaaaaaaaaaaaaaaa")).not.toBeNull();

    expect(
      await migrateLegacyProjectIds({
        projectRegistry,
        workspaceRegistry,
        logger,
      }),
    ).toEqual(new Map());
  });
});
