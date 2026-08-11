import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Server as HTTPServer } from "http";
import type pino from "pino";
import type { AgentManager } from "./agent/agent-manager.js";
import type { AgentStorage } from "./agent/agent-storage.js";
import type { DownloadTokenStore } from "./file-download/token-store.js";
import type { DaemonConfigStore } from "./daemon-config-store.js";
import type { ScheduleService } from "./schedule/service.js";
import type { CheckoutDiffManager } from "./checkout-diff-manager.js";
import type { WorkspaceAutoName } from "./workspace-auto-name.js";
import { asInternals, createStub } from "./test-utils/class-mocks.js";
import { createProviderSnapshotManagerStub } from "./test-utils/session-stubs.js";
import {
  asUint8Array,
  decodeTerminalStreamFrame,
  encodeTerminalStreamFrame,
  TerminalStreamOpcode,
} from "@getpaseo/protocol/terminal-stream-protocol";
import { CLIENT_CAPS } from "@getpaseo/protocol/client-capabilities";

type SocketListener = (...args: unknown[]) => void;

const wsModuleMock = vi.hoisted(() => {
  class MockWebSocketServer {
    static instances: MockWebSocketServer[] = [];
    readonly handlers = new Map<string, (...args: unknown[]) => void>();

    constructor(_options: unknown) {
      MockWebSocketServer.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, handler);
      return this;
    }

    close() {
      // no-op
    }
  }

  return { MockWebSocketServer };
});

const sessionMock = vi.hoisted(() => {
  const instances: MockSession[] = [];

  class MockSession {
    cleanup = vi.fn(async () => {});
    handleMessage = vi.fn(async () => {});
    handleBinaryFrame = vi.fn((_frame: unknown) => {});
    supports = vi.fn((capability: string) => this.args.clientCapabilities?.[capability] === true);
    updateClientCapabilities = vi.fn((capabilities: Record<string, unknown> | null) => {
      this.args.clientCapabilities = capabilities;
    });
    clearAgentTimelineSubscription = vi.fn();
    getClientActivity = vi.fn(() => null);
    getSessionId = vi.fn(() => "mock-session-id");
    resetPeakInflight = vi.fn(() => {});
    getRuntimeMetrics = vi.fn(() => ({
      checkoutDiffTargetCount: 0,
      checkoutDiffSubscriptionCount: 0,
      checkoutDiffWatcherCount: 0,
      checkoutDiffFallbackRefreshTargetCount: 0,
      terminalDirectorySubscriptionCount: 0,
      terminalSubscriptionCount: 0,
      inflightRequests: 0,
      peakInflightRequests: 0,
    }));
    readonly args: Record<string, unknown>;

    constructor(args: Record<string, unknown>) {
      this.args = args;
      instances.push(this);
    }
  }

  return { MockSession, instances };
});

vi.mock("ws", () => ({
  WebSocketServer: wsModuleMock.MockWebSocketServer,
}));

vi.mock("./session.js", () => ({
  Session: sessionMock.MockSession,
}));

vi.mock("./push/index.js", () => ({
  createPushNotifications: () => ({
    renew: () => undefined,
    revoke: () => undefined,
    send: async () => undefined,
  }),
}));

vi.mock("./client-access-store.js", () => ({
  CLIENT_ACCESS_HISTORY_RETENTION_DAYS: 30,
  ClientAccessStore: class {
    private approved = new Map<string, Record<string, unknown>>();
    private history: Record<string, unknown>[] = [];

    isApproved(clientId: string) {
      return this.approved.get(clientId)?.paused === false;
    }

    isPaused(clientId: string) {
      return this.approved.get(clientId)?.paused === true;
    }

    get(clientId: string) {
      return this.approved.get(clientId) ?? null;
    }

    listApproved() {
      return Array.from(this.approved.values());
    }

    approve(record: Record<string, unknown>, approvedAt = new Date().toISOString()) {
      const existing = this.approved.get(String(record.clientId));
      const approved = {
        ...record,
        approvedAt,
        lastConnectedAt: record.lastConnectedAt ?? existing?.lastConnectedAt ?? null,
        paused: false,
      };
      this.approved.set(String(record.clientId), approved);
      return approved;
    }

    markConnected(clientId: string, connectedAt = new Date().toISOString()) {
      const existing = this.approved.get(clientId);
      if (!existing) return null;
      const updated = { ...existing, lastConnectedAt: connectedAt };
      this.approved.set(clientId, updated);
      return updated;
    }

    setPaused(clientId: string, paused: boolean) {
      const existing = this.approved.get(clientId);
      if (!existing) return null;
      const updated = { ...existing, paused };
      this.approved.set(clientId, updated);
      return updated;
    }

    delete(clientId: string) {
      return this.approved.delete(clientId);
    }

    startConnection(record: Record<string, unknown>, connectedAt = new Date().toISOString()) {
      const id = `history-${this.history.length + 1}`;
      this.history.push({ ...record, id, connectedAt, disconnectedAt: null });
      return id;
    }

    endConnection(historyId: string, disconnectedAt = new Date().toISOString()) {
      const record = this.history.find((entry) => entry.id === historyId);
      if (!record) return false;
      record.disconnectedAt = disconnectedAt;
      return true;
    }

    listHistory() {
      return [...this.history];
    }

    deleteHistory(historyId: string) {
      const index = this.history.findIndex((entry) => entry.id === historyId);
      if (index < 0) return false;
      this.history.splice(index, 1);
      return true;
    }
  },
}));

