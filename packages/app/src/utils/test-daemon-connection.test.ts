import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState, DaemonClientConfig } from "@getpaseo/client/internal/daemon-client";
import type { DaemonConnectionDependencies, DaemonProbeClient } from "./test-daemon-connection";

class FakeDaemonClient implements DaemonProbeClient {
  readonly lastError: string | null;

  constructor(
    private readonly probe: FakeDaemonProbe,
    readonly config: DaemonClientConfig,
  ) {
    this.lastError = probe.nextLastError;
  }

  async connect(): Promise<void> {
    if (this.probe.nextConnectError) {
      throw this.probe.nextConnectError;
    }
  }

  getLastServerInfoMessage() {
    return {
      serverId: "srv_probe_test",
      hostname: "probe-host",
    };
  }

  async close(): Promise<void> {
    this.probe.closedClients.push(this);
  }
}

class FakeDaemonProbe {
  createdClients: FakeDaemonClient[] = [];
  closedClients: FakeDaemonClient[] = [];
  clientIdsRequested = 0;
  nextConnectError: Error | null = null;
  nextLastError: string | null = null;

  readonly deps: DaemonConnectionDependencies<FakeDaemonClient> = {
    getClientId: async () => {
      this.clientIdsRequested += 1;
      return "cid_shared_probe_test";
    },
    resolveAppVersion: () => null,
    createLocalTransportFactory: () => null,
    buildLocalTransportUrl: ({ transportType, transportPath }) =>
      `paseo+local://${transportType}?path=${encodeURIComponent(transportPath)}`,
    createClient: (config) => {
      const client = new FakeDaemonClient(this, config);
      this.createdClients.push(client);
      return client;
    },
  };

  failNextConnection(error: Error, lastError: string | null): void {
    this.nextConnectError = error;
    this.nextLastError = lastError;
  }

  createdConfigs(): DaemonClientConfig[] {
    return this.createdClients.map((client) => client.config);
  }
}

describe("test-daemon-connection connectToDaemon", () => {
  let probe: FakeDaemonProbe;

  beforeEach(() => {
    vi.stubGlobal("__DEV__", false);
    probe = new FakeDaemonProbe();
  });

  it("reuses the app clientId for direct connections", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const first = await connectToDaemon(
      {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
      },
      undefined,
      probe.deps,
    );
    await first.client.close();

    const second = await connectToDaemon(
      {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
      },
      undefined,
      probe.deps,
    );
    await second.client.close();

    const [firstConfig, secondConfig] = probe.createdConfigs();
    expect(firstConfig?.clientId).toBe("cid_shared_probe_test");
    expect(secondConfig?.clientId).toBe("cid_shared_probe_test");
    expect(probe.clientIdsRequested).toBe(2);
  });

  it("keeps direct TCP probes on the renderer WebSocket", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const deps = {
      ...probe.deps,
      createWebSocketTransportFactory: () => {
        throw new Error("Direct TCP must not use the desktop WebSocket bridge");
      },
    };

    const result = await connectToDaemon(
      {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
      },
      undefined,
      deps,
    );
    await result.client.close();

    expect(probe.createdConfigs()[0]?.transportFactory).toBeUndefined();
  });

  it("encodes the local socket target into the client config", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const result = await connectToDaemon(
      {
        id: "socket:/tmp/paseo.sock",
        type: "directSocket",
        path: "/tmp/paseo.sock",
      },
      undefined,
      probe.deps,
    );
    await result.client.close();

    expect(probe.createdConfigs()[0]?.url).toBe("paseo+local://socket?path=%2Ftmp%2Fpaseo.sock");
  });

  it("passes direct TCP connection passwords into the client config", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const result = await connectToDaemon(
      {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
        password: "shared-secret",
      },
      undefined,
      probe.deps,
    );
    await result.client.close();

    expect(probe.createdConfigs()[0]?.password).toBe("shared-secret");
  });

  it("passes performance tracing into the connected client", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const trace = {
      isEnabled: () => true,
      beginSection: vi.fn(),
      endSection: vi.fn(),
    };
    const result = await connectToDaemon(
      {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
      },
      { trace },
      probe.deps,
    );
    await result.client.close();

    expect(probe.createdConfigs()[0]?.trace).toBe(trace);
  });

  it("uses relay TLS from the stored connection", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const tlsResult = await connectToDaemon(
      {
        id: "relay:wss:[::1]:443",
        type: "relay",
        relayEndpoint: "[::1]:443",
        useTls: true,
        daemonPublicKeyB64: "pubkey",
      },
      { serverId: "srv_probe_test" },
      probe.deps,
    );
    await tlsResult.client.close();

    const plainResult = await connectToDaemon(
      {
        id: "relay:relay.paseo.sh:443",
        type: "relay",
        relayEndpoint: "relay.paseo.sh:443",
        useTls: false,
        daemonPublicKeyB64: "pubkey",
      },
      { serverId: "srv_probe_test" },
      probe.deps,
    );
    await plainResult.client.close();

    expect(probe.createdConfigs()[0]?.url).toMatch(/^wss:\/\/\[::1\]\/ws\?/);
    expect(probe.createdConfigs()[1]?.url).toMatch(/^ws:\/\/relay\.paseo\.sh:443\/ws\?/);
  });

  it("surfaces auth rejection as an incorrect password", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    probe.failNextConnection(
      new Error("Transport closed (code 4001)"),
      "Transport closed (code 4001)",
    );

    await expect(
      connectToDaemon(
        {
          id: "direct:lan:6767",
          type: "directTcp",
          endpoint: "lan:6767",
          password: "wrong-secret",
        },
        undefined,
        probe.deps,
      ),
    ).rejects.toMatchObject({
      message: "Incorrect password",
    });
  });

  it("keeps generic transport failures generic when a password was supplied", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    probe.failNextConnection(new Error("Transport error"), "Transport error");

    await expect(
      connectToDaemon(
        {
          id: "direct:lan:6767",
          type: "directTcp",
          endpoint: "lan:6767",
          password: "shared-secret",
        },
        undefined,
        probe.deps,
      ),
    ).rejects.toMatchObject({
      message: "Transport error",
    });
  });

  it("keeps the transport open while client access approval is pending", async () => {
    const { connectToDaemon, DaemonConnectionApprovalRequiredError } =
      await import("./test-daemon-connection");
    probe.failNextConnection(
      new Error("无权限，联系服务端通过连接申请"),
      "无权限，联系服务端通过连接申请",
    );

    const error = await connectToDaemon(
      {
        id: "relay:relay.paseo.sh:443",
        type: "relay",
        relayEndpoint: "relay.paseo.sh:443",
        useTls: true,
        daemonPublicKeyB64: "pubkey",
      },
      { serverId: "srv_probe_test" },
      probe.deps,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DaemonConnectionApprovalRequiredError);
    expect(probe.closedClients).toHaveLength(0);
  });
});

