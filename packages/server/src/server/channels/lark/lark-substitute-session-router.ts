import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type { LarkChannelService } from "./lark-channel-service.js";
import {
  emitLarkSubstituteReplySessionError,
  handleLarkSubstituteReplySessionRequest,
  isLarkSubstituteReplySessionRequest,
} from "./lark-substitute-reply-session-handler.js";
import {
  emitLarkSubstituteSessionError,
  handleLarkSubstituteSessionRequest,
  isLarkSubstituteSessionRequest,
} from "./lark-substitute-session-handler.js";
import {
  emitLarkSubstituteTaskSessionError,
  handleLarkSubstituteTaskSessionRequest,
  isLarkSubstituteTaskSessionRequest,
} from "./lark-substitute-task-session-handler.js";

type LarkSubstituteResponse = Extract<
  SessionOutboundMessage,
  { type: `channel.lark.substitute${string}.response` }
>;

type EmitResponse = (message: LarkSubstituteResponse) => void;

export async function dispatchLarkSubstituteSessionRequest(
  message: SessionInboundMessage,
  service: LarkChannelService,
  emitResponse: EmitResponse,
): Promise<boolean> {
  if (isLarkSubstituteReplySessionRequest(message)) {
    await handleLarkSubstituteReplySessionRequest(message, service, emitResponse);
    return true;
  }
  if (isLarkSubstituteTaskSessionRequest(message)) {
    await handleLarkSubstituteTaskSessionRequest(message, service, emitResponse);
    return true;
  }
  if (isLarkSubstituteSessionRequest(message)) {
    handleLarkSubstituteSessionRequest(message, service, emitResponse);
    return true;
  }
  return false;
}

export function emitLarkSubstituteSessionRequestError(
  message: SessionInboundMessage,
  service: LarkChannelService,
  emitResponse: EmitResponse,
  error: string,
): boolean {
  if (isLarkSubstituteReplySessionRequest(message)) {
    emitLarkSubstituteReplySessionError(message, emitResponse, error);
    return true;
  }
  if (isLarkSubstituteTaskSessionRequest(message)) {
    emitLarkSubstituteTaskSessionError(message, service, emitResponse, error);
    return true;
  }
  if (isLarkSubstituteSessionRequest(message)) {
    emitLarkSubstituteSessionError(message, service, emitResponse, error);
    return true;
  }
  return false;
}
