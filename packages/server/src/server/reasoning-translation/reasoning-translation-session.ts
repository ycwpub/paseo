import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type pino from "pino";
import type { ReasoningTranslationService } from "./reasoning-translation-service.js";

export type ReasoningTranslationSessionRequest = Extract<
  SessionInboundMessage,
  { type: "reasoning.translate.request" }
>;

export class ReasoningTranslationSession {
  private readonly logger: pino.Logger;

  constructor(
    private readonly options: {
      emit: (message: SessionOutboundMessage) => void;
      service: ReasoningTranslationService;
      logger: pino.Logger;
    },
  ) {
    this.logger = options.logger.child({ module: "reasoning-translation-session" });
  }

  async handleRequest(message: ReasoningTranslationSessionRequest): Promise<void> {
    try {
      const translatedText = await this.options.service.translate(message.agentId, message.text);
      this.options.emit({
        type: "reasoning.translate.response",
        payload: {
          requestId: message.requestId,
          translatedText,
          error: null,
        },
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.logger.warn({ err: error, agentId: message.agentId }, "Reasoning translation failed");
      this.options.emit({
        type: "reasoning.translate.response",
        payload: {
          requestId: message.requestId,
          translatedText: null,
          error: messageText,
        },
      });
    }
  }
}
