import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type pino from "pino";
import { startRelayTransport } from "./relay-transport";
function createMockLogger() {
  const messages: {
    level: "debug" | "info" | "warn" | "error";
    args: unknown[];
  }[] = [];
  const logger = {
    messages,
    child: () => logger,
    debug: (...args: unknown[]) => messages.push({ level: "debug", args }),
    info: (...args: unknown[]) => messages.push({ level: "info", args }),
    warn: (...args: unknown[]) => messages.push({ level: "warn", args }),
    error: (...args: unknown[]) => messages.push({ level: "error", args }),
  };
  return logger;
}
class FakeRelayWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = FakeRelayWebSocket.CONNECTING;
  sent: Array<string | Uint8Array | ArrayBuffer> = [];
  terminateCalls = 0;
  pingCalls = 0;
  deferSendCompletion = false;
  onSend: ((data: string | Uint8Array | ArrayBuffer) => void) | null = null;
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  private readonly pendingSendCallbacks: Array<(error?: Error) => void> = [];
  constructor(readonly url: string) {}
  on(event: string, listener: (...args: unknown[]) => void) {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(listener);
    this.listeners.set(event, handlers);
  }
  once(event: string, listener: (...args: unknown[]) => void) {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }
  close(code?: number, reason?: string) {
    this.readyState = FakeRelayWebSocket.CLOSED;
    this.emit("close", code ?? 1000, reason ?? "");
  }
  terminate() {
    this.terminateCalls += 1;
    this.readyState = FakeRelayWebSocket.CLOSED;
    this.emit("close", 1006, "");
  }
  send(data: string | Uint8Array | ArrayBuffer, callback?: (error?: Error) => void) {
    if (this.readyState !== FakeRelayWebSocket.OPEN) {
      throw new Error(`WebSocket not open (readyState=${this.readyState})`);
    }
    this.sent.push(data);
    this.onSend?.(data);
    if (!callback) return;
    if (this.deferSendCompletion) {
      this.pendingSendCallbacks.push(callback);
      return;
    }
    callback();
  }
  completeNextSend() {
    this.pendingSendCallbacks.shift()?.();
  }
  ping() {
    if (this.readyState !== FakeRelayWebSocket.OPEN) {
      throw new Error(`WebSocket not open (readyState=${this.readyState})`);
    }
    this.pingCalls += 1;
  }
  open() {
    this.readyState = FakeRelayWebSocket.OPEN;
    this.emit("open");
  }
  message(data: unknown, isBinary = data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    this.emit("message", data, isBinary);
  }
  pong() {
    this.emit("pong");
  }
  private off(event: string, listener: (...args: unknown[]) => void) {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      handlers.filter((handler) => handler !== listener),
    );
  }
  private emit(event: string, ...args: unknown[]) {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers.slice()) {
      handler(...args);
    }
  }
}
function createFakeWebSockets() {
  const sockets: FakeRelayWebSocket[] = [];
  return {
    sockets,
    createWebSocket(url: string) {
      const socket = new FakeRelayWebSocket(url);
      sockets.push(socket);
      return socket;
    },
  };
}
describe("relay-transport control lifecycle", () => {
  const controllers: Array<{
    stop: () => Promise<void>;
  }> = [];
  let relay: ReturnType<typeof createFakeWebSockets>;
  beforeEach(() => {
    relay = createFakeWebSockets();
  });
  afterEach(async () => {
    await Promise.all(controllers.map((controller) => controller.stop()));
    controllers.length = 0;
    vi.useRealTimers();
  });
  test("discovers the Relay-hosted pairing frontend path from the control channel", () => {
    const logger = createMockLogger();
    const onPairingBaseUrl = vi.fn();
    const controller = startRelayTransport({
      logger: logger as unknown as pino.Logger,
      attachSocket: async () => {},
      relayEndpoint: "10.37.55.187:6769",
      relayUseTls: false,
      serverId: "srv_test",
      onPairingBaseUrl,
      createWebSocket: relay.createWebSocket,
    });
    controllers.push(controller);
    const control = relay.sockets[0];
    control.open();
    control.message(
      JSON.stringify({
        type: "sync",
        pairingBaseUrl: "http://10.37.55.187:6769/app",
        connectionIds: [],
      }),
    );
    expect(onPairingBaseUrl).toHaveBeenCalledWith("http://10.37.55.187:6769/app");
  });
  test("passes stable relay external session metadata when attaching data socket", async () => {
    const logger = createMockLogger();
    const attachedSockets: unknown[] = [];
    const attachedMetadata: unknown[] = [];
    const attachSocket = async (socket: unknown, metadata: unknown) => {
      attachedSockets.push(socket);
      attachedMetadata.push(metadata);
    };
    const controller = startRelayTransport({
      logger: logger as unknown as pino.Logger,
      attachSocket,
      relayEndpoint: "relay.paseo.sh:443",
      relayUseTls: true,
      serverId: "srv_test",
      serverHostname: "paseo-daemon.local",
      serverDeviceType: "mac",
      namespaceConnectionIds: true,
      createWebSocket: relay.createWebSocket,
    });
    controllers.push(controller);
    const control = relay.sockets[0];
    expect(new URL(control.url).searchParams.get("hostname")).toBe("paseo-daemon.local");
    expect(new URL(control.url).searchParams.get("deviceType")).toBe("mac");
    control.open();
    control.message(JSON.stringify({ type: "sync", connectionIds: [] }));
    control.message(
      JSON.stringify({
        type: "connected",
        connectionId: "clt_test",
        remoteAddress: "10.37.55.187",
        remotePort: 54321,
      }),
    );
    const dataSocket = relay.sockets[1];
    expect(dataSocket).toBeDefined();
    expect(new URL(dataSocket.url).searchParams.get("hostname")).toBe("paseo-daemon.local");
    expect(new URL(dataSocket.url).searchParams.get("deviceType")).toBe("mac");
    dataSocket.open();
    await Promise.resolve();
    expect(attachedSockets).toEqual([dataSocket]);
    expect(attachedMetadata).toEqual([
      {
        transport: "relay",
        externalSessionKey: "relay:wss://relay.paseo.sh:443:clt_test",
        relayConnectionId: "wss://relay.paseo.sh:443:clt_test",
        remoteAddress: "10.37.55.187",
        remotePort: 54321,
      },
    ]);
  });
});
