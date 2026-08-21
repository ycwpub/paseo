import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import pino from "pino";
import { ProjectConfigSession, type ProjectConfigSessionHost } from "./project-config-session.js";
import type { PersistedProjectRecord } from "../../workspace-registry.js";
import type { SessionOutboundMessage } from "../../messages.js";
import { resolveManagedProjectStorageRoot } from "../../project/project-storage-paths.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-config-session-test-")));
  tempDirs.push(root);
  return root;
}

function projectRecord(rootPath: string, archivedAt: string | null = null): PersistedProjectRecord {
  return {
    projectId: `project:${rootPath}`,
    rootPath,
    kind: "git",
    displayName: "Project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt,
  };
}

function makeSubsystem(records: PersistedProjectRecord[]) {
  const emitted: SessionOutboundMessage[] = [];
  const host: ProjectConfigSessionHost = { emit: (msg) => emitted.push(msg) };
  const recordsById = new Map(records.map((record) => [record.projectId, record]));
  const paseoHome = makeRoot();
  const subsystem = new ProjectConfigSession({
    host,
    projectRegistry: {
      list: async () => [...recordsById.values()],
      get: async (projectId) => recordsById.get(projectId) ?? null,
      update: async (projectId, updater) => {
        const current = recordsById.get(projectId);
        if (!current) return null;
        const updated = updater(current);
        recordsById.set(projectId, updated);
        return updated;
      },
    },
    paseoHome,
    logger: pino({ level: "silent" }),
  });
  return { subsystem, emitted, paseoHome, recordsById };
}

