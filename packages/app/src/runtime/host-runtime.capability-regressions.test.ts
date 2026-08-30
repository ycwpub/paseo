import { afterEach, describe, expect, it, vi } from "vitest";
import type { DaemonClient, ConnectionState, FetchAgentsEntry, FetchAgentsOptions } from "@getpaseo/client/internal/daemon-client";
import type { SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type { HostConnection, HostProfile } from "@/types/host-connection";
import { defaultHostAppearance } from "@/hosts/appearance";
import { useSessionStore } from "@/stores/session-store";
import { DaemonConnectionApprovalRequiredError } from "@/utils/test-daemon-connection";
import { HostRuntimeController, HostRuntimeStore, type HostRuntimeStorage } from "./host-runtime";
class FakeDaemonClient {
    private state: ConnectionState = { status: "idle" };
    private listeners = new Set<(status: ConnectionState) => void>();
    private error: string | null = null;
    private heartbeatRttMs: number | null = null;
    private latencyMeasurementFailure: Error | null = null;
    private latencyMeasurementsRequested: Array<{
        timeoutMs?: number;
    }> = [];
    public connectCalls = 0;
    public fetchAgentsCalls: FetchAgentsOptions[] = [];
    public fetchAgentsResponses: Array<Awaited<ReturnType<DaemonClient["fetchAgents"]>> | ReturnType<DaemonClient["fetchAgents"]>> = [];
    public sentAgentMessages: Array<Parameters<DaemonClient["sendAgentMessage"]>> = [];
    public sendAgentMessageFailures: Error[] = [];
    public sendAgentMessageResponses: Promise<void>[] = [];
    private agentUpdateListeners = new Set<(message: Extract<SessionOutboundMessage, {
        type: "agent_update";
    }>) => void>();
    private fetchWaiters = new Set<() => void>();
    private agentListenerWaiters = new Set<() => void>();
    private sentMessageWaiters = new Set<() => void>();
    on(type: "agent_update", listener: (message: Extract<SessionOutboundMessage, {
        type: "agent_update";
    }>) => void): () => void {
        if (type === "agent_update")
            this.agentUpdateListeners.add(listener);
        for (const waiter of this.agentListenerWaiters)
            waiter();
        return () => this.agentUpdateListeners.delete(listener);
    }
    async waitForAgentUpdates(): Promise<void> {
        if (this.agentUpdateListeners.size > 0)
            return;
        await new Promise<void>((resolve) => {
            const waiter = () => {
                if (this.agentUpdateListeners.size === 0)
                    return;
                this.agentListenerWaiters.delete(waiter);
                resolve();
            };
            this.agentListenerWaiters.add(waiter);
        });
    }
    agentUpdate(payload: Extract<SessionOutboundMessage, {
        type: "agent_update";
    }>["payload"]): void {
        for (const listener of this.agentUpdateListeners) {
            listener({ type: "agent_update", payload });
        }
    }
    async connect(): Promise<void> {
        this.connectCalls += 1;
        this.setConnectionState({ status: "connected" });
    }
    async close(): Promise<void> {
        this.setConnectionState({ status: "disconnected", reason: "client_closed" });
    }
    async sendAgentMessage(...args: Parameters<DaemonClient["sendAgentMessage"]>): ReturnType<DaemonClient["sendAgentMessage"]> {
        this.sentAgentMessages.push(args);
        for (const waiter of this.sentMessageWaiters)
            waiter();
        const response = this.sendAgentMessageResponses.shift();
        if (response)
            await response;
        const failure = this.sendAgentMessageFailures.shift();
        if (failure)
            throw failure;
    }
    async waitForSentMessages(count: number): Promise<void> {
        if (this.sentAgentMessages.length >= count)
            return;
        await new Promise<void>((resolve) => {
            const waiter = () => {
                if (this.sentAgentMessages.length < count)
                    return;
                this.sentMessageWaiters.delete(waiter);
                resolve();
            };
            this.sentMessageWaiters.add(waiter);
        });
    }
    ensureConnected(): void {
        if (this.state.status !== "connected") {
            this.setConnectionState({ status: "connected" });
        }
    }
    getConnectionState(): ConnectionState {
        return this.state;
    }
    getLastServerInfoMessage(): null {
        return null;
    }
    subscribeConnectionStatus(listener: (status: ConnectionState) => void): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => {
            this.listeners.delete(listener);
        };
    }
    get lastError(): string | null {
        return this.error;
    }
    async fetchAgents(options?: FetchAgentsOptions): Promise<Awaited<ReturnType<DaemonClient["fetchAgents"]>>> {
        this.fetchAgentsCalls.push(options ?? {});
        for (const waiter of this.fetchWaiters)
            waiter();
        const queued = this.fetchAgentsResponses.shift();
        if (queued) {
            return await queued;
        }
        return makeFetchAgentsPayload({
            entries: [],
            subscriptionId: options?.subscribe?.subscriptionId ?? undefined,
        });
    }
    async waitForFetches(count: number): Promise<void> {
        if (this.fetchAgentsCalls.length >= count)
            return;
        await new Promise<void>((resolve) => {
            const waiter = () => {
                if (this.fetchAgentsCalls.length < count)
                    return;
                this.fetchWaiters.delete(waiter);
                resolve();
            };
            this.fetchWaiters.add(waiter);
        });
    }
    async ping(): Promise<{
        rttMs: number;
    }> {
        return { rttMs: 0 };
    }
    async measureLatency(params?: {
        timeoutMs?: number;
    }): Promise<number> {
        this.latencyMeasurementsRequested.push(params ?? {});
        if (this.latencyMeasurementFailure) {
            throw this.latencyMeasurementFailure;
        }
        const result = await this.ping();
        return result.rttMs;
    }
    setReconnectEnabled(_enabled: boolean): void { }
    getLastLivenessRttMs(): number | null {
        return this.heartbeatRttMs;
    }
    heartbeatReportsRtt(rttMs: number | null): void {
        this.heartbeatRttMs = rttMs;
    }
    latencyMeasurementsFailWith(message: string): void {
        this.latencyMeasurementFailure = new Error(message);
    }
    latencyMeasurements(): Array<{
        timeoutMs?: number;
    }> {
        return this.latencyMeasurementsRequested;
    }
    clearLatencyMeasurements(): void {
        this.latencyMeasurementsRequested = [];
    }
    isDisposed(): boolean {
        return this.state.status === "disconnected" && this.state.reason === "client_closed";
    }
    setConnectionState(next: ConnectionState): void {
        this.state = next;
        if (next.status === "disconnected") {
            this.error = next.reason ?? this.error;
        }
        for (const listener of this.listeners) {
            listener(next);
        }
    }
}
afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).__PASEO_INITIAL_DAEMON_CONNECTION__;
    delete (globalThis as {
        window?: unknown;
    }).window;
});
function makeFetchAgentsPayload(input: {
    entries: FetchAgentsEntry[];
    hasMore?: boolean;
    nextCursor?: string | null;
    subscriptionId?: string;
}): Awaited<ReturnType<DaemonClient["fetchAgents"]>> {
    return {
        entries: input.entries,
        pageInfo: {
            nextCursor: input.nextCursor ?? null,
            prevCursor: null,
            hasMore: input.hasMore ?? false,
        } as Awaited<ReturnType<DaemonClient["fetchAgents"]>>["pageInfo"],
        ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
        requestId: "req_test",
    };
}
function makeHost(input?: Partial<HostProfile>): HostProfile {
    const direct: HostConnection = {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
    };
    const relay: HostConnection = {
        id: "relay:relay.paseo.sh:443",
        type: "relay",
        relayEndpoint: "relay.paseo.sh:443",
        daemonPublicKeyB64: "pk_test",
    };
    return {
        serverId: input?.serverId ?? "srv_test",
        label: input?.label ?? "test host",
        appearance: input?.appearance ?? defaultHostAppearance(),
        lifecycle: input?.lifecycle ?? {},
        connections: input?.connections ?? [direct, relay],
        preferredConnectionId: input?.preferredConnectionId ?? direct.id,
        createdAt: input?.createdAt ?? new Date(0).toISOString(),
        updatedAt: input?.updatedAt ?? new Date(0).toISOString(),
    };
}
function makeConnectedProbeClient(latencyMs: number): FakeDaemonClient {
    const client = new FakeDaemonClient();
    client.connectCalls = 1;
    client.setConnectionState({ status: "connected" });
    client.ping = async () => ({ rttMs: latencyMs });
    return client;
}
function createMemoryHostRuntimeStorage(entries: Record<string, string> = {}): HostRuntimeStorage {
    const values = new Map(Object.entries(entries));
    return {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => {
            values.set(key, value);
        },
        removeItem: async (key) => {
            values.delete(key);
        },
    };
}
describe("HostRuntimeController", () => {
    it("keeps a pending approval probe active until the server approves it", async () => {
        const relay = makeHost().connections.find((connection) => connection.type === "relay")!;
        const host = makeHost({ connections: [relay], preferredConnectionId: relay.id });
        const pendingClient = new FakeDaemonClient();
        pendingClient.setConnectionState({
            status: "awaiting_approval",
            message: "无权限，联系服务端通过连接申请",
        });
        const controller = new HostRuntimeController({
            host,
            deps: {
                createClient: () => {
                    throw new Error("should adopt the pending approval client");
                },
                connectToDaemon: async () => {
                    throw new DaemonConnectionApprovalRequiredError("无权限，联系服务端通过连接申请", {
                        reason: "无权限，联系服务端通过连接申请",
                        lastError: "无权限，联系服务端通过连接申请",
                    }, pendingClient as unknown as DaemonClient);
                },
                getClientId: async () => "cid_test_runtime",
            },
        });
        await controller.runProbeCycleNow();
        expect(controller.getSnapshot().activeConnectionId).toBe(relay.id);
        expect(controller.getSnapshot().connectionStatus).toBe("connecting");
        expect(controller.getSnapshot().client).toBe(pendingClient);
        expect(controller.getSnapshot().probeByConnectionId.get(relay.id)).toEqual({
            status: "pending",
            latencyMs: null,
        });
        expect(pendingClient.isDisposed()).toBe(false);
        pendingClient.setConnectionState({ status: "connected" });
        expect(controller.getSnapshot().connectionStatus).toBe("online");
        expect(controller.getSnapshot().lastError).toBeNull();
    });
});
describe("HostRuntimeStore", () => {
    it("keeps later queued messages blocked while the first message is being edited", async () => {
        const host = makeHost({ serverId: "srv_editing_queue" });
        const fakeClient = new FakeDaemonClient();
        const store = new HostRuntimeStore({
            deps: {
                createClient: () => fakeClient as unknown as DaemonClient,
                connectToDaemon: async () => ({
                    client: fakeClient as unknown as DaemonClient,
                    serverId: host.serverId,
                    hostname: null,
                }),
                getClientId: async () => "cid_editing_queue",
            },
        });
        const sessionStore = useSessionStore.getState();
        sessionStore.initializeSession(host.serverId, fakeClient as unknown as DaemonClient, 1);
        sessionStore.setQueuedMessages(host.serverId, new Map([
            [
                "agent",
                [
                    { id: "editing", text: "editing", attachments: [], isEditing: true },
                    { id: "later", text: "later", attachments: [] },
                ],
            ],
        ]));
        store.drainQueuedAgentMessage(host.serverId, "agent");
        await Promise.resolve();
        expect(fakeClient.sentAgentMessages).toEqual([]);
        expect(useSessionStore.getState().sessions[host.serverId]?.queuedMessages.get("agent")).toEqual([
            { id: "editing", text: "editing", attachments: [], isEditing: true },
            { id: "later", text: "later", attachments: [] },
        ]);
        useSessionStore.getState().clearSession(host.serverId);
    });
    it("keeps queued messages blocked until context compaction completes", async () => {
        const host = makeHost({ serverId: "srv_compaction_queue_drain" });
        const fakeClient = new FakeDaemonClient();
        const store = new HostRuntimeStore({
            deps: {
                createClient: () => fakeClient as unknown as DaemonClient,
                connectToDaemon: async () => ({
                    client: fakeClient as unknown as DaemonClient,
                    serverId: host.serverId,
                    hostname: null,
                }),
                getClientId: async () => "cid_compaction_queue_drain",
            },
        });
        const sessionStore = useSessionStore.getState();
        sessionStore.initializeSession(host.serverId, fakeClient as unknown as DaemonClient, 1);
        sessionStore.setQueuedMessages(host.serverId, new Map([["agent", [{ id: "after-compaction", text: "continue", attachments: [] }]]]));
        sessionStore.setAgentStreamTail(host.serverId, new Map([
            [
                "agent",
                [
                    {
                        kind: "compaction",
                        id: "compaction",
                        timestamp: new Date(0),
                        status: "loading",
                        trigger: "auto",
                    },
                ],
            ],
        ]));
        store.drainQueuedAgentMessage(host.serverId, "agent");
        expect(fakeClient.sentAgentMessages).toEqual([]);
        sessionStore.setAgentStreamTail(host.serverId, new Map([
            [
                "agent",
                [
                    {
                        kind: "compaction",
                        id: "compaction",
                        timestamp: new Date(0),
                        status: "completed",
                        trigger: "auto",
                    },
                ],
            ],
        ]));
        store.drainQueuedAgentMessage(host.serverId, "agent");
        await fakeClient.waitForSentMessages(1);
        expect(fakeClient.sentAgentMessages.map(([agentId, text]) => [agentId, text])).toEqual([
            ["agent", "continue"],
        ]);
        useSessionStore.getState().clearSession(host.serverId);
    });
    it("replaces a stale loopback desktop connection with the daemon's current endpoint", async () => {
        const store = new HostRuntimeStore({
            deps: {
                createClient: () => new FakeDaemonClient() as unknown as DaemonClient,
                connectToDaemon: async ({ host }) => ({
                    client: makeConnectedProbeClient(5) as unknown as DaemonClient,
                    serverId: host.serverId,
                    hostname: host.label ?? null,
                }),
                getClientId: async () => "cid_test_runtime",
            },
            storage: createMemoryHostRuntimeStorage(),
        });
        try {
            await store.upsertConnectionFromListen({
                listenAddress: "127.0.0.1:6769",
                serverId: "srv_desktop",
                hostname: "desktop",
            });
            await store.upsertConnectionFromListen({
                listenAddress: "127.0.0.1:6767",
                serverId: "srv_desktop",
                hostname: "desktop",
            });
            const host = store.getHosts().find((candidate) => candidate.serverId === "srv_desktop");
            expect(host?.connections).toEqual([
                {
                    id: "direct:localhost:6767",
                    type: "directTcp",
                    endpoint: "localhost:6767",
                },
            ]);
            expect(host?.preferredConnectionId).toBe("direct:localhost:6767");
        }
        finally {
            store.syncHosts([]);
        }
    });
});
