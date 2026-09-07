import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type { LarkChannelService } from "./lark-channel-service.js";

export type LarkSubstituteTaskSessionRequest = Extract<
  SessionInboundMessage,
  { type: `channel.lark.substitute_task.${string}.request` }
>;

type LarkSubstituteTaskSessionResponse = Extract<
  SessionOutboundMessage,
  { type: `channel.lark.substitute_task.${string}.response` }
>;

type LarkSubstituteTaskSessionService = Pick<
  LarkChannelService,
  | "listSubstituteTasks"
  | "scanSubstituteTasksNow"
  | "pauseSubstituteTasks"
  | "deleteSubstituteTasks"
>;

type EmitResponse = (message: LarkSubstituteTaskSessionResponse) => void;

export function isLarkSubstituteTaskSessionRequest(
  message: SessionInboundMessage,
): message is LarkSubstituteTaskSessionRequest {
  return message.type.startsWith("channel.lark.substitute_task.");
}

export async function handleLarkSubstituteTaskSessionRequest(
  message: LarkSubstituteTaskSessionRequest,
  service: LarkSubstituteTaskSessionService,
  emitResponse: EmitResponse,
): Promise<void> {
  switch (message.type) {
    case "channel.lark.substitute_task.list.request":
      emitResponse({
        type: "channel.lark.substitute_task.list.response",
        payload: {
          requestId: message.requestId,
          tasks: service.listSubstituteTasks(message.modeId),
          error: null,
        },
      });
      return;
    case "channel.lark.substitute_task.scan.request": {
      const summary = await service.scanSubstituteTasksNow(message.modeId);
      emitResponse({
        type: "channel.lark.substitute_task.scan.response",
        payload: {
          requestId: message.requestId,
          ...summary,
          tasks: service.listSubstituteTasks(message.modeId),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.substitute_task.pause.request": {
      const pausedTaskIds = service.pauseSubstituteTasks(message.taskIds, message.modeId);
      emitResponse({
        type: "channel.lark.substitute_task.pause.response",
        payload: {
          requestId: message.requestId,
          pausedTaskIds,
          tasks: service.listSubstituteTasks(message.modeId),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.substitute_task.delete.request": {
      const deletedTaskIds = service.deleteSubstituteTasks(message.taskIds, message.modeId);
      emitResponse({
        type: "channel.lark.substitute_task.delete.response",
        payload: {
          requestId: message.requestId,
          deletedTaskIds,
          tasks: service.listSubstituteTasks(message.modeId),
          error: null,
        },
      });
      return;
    }
  }
}

export function emitLarkSubstituteTaskSessionError(
  message: LarkSubstituteTaskSessionRequest,
  service: LarkSubstituteTaskSessionService,
  emitResponse: EmitResponse,
  error: string,
): void {
  const tasks = service.listSubstituteTasks(message.modeId);
  switch (message.type) {
    case "channel.lark.substitute_task.list.request":
      emitResponse({
        type: "channel.lark.substitute_task.list.response",
        payload: { requestId: message.requestId, tasks, error },
      });
      return;
    case "channel.lark.substitute_task.scan.request":
      emitResponse({
        type: "channel.lark.substitute_task.scan.response",
        payload: {
          requestId: message.requestId,
          enabledModeCount: 0,
          groupScanCount: 0,
          privateScanCount: 0,
          tasks,
          error,
        },
      });
      return;
    case "channel.lark.substitute_task.pause.request":
      emitResponse({
        type: "channel.lark.substitute_task.pause.response",
        payload: { requestId: message.requestId, pausedTaskIds: [], tasks, error },
      });
      return;
    case "channel.lark.substitute_task.delete.request":
      emitResponse({
        type: "channel.lark.substitute_task.delete.response",
        payload: { requestId: message.requestId, deletedTaskIds: [], tasks, error },
      });
      return;
  }
}
