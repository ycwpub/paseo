import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type { LarkChannelService } from "./lark-channel-service.js";

export type LarkSubstituteReplySessionRequest = Extract<
  SessionInboundMessage,
  { type: "channel.lark.substitute.reply.request" }
>;

type LarkSubstituteReplySessionResponse = Extract<
  SessionOutboundMessage,
  { type: "channel.lark.substitute.reply.response" }
>;

type LarkSubstituteReplySessionService = Pick<LarkChannelService, "replyToSubstituteConversation">;

type EmitResponse = (message: LarkSubstituteReplySessionResponse) => void;

export function isLarkSubstituteReplySessionRequest(
  message: SessionInboundMessage,
): message is LarkSubstituteReplySessionRequest {
  return message.type === "channel.lark.substitute.reply.request";
}

export async function handleLarkSubstituteReplySessionRequest(
  message: LarkSubstituteReplySessionRequest,
  service: LarkSubstituteReplySessionService,
  emitResponse: EmitResponse,
): Promise<void> {
  const reply = await service.replyToSubstituteConversation(message.agentId, message.text);
  emitResponse({
    type: "channel.lark.substitute.reply.response",
    payload: {
      requestId: message.requestId,
      reply,
      error: null,
    },
  });
}

export function emitLarkSubstituteReplySessionError(
  message: LarkSubstituteReplySessionRequest,
  emitResponse: EmitResponse,
  error: string,
): void {
  emitResponse({
    type: "channel.lark.substitute.reply.response",
    payload: {
      requestId: message.requestId,
      reply: null,
      error,
    },
  });
}
