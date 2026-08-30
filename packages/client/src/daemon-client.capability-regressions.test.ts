import { afterEach, expect, expectTypeOf, test, vi } from "vitest";
import { z } from "zod";
import { DaemonClient, FileExplorerRequestError, type DaemonTransport, type Logger } from "./daemon-client";
expectTypeOf<"getGitDiff" extends keyof DaemonClient ? true : false>().toEqualTypeOf<false>();
expectTypeOf<"getHighlightedDiff" extends keyof DaemonClient ? true : false>().toEqualTypeOf<false>();
expectTypeOf<"exploreFileSystem" extends keyof DaemonClient ? true : false>().toEqualTypeOf<false>();
function createMockLogger() {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}
function createMockTransport() {
    const sent: Array<string | Uint8Array | ArrayBuffer> = [];
    let onMessage: (data: unknown) => void = () => { };
    let onOpen: () => void = () => { };
    let onClose: (_event?: unknown) => void = () => { };
    let onError: (_event?: unknown) => void = () => { };
    let serverInfoOrdinal = 1;
    const transport: DaemonTransport = {
        send: (data) => {
            sent.push(data);
            if (typeof data !== "string") {
                return;
            }
            const frame = JSON.parse(data) as {
                type?: string;
            };
            if (frame.type === "ping") {
                onMessage(JSON.stringify({ type: "pong" }));
            }
        },
        close: () => { },
        onMessage: (handler) => {
            onMessage = handler;
            return () => { };
        },
        onOpen: (handler) => {
            onOpen = handler;
            return () => { };
        },
        onClose: (handler) => {
            onClose = handler;
            return () => { };
        },
        onError: (handler) => {
            onError = handler;
            return () => { };
        },
    };
    return {
        transport,
        sent,
        triggerSocketOpen: () => onOpen(),
        triggerOpen: (options?: {
            preserveSent?: boolean;
            features?: Record<string, boolean>;
        }) => {
            onOpen();
            if (!options?.preserveSent) {
                // Ignore HELLO handshake payloads in assertions.
                sent.length = 0;
            }
            onMessage(JSON.stringify({
                type: "session",
                message: {
                    type: "status",
                    payload: {
                        status: "server_info",
                        serverId: `srv_test_${serverInfoOrdinal++}`,
                        hostname: null,
                        version: null,
                        ...(options?.features ? { features: options.features } : {}),
                    },
                },
            }));
        },
        triggerClose: (event?: unknown) => onClose(event),
        triggerError: (event?: unknown) => onError(event),
        triggerMessage: (data: unknown) => onMessage(data),
    };
}
function wrapSessionMessage(message: unknown): string {
    return JSON.stringify({
        type: "session",
        message,
    });
}
function assertStr(data: string | Uint8Array | ArrayBuffer | undefined): string {
    if (typeof data !== "string")
        throw new Error("Expected string frame");
    return data;
}
function parseSentFrame(data: string | Uint8Array | ArrayBuffer | undefined): Record<string, unknown> {
    return z
        .object({
        type: z.literal("session"),
        message: z.record(z.string(), z.unknown()),
    })
        .parse(JSON.parse(assertStr(data))).message;
}
function respondToScheduleRequest(mock: ReturnType<typeof createMockTransport>, request: Record<string, unknown>): void {
    const responseType = request.type === "schedule/create" ? "schedule/create/response" : "schedule/update/response";
    mock.triggerMessage(wrapSessionMessage({
        type: responseType,
        payload: {
            requestId: request.requestId,
            schedule: null,
            error: null,
        },
    }));
}
const clients: DaemonClient[] = [];
afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    clients.length = 0;
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
test("exposes the normalized client id", () => {
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "  client-current-device  ",
        transportFactory: () => createMockTransport().transport,
        reconnect: { enabled: false },
    });
    clients.push(client);
    expect(client.getClientId()).toBe("client-current-device");
});
test("waits for server approval and connects on the same transport after approval", async () => {
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "client-awaiting-approval",
        transportFactory: () => mock.transport,
        reconnect: { enabled: false },
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerSocketOpen();
    mock.triggerMessage(JSON.stringify({
        type: "connection.approval_required",
        message: "无权限，联系服务端通过连接申请",
    }));
    await expect(connectPromise).rejects.toThrow("无权限，联系服务端通过连接申请");
    expect(client.getConnectionState()).toEqual({
        status: "awaiting_approval",
        message: "无权限，联系服务端通过连接申请",
    });
    mock.triggerMessage(wrapSessionMessage({
        type: "status",
        payload: {
            status: "server_info",
            serverId: "srv_approved",
            hostname: "approved-host",
            version: "1.0.0",
        },
    }));
    expect(client.getConnectionState()).toEqual({ status: "connected" });
    expect(client.getConnectionTransport()).toEqual({
        type: "direct",
        endpoint: "ws://test",
        e2ee: false,
        upgradedFromRelay: false,
    });
});
test("reports the active Relay endpoint after connecting", async () => {
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "wss://relay.paseo.sh:443/?serverId=srv_test&role=client",
        clientId: "client-relay-path",
        transportFactory: () => mock.transport,
        reconnect: { enabled: false },
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    expect(client.getConnectionTransport()).toEqual({
        type: "relay",
        endpoint: "wss://relay.paseo.sh",
        e2ee: false,
    });
});
test("sets the complete viewed timeline subscription only when the daemon supports it", async () => {
    const supportedTransport = createMockTransport();
    const supportedClient = new DaemonClient({
        url: "ws://test",
        clientId: "timeline_supported",
        transportFactory: () => supportedTransport.transport,
        reconnect: { enabled: false },
    });
    const legacyTransport = createMockTransport();
    const legacyClient = new DaemonClient({
        url: "ws://test",
        clientId: "timeline_legacy",
        transportFactory: () => legacyTransport.transport,
        reconnect: { enabled: false },
    });
    clients.push(supportedClient, legacyClient);
    const supportedConnect = supportedClient.connect();
    supportedTransport.triggerOpen({
        features: { selectiveAgentTimeline: true },
    });
    await supportedConnect;
    const legacyConnect = legacyClient.connect();
    legacyTransport.triggerOpen();
    await legacyConnect;
    expect(supportedClient.getLastServerInfoMessage()?.features).toEqual({
        selectiveAgentTimeline: true,
    });
    const setPromise = supportedClient.setAgentTimelineSubscription(["agent-b", "agent-a"]);
    await Promise.resolve();
    const request = parseSentFrame(supportedTransport.sent[0]);
    supportedTransport.triggerMessage(wrapSessionMessage({
        type: "agent.timeline.set_subscription.response",
        payload: {
            requestId: request.requestId,
            agentIds: ["agent-a", "agent-b"],
        },
    }));
    await setPromise;
    await legacyClient.setAgentTimelineSubscription(["agent-a"]);
    expect({ request, legacyFrames: legacyTransport.sent }).toEqual({
        request: {
            type: "agent.timeline.set_subscription.request",
            requestId: expect.any(String),
            agentIds: ["agent-a", "agent-b"],
        },
        legacyFrames: [],
    });
});
const noopLogger: Logger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};
type PongMode = {
    kind: "answer";
    delayMs: number;
} | {
    kind: "silent";
};
class FakeDaemon {
    private onMessage: (data: unknown) => void = () => { };
    private onOpen: () => void = () => { };
    private onClose: (event?: unknown) => void = () => { };
    private onError: (event?: unknown) => void = () => { };
    private pongMode: PongMode = { kind: "answer", delayMs: 0 };
    private withheldPongs = 0;
    private pingsSentAt: number[] = [];
    private closeEvents: Array<{
        code?: number;
        reason?: string;
    }> = [];
    readonly transport: DaemonTransport = {
        send: (data) => {
            if (typeof data !== "string") {
                return;
            }
            const frame = JSON.parse(data) as {
                type?: string;
            };
            if (frame.type !== "ping") {
                return;
            }
            this.pingsSentAt.push(performance.now());
            if (this.withheldPongs > 0) {
                this.withheldPongs -= 1;
                return;
            }
            if (this.pongMode.kind === "silent") {
                return;
            }
            if (this.pongMode.delayMs === 0) {
                this.onMessage(JSON.stringify({ type: "pong" }));
                return;
            }
            setTimeout(() => {
                this.onMessage(JSON.stringify({ type: "pong" }));
            }, this.pongMode.delayMs);
        },
        close: (code?: number, reason?: string) => {
            this.closeEvents.push({ code, reason });
        },
        onMessage: (handler) => {
            this.onMessage = handler;
            return () => { };
        },
        onOpen: (handler) => {
            this.onOpen = handler;
            return () => { };
        },
        onClose: (handler) => {
            this.onClose = handler;
            return () => { };
        },
        onError: (handler) => {
            this.onError = handler;
            return () => { };
        },
    };
    openConnection(): void {
        this.onOpen();
        this.onMessage(JSON.stringify({
            type: "session",
            message: {
                type: "status",
                payload: {
                    status: "server_info",
                    serverId: "srv_heartbeat_test",
                    hostname: null,
                    version: null,
                },
            },
        }));
    }
    daemonAnswersPingsAfter(delay: "fast" | `${number}s`): void {
        this.pongMode = {
            kind: "answer",
            delayMs: delay === "fast" ? 0 : Number.parseFloat(delay) * 1000,
        };
    }
    daemonGoesSilent(): void {
        this.pongMode = { kind: "silent" };
    }
    daemonWithholdsNextPongThenAnswersFast(): void {
        this.withheldPongs += 1;
        this.daemonAnswersPingsAfter("fast");
    }
    daemonClosesWith(reason: string): void {
        this.onClose({ reason });
    }
    triggerError(event?: unknown): void {
        this.onError(event);
    }
    pingTimestamps(): string[] {
        return this.pingsSentAt.map((timestamp) => `${timestamp / 1000}s`);
    }
    teardownCount(): number {
        return this.closeEvents.filter((event) => event.reason === "Liveness check timed out").length;
    }
    closesFromClient(): Array<{
        code?: number;
        reason?: string;
    }> {
        return this.closeEvents;
    }
}
class DaemonClientSession {
    private readonly daemon = new FakeDaemon();
    private readonly client: DaemonClient;
    constructor() {
        this.client = new DaemonClient({
            url: "ws://test",
            clientId: "clsk_heartbeat_test",
            logger: noopLogger,
            reconnect: { enabled: false },
            transportFactory: () => this.daemon.transport,
        });
        clients.push(this.client);
    }
    async connect(): Promise<void> {
        const connection = this.client.connect();
        this.daemon.openConnection();
        await connection;
    }
    async advance(ms: number): Promise<void> {
        await vi.advanceTimersByTimeAsync(ms);
    }
    daemonAnswersPingsAfter(delay: "fast" | `${number}s`): void {
        this.daemon.daemonAnswersPingsAfter(delay);
    }
    daemonGoesSilent(): void {
        this.daemon.daemonGoesSilent();
    }
    daemonWithholdsNextPongThenAnswersFast(): void {
        this.daemon.daemonWithholdsNextPongThenAnswersFast();
    }
    daemonClosesWith(reason: string): void {
        this.daemon.daemonClosesWith(reason);
    }
    pingTimestamps(): string[] {
        return this.daemon.pingTimestamps();
    }
    state(): ReturnType<DaemonClient["getConnectionState"]> {
        return this.client.getConnectionState();
    }
    lastError(): string | null {
        return this.client.lastError;
    }
    teardownCount(): number {
        return this.daemon.teardownCount();
    }
    closesFromClient(): Array<{
        code?: number;
        reason?: string;
    }> {
        return this.daemon.closesFromClient();
    }
    lastLivenessRttMs(): number | null {
        return this.client.getLastLivenessRttMs();
    }
    measureLatency(input: {
        timeoutMs: number;
    }): Promise<number> {
        return this.client.measureLatency(input);
    }
}
function useHeartbeatClock(): void {
    vi.useFakeTimers({
        toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    });
}
test("advertises client capabilities in hello", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        clientName: "Paseo Desktop · workstation",
        clientHostname: "workstation",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
        capabilities: {
            browser_host: {
                supportedCommands: ["list_tabs"],
                hostKind: "desktop app",
            },
        },
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen({ preserveSent: true });
    await connectPromise;
    expect(mock.sent).toHaveLength(1);
    expect(JSON.parse(assertStr(mock.sent[0]))).toEqual({
        type: "hello",
        clientId: "clsk_unit_test",
        clientName: "Paseo Desktop · workstation",
        clientHostname: "workstation",
        clientType: "cli",
        protocolVersion: 1,
        capabilities: {
            compact_provider_snapshots: true,
            custom_mode_icons: true,
            project_updates: true,
            provider_subagents: true,
            reasoning_merge_enum: true,
            terminal_reflowable_snapshot: true,
            browser_host: {
                supportedCommands: ["list_tabs"],
                hostKind: "desktop app",
            },
        },
    });
});
test("sends bash target options when creating schedules", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    const createPromise = client.scheduleCreate({
        requestId: "request-1",
        prompt: "npm test",
        cadence: { type: "cron", expression: "* * * * *" },
        target: {
            type: "bash",
            config: {
                cwd: "/tmp/project",
                shell: "/bin/bash",
                timeoutMs: 60000,
            },
        },
    });
    const request = parseSentFrame(mock.sent[0]);
    expect(request).toEqual({
        type: "schedule/create",
        requestId: "request-1",
        prompt: "npm test",
        cadence: { type: "cron", expression: "* * * * *" },
        target: {
            type: "bash",
            config: {
                cwd: "/tmp/project",
                shell: "/bin/bash",
                timeoutMs: 60000,
            },
        },
    });
    respondToScheduleRequest(mock, request);
    await expect(createPromise).resolves.toEqual({
        requestId: "request-1",
        schedule: null,
        error: null,
    });
});
test("sends bash run options when updating schedules", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    const updatePromise = client.scheduleUpdate({
        id: "schedule-1",
        requestId: "request-1",
        bashConfig: {
            cwd: "/tmp/project",
            shell: null,
            timeoutMs: null,
        },
    });
    const request = parseSentFrame(mock.sent[0]);
    expect(request).toEqual({
        type: "schedule/update",
        requestId: "request-1",
        scheduleId: "schedule-1",
        bashConfig: {
            cwd: "/tmp/project",
            shell: null,
            timeoutMs: null,
        },
    });
    respondToScheduleRequest(mock, request);
    await expect(updatePromise).resolves.toEqual({
        requestId: "request-1",
        schedule: null,
        error: null,
    });
});
test("a candidate measurement that times out under a heartbeat tick does not count toward teardown", async () => {
    useHeartbeatClock();
    const session = new DaemonClientSession();
    session.daemonGoesSilent();
    await session.connect();
    // A candidate measurement is still in flight when the +10s heartbeat tick lands,
    // so the heartbeat shares the in-flight ping. Let the measurement time out.
    await session.advance(9000);
    const measurement = session.measureLatency({ timeoutMs: 5000 });
    const measurementError = measurement.then(() => null, (error) => error);
    await session.advance(5500);
    await expect(measurementError).resolves.toEqual(expect.objectContaining({
        message: "Latency measurement timed out (5000ms)",
    }));
    // The measurement timeout must not have been recorded as a liveness failure: a
    // single genuine heartbeat miss after it must still leave the connection up.
    await session.advance(25000);
    expect(session.state()).toEqual({ status: "connected" });
    expect(session.teardownCount()).toBe(0);
});
test("listDirectory exposes a typed missing-directory error", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    const responsePromise = client.listDirectory("/tmp/project", ".", "req-missing");
    mock.triggerMessage(wrapSessionMessage({
        type: "file_explorer_response",
        payload: {
            cwd: "/tmp/project",
            path: ".",
            mode: "list",
            directory: null,
            file: null,
            error: "Directory does not exist",
            errorCode: "not_found",
            requestId: "req-missing",
        },
    }));
    const error = await responsePromise.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(FileExplorerRequestError);
    expect(error).toMatchObject({
        message: "Directory does not exist",
        code: "not_found",
    });
});
test("sends create_agent_request with workspace and caller identity", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    const createPromise = client.createAgent({
        provider: "codex",
        cwd: "/tmp/project/.paseo/worktrees/feature-a",
        workspaceId: "ws-feature-a",
        callerAgentId: "parent-agent",
        assistantId: "assistant-lead",
        teamId: "team-delivery",
        title: "Compat agent",
        modeId: "default",
    });
    expect(mock.sent).toHaveLength(1);
    const request = parseSentFrame(mock.sent[0]);
    expect(request).toEqual(expect.objectContaining({
        type: "create_agent_request",
        workspaceId: "ws-feature-a",
        callerAgentId: "parent-agent",
        assistantId: "assistant-lead",
        teamId: "team-delivery",
    }));
    mock.triggerMessage(wrapSessionMessage({
        type: "status",
        payload: {
            status: "agent_create_failed",
            requestId: request.requestId,
            error: "compat test sentinel",
        },
    }));
    await expect(createPromise).rejects.toThrow("compat test sentinel");
});
test("creates a directoryless project through the dotted RPC", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    const createPromise = client.createDirectorylessProject({ name: "Planning" }, "req-directoryless");
    expect(parseSentFrame(mock.sent[0])).toEqual({
        type: "project.create_directoryless.request",
        name: "Planning",
        requestId: "req-directoryless",
    });
    mock.triggerMessage(wrapSessionMessage({
        type: "project.create_directoryless.response",
        payload: {
            requestId: "req-directoryless",
            project: {
                projectId: "prj_directoryless",
                projectDisplayName: "Planning",
                projectCustomName: null,
                projectRootPath: "",
                projectDirectoryless: true,
                projectKind: "non_git",
            },
            error: null,
        },
    }));
    await expect(createPromise).resolves.toEqual({
        requestId: "req-directoryless",
        project: {
            projectId: "prj_directoryless",
            projectDisplayName: "Planning",
            projectCustomName: null,
            projectRootPath: "",
            projectDirectoryless: true,
            projectKind: "non_git",
        },
        error: null,
    });
});
test("sends project.remove.request", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    const removePromise = client.removeProject("remote:github.com/acme/app", "req-remove-project");
    expect(parseSentFrame(mock.sent[0])).toEqual({
        type: "project.remove.request",
        requestId: "req-remove-project",
        projectId: "remote:github.com/acme/app",
    });
    mock.triggerMessage(wrapSessionMessage({
        type: "project.remove.response",
        payload: {
            requestId: "req-remove-project",
            projectId: "remote:github.com/acme/app",
            accepted: true,
            removedWorkspaceIds: ["ws-main"],
            error: null,
        },
    }));
    await expect(removePromise).resolves.toEqual({
        removedWorkspaceIds: ["ws-main"],
    });
});
test("sends workspace.remove.request", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    const removePromise = client.removeWorkspace("wks-main", "req-remove-workspace");
    expect(parseSentFrame(mock.sent[0])).toEqual({
        type: "workspace.remove.request",
        requestId: "req-remove-workspace",
        workspaceId: "wks-main",
    });
    mock.triggerMessage(wrapSessionMessage({
        type: "workspace.remove.response",
        payload: {
            requestId: "req-remove-workspace",
            workspaceId: "wks-main",
            accepted: true,
            error: null,
        },
    }));
    await expect(removePromise).resolves.toBeUndefined();
});
test("waits for reconnect before sending a session request", async () => {
    useHeartbeatClock();
    try {
        const logger = createMockLogger();
        const first = createMockTransport();
        const second = createMockTransport();
        const third = createMockTransport();
        const transports = [first, second, third];
        let transportIndex = 0;
        const client = new DaemonClient({
            url: "ws://test",
            clientId: "clsk_reconnect_request_test",
            logger,
            reconnect: {
                enabled: true,
                baseDelayMs: 5,
                maxDelayMs: 5,
            },
            transportFactory: () => {
                const next = transports[Math.min(transportIndex, transports.length - 1)];
                transportIndex += 1;
                return next.transport;
            },
        });
        clients.push(client);
        const connectPromise = client.connect();
        first.triggerOpen();
        await connectPromise;
        first.triggerClose({ code: 1006, reason: "Daemon restarting" });
        expect(client.getConnectionState().status).toBe("disconnected");
        const createPromise = client.createAgent({
            provider: "codex",
            cwd: "/tmp/project",
            requestId: "req-after-reconnect",
            initialPrompt: "Continue after the daemon restarts",
        });
        await Promise.resolve();
        expect(first.sent).toEqual([]);
        await vi.advanceTimersByTimeAsync(5);
        expect(client.getConnectionState().status).toBe("connecting");
        second.triggerClose({ code: 1006, reason: "Daemon still restarting" });
        expect(client.getConnectionState().status).toBe("disconnected");
        await vi.advanceTimersByTimeAsync(5);
        expect(client.getConnectionState().status).toBe("connecting");
        third.triggerOpen();
        await Promise.resolve();
        expect(third.sent).toHaveLength(1);
        const request = parseSentFrame(third.sent[0]);
        expect(request).toEqual(expect.objectContaining({
            type: "create_agent_request",
            requestId: "req-after-reconnect",
            initialPrompt: "Continue after the daemon restarts",
        }));
        third.triggerMessage(wrapSessionMessage({
            type: "status",
            payload: {
                status: "agent_create_failed",
                requestId: request.requestId,
                error: "reconnected request sentinel",
            },
        }));
        await expect(createPromise).rejects.toThrow("reconnected request sentinel");
    }
    finally {
        vi.useRealTimers();
    }
});
test("getCheckoutDiff uses one-shot subscription protocol", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    const promise = client.getCheckoutDiff("/tmp/project", {
        mode: "base",
        baseRef: "main",
    });
    expect(mock.sent).toHaveLength(1);
    const subscribeRequest = parseSentFrame(mock.sent[0]);
    expect(subscribeRequest.type).toBe("subscribe_checkout_diff_request");
    expect(subscribeRequest.cwd).toBe("/tmp/project");
    expect(subscribeRequest.compare).toEqual({
        mode: "base",
        baseRef: "main",
    });
    mock.triggerMessage(JSON.stringify({
        type: "session",
        message: {
            type: "subscribe_checkout_diff_response",
            payload: {
                subscriptionId: subscribeRequest.subscriptionId,
                cwd: "/tmp/project",
                files: [],
                error: null,
                requestId: subscribeRequest.requestId,
            },
        },
    }));
    await expect(promise).resolves.toEqual({
        cwd: "/tmp/project",
        files: [],
        error: null,
        requestId: subscribeRequest.requestId,
    });
    expect(mock.sent).toHaveLength(2);
    const unsubscribeRequest = parseSentFrame(mock.sent[1]);
    expect(unsubscribeRequest.type).toBe("unsubscribe_checkout_diff_request");
    expect(unsubscribeRequest.subscriptionId).toBe(subscribeRequest.subscriptionId);
});
test("resubscribes checkout diff streams after reconnect", async () => {
    const logger = createMockLogger();
    const mock = createMockTransport();
    const client = new DaemonClient({
        url: "ws://test",
        clientId: "clsk_unit_test",
        logger,
        reconnect: { enabled: false },
        transportFactory: () => mock.transport,
    });
    clients.push(client);
    const internal = client as unknown as {
        checkoutDiffSubscriptions: Map<string, {
            cwd: string;
            compare: {
                mode: "uncommitted" | "base";
                baseRef?: string;
            };
        }>;
    };
    internal.checkoutDiffSubscriptions.set("checkout-sub-1", {
        cwd: "/tmp/project",
        compare: { mode: "base", baseRef: "main" },
    });
    const connectPromise = client.connect();
    mock.triggerOpen();
    await connectPromise;
    expect(mock.sent).toHaveLength(1);
    const request = parseSentFrame(mock.sent[0]);
    expect(request.type).toBe("subscribe_checkout_diff_request");
    expect(request.subscriptionId).toBe("checkout-sub-1");
    expect(request.cwd).toBe("/tmp/project");
    expect(request.compare).toEqual({ mode: "base", baseRef: "main" });
    expect(typeof request.requestId).toBe("string");
    expect(z.string().parse(request.requestId).length).toBeGreaterThan(0);
});
