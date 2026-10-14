import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { writeProjectConfigForProject } from "../project/project-config-storage.js";
import { ProjectCallAuthorizer, ProjectPermissionDeniedError } from "./project-call-authorizer.js";

describe("ProjectCallAuthorizer", () => {
  it("resolves Workspace Project identity and rejects a denied RPC with its rule", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-project-policy-"));
    const project = {
      projectId: "project-a",
      rootPath: "/repo/project-a",
      displayName: "Project A",
      customName: null,
    };
    const initialized = writeProjectConfigForProject({
      paseoHome,
      project,
      config: {
        project: {
          directoryMode: "single",
          permissions: {
            enabled: true,
            defaultAction: "allow",
            rpcRules: [
              {
                id: "deny-delete-agent",
                action: "deny",
                target: { type: "exact", value: "mcp:paseo/delete_agent" },
              },
            ],
          },
        },
      },
      expectedRevision: null,
    });
    expect(initialized.ok).toBe(true);

    const authorizer = new ProjectCallAuthorizer({
      paseoHome,
      workspaceRegistry: {
        get: async (workspaceId) =>
          workspaceId === "workspace-a"
            ? {
                workspaceId,
                projectId: project.projectId,
                archivedAt: null,
              }
            : null,
      },
      projectRegistry: {
        get: async (projectId) => (projectId === project.projectId ? project : null),
      },
    });

    await expect(
      authorizer.authorize({
        workspaceId: "workspace-a",
        source: "agent_mcp",
        request: { kind: "rpc", target: "mcp:paseo/delete_agent" },
      }),
    ).rejects.toEqual(
      expect.objectContaining<ProjectPermissionDeniedError>({
        name: "ProjectPermissionDeniedError",
        code: "PROJECT_PERMISSION_DENIED",
        projectId: "project-a",
        target: "mcp:paseo/delete_agent",
        matchedRuleId: "deny-delete-agent",
      }),
    );
  });
});