describe("isClientAccessApprovalRequired", () => {
  it("recognizes the server admission error", async () => {
    const { isClientAccessApprovalRequired } = await import("./test-daemon-connection");

    expect(isClientAccessApprovalRequired(new Error("无权限，联系服务端通过连接申请"))).toBe(true);
    expect(isClientAccessApprovalRequired(new Error("Transport error"))).toBe(false);
  });
});

class FakeApprovalWaitClient {
  private state: ConnectionState = {
    status: "awaiting_approval",
    message: "无权限，联系服务端通过连接申请",
  };
  private readonly listeners = new Set<(state: ConnectionState) => void>();
  serverInfo: { serverId: string; hostname: string | null } | null = null;

  subscribeConnectionStatus(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getLastServerInfoMessage() {
    return this.serverInfo;
  }

  setState(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

describe("waitForDaemonApproval", () => {
  it("resolves after the server approves the same connection", async () => {
    const { waitForDaemonApproval } = await import("./test-daemon-connection");
    const client = new FakeApprovalWaitClient();
    const pending = waitForDaemonApproval(client);

    expect(client.listenerCount()).toBe(1);
    client.serverInfo = {
      serverId: "srv_approved",
      hostname: "approved-host",
    };
    client.setState({ status: "connected" });

    await expect(pending).resolves.toEqual({
      serverId: "srv_approved",
      hostname: "approved-host",
    });
    expect(client.listenerCount()).toBe(0);
  });

  it("rejects when the connection closes before approval", async () => {
    const { waitForDaemonApproval } = await import("./test-daemon-connection");
    const client = new FakeApprovalWaitClient();
    const pending = waitForDaemonApproval(client);

    client.setState({ status: "disconnected", reason: "relay closed" });

    await expect(pending).rejects.toThrow("relay closed");
    expect(client.listenerCount()).toBe(0);
  });

  it("rejects and unsubscribes when pairing is cancelled", async () => {
    const { waitForDaemonApproval } = await import("./test-daemon-connection");
    const client = new FakeApprovalWaitClient();
    const abortController = new AbortController();
    const pending = waitForDaemonApproval(client, abortController.signal);

    abortController.abort();

    await expect(pending).rejects.toThrow("Pairing cancelled");
    expect(client.listenerCount()).toBe(0);
  });
});
