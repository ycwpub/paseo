import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type { LarkChannelService } from "./lark-channel-service.js";

export type LarkSubstituteSessionRequest = Extract<
  SessionInboundMessage,
  { type: `channel.lark.substitute.${string}.request` }
>;

type LarkSubstituteSessionResponse = Extract<
  SessionOutboundMessage,
  { type: `channel.lark.substitute.${string}.response` }
>;

type LarkSubstituteSessionService = Pick<
  LarkChannelService,
  | "listSubstituteModes"
  | "createSubstituteMode"
  | "updateSubstituteMode"
  | "setSubstituteModeEnabled"
  | "deleteSubstituteMode"
>;

type EmitResponse = (message: LarkSubstituteSessionResponse) => void;

export function isLarkSubstituteSessionRequest(
  message: SessionInboundMessage,
): message is LarkSubstituteSessionRequest {
  return message.type.startsWith("channel.lark.substitute.");
}

export function handleLarkSubstituteSessionRequest(
  message: LarkSubstituteSessionRequest,
  service: LarkSubstituteSessionService,
  emitResponse: EmitResponse,
): void {
  switch (message.type) {
    case "channel.lark.substitute.list.request":
      emitResponse({
        type: "channel.lark.substitute.list.response",
        payload: {
          requestId: message.requestId,
          modes: service.listSubstituteModes(),
          error: null,
        },
      });
      return;
    case "channel.lark.substitute.create.request": {
      const mode = service.createSubstituteMode(message.mode);
      emitResponse({
        type: "channel.lark.substitute.create.response",
        payload: {
          requestId: message.requestId,
          mode,
          modes: service.listSubstituteModes(),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.substitute.update.request": {
      const mode = service.updateSubstituteMode(message.modeId, message.mode);
      emitResponse({
        type: "channel.lark.substitute.update.response",
        payload: {
          requestId: message.requestId,
          mode,
          modes: service.listSubstituteModes(),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.substitute.set_enabled.request": {
      const mode = service.setSubstituteModeEnabled(message.modeId, message.enabled);
      emitResponse({
        type: "channel.lark.substitute.set_enabled.response",
        payload: {
          requestId: message.requestId,
          mode,
          modes: service.listSubstituteModes(),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.substitute.delete.request": {
      const ok = service.deleteSubstituteMode(message.modeId);
      emitResponse({
        type: "channel.lark.substitute.delete.response",
        payload: {
          requestId: message.requestId,
          modeId: message.modeId,
          ok,
          modes: service.listSubstituteModes(),
          error: ok ? null : "替身模式不存在",
        },
      });
      return;
    }
  }
}

export function emitLarkSubstituteSessionError(
  message: LarkSubstituteSessionRequest,
  service: LarkSubstituteSessionService,
  emitResponse: EmitResponse,
  error: string,
): void {
  const modes = service.listSubstituteModes();
  switch (message.type) {
    case "channel.lark.substitute.list.request":
      emitResponse({
        type: "channel.lark.substitute.list.response",
        payload: { requestId: message.requestId, modes, error },
      });
      return;
    case "channel.lark.substitute.create.request":
      emitResponse({
        type: "channel.lark.substitute.create.response",
        payload: { requestId: message.requestId, mode: null, modes, error },
      });
      return;
    case "channel.lark.substitute.update.request":
      emitResponse({
        type: "channel.lark.substitute.update.response",
        payload: { requestId: message.requestId, mode: null, modes, error },
      });
      return;
    case "channel.lark.substitute.set_enabled.request":
      emitResponse({
        type: "channel.lark.substitute.set_enabled.response",
        payload: { requestId: message.requestId, mode: null, modes, error },
      });
      return;
    case "channel.lark.substitute.delete.request":
      emitResponse({
        type: "channel.lark.substitute.delete.response",
        payload: {
          requestId: message.requestId,
          modeId: message.modeId,
          ok: false,
          modes,
          error,
        },
      });
      return;
  }
}