describe("ProjectConfigSession", () => {
  test("read resolves a known root despite a trailing slash and returns the raw config + revision", async () => {
    const repoRoot = makeRoot();
    writeFileSync(join(repoRoot, "paseo.json"), JSON.stringify({ worktree: { setup: "npm ci" } }));
    const project = projectRecord(repoRoot);
    const { subsystem, emitted, paseoHome } = makeSubsystem([project]);
    const projectPath = resolveManagedProjectStorageRoot(paseoHome, project.projectId);

    await subsystem.handleReadProjectConfigRequest({
      type: "read_project_config_request",
      requestId: "read-1",
      repoRoot: `${repoRoot}/`,
    });

    expect(emitted).toEqual([
      {
        type: "read_project_config_response",
        payload: {
          requestId: "read-1",
          repoRoot: projectPath,
          ok: true,
          config: { worktree: { setup: "npm ci" } },
          revision: expect.objectContaining({
            mtimeMs: expect.any(Number),
            size: expect.any(Number),
          }),
        },
      },
    ]);
  });

  // POSIX-only: creates a directory symlink without Windows privileges.
  test.skipIf(process.platform === "win32")(
    "read resolves a symlink to an active root via realpath",
    async () => {
      const repoRoot = makeRoot();
      writeFileSync(
        join(repoRoot, "paseo.json"),
        JSON.stringify({ worktree: { setup: "npm ci" } }),
      );
      const linkRoot = join(makeRoot(), "link");
      symlinkSync(repoRoot, linkRoot, "dir");
      const project = projectRecord(repoRoot);
      const { subsystem, emitted, paseoHome } = makeSubsystem([project]);
      const projectPath = resolveManagedProjectStorageRoot(paseoHome, project.projectId);

      await subsystem.handleReadProjectConfigRequest({
        type: "read_project_config_request",
        requestId: "read-symlink-1",
        repoRoot: linkRoot,
      });

      expect(emitted).toEqual([
        {
          type: "read_project_config_response",
          payload: {
            requestId: "read-symlink-1",
            repoRoot: projectPath,
            ok: true,
            config: { worktree: { setup: "npm ci" } },
            revision: expect.objectContaining({
              mtimeMs: expect.any(Number),
              size: expect.any(Number),
            }),
          },
        },
      ]);
    },
  );

  test("read rejects archived and unknown roots with project_not_found", async () => {
    const archivedRoot = makeRoot();
    const unknownRoot = makeRoot();
    const { subsystem, emitted } = makeSubsystem([
      projectRecord(archivedRoot, "2026-01-02T00:00:00.000Z"),
    ]);

    await subsystem.handleReadProjectConfigRequest({
      type: "read_project_config_request",
      requestId: "archived-1",
      repoRoot: archivedRoot,
    });
    await subsystem.handleReadProjectConfigRequest({
      type: "read_project_config_request",
      requestId: "unknown-1",
      repoRoot: unknownRoot,
    });

    expect(emitted).toEqual([
      {
        type: "read_project_config_response",
        payload: {
          requestId: "archived-1",
          repoRoot: archivedRoot,
          ok: false,
          error: { code: "project_not_found" },
        },
      },
      {
        type: "read_project_config_response",
        payload: {
          requestId: "unknown-1",
          repoRoot: unknownRoot,
          ok: false,
          error: { code: "project_not_found" },
        },
      },
    ]);
  });

  test("write round-trips a config to a known root and echoes the new revision", async () => {
    const repoRoot = makeRoot();
    const project = projectRecord(repoRoot);
    const { subsystem, emitted, paseoHome } = makeSubsystem([project]);
    const projectPath = resolveManagedProjectStorageRoot(paseoHome, project.projectId);

    await subsystem.handleWriteProjectConfigRequest({
      type: "write_project_config_request",
      requestId: "write-1",
      repoRoot,
      config: { worktree: { setup: "npm ci" } },
      expectedRevision: null,
    });

    expect(emitted).toEqual([
      {
        type: "write_project_config_response",
        payload: {
          requestId: "write-1",
          repoRoot: projectPath,
          ok: true,
          config: { worktree: { setup: "npm ci" } },
          revision: expect.objectContaining({
            mtimeMs: expect.any(Number),
            size: expect.any(Number),
          }),
        },
      },
    ]);
  });

  test("reads and writes a directoryless Project by projectId", async () => {
    const project = projectRecord("");
    project.projectId = "prj_directoryless";
    project.rootPath = null;
    const { subsystem, emitted, recordsById, paseoHome } = makeSubsystem([project]);
    const projectPath = resolveManagedProjectStorageRoot(paseoHome, project.projectId);

    await subsystem.handleReadProjectConfigRequest({
      type: "read_project_config_request",
      requestId: "read-directoryless",
      repoRoot: "",
      projectId: project.projectId,
    });
    await subsystem.handleWriteProjectConfigRequest({
      type: "write_project_config_request",
      requestId: "write-directoryless",
      repoRoot: "",
      projectId: project.projectId,
      config: {
        project: {
          directoryMode: "multiple",
          directories: { project: ["/repo/one", "/repo/two"] },
        },
      },
      expectedRevision: null,
    });

    expect(emitted).toEqual([
      {
        type: "read_project_config_response",
        payload: {
          requestId: "read-directoryless",
          repoRoot: projectPath,
          ok: true,
          config: {
            project: {
              directoryMode: "multiple",
              directories: { project: [] },
            },
          },
          revision: null,
        },
      },
      {
        type: "write_project_config_response",
        payload: {
          requestId: "write-directoryless",
          repoRoot: projectPath,
          ok: true,
          config: {
            project: {
              directoryMode: "multiple",
              directories: { project: ["/repo/one", "/repo/two"] },
            },
          },
          revision: expect.objectContaining({
            mtimeMs: expect.any(Number),
            size: expect.any(Number),
          }),
        },
      },
    ]);
    expect(recordsById.get(project.projectId)?.updatedAt).not.toBe(project.updatedAt);
  });

  test("updates the registered root when a multiple-directory Project becomes single", async () => {
    const repoRoot = makeRoot();
    const selectedRoot = makeRoot();
    const project = projectRecord(repoRoot);
    const { subsystem, emitted, recordsById, paseoHome } = makeSubsystem([project]);

    await subsystem.handleWriteProjectConfigRequest({
      type: "write_project_config_request",
      requestId: "write-multiple",
      repoRoot,
      projectId: project.projectId,
      config: {
        project: {
          directoryMode: "multiple",
          directories: { project: [repoRoot, selectedRoot] },
        },
      },
      expectedRevision: null,
    });
    const firstResponse = emitted[0];
    if (firstResponse?.type !== "write_project_config_response" || !firstResponse.payload.ok) {
      throw new Error("Expected the multiple-directory write to succeed");
    }
    expect(firstResponse.payload.repoRoot).toBe(
      resolveManagedProjectStorageRoot(paseoHome, project.projectId),
    );
    expect(recordsById.get(project.projectId)?.rootPath).toBeNull();

    await subsystem.handleWriteProjectConfigRequest({
      type: "write_project_config_request",
      requestId: "write-single",
      repoRoot,
      projectId: project.projectId,
      config: {
        project: {
          directoryMode: "single",
          directories: { project: [selectedRoot] },
        },
      },
      expectedRevision: firstResponse.payload.revision,
    });

    expect(recordsById.get(project.projectId)?.rootPath).toBe(selectedRoot);
    expect(emitted[1]).toEqual({
      type: "write_project_config_response",
      payload: {
        requestId: "write-single",
        repoRoot: resolveManagedProjectStorageRoot(paseoHome, project.projectId),
        ok: true,
        config: {
          project: {
            directoryMode: "single",
            directories: { project: [selectedRoot] },
          },
        },
        revision: expect.objectContaining({
          mtimeMs: expect.any(Number),
          size: expect.any(Number),
        }),
      },
    });
  });

  test("write rejects a stale revision and an unknown root with their inline domain failures", async () => {
    const staleRoot = makeRoot();
    writeFileSync(join(staleRoot, "paseo.json"), JSON.stringify({ worktree: { setup: "old" } }));
    const unknownRoot = makeRoot();
    const project = projectRecord(staleRoot);
    const { subsystem, emitted, paseoHome } = makeSubsystem([project]);
    const projectPath = resolveManagedProjectStorageRoot(paseoHome, project.projectId);

    await subsystem.handleWriteProjectConfigRequest({
      type: "write_project_config_request",
      requestId: "stale-1",
      repoRoot: staleRoot,
      config: { worktree: { setup: "new" } },
      expectedRevision: { mtimeMs: 1, size: 1 },
    });
    await subsystem.handleWriteProjectConfigRequest({
      type: "write_project_config_request",
      requestId: "unknown-write-1",
      repoRoot: unknownRoot,
      config: { worktree: { setup: "new" } },
      expectedRevision: null,
    });

    expect(emitted).toEqual([
      {
        type: "write_project_config_response",
        payload: {
          requestId: "stale-1",
          repoRoot: projectPath,
          ok: false,
          error: {
            code: "stale_project_config",
            currentRevision: expect.objectContaining({
              mtimeMs: expect.any(Number),
              size: expect.any(Number),
            }),
          },
        },
      },
      {
        type: "write_project_config_response",
        payload: {
          requestId: "unknown-write-1",
          repoRoot: unknownRoot,
          ok: false,
          error: { code: "project_not_found" },
        },
      },
    ]);
  });
});
