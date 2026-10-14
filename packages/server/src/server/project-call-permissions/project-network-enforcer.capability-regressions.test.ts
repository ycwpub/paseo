import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { writeProjectConfigForProject } from "../project/project-config-storage.js";
import {
  ProjectNetworkEnforcer,
  ProjectStrictNetworkUnavailableError,
} from "./project-network-enforcer.js";

describe("ProjectNetworkEnforcer", () => {
  it("fails closed when strict network policy has no active OS adapter", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-strict-network-"));
    const project = { projectId: "project-a", rootPath: "/repo/project-a" };
    const write = writeProjectConfigForProject({
      paseoHome,
      project,
      config: {
        project: {
          directoryMode: "single",
          permissions: {
            enabled: true,
            enforcement: "strict",
            defaultAction: "deny",
          },
        },
      },
      expectedRevision: null,
    });
    expect(write.ok).toBe(true);

    const enforcer = new ProjectNetworkEnforcer({
      paseoHome,
      workspaceRegistry: {
        get: async () => ({
          workspaceId: "workspace-a",
          projectId: "project-a",
          archivedAt: null,
        }),
      },
      projectRegistry: {
        get: async () => project,
      },
    });

    await expect(enforcer.assertExecutionAllowed("workspace-a")).rejects.toEqual(
      expect.objectContaining<ProjectStrictNetworkUnavailableError>({
        name: "ProjectStrictNetworkUnavailableError",
        code: "PROJECT_STRICT_NETWORK_UNAVAILABLE",
        projectId: "project-a",
      }),
    );
  });
});
