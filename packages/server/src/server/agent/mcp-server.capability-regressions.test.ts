import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { resolve as resolvePath } from "node:path";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { createAgentMcpServer } from "./mcp-server.js";
import { AgentManager, type ManagedAgent } from "./agent-manager.js";
import { AgentStorage, type StoredAgentRecord } from "./agent-storage.js";
import type { AgentProvider, ProviderSnapshotEntry } from "./agent-sdk-types.js";
import type { ProviderSnapshotManager } from "./provider-snapshot-manager.js";
const REPO_CWD = resolvePath("/tmp/repo");
const BROWSER_WORKSPACE_ID = "wks_browser_tools";
function createManagedAgent(overrides: Partial<ManagedAgent> = {}): ManagedAgent {
  const now = new Date();
  return {
    id: "live-agent",
    provider: "claude",
    cwd: "/tmp/live-project",
    config: {},
    runtimeInfo: undefined,
    createdAt: now,
    updatedAt: now,
    lastUserMessageAt: null,
    lifecycle: "idle",
    capabilities: {
      supportsStreaming: false,
      supportsSessionPersistence: false,
      supportsDynamicModes: false,
      supportsMcpServers: true,
      supportsReasoningStream: false,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    features: [],
    pendingPermissions: new Map(),
    persistence: null,
    labels: {},
    attention: { requiresAttention: false },
    ...overrides,
  } as ManagedAgent;
}
class BoundaryAgentManagerFake {
  private readonly agent = createManagedAgent({
    id: "agent-1",
    cwd: REPO_CWD,
    workspaceId: BROWSER_WORKSPACE_ID,
  });
  public getAgent(agentId: string): ManagedAgent | null {
    return agentId === this.agent.id ? this.agent : null;
  }
  public listAgents(): ManagedAgent[] {
    return [];
  }
}
class BoundaryAgentStorageFake {
  public async list(): Promise<StoredAgentRecord[]> {
    return [];
  }
}
class BoundaryProviderSnapshotManagerFake {
  public listRegisteredProviderIds(): AgentProvider[] {
    return [];
  }
  public hasProvider(): boolean {
    return false;
  }
  public getProviderLabel(provider: AgentProvider): string {
    return provider;
  }
  public async listProviders(): Promise<ProviderSnapshotEntry[]> {
    return [];
  }
  public async getProvider(): Promise<ProviderSnapshotEntry> {
    throw new Error("Provider catalog is not used by this boundary test");
  }
  public async listModels(): Promise<[]> {
    return [];
  }
  public async listModes(): Promise<[]> {
    return [];
  }
}
async function connectInMemoryMcpClient(server: Awaited<ReturnType<typeof createAgentMcpServer>>) {
  const client = new Client({ name: "paseo-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}
describe("browser MCP tools", () => {
  const logger = createTestLogger();
  it("lists tools while the caller agent is still being restored", async () => {
    const server = await createAgentMcpServer({
      agentManager: new BoundaryAgentManagerFake() as AgentManager,
      agentStorage: new BoundaryAgentStorageFake() as AgentStorage,
      providerSnapshotManager:
        new BoundaryProviderSnapshotManagerFake() as unknown as ProviderSnapshotManager,
      callerAgentId: "restoring-agent",
      assistantStore: { get: () => null },
      teamStore: { get: () => null },
      logger,
    });
    const client = await connectInMemoryMcpClient(server);
    try {
      const listedTools = await client.listTools();
      expect(listedTools.tools.map((tool) => tool.name)).toContain("create_agent");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
