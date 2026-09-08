import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import { createProviderSnapshotManagerStub } from "../../test-utils/session-stubs.js";
import { createAgentCommand } from "./create.js";
import type { ManagedAgent } from "../agent-manager.js";
import { CloudDocumentCacheService } from "../../knowledge/cloud-cache/service.js";
import { CloudDocumentAuthenticationError } from "../../knowledge/cloud-cache/source.js";
test("mcp create injects Project context for child agents in an existing workspace", async () => {
  const root = mkdtempSync(join(tmpdir(), "paseo-create-project-context-"));
  const workspaceDirectory = join(root, "worktree");
  mkdirSync(workspaceDirectory, { recursive: true });
  writeFileSync(
    join(root, "paseo.json"),
    JSON.stringify({
      project: {
        directoryMode: "multiple",
        directories: {
          project: [".", "../facade"],
          knowledge: ["docs/rules"],
          indexSkill: [".paseo/index"],
          workspaceData: [".paseo/workspaces"],
        },
      },
    }),
  );
  const snapshot = {
    id: "agent-project-context",
    provider: "claude",
    cwd: workspaceDirectory,
    runtimeInfo: null,
  } as ManagedAgent;
  const createAgent = vi.fn(async () => snapshot);
  const dependencies: Parameters<typeof createAgentCommand>[0] = {
    agentManager: {
      createAgent,
    } as unknown as Parameters<typeof createAgentCommand>[0]["agentManager"],
    agentStorage: {} as Parameters<typeof createAgentCommand>[0]["agentStorage"],
    logger: createTestLogger(),
    providerSnapshotManager: createProviderSnapshotManagerStub().manager,
    projectRegistry: {
      get: vi.fn(async () => ({
        projectId: "prj_context",
        rootPath: root,
        kind: "git",
        displayName: "Context project",
        customName: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        archivedAt: null,
      })),
    },
    workspaceRegistry: {
      get: vi.fn(async () => ({
        workspaceId: "ws-context",
        projectId: "prj_context",
        cwd: workspaceDirectory,
        displayName: "Context workspace",
        title: null,
      })),
    },
  } as Parameters<typeof createAgentCommand>[0];
  try {
    await createAgentCommand(dependencies, {
      kind: "mcp",
      provider: "claude",
      cwd: workspaceDirectory,
      workspaceId: "ws-context",
      title: "child agent",
      background: true,
      notifyOnFinish: false,
    });
    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        writableProjectDirectories: [root, join(root, "../facade")],
        systemPrompt: expect.stringContaining("General knowledge directories"),
      }),
      undefined,
      expect.objectContaining({ workspaceId: "ws-context" }),
    );
    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Project ID: prj_context"),
      }),
      undefined,
      expect.anything(),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("create requests cloud knowledge authorization in the new Agent conversation", async () => {
  const paseoHome = mkdtempSync(join(tmpdir(), "paseo-create-cloud-auth-"));
  const snapshot = {
    id: "agent-cloud-auth",
    provider: "claude",
    cwd: paseoHome,
    runtimeInfo: null,
  } as ManagedAgent;
  const requestFrameworkPermission = vi.fn(async () => "framework-auth");
  const source = "https://bytedance.larkoffice.com/wiki/private";
  const cloudDocumentCacheService = new CloudDocumentCacheService({
    paseoHome,
    logger: createTestLogger(),
    reader: {
      fetch: vi.fn(async () => {
        throw new CloudDocumentAuthenticationError({
          kind: "authentication_required",
          source,
          message: "需要登录飞书",
          loginUrl: "https://login.example.com",
          authCommand: "bytedcli insearch login",
        });
      }),
    },
  });
  const dependencies: Parameters<typeof createAgentCommand>[0] = {
    agentManager: {
      createAgent: vi.fn(async () => snapshot),
      requestFrameworkPermission,
    } as unknown as Parameters<typeof createAgentCommand>[0]["agentManager"],
    agentStorage: {} as Parameters<typeof createAgentCommand>[0]["agentStorage"],
    logger: createTestLogger(),
    providerSnapshotManager: createProviderSnapshotManagerStub().manager,
    paseoHome,
    cloudDocumentCacheService,
    readGlobalKnowledge: () => ({
      standards: [{ type: "cloud-document", source }],
    }),
  };
  try {
    await createAgentCommand(dependencies, {
      kind: "mcp",
      provider: "claude",
      cwd: paseoHome,
      workspaceId: "ws-cloud-auth",
      title: "cloud auth",
      background: true,
      notifyOnFinish: false,
    });
    expect(requestFrameworkPermission).toHaveBeenCalledWith(
      "agent-cloud-auth",
      expect.objectContaining({
        request: expect.objectContaining({
          title: "云文档需要登录授权",
          metadata: expect.objectContaining({
            permissionType: "cloud-knowledge-auth",
            source,
          }),
        }),
      }),
    );
  } finally {
    rmSync(paseoHome, { recursive: true, force: true });
  }
});
test("mcp create uses workspaceTitle only when provisioning a workspace", async () => {
  const snapshot = {
    id: "agent-1",
    provider: "claude",
    cwd: "/tmp/paseo-create-test",
    runtimeInfo: null,
  } as ManagedAgent;
  const createAgent = vi.fn(async () => snapshot);
  const streamAgent = vi.fn(() => (async function* noop() {})());
  const ensureWorkspaceForCreate = vi.fn(async () => "ws-created-from-title");
  const dependencies: Parameters<typeof createAgentCommand>[0] = {
    agentManager: {
      createAgent,
      getAgent: vi.fn(() => snapshot),
      tryRunOutOfBand: vi.fn(() => false),
      hasInFlightRun: vi.fn(() => false),
      streamAgent,
      waitForAgentRunStart: vi.fn(async () => undefined),
    } as unknown as Parameters<typeof createAgentCommand>[0]["agentManager"],
    agentStorage: {} as Parameters<typeof createAgentCommand>[0]["agentStorage"],
    logger: createTestLogger(),
    providerSnapshotManager: createProviderSnapshotManagerStub().manager,
    ensureWorkspaceForCreate,
  };
  await createAgentCommand(dependencies, {
    kind: "mcp",
    provider: "claude",
    cwd: "/tmp/paseo-create-test",
    projectId: "prj_lark_target",
    title: "Topic title",
    workspaceTitle: "Workspace from Lark topic",
    initialPrompt: "Message from Lark user Alice in chat oc_1 (Topic title):\n\nReal prompt",
    background: true,
    notifyOnFinish: false,
    promptFailure: "throw",
  });
  expect(ensureWorkspaceForCreate).toHaveBeenCalledWith(
    "/tmp/paseo-create-test",
    {
      prompt: "Workspace from Lark topic",
    },
    "prj_lark_target",
  );
  expect(streamAgent).toHaveBeenCalledWith(
    "agent-1",
    "Message from Lark user Alice in chat oc_1 (Topic title):\n\nReal prompt",
    undefined,
  );
});
