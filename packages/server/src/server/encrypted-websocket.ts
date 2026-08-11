import { EventEmitter } from "node:events";
import type pino from "pino";
import {
  createDaemonChannel,
  type EncryptedChannel,
  type KeyPair,
  type Transport,
} from "@getpaseo/relay/e2ee";

export interface EncryptedWebSocketLike {
  readonly readyState: number;
  send: (data: string | Uint8Array | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: "message" | "close" | "error", listener: (...args: unknown[]) => void) => void;
  once: (event: "close" | "error", listener: (...args: unknown[]) => void) => void;
}

export interface RawEncryptedWebSocketLike extends EncryptedWebSocketLike {
  on: (event: "message" | "close" | "error", listener: (...args: unknown[]) => void) => void;
}

export async function wrapDaemonEncryptedWebSocket(
  socket: RawEncryptedWebSocketLike,
  daemonKeyPair: KeyPair,
  logger: pino.Logger,
): Promise<EncryptedWebSocketLike> {
  const transport = createTransportAdapter(socket, logger);
  const emitter = new EventEmitter();
  const pendingMessages: Array<string | ArrayBuffer> = [];
  let messageHandlerAttached = false;
  const emitMessage = (data: string | ArrayBuffer) => {
    if (messageHandlerAttached) {
      emitter.emit("message", data);
      return;
    }
    pendingMessages.push(data);
  };
  const channel = await createDaemonChannel(transport, daemonKeyPair, {
    onmessage: emitMessage,
    onclose: (code, reason) => emitter.emit("close", code, reason),
    onerror: (error) => {
      logger.warn({ err: error }, "websocket_e2ee_error");
      emitter.emit("error", error);
    },
  });
  return createEncryptedSocket(channel, emitter, () => {
    if (messageHandlerAttached) return;
    messageHandlerAttached = true;
    for (const message of pendingMessages) {
      emitter.emit("message", message);
    }
    pendingMessages.length = 0;
  });
}

function createTransportAdapter(socket: RawEncryptedWebSocketLike, logger: pino.Logger): Transport {
  const transport: Transport = {
    send: (data) => {
      try {
        socket.send(data);
      } catch (err) {
        logger.warn({ err }, "encrypted_websocket_send_failed");
      }
    },
    close: (code?: number, reason?: string) => socket.close(code, reason),
    onmessage: null,
    onclose: null,
    onerror: null,
  };

  socket.on("message", (data, isBinary) => {
    transport.onmessage?.(normalizeMessageData(data, isBinary === true));
  });
  socket.on("close", (code, reason) => {
    const closeCode = typeof code === "number" ? code : 1006;
    transport.onclose?.(closeCode, String(reason ?? ""));
  });
  socket.on("error", (err) => {
    transport.onerror?.(err instanceof Error ? err : new Error(String(err)));
  });

  return transport;
}

function createEncryptedSocket(
  channel: EncryptedChannel,
  emitter: EventEmitter,
  onMessageHandlerAttached: () => void,
): EncryptedWebSocketLike {
  let readyState = 1;

  channel.setState("open");

  const close = (code?: number, reason?: string) => {
    if (readyState === 3) return;
    readyState = 3;
    channel.close(code, reason);
  };

  emitter.on("close", () => {
    if (readyState === 3) return;
    readyState = 3;
  });

  return {
    get readyState() {
      return readyState;
    },
    send: (data) => {
      const outbound = normalizeSendPayload(data);
      void channel.send(outbound).catch((error) => {
        emitter.emit("error", error);
      });
    },
    close,
    on: (event, listener) => {
      emitter.on(event, listener);
      if (event === "message") {
        onMessageHandlerAttached();
      }
    },
    once: (event, listener) => {
      emitter.once(event, listener);
    },
  };
}

function normalizeSendPayload(data: string | Uint8Array | ArrayBuffer): string | ArrayBuffer {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return data;
  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out.buffer;
}

function normalizeMessageData(data: unknown, isBinary: boolean): string | ArrayBuffer {
  if (!isBinary) {
    if (typeof data === "string") return data;
    const buffer = bufferFromWsData(data);
    if (buffer) return buffer.toString("utf8");
    return String(data);
  }

  if (data instanceof ArrayBuffer) return data;

  const buffer = bufferFromWsData(data);
  if (buffer) {
    const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const out = new Uint8Array(view.byteLength);
    out.set(view);
    return out.buffer;
  }

  return String(data);
}

function bufferFromWsData(data: unknown): Buffer | null {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) {
    const buffers: Buffer[] = [];
    for (const part of data) {
      if (Buffer.isBuffer(part)) {
        buffers.push(part);
      } else if (part instanceof ArrayBuffer) {
        buffers.push(Buffer.from(part));
      } else if (ArrayBuffer.isView(part)) {
        buffers.push(Buffer.from(part.buffer, part.byteOffset, part.byteLength));
      } else if (typeof part === "string") {
        buffers.push(Buffer.from(part, "utf8"));
      } else {
        return null;
      }
    }
    return Buffer.concat(buffers);
  }
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}
