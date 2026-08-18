import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type pino from "pino";
import type { PaseoMemoryState, PaseoMemoryUpdateInput } from "@getpaseo/protocol/messages";

export type MemorySessionRequest = Extract<
  SessionInboundMessage,
  {
    type: "memory.get_state.request" | "memory.update_state.request" | "memory.clear.request";
  }
>;

export interface MemoryController {
  getState(): PaseoMemoryState;
  update(input: PaseoMemoryUpdateInput): PaseoMemoryState;
  clear(): PaseoMemoryState;
}

export class MemorySession {
  private readonly emit: (message: SessionOutboundMessage) => void;
  private readonly service: MemoryController;
  private readonly logger: pino.Logger;

  constructor(options: {
    emit: (message: SessionOutboundMessage) => void;
    service: MemoryController;
    logger: pino.Logger;
  }) {
    this.emit = options.emit;
    this.service = options.service;
    this.logger = options.logger.child({ module: "memory-session" });
  }

  async handleRequest(message: MemorySessionRequest): Promise<void> {
    try {
      let memory;
      switch (message.type) {
        case "memory.get_state.request":
          memory = this.service.getState();
          break;
        case "memory.update_state.request":
          memory = this.service.update(message.update);
          break;
        case "memory.clear.request":
          memory = this.service.clear();
          break;
      }
      this.emit({
        type: responseType(message.type),
        payload: { requestId: message.requestId, memory, error: null },
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.logger.warn({ err: error, requestType: message.type }, "Memory RPC failed");
      this.emit({
        type: responseType(message.type),
        payload: { requestId: message.requestId, memory: null, error: messageText },
      });
    }
  }
}

function responseType(
  type: MemorySessionRequest["type"],
): "memory.get_state.response" | "memory.update_state.response" | "memory.clear.response" {
  switch (type) {
    case "memory.get_state.request":
      return "memory.get_state.response";
    case "memory.update_state.request":
      return "memory.update_state.response";
    case "memory.clear.request":
      return "memory.clear.response";
  }
}
