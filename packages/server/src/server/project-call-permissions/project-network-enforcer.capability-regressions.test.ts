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
  it("fails closed for every Project when the global external proxy is enabled without an adapter", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-strict-network-"));
    const project = { projectId: "project-a", rootPath: "/repo/project-a" };

    const enforcer = new ProjectNetworkEnforcer({
      paseoHome,
      isExternalProxyEnabled: () => true,
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

  it("bypasses the adapter when the global external proxy is off", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-direct-network-"));
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
      isExternalProxyEnabled: () => false,
      workspaceRegistry: {
        get: async () => ({
          workspaceId: "workspace-a",
          projectId: "project-a",
          archivedAt: null,
        }),
      },
      projectRegistry: { get: async () => project },
    });

    await expect(
      enforcer.prepareExecutionEnvironment("workspace-a", "agent_process"),
    ).resolves.toEqual({});
  });

  it("returns adapter launch environment for a Project without permission rules when globally enabled", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-strict-network-env-"));
    const project = { projectId: "project-a", rootPath: "/repo/project-a" };
    const enforcer = new ProjectNetworkEnforcer({
      paseoHome,
      isExternalProxyEnabled: () => true,
      workspaceRegistry: {
        get: async () => ({
          workspaceId: "workspace-a",
          projectId: "project-a",
          archivedAt: null,
        }),
      },
      projectRegistry: { get: async () => project },
      adapter: {
        status: async () => "active",
        prepare: async (input) => ({
          PASEO_PROJECT_NETWORK_ISOLATION: "1",
          PASEO_TEST_CONTEXT: `${input.projectId}/${input.workspaceId}/${input.source}`,
        }),
      },
    });

    await expect(
      enforcer.prepareExecutionEnvironment("workspace-a", "agent_process"),
    ).resolves.toEqual({
      PASEO_PROJECT_NETWORK_ISOLATION: "1",
      PASEO_TEST_CONTEXT: "project-a/workspace-a/agent_process",
    });
  });
});
