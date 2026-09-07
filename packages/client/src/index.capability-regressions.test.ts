import { afterEach, expect, test, vi } from "vitest";
import { createPaseoClient } from "./index.js";
import type { PaseoClient, PaseoWorkspace } from "./index.js";
type FakeWebSocketHandler = (...args: unknown[]) => void;
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 1;
  sent: Array<string | ArrayBuffer | Uint8Array> = [];
  onopen: FakeWebSocketHandler | null = null;
  onmessage: FakeWebSocketHandler | null = null;
  onclose: FakeWebSocketHandler | null = null;
  onerror: FakeWebSocketHandler | null = null;
  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string | ArrayBuffer | Uint8Array): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.onopen?.();
  }
  message(data: string): void {
    this.onmessage?.({ data });
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  FakeWebSocket.instances.length = 0;
});
function sessionMessage(message: object): string {
  return JSON.stringify({
    type: "session",
    message,
  });
}
function parseSentSessionMessage(data: string | ArrayBuffer | Uint8Array | undefined): {
  type: string;
  requestId?: string;
  agentId?: string;
  workspaceId?: string;
  provider?: string;
  providers?: string[];
  cwd?: string;
  config?: unknown;
  draftConfig?: unknown;
  filter?: unknown;
  page?: unknown;
  sync?: unknown;
  text?: string;
} {
  if (typeof data !== "string") {
    throw new Error("Expected string WebSocket frame");
  }
  const parsed = JSON.parse(data);
  return parsed.message;
}
function parseSentFrame(
  data: string | ArrayBuffer | Uint8Array | undefined,
): Record<string, unknown> {
  if (typeof data !== "string") {
    throw new Error("Expected string WebSocket frame");
  }
  return JSON.parse(data);
}
async function connectClient(
  features: Record<string, boolean> = { providersSnapshotCwd: true },
): Promise<{
  client: PaseoClient;
  ws: FakeWebSocket;
}> {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const client = createPaseoClient({
    url: "ws://daemon.test",
    clientName: "Paseo SDK · test-runner",
    clientHostname: "test-runner",
    reconnect: { enabled: false },
  });
  const connectPromise = client.connect();
  const ws = FakeWebSocket.instances[0];
  ws.open();
  const hello = parseSentFrame(ws.sent.at(-1));
  expect(hello).toMatchObject({
    type: "hello",
    clientName: "Paseo SDK · test-runner",
    clientHostname: "test-runner",
    clientType: "cli",
    protocolVersion: 1,
  });
  expect(hello.clientId).toEqual(expect.stringMatching(/^paseo-sdk-/));
  ws.message(
    sessionMessage({
      type: "status",
      payload: {
        status: "server_info",
        serverId: "srv_sdk_test",
        hostname: null,
        version: null,
        features,
      },
    }),
  );
  await connectPromise;
  return { client, ws };
}
function createWorkspace(input: Partial<PaseoWorkspace> = {}): PaseoWorkspace {
  return {
    id: "workspace_sdk",
    projectId: "project_sdk",
    projectDisplayName: "SDK",
    projectRootPath: "/repo/sdk",
    workspaceDirectory: "/repo/sdk",
    projectKind: "git",
    workspaceKind: "directory",
    name: "sdk",
    archivingAt: null,
    status: "done",
    statusEnteredAt: null,
    activityAt: "2026-05-16T00:00:00.000Z",
    scripts: [],
    gitRuntime: null,
    githubRuntime: null,
    ...input,
  };
}
test("createPaseoClient exposes workspace list through the daemon client", async () => {
  const { client, ws } = await connectClient();
  const listPromise = client.workspaces.list({
    filter: { query: "sdk" },
    page: { limit: 10 },
  });
  const request = parseSentSessionMessage(ws.sent.at(-1));
  expect(request).toMatchObject({
    type: "fetch_workspaces_request",
    filter: { query: "sdk" },
    page: { limit: 10 },
  });
  ws.message(
    sessionMessage({
      type: "fetch_workspaces_response",
      payload: {
        requestId: request.requestId,
        entries: [],
        pageInfo: {
          nextCursor: null,
          prevCursor: null,
          hasMore: false,
        },
      },
    }),
  );
  await expect(listPromise).resolves.toEqual({
    requestId: request.requestId,
    entries: [],
    emptyProjects: [],
    pageInfo: {
      nextCursor: null,
      prevCursor: null,
      hasMore: false,
    },
  });
  expect(client.getConnectionState()).toEqual({ status: "connected" });
  expect(client.getConnectionTransport()).toMatchObject({
    type: "direct",
    upgradedFromRelay: false,
  });
  await client.close();
});
test("workspace handles keep identity and refresh snapshots through existing driver calls", async () => {
  const { client, ws } = await connectClient();
  const openedWorkspace = createWorkspace();
  const openPromise = client.workspaces.open("/repo/sdk", "open-workspace-request");
  expect(parseSentSessionMessage(ws.sent.at(-1))).toMatchObject({
    type: "open_project_request",
    cwd: "/repo/sdk",
  });
  ws.message(
    sessionMessage({
      type: "open_project_response",
      payload: {
        requestId: "open-workspace-request",
        workspace: openedWorkspace,
        error: null,
      },
    }),
  );
  const workspace = await openPromise;
  expect(workspace.id).toBe("workspace_sdk");
  expect(workspace.projectId).toBe("project_sdk");
  expect(workspace.directory).toBe("/repo/sdk");
  expect(workspace.current()).toEqual(openedWorkspace);
  const refreshedWorkspace = createWorkspace({ name: "sdk refreshed" });
  const refetchPromise = workspace.refresh({
    requestId: "workspace-refetch-request",
  });
  expect(parseSentSessionMessage(ws.sent.at(-1))).toMatchObject({
    type: "fetch_workspaces_request",
    requestId: "workspace-refetch-request",
    page: { limit: 200 },
  });
  ws.message(
    sessionMessage({
      type: "fetch_workspaces_response",
      payload: {
        requestId: "workspace-refetch-request",
        entries: [],
        pageInfo: {
          nextCursor: "workspace-page-2",
          prevCursor: null,
          hasMore: true,
        },
      },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const secondPageRequest = parseSentSessionMessage(ws.sent.at(-1));
  expect(secondPageRequest).toMatchObject({
    type: "fetch_workspaces_request",
    page: { limit: 200, cursor: "workspace-page-2" },
  });
  ws.message(
    sessionMessage({
      type: "fetch_workspaces_response",
      payload: {
        requestId: secondPageRequest.requestId,
        entries: [refreshedWorkspace],
        pageInfo: {
          nextCursor: null,
          prevCursor: null,
          hasMore: false,
        },
      },
    }),
  );
  await expect(refetchPromise).resolves.toEqual(refreshedWorkspace);
  expect(workspace.current()).toEqual(refreshedWorkspace);
  const updates: string[] = [];
  const unsubscribe = workspace.subscribe((update) => {
    if (update.kind === "upsert") {
      updates.push(update.workspace.name);
    }
  });
  const pushedWorkspace = createWorkspace({ name: "sdk pushed" });
  ws.message(
    sessionMessage({
      type: "workspace_update",
      payload: {
        kind: "upsert",
        workspace: pushedWorkspace,
      },
    }),
  );
  expect(updates).toEqual(["sdk pushed"]);
  expect(workspace.current()).toEqual(pushedWorkspace);
  const titlePromise = workspace.setTitle("SDK review", "workspace-title-request");
  expect(parseSentSessionMessage(ws.sent.at(-1))).toMatchObject({
    type: "workspace.title.set.request",
    requestId: "workspace-title-request",
    workspaceId: "workspace_sdk",
    title: "SDK review",
  });
  ws.message(
    sessionMessage({
      type: "workspace.title.set.response",
      payload: {
        requestId: "workspace-title-request",
        workspaceId: "workspace_sdk",
        accepted: true,
        title: "SDK review",
        error: null,
      },
    }),
  );
  await expect(titlePromise).resolves.toEqual({ title: "SDK review" });
  unsubscribe();
  ws.message(
    sessionMessage({
      type: "workspace_update",
      payload: {
        kind: "upsert",
        workspace: createWorkspace({ name: "sdk after unsubscribe" }),
      },
    }),
  );
  expect(updates).toEqual(["sdk pushed"]);
  await client.close();
});
test("config actions delegate to existing daemon config RPCs", async () => {
  const { client, ws } = await connectClient();
  const getPromise = client.config.get("config-get-request");
  expect(parseSentSessionMessage(ws.sent.at(-1))).toMatchObject({
    type: "get_daemon_config_request",
    requestId: "config-get-request",
  });
  ws.message(
    sessionMessage({
      type: "get_daemon_config_response",
      payload: {
        requestId: "config-get-request",
        config: {
          mcp: { injectIntoAgents: true },
          providers: {},
          autoArchiveAfterMerge: false,
        },
      },
    }),
  );
  await expect(getPromise).resolves.toEqual({
    requestId: "config-get-request",
    config: {
      mcp: { injectIntoAgents: true },
      providers: {},
      browserTools: { enabled: false },
      clientAccess: { requireApproval: false },
      projectIndexing: { updateIntervalMinutes: 1440 },
      metadataGeneration: { providers: [] },
      relay: {
        endpoints: [],
        pairingBaseUrls: [],
        local: { enabled: false, listen: "0.0.0.0:6769" },
      },
      autoArchiveAfterMerge: false,
      enableTerminalAgentHooks: false,
      appendSystemPrompt: "",
    },
  });
  const patchPromise = client.config.patch(
    {
      providers: {
        codex: {
          enabled: false,
        },
      },
    },
    "config-patch-request",
  );
  expect(parseSentSessionMessage(ws.sent.at(-1))).toMatchObject({
    type: "set_daemon_config_request",
    requestId: "config-patch-request",
    config: {
      providers: {
        codex: {
          enabled: false,
        },
      },
    },
  });
  ws.message(
    sessionMessage({
      type: "set_daemon_config_response",
      payload: {
        requestId: "config-patch-request",
        config: {
          mcp: { injectIntoAgents: true },
          providers: {
            codex: {
              enabled: false,
            },
          },
          autoArchiveAfterMerge: false,
        },
      },
    }),
  );
  await expect(patchPromise).resolves.toEqual({
    requestId: "config-patch-request",
    config: {
      mcp: { injectIntoAgents: true },
      providers: {
        codex: {
          enabled: false,
        },
      },
      browserTools: { enabled: false },
      clientAccess: { requireApproval: false },
      projectIndexing: { updateIntervalMinutes: 1440 },
      metadataGeneration: { providers: [] },
      relay: {
        endpoints: [],
        pairingBaseUrls: [],
        local: { enabled: false, listen: "0.0.0.0:6769" },
      },
      autoArchiveAfterMerge: false,
      enableTerminalAgentHooks: false,
      appendSystemPrompt: "",
    },
  });
  await client.close();
});