import { z } from "zod";
import { VoiceAssistantWebSocketServer } from "./websocket-server";
import { parseServerInfoStatusPayload } from "./messages.js";
import type { SpeechReadinessSnapshot } from "./speech/speech-runtime.js";

interface WebSocketServerInternals {
  attachSocket(ws: unknown, req: unknown): Promise<void>;
  approveClientAccess(clientId: string): unknown;
  setClientAccessPaused(clientId: string, paused: boolean): { status: string } | null;
  deleteClientAccess(clientId: string): boolean;
  listClientAccessEntries(): Array<{
    clientId: string;
    clientName: string | null;
    clientHostname: string | null;
    lastConnectedAt: string | null;
    status: string;
  }>;
  directCandidateBaseUrls: string[];
  consumeDirectUpgradeToken(token: string): { clientId: string; expiresAtMs: number } | null;
}

const TEST_DAEMON_VERSION = "1.2.3-test";
type DaemonConfigChangeListener = Parameters<DaemonConfigStore["onChange"]>[0];

const WireEnvelopeSchema = z.object({
  type: z.string().optional(),
  message: z
    .object({
      type: z.string().optional(),
      payload: z.unknown().optional(),
    })
    .optional(),
});

function parseSentEnvelope(data: unknown): z.infer<typeof WireEnvelopeSchema> {
  if (typeof data !== "string") throw new Error("Expected string frame");
  return WireEnvelopeSchema.parse(JSON.parse(data));
}

function sentEnvelopes(socket: MockSocket): z.infer<typeof WireEnvelopeSchema>[] {
  return socket.sent
    .filter((data): data is string => typeof data === "string")
    .map((data) => WireEnvelopeSchema.safeParse(JSON.parse(data)))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function sentServerInfoEnvelopes(socket: MockSocket): z.infer<typeof WireEnvelopeSchema>[] {
  return sentEnvelopes(socket).filter(
    (envelope) => parseServerInfoStatusPayload(envelope.message?.payload) !== null,
  );
}

function sentBinaryFrames(socket: MockSocket): Uint8Array[] {
  return socket.sent.map(asUint8Array).filter((frame): frame is Uint8Array => frame !== null);
}

function sentTerminalFrames(
  socket: MockSocket,
): NonNullable<ReturnType<typeof decodeTerminalStreamFrame>>[] {
  return sentBinaryFrames(socket)
    .map(decodeTerminalStreamFrame)
    .filter(
      (frame): frame is NonNullable<ReturnType<typeof decodeTerminalStreamFrame>> => frame !== null,
    );
}

const BinaryFrameSchema = z.object({
  kind: z.literal("terminal"),
  frame: z.object({
    opcode: z.number(),
    slot: z.number(),
    payload: z.instanceof(Uint8Array),
  }),
});

class MockSocket {
  readyState = 1;
  bufferedAmount = 0;
  sent: unknown[] = [];
  closeCalls: Array<{ code: number; reason: string }> = [];
  private listeners = new Map<string, SocketListener[]>();

  on(event: "message" | "close" | "error", listener: SocketListener): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(listener);
    this.listeners.set(event, handlers);
  }

  once(event: "close" | "error", listener: SocketListener): void {
    const wrapped: SocketListener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code: code ?? 1000, reason: reason ?? "" });
    this.readyState = 3;
    this.emit("close", code ?? 1000, reason ?? "");
  }

  emit(event: "message" | "close" | "error", ...args: unknown[]): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers.slice()) {
      handler(...args);
    }
  }

  private off(event: "close" | "error", listener: SocketListener): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      handlers.filter((handler) => handler !== listener),
    );
  }
}

