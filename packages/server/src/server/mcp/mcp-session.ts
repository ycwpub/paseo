import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type pino from "pino";
import { McpStore } from "./mcp-store.js";

export type McpSessionRequest = Extract<
  SessionInboundMessage,
  {
    type:
      | "mcp.list.request"
      | "mcp.create.request"
      | "mcp.update.request"
      | "mcp.delete.request"
      | "mcp.test_connection.request";
  }
>;

export interface McpSessionHost {
  emit(message: SessionOutboundMessage): void;
}

export interface McpSessionOptions {
  host: McpSessionHost;
  store: McpStore;
  refreshSharedResources?: () => void;
  logger: pino.Logger;
}

export class McpSession {
  private readonly host: McpSessionHost;
  private readonly store: McpStore;
  private readonly refreshSharedResources: (() => void) | null;
  private readonly logger: pino.Logger;

  constructor(options: McpSessionOptions) {
    this.host = options.host;
    this.store = options.store;
    this.refreshSharedResources = options.refreshSharedResources ?? null;
    this.logger = options.logger.child({ module: "mcp-session" });
  }

  async handleRequest(message: McpSessionRequest): Promise<void> {
    try {
      switch (message.type) {
        case "mcp.list.request":
          if (message.refresh) {
            this.refreshSharedResources?.();
          }
          this.host.emit({
            type: "mcp.list.response",
            payload: {
              requestId: message.requestId,
              servers: this.store.list(),
              error: null,
            },
          });
          return;
        case "mcp.create.request": {
          const server = this.store.create(message.server);
          this.emitChanged();
          this.host.emit({
            type: "mcp.create.response",
            payload: { requestId: message.requestId, server, error: null },
          });
          return;
        }
        case "mcp.update.request": {
          const server = this.store.update(message.server);
          if (!server) {
            this.host.emit({
              type: "mcp.update.response",
              payload: {
                requestId: message.requestId,
                server: null,
                error: "MCP server not found",
              },
            });
            return;
          }
          this.emitChanged();
          this.host.emit({
            type: "mcp.update.response",
            payload: { requestId: message.requestId, server, error: null },
          });
          return;
        }
        case "mcp.delete.request": {
          const ok = this.store.delete(message.id);
          if (ok) this.emitChanged();
          this.host.emit({
            type: "mcp.delete.response",
            payload: {
              requestId: message.requestId,
              id: message.id,
              ok,
              error: ok ? null : "MCP server not found",
            },
          });
          return;
        }
        case "mcp.test_connection.request":
          if (!this.store.get(message.id)) {
            this.host.emit({
              type: "mcp.test_connection.response",
              payload: {
                requestId: message.requestId,
                status: "error",
                error: "MCP server not found",
              },
            });
            return;
          }
          // TODO: replace this optimistic smoke result with a real MCP handshake.
          this.store.updateTestResult(message.id, {
            lastTestStatus: "connected",
            tools: [],
            lastConnected: Date.now(),
          });
          this.emitChanged();
          this.host.emit({
            type: "mcp.test_connection.response",
            payload: {
              requestId: message.requestId,
              status: "connected",
              tools: [],
              error: null,
            },
          });
          return;
      }
    } catch (error) {
      this.logger.warn({ err: error, requestType: message.type }, "MCP RPC failed");
      this.emitErrorResponse(message, error instanceof Error ? error.message : String(error));
    }
  }

  private emitChanged(): void {
    this.host.emit({
      type: "mcp.changed",
      payload: { servers: this.store.list() },
    });
  }

  private emitErrorResponse(message: McpSessionRequest, error: string): void {
    switch (message.type) {
      case "mcp.list.request":
        this.host.emit({
          type: "mcp.list.response",
          payload: { requestId: message.requestId, servers: this.store.list(), error },
        });
        return;
      case "mcp.create.request":
        this.host.emit({
          type: "mcp.create.response",
          payload: { requestId: message.requestId, server: null, error },
        });
        return;
      case "mcp.update.request":
        this.host.emit({
          type: "mcp.update.response",
          payload: { requestId: message.requestId, server: null, error },
        });
        return;
      case "mcp.delete.request":
        this.host.emit({
          type: "mcp.delete.response",
          payload: { requestId: message.requestId, id: message.id, ok: false, error },
        });
        return;
      case "mcp.test_connection.request":
        this.host.emit({
          type: "mcp.test_connection.response",
          payload: { requestId: message.requestId, status: "error", error },
        });
        return;
    }
  }
}
