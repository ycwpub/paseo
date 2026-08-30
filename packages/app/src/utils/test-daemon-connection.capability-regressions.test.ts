import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState, DaemonClientConfig } from "@getpaseo/client/internal/daemon-client";
import type { DaemonConnectionDependencies, DaemonProbeClient } from "./test-daemon-connection";
class FakeDaemonClient implements DaemonProbeClient {
    readonly lastError: string | null;
    constructor(private readonly probe: FakeDaemonProbe, readonly config: DaemonClientConfig) {
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
        createDesktopTransportFactory: () => null,
        buildDesktopTransportUrl: (target) => {
            if (target.transportType === "ssh") {
                return `paseo+desktop://ssh?host=${encodeURIComponent(target.host)}`;
            }
            return `paseo+desktop://${target.transportType}?path=${encodeURIComponent(target.transportPath)}`;
        },
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
    it("keeps the transport open while client access approval is pending", async () => {
        const { connectToDaemon, DaemonConnectionApprovalRequiredError } = await import("./test-daemon-connection");
        probe.failNextConnection(new Error("无权限，联系服务端通过连接申请"), "无权限，联系服务端通过连接申请");
        const error = await connectToDaemon({
            id: "relay:relay.paseo.sh:443",
            type: "relay",
            relayEndpoint: "relay.paseo.sh:443",
            useTls: true,
            daemonPublicKeyB64: "pubkey",
        }, { serverId: "srv_probe_test" }, probe.deps).catch((caught: unknown) => caught);
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
    serverInfo: {
        serverId: string;
        hostname: string | null;
    } | null = null;
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