function createLogger() {
  const logger = {
    child: vi.fn(() => logger),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger;
}

function createWorkspaceAutoNameStub(): WorkspaceAutoName {
  return createStub<WorkspaceAutoName>({
    scheduleForWorktree: () => {},
    scheduleForDirectory: () => {},
  });
}

function createServer(options?: {
  speechReadiness?: SpeechReadinessSnapshot | null;
  logger?: ReturnType<typeof createLogger>;
  requireClientApproval?: boolean;
}) {
  const speechReadiness = options?.speechReadiness ?? null;
  let daemonConfigChangeListener: DaemonConfigChangeListener | null = null;
  const mutableConfig = {
    providers: {},
    clientAccess: { requireApproval: options?.requireClientApproval ?? true },
  };
  const daemonConfigStore = {
    get: vi.fn(() => mutableConfig),
    onChange: vi.fn((listener: DaemonConfigChangeListener) => {
      daemonConfigChangeListener = listener;
      return () => {
        daemonConfigChangeListener = null;
      };
    }),
  };
  const logger = options?.logger ?? createLogger();
  const server = new VoiceAssistantWebSocketServer(
    createStub<HTTPServer>({}),
    createStub<pino.Logger>(logger),
    "srv_test",
    createStub<AgentManager>({
      subscribe: vi.fn(() => () => {}),
      setAgentAttentionCallback: vi.fn(),
      updateProviderRegistry: vi.fn(),
      getAgent: vi.fn(() => null),
      getMetricsSnapshot: vi.fn(() => ({
        totalAgents: 0,
        idleAgents: 0,
        runningAgents: 0,
        pendingPermissionAgents: 0,
        erroredAgents: 0,
      })),
    }),
    createStub<AgentStorage>({}),
    createStub<DownloadTokenStore>({}),
    "/tmp/paseo-test",
    createStub<DaemonConfigStore>(daemonConfigStore),
    null,
    { allowedOrigins: new Set() },
    createWorkspaceAutoNameStub(),
    undefined,
    speechReadiness
      ? {
          resolveStt: () => null,
          resolveSttLanguage: () => "en",
          resolveTts: () => null,
          resolveTurnDetection: () => null,
          resolveDictationStt: () => null,
          resolveDictationSttLanguage: () => "en",
          getReadiness: () => speechReadiness,
          onReadinessChange: vi.fn(() => () => {}),
          start: vi.fn(),
          stop: vi.fn(),
          ready: Promise.resolve(),
        }
      : undefined,
    undefined,
    undefined,
    TEST_DAEMON_VERSION,
    undefined,
    undefined,
    undefined,
    createStub<ScheduleService>({}),
    createStub<CheckoutDiffManager>({
      subscribe: vi.fn(),
      scheduleRefreshForCwd: vi.fn(),
      getMetrics: vi.fn(() => ({
        checkoutDiffTargetCount: 0,
        checkoutDiffSubscriptionCount: 0,
        checkoutDiffWatcherCount: 0,
        checkoutDiffFallbackRefreshTargetCount: 0,
      })),
      dispose: vi.fn(),
    }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    createProviderSnapshotManagerStub().manager,
  );
  return Object.assign(server, {
    setRequireClientApprovalForTest(requireApproval: boolean) {
      mutableConfig.clientAccess.requireApproval = requireApproval;
      daemonConfigChangeListener?.(mutableConfig as Parameters<DaemonConfigChangeListener>[0], {
        removedProviders: [],
      });
    },
  });
}

function createReadySpeechReadinessSnapshot(): SpeechReadinessSnapshot {
  return {
    generatedAt: "2026-02-14T00:00:00.000Z",
    requiredLocalModelIds: [],
    missingLocalModelIds: [],
    download: {
      inProgress: false,
      error: null,
    },
    dictation: {
      enabled: true,
      available: true,
      reasonCode: "ready",
      message: "Dictation is ready.",
      retryable: false,
      missingModelIds: [],
    },
    realtimeVoice: {
      enabled: true,
      available: true,
      reasonCode: "ready",
      message: "Realtime voice is ready.",
      retryable: false,
      missingModelIds: [],
    },
    voiceFeature: {
      enabled: true,
      available: true,
      reasonCode: "ready",
      message: "Voice features are ready.",
      retryable: false,
      missingModelIds: [],
    },
  };
}

function createDownloadInProgressSpeechReadinessSnapshot(): SpeechReadinessSnapshot {
  return {
    generatedAt: "2026-02-14T00:00:00.000Z",
    requiredLocalModelIds: ["parakeet-tdt-0.6b-v2-int8"],
    missingLocalModelIds: ["parakeet-tdt-0.6b-v2-int8"],
    download: {
      inProgress: true,
      error: null,
    },
    dictation: {
      enabled: true,
      available: false,
      reasonCode: "stt_unavailable",
      message: "Dictation is unavailable: speech-to-text service is not ready.",
      retryable: false,
      missingModelIds: [],
    },
    realtimeVoice: {
      enabled: true,
      available: false,
      reasonCode: "stt_unavailable",
      message: "Realtime voice is unavailable: speech-to-text service is not ready.",
      retryable: false,
      missingModelIds: [],
    },
    voiceFeature: {
      enabled: true,
      available: false,
      reasonCode: "model_download_in_progress",
      message:
        "Voice features are unavailable while models download in the background (parakeet-tdt-0.6b-v2-int8).",
      retryable: true,
      missingModelIds: ["parakeet-tdt-0.6b-v2-int8"],
    },
  };
}

function createHelloMessage(
  clientId: string,
  options?: { capabilities?: Record<string, boolean> },
) {
  return {
    type: "hello" as const,
    clientId,
    clientType: "cli" as const,
    protocolVersion: 1,
    ...(options?.capabilities ? { capabilities: options.capabilities } : {}),
  };
}

function createDirectRequest() {
  return {
    headers: {
      host: "localhost:6767",
      origin: "http://localhost:6767",
      "user-agent": "vitest",
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
    url: "/ws",
  };
}

async function attachRelayAndHello(params: {
  server: VoiceAssistantWebSocketServer;
  socket: MockSocket;
  clientId: string;
}) {
  await params.server.attachExternalSocket(params.socket, {
    transport: "relay",
  });
  params.socket.emit("message", JSON.stringify(createHelloMessage(params.clientId)));
  expect(params.socket.sent.length).toBeGreaterThan(0);
  const firstEnvelope = JSON.parse(String(params.socket.sent[0])) as {
    type?: string;
  };
  if (firstEnvelope.type === "connection.approval_required") {
    asInternals<WebSocketServerInternals>(params.server).approveClientAccess(params.clientId);
    params.socket.sent.shift();
  }
  const envelope = parseSentEnvelope(params.socket.sent.at(-1));
  expect(envelope.type).toBe("session");
  const serverInfo = parseServerInfoStatusPayload(envelope.message?.payload);
  expect(envelope.message?.type).toBe("status");
  expect(serverInfo).not.toBeNull();
  return serverInfo!;
}

async function attachDirectAndHello(params: {
  server: VoiceAssistantWebSocketServer;
  socket: MockSocket;
  clientId: string;
}) {
  await asInternals<WebSocketServerInternals>(params.server).attachSocket(
    params.socket,
    createDirectRequest(),
  );
  params.socket.emit("message", JSON.stringify(createHelloMessage(params.clientId)));
  expect(params.socket.sent.length).toBeGreaterThan(0);
  const envelope = parseSentEnvelope(params.socket.sent[0]);
  expect(envelope.type).toBe("session");
  const serverInfo = parseServerInfoStatusPayload(envelope.message?.payload);
  expect(envelope.message?.type).toBe("status");
  expect(serverInfo).not.toBeNull();
  return serverInfo!;
}

function holdNextSessionMessage(session: (typeof sessionMock.instances)[number]): {
  finish: () => void;
} {
  let finish = () => {};
  session.handleMessage.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  return {
    finish: () => finish(),
  };
}

function holdSessionCleanup(session: (typeof sessionMock.instances)[number]): {
  finish: () => void;
} {
  let finish = () => {};
  session.cleanup.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  return {
    finish: () => finish(),
  };
}

describe("relay external socket reconnect behavior", () => {
  beforeEach(() => {
    sessionMock.instances.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("blocks an external client until its connection request is approved", async () => {
    const server = createServer();
    const socket = new MockSocket();
    const clientId = "cid-awaiting-approval";

    await server.attachExternalSocket(socket, {
      transport: "relay",
      remoteAddress: "10.37.55.187",
      remotePort: 54321,
    });
    socket.emit("message", JSON.stringify(createHelloMessage(clientId)));

    expect(sessionMock.instances).toHaveLength(0);
    expect(JSON.parse(String(socket.sent.at(-1)))).toEqual({
      type: "connection.approval_required",
      message: "无权限，联系服务端通过连接申请",
    });

    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "daemon.get_status.request",
          requestId: "req-before-approval",
        },
      }),
    );
    expect(JSON.parse(String(socket.sent.at(-1)))).toEqual({
      type: "connection.approval_required",
      message: "无权限，联系服务端通过连接申请",
    });

    asInternals<WebSocketServerInternals>(server).approveClientAccess(clientId);
    expect(sessionMock.instances).toHaveLength(1);
    expect(sentServerInfoEnvelopes(socket)).toHaveLength(1);

    await server.close();
  });

  test("lists client names and supports pausing, resuming, and deleting access", async () => {
    vi.setSystemTime(new Date("2026-07-30T08:00:00.000Z"));
    const server = createServer();
    const internals = asInternals<WebSocketServerInternals>(server);
    const clientId = "cid-managed-access";
    const socket = new MockSocket();

    await server.attachExternalSocket(socket, {
      transport: "relay",
      remoteAddress: "10.37.55.187",
      remotePort: 54321,
    });
    socket.emit(
      "message",
      JSON.stringify({
        ...createHelloMessage(clientId),
        clientName: "Paseo · Alice's Pixel",
        clientHostname: "alice-pixel",
      }),
    );
    internals.approveClientAccess(clientId);

    expect(internals.listClientAccessEntries()).toEqual([
      expect.objectContaining({
        clientId,
        clientName: "Paseo · Alice's Pixel",
        clientHostname: "alice-pixel",
        remoteAddress: "10.37.55.187",
        remotePort: 54321,
        lastConnectedAt: "2026-07-30T08:00:00.000Z",
        status: "approved",
      }),
    ]);

    expect(internals.setClientAccessPaused(clientId, true)?.status).toBe("paused");
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.closeCalls.at(-1)).toMatchObject({ code: 4404 });

    const reconnectingSocket = new MockSocket();
    await server.attachExternalSocket(reconnectingSocket, { transport: "relay" });
    reconnectingSocket.emit("message", JSON.stringify(createHelloMessage(clientId)));
    expect(JSON.parse(String(reconnectingSocket.sent.at(-1)))).toMatchObject({
      type: "connection.approval_required",
    });
    server.setRequireClientApprovalForTest(false);
    expect(sentServerInfoEnvelopes(reconnectingSocket)).toHaveLength(0);

    vi.setSystemTime(new Date("2026-07-30T09:30:00.000Z"));
    expect(internals.setClientAccessPaused(clientId, false)?.status).toBe("approved");
    expect(sentServerInfoEnvelopes(reconnectingSocket)).toHaveLength(1);
    expect(internals.listClientAccessEntries()[0]?.lastConnectedAt).toBe(
      "2026-07-30T09:30:00.000Z",
    );
    expect(internals.deleteClientAccess(clientId)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(internals.listClientAccessEntries()).toHaveLength(0);

    await server.close();
  });

  test("rejects pausing or deleting the client issuing the request", async () => {
    const server = createServer();
    const internals = asInternals<WebSocketServerInternals>(server);
    const clientId = "cid-current-manager";
    const socket = new MockSocket();

    await attachRelayAndHello({ server, socket, clientId });
    const sentBeforeRequests = socket.sent.length;

    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "daemon.client_access.set_paused.request",
          requestId: "pause-current-client",
          clientId,
          paused: true,
        },
      }),
    );
    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "daemon.client_access.delete.request",
          requestId: "delete-current-client",
          clientId,
        },
      }),
    );

    await vi.waitFor(() => {
      expect(sentEnvelopes(socket).slice(sentBeforeRequests)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.objectContaining({
              type: "daemon.client_access.set_paused.response",
              payload: expect.objectContaining({
                requestId: "pause-current-client",
                success: false,
                error: "不能暂停当前客户端",
              }),
            }),
          }),
          expect.objectContaining({
            message: expect.objectContaining({
              type: "daemon.client_access.delete.response",
              payload: expect.objectContaining({
                requestId: "delete-current-client",
                success: false,
                error: "不能删除当前客户端",
              }),
            }),
          }),
        ]),
      );
    });
    expect(socket.closeCalls).toHaveLength(0);
    expect(internals.listClientAccessEntries()).toEqual([
      expect.objectContaining({ clientId, status: "approved" }),
    ]);

    await server.close();
  });

  test("accepts an external client immediately when client approval is disabled", async () => {
    vi.setSystemTime(new Date("2026-07-30T10:00:00.000Z"));
    const server = createServer({ requireClientApproval: false });
    const internals = asInternals<WebSocketServerInternals>(server);
    const socket = new MockSocket();

    await server.attachExternalSocket(socket, {
      transport: "relay",
      remoteAddress: "10.37.55.20",
      remotePort: 45678,
    });
    socket.emit(
      "message",
      JSON.stringify({
        ...createHelloMessage("cid-no-approval-required"),
        clientName: "Paseo Desktop · development-mac",
        clientHostname: "development-mac",
      }),
    );

    expect(sessionMock.instances).toHaveLength(1);
    expect(sentServerInfoEnvelopes(socket)).toHaveLength(1);
    expect(
      socket.sent.some(
        (frame) =>
          typeof frame === "string" &&
          (JSON.parse(frame) as { type?: string }).type === "connection.approval_required",
      ),
    ).toBe(false);
    expect(internals.listClientAccessEntries()).toEqual([
      expect.objectContaining({
        clientId: "cid-no-approval-required",
        clientName: "Paseo Desktop · development-mac",
        clientHostname: "development-mac",
        remoteAddress: "10.37.55.20",
        remotePort: 45678,
        status: "allowed",
        approvedAt: null,
        lastConnectedAt: "2026-07-30T10:00:00.000Z",
        connected: true,
      }),
    ]);

    expect(internals.setClientAccessPaused("cid-no-approval-required", true)).toEqual(
      expect.objectContaining({
        clientId: "cid-no-approval-required",
        status: "paused",
        lastConnectedAt: "2026-07-30T10:00:00.000Z",
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.closeCalls.at(-1)).toMatchObject({ code: 4404 });

    const reconnectingSocket = new MockSocket();
    await server.attachExternalSocket(reconnectingSocket, {
      transport: "relay",
      remoteAddress: "10.37.55.20",
      remotePort: 45679,
    });
    reconnectingSocket.emit(
      "message",
      JSON.stringify(createHelloMessage("cid-no-approval-required")),
    );
    expect(JSON.parse(String(reconnectingSocket.sent.at(-1)))).toMatchObject({
      type: "connection.approval_required",
    });

    expect(internals.setClientAccessPaused("cid-no-approval-required", false)?.status).toBe(
      "approved",
    );
    expect(sentServerInfoEnvelopes(reconnectingSocket)).toHaveLength(1);

    await server.close();
  });

  test("lists loopback desktop clients as implicitly allowed", async () => {
    vi.setSystemTime(new Date("2026-07-30T10:30:00.000Z"));
    const server = createServer();
    const internals = asInternals<WebSocketServerInternals>(server);
    const socket = new MockSocket();

    await asInternals<WebSocketServerInternals>(server).attachSocket(socket, createDirectRequest());
    socket.emit(
      "message",
      JSON.stringify({
        ...createHelloMessage("cid-local-desktop"),
        clientName: "Paseo Desktop · development-mac",
        clientHostname: "development-mac",
      }),
    );

    expect(internals.listClientAccessEntries()).toEqual([
      expect.objectContaining({
        clientId: "cid-local-desktop",
        status: "allowed",
        peer: "loopback",
        transport: "direct",
        lastConnectedAt: "2026-07-30T10:30:00.000Z",
        connected: true,
      }),
    ]);

    await server.close();
  });

  test("accepts pending clients when client approval is disabled at runtime", async () => {
    const server = createServer();
    const socket = new MockSocket();

    await server.attachExternalSocket(socket, { transport: "relay" });
    socket.emit("message", JSON.stringify(createHelloMessage("cid-disable-approval-runtime")));
    expect(sessionMock.instances).toHaveLength(0);

    server.setRequireClientApprovalForTest(false);

    expect(sessionMock.instances).toHaveLength(1);
    expect(sentServerInfoEnvelopes(socket)).toHaveLength(1);

    await server.close();
  });

  test("issues a one-time LAN direct token only after Relay approval", async () => {
    const server = createServer();
    const internals = asInternals<WebSocketServerInternals>(server);
    internals.directCandidateBaseUrls = ["ws://192.168.10.20:43210/ws"];
    const socket = new MockSocket();
    const clientId = "cid-direct-token";

    await server.attachExternalSocket(socket, { transport: "relay" });
    socket.emit("message", JSON.stringify(createHelloMessage(clientId)));
    internals.approveClientAccess(clientId);

    const directOffer = socket.sent
      .filter((frame): frame is string => typeof frame === "string")
      .map((frame) => JSON.parse(frame) as Record<string, unknown>)
      .find((frame) => frame.type === "transport.direct_offer") as
      | { candidates: string[]; expiresAt: string }
      | undefined;
    expect(directOffer).toBeDefined();
    expect(Date.parse(directOffer!.expiresAt)).toBeGreaterThan(Date.now());
    const token = new URL(directOffer!.candidates[0]!).searchParams.get("directToken");
    expect(token).toBeTruthy();
    expect(internals.consumeDirectUpgradeToken(token!)).toMatchObject({
      clientId,
    });
    expect(internals.consumeDirectUpgradeToken(token!)).toBeNull();

    await server.close();
  });

  test("rejects a LAN direct socket whose hello uses a different clientId", async () => {
    const server = createServer();
    const socket = new MockSocket();

    await server.attachExternalSocket(socket, {
      transport: "direct_e2ee",
      directUpgradeClientId: "cid-expected",
    });
    socket.emit("message", JSON.stringify(createHelloMessage("cid-attacker")));

    expect(socket.closeCalls).toContainEqual({
      code: 4403,
      reason: "Direct upgrade client mismatch",
    });
    expect(sessionMock.instances).toHaveLength(0);

    await server.close();
  });

  test("keeps the same session when relay reconnects within grace window", async () => {
    const server = createServer();
    const clientId = "cid-relay-reconnect";

    const socket1 = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: socket1,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    socket1.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    const socket2 = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: socket2,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    await server.close();
  });

  test("passes hello capabilities through to the created session", async () => {
    const server = createServer();
    const socket = new MockSocket();

    await asInternals<WebSocketServerInternals>(server).attachSocket(socket, createDirectRequest());
    socket.emit(
      "message",
      JSON.stringify(
        createHelloMessage("client-capabilities", {
          capabilities: { [CLIENT_CAPS.reasoningMergeEnum]: true },
        }),
      ),
    );
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];
    expect(session.args.clientCapabilities).toEqual({
      [CLIENT_CAPS.reasoningMergeEnum]: true,
    });

    await server.close();
  });

  test("rejects sockets attached after shutdown begins", async () => {
    const server = createServer();
    const existingSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: existingSocket,
      clientId: "existing-client",
    });

    const heldCleanup = holdSessionCleanup(sessionMock.instances[0]);
    const closePromise = server.close();

    const lateSocket = new MockSocket();
    try {
      await server.attachExternalSocket(lateSocket, { transport: "relay" });
      lateSocket.emit("message", JSON.stringify(createHelloMessage("late-client")));

      expect({
        readyState: lateSocket.readyState,
        sessionCount: sessionMock.instances.length,
      }).toEqual({
        readyState: 3,
        sessionCount: 1,
      });
    } finally {
      heldCleanup.finish();
      await closePromise;
    }
  });

  test("closes pending connection when hello timeout elapses", async () => {
    const server = createServer();

    const socket = new MockSocket();
    let closeCode: number | null = null;
    let closeReason = "";
    socket.on("close", (code: unknown, reason: unknown) => {
      closeCode = typeof code === "number" ? code : null;
      closeReason = typeof reason === "string" ? reason : "";
    });

    await asInternals<WebSocketServerInternals>(server).attachSocket(socket, createDirectRequest());
    await vi.advanceTimersByTimeAsync(15_000);

    expect(closeCode).toBe(4001);
    expect(closeReason).toBe("Hello timeout");
    expect(sessionMock.instances).toHaveLength(0);

    await server.close();
  });

  test("returns server_info when clientId reconnects with existing session", async () => {
    const server = createServer();
    const clientId = "cid-resume-flag";

    const firstSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: firstSocket,
      clientId,
    });

    firstSocket.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(1_000);

    const secondSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: secondSocket,
      clientId,
    });

    await server.close();
  });

  test("returns server_info for distinct clientIds", async () => {
    const server = createServer();

    const firstSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: firstSocket,
      clientId: "cid-new-1",
    });

    const secondSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: secondSocket,
      clientId: "cid-new-2",
    });
    expect(sessionMock.instances).toHaveLength(2);

    await server.close();
  });

  test("rejects session messages before hello", async () => {
    const server = createServer();
    const socket = new MockSocket();
    let closeCode: number | null = null;
    let closeReason = "";
    socket.on("close", (code: unknown, reason: unknown) => {
      closeCode = typeof code === "number" ? code : null;
      closeReason = typeof reason === "string" ? reason : "";
    });

    await server.attachExternalSocket(socket, { transport: "relay" });
    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "ping",
        },
      }),
    );
    expect(closeCode).toBe(4002);
    expect(["Invalid hello", "Session message before hello"]).toContain(closeReason);
    expect(sessionMock.instances).toHaveLength(0);

    await server.close();
  });

  test("logs control RPCs with the socket identity", async () => {
    const logger = createLogger();
    const server = createServer({ logger });
    const socket = new MockSocket();

    await server.attachExternalSocket(socket, {
      transport: "relay",
      relayConnectionId: "relay-conn-1",
    });
    socket.emit("message", JSON.stringify(createHelloMessage("cid-control-log")));
    asInternals<WebSocketServerInternals>(server).approveClientAccess("cid-control-log");
    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "shutdown_server_request",
          requestId: "shutdown-1",
        },
      }),
    );
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: expect.stringMatching(/^conn_/),
        transport: "relay",
        relayConnectionId: "relay-conn-1",
        clientId: "cid-control-log",
        sessionId: "mock-session-id",
        requestType: "shutdown_server_request",
        requestId: "shutdown-1",
        reason: "client_shutdown_rpc",
      }),
      "ws_control_rpc_received",
    );

    await server.close();
  });

  test("responds to top-level ping while provider diagnostic is still running", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-ping-during-provider-diagnostic",
    });

    const session = sessionMock.instances[0];
    const providerDiagnostic = holdNextSessionMessage(session);

    const sentBeforeDiagnostic = socket.sent.length;
    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "provider_diagnostic_request",
          provider: "grok",
          requestId: "slow-provider-diagnostic",
        },
      }),
    );
    await vi.waitFor(() => {
      expect(session.handleMessage).toHaveBeenCalledTimes(1);
    });

    socket.emit("message", JSON.stringify({ type: "ping" }));
    await Promise.resolve();

    expect(sentEnvelopes(socket).slice(sentBeforeDiagnostic)).toContainEqual({
      type: "pong",
    });

    providerDiagnostic.finish();
    await Promise.resolve();
    await server.close();
  });

  test("routes later session requests while provider diagnostic is still running", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-session-request-during-provider-diagnostic",
    });

    const session = sessionMock.instances[0];
    const providerDiagnostic = holdNextSessionMessage(session);

    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "provider_diagnostic_request",
          provider: "grok",
          requestId: "slow-provider-diagnostic",
        },
      }),
    );
    await vi.waitFor(() => {
      expect(session.handleMessage).toHaveBeenCalledTimes(1);
    });

    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "ping",
          requestId: "second-session-request",
          clientSentAt: Date.now(),
        },
      }),
    );
    await vi.waitFor(() => {
      expect(session.handleMessage).toHaveBeenCalledTimes(2);
    });

    providerDiagnostic.finish();
    await Promise.resolve();
    await server.close();
  });

  test("sends rpc_error when an async session request fails", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-session-request-failure",
    });

    const session = sessionMock.instances[0];
    session.handleMessage.mockRejectedValueOnce(new Error("handler exploded"));

    const sentBeforeRequest = socket.sent.length;
    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "provider_diagnostic_request",
          provider: "grok",
          requestId: "failing-provider-diagnostic",
        },
      }),
    );

    await vi.waitFor(() => {
      expect(sentEnvelopes(socket).slice(sentBeforeRequest)).toContainEqual({
        type: "session",
        message: {
          type: "rpc_error",
          payload: {
            requestId: "failing-provider-diagnostic",
            requestType: "provider_diagnostic_request",
            error: "Invalid message",
            code: "invalid_message",
          },
        },
      });
    });

    await server.close();
  });

  test("reuses direct session when same clientId reconnects within grace window", async () => {
    const server = createServer();
    const clientId = "cid-direct-reconnect";

    const socket1 = new MockSocket();
    await attachDirectAndHello({
      server,
      socket: socket1,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    socket1.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    const socket2 = new MockSocket();
    await attachDirectAndHello({
      server,
      socket: socket2,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    await server.close();
  });

  test("reuses one session when switching from direct to relay with the same clientId", async () => {
    const server = createServer();
    const clientId = "cid-switch-path";

    const directSocket = new MockSocket();
    await attachDirectAndHello({
      server,
      socket: directSocket,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    const relaySocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: relaySocket,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);

    const { onMessage } = session.args;
    expect(onMessage).toBeTypeOf("function");
    if (typeof onMessage === "function") {
      onMessage({
        type: "status",
        payload: { status: "ok" },
      });
    }

    expect(directSocket.sent.length).toBeGreaterThan(0);
    expect(relaySocket.sent.length).toBeGreaterThan(0);

    directSocket.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    relaySocket.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(90_000);
    expect(session.cleanup).toHaveBeenCalledTimes(1);

    await server.close();
  });

  test("cleans up relay session when reconnect grace expires", async () => {
    const server = createServer();
    const clientId = "cid-relay-grace-expire";

    const socket1 = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: socket1,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    socket1.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(90_000);
    expect(session.cleanup).toHaveBeenCalledTimes(1);

    await server.close();
  });

  test("advertises current features in initial server_info", async () => {
    const server = createServer();
    const socket = new MockSocket();

    const serverInfo = await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-stable-project-identity",
    });

    expect(serverInfo.features?.stableProjectIdentity).toBe(true);
    expect(serverInfo.features?.canonicalSubmittedPrompts).toBe(true);
    expect(serverInfo.features?.providersSnapshotCwd).toBe(true);
    expect(serverInfo.features?.["terminal-input-mode-replay"]).toBe(true);
    expect(serverInfo.features?.["terminal-size-ownership"]).toBe(true);
    expect(serverInfo.features?.agentTurnIdentity).toBeUndefined();
    await server.close();
  });

  test("includes voice capabilities in initial server_info when speech readiness exists", async () => {
    const speechReadiness = createReadySpeechReadinessSnapshot();
    const server = createServer({ speechReadiness });

    const socket = new MockSocket();
    const serverInfo = (await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-server-info-capabilities",
    })) as {
      version?: unknown;
      capabilities?: {
        voice?: {
          dictation?: { enabled?: unknown; reason?: unknown };
          voice?: { enabled?: unknown; reason?: unknown };
        };
      };
    };
    expect(serverInfo.version).toBe(TEST_DAEMON_VERSION);
    expect(serverInfo.capabilities?.voice?.dictation?.enabled).toBe(
      speechReadiness.dictation.enabled,
    );
    expect(serverInfo.capabilities?.voice?.dictation?.reason).toBe("");
    expect(serverInfo.capabilities?.voice?.voice?.enabled).toBe(
      speechReadiness.realtimeVoice.enabled,
    );
    expect(serverInfo.capabilities?.voice?.voice?.reason).toBe("");

    await server.close();
  });

  test("broadcasts updated server_info when capabilities change", async () => {
    const server = createServer();

    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-server-info-broadcast",
    });
    expect(sentServerInfoEnvelopes(socket)).toHaveLength(1);

    const speechReadiness = createReadySpeechReadinessSnapshot();
    server.publishSpeechReadiness(speechReadiness);
    expect(sentServerInfoEnvelopes(socket)).toHaveLength(2);

    const secondEnvelope = sentServerInfoEnvelopes(socket)[1];
    const secondPayload = parseServerInfoStatusPayload(secondEnvelope.message?.payload);
    expect(secondPayload?.capabilities?.voice?.dictation.enabled).toBe(true);
    expect(secondPayload?.capabilities?.voice?.voice.enabled).toBe(true);

    // Same readiness should not produce another server_info broadcast.
    server.publishSpeechReadiness(speechReadiness);
    expect(sentServerInfoEnvelopes(socket)).toHaveLength(2);

    await server.close();
  });

  test("includes temporary retry guidance while models are downloading", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-server-info-download-guidance",
    });
    expect(sentServerInfoEnvelopes(socket)).toHaveLength(1);

    server.publishSpeechReadiness(createDownloadInProgressSpeechReadinessSnapshot());
    expect(sentServerInfoEnvelopes(socket)).toHaveLength(2);

    const envelope = sentServerInfoEnvelopes(socket)[1];
    const payload = parseServerInfoStatusPayload(envelope.message?.payload);
    expect(payload?.capabilities?.voice?.dictation.enabled).toBe(true);
    expect(payload?.capabilities?.voice?.voice.enabled).toBe(true);
    expect(payload?.capabilities?.voice?.dictation.reason).toContain("Try again in a few minutes.");
    expect(payload?.capabilities?.voice?.voice.reason).toContain("Try again in a few minutes.");

    await server.close();
  });

  test("routes inbound terminal frames to session.handleBinaryFrame", async () => {
    const server = createServer();

    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-binary-inbound",
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    socket.emit(
      "message",
      Buffer.from(
        encodeTerminalStreamFrame({
          opcode: TerminalStreamOpcode.Input,
          slot: 9,
          payload: new TextEncoder().encode("ls\r"),
        }),
      ),
    );
    expect(session.handleBinaryFrame).toHaveBeenCalledTimes(1);
    const { frame } = BinaryFrameSchema.parse(session.handleBinaryFrame.mock.calls[0]?.[0]);
    expect(frame.opcode).toBe(TerminalStreamOpcode.Input);
    expect(frame.slot).toBe(9);
    expect(new TextDecoder().decode(frame.payload)).toBe("ls\r");

    await server.close();
  });

  test("sends status error when async binary frame handling fails", async () => {
    const server = createServer();

    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-binary-inbound-failure",
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];
    session.handleBinaryFrame.mockRejectedValueOnce(new Error("binary exploded"));

    const sentBeforeFrame = socket.sent.length;
    socket.emit(
      "message",
      Buffer.from(
        encodeTerminalStreamFrame({
          opcode: TerminalStreamOpcode.Input,
          slot: 11,
          payload: new TextEncoder().encode("pwd\r"),
        }),
      ),
    );

    await vi.waitFor(() => {
      expect(sentEnvelopes(socket).slice(sentBeforeFrame)).toContainEqual({
        type: "session",
        message: {
          type: "status",
          payload: {
            status: "error",
            message: "Invalid message: binary exploded",
          },
        },
      });
    });

    await server.close();
  });

  test("sends outbound terminal frames from session over websocket", async () => {
    const server = createServer();

    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-binary-outbound",
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    const { onBinaryMessage } = session.args;
    expect(onBinaryMessage).toBeTypeOf("function");
    if (typeof onBinaryMessage === "function") {
      onBinaryMessage(new Uint8Array([TerminalStreamOpcode.Output, 12, 0x6f, 0x6b]));
    }

    const terminalFrames = sentTerminalFrames(socket);
    expect(terminalFrames).toHaveLength(1);
    const frame = terminalFrames[0];
    expect(frame.opcode).toBe(TerminalStreamOpcode.Output);
    expect(frame.slot).toBe(12);
    expect(new TextDecoder().decode(frame.payload ?? new Uint8Array())).toBe("ok");

    await server.close();
  });
});
