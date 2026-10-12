import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";

import type { LarkChannelService } from "./lark-channel-service.js";

type GroupProcessorRequest = Extract<
  SessionInboundMessage,
  { type: `channel.lark.group_processor${string}.request` }
>;

type GroupProcessorResponse = Extract<
  SessionOutboundMessage,
  { type: `channel.lark.group_processor${string}.response` }
>;

export function isLarkGroupMessageProcessorSessionRequest(
  message: SessionInboundMessage,
): message is GroupProcessorRequest {
  return message.type.startsWith("channel.lark.group_processor");
}

export async function handleLarkGroupMessageProcessorSessionRequest(
  message: GroupProcessorRequest,
  service: LarkChannelService,
  emit: (response: GroupProcessorResponse) => void,
): Promise<void> {
  switch (message.type) {
    case "channel.lark.group_processor.list.request":
      emit({
        type: "channel.lark.group_processor.list.response",
        payload: {
          requestId: message.requestId,
          processors: service.listGroupMessageProcessors(),
          error: null,
        },
      });
      return;
    case "channel.lark.group_processor.create.request": {
      const processor = service.createGroupMessageProcessor(message.processor);
      emit({
        type: "channel.lark.group_processor.create.response",
        payload: {
          requestId: message.requestId,
          processor,
          processors: service.listGroupMessageProcessors(),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.group_processor.update.request": {
      const processor = service.updateGroupMessageProcessor(message.processorId, message.processor);
      emit({
        type: "channel.lark.group_processor.update.response",
        payload: {
          requestId: message.requestId,
          processor,
          processors: service.listGroupMessageProcessors(),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.group_processor.set_enabled.request": {
      const processor = service.setGroupMessageProcessorEnabled(
        message.processorId,
        message.enabled,
      );
      emit({
        type: "channel.lark.group_processor.set_enabled.response",
        payload: {
          requestId: message.requestId,
          processor,
          processors: service.listGroupMessageProcessors(),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.group_processor.delete.request": {
      const ok = service.deleteGroupMessageProcessor(message.processorId);
      emit({
        type: "channel.lark.group_processor.delete.response",
        payload: {
          requestId: message.requestId,
          processorId: message.processorId,
          ok,
          processors: service.listGroupMessageProcessors(),
          error: ok ? null : "群消息处理器不存在",
        },
      });
      return;
    }
    case "channel.lark.group_processor_task.list.request":
      emit({
        type: "channel.lark.group_processor_task.list.response",
        payload: {
          requestId: message.requestId,
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error: null,
        },
      });
      return;
    case "channel.lark.group_processor_task.scan.request": {
      const summary = await service.scanGroupMessageProcessorTasksNow(
        message.processorId,
        message.scanRange,
      );
      emit({
        type: "channel.lark.group_processor_task.scan.response",
        payload: {
          requestId: message.requestId,
          ...summary,
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error: null,
        },
      });
      return;
    }
    case "channel.lark.group_processor_task.pause.request":
      emit({
        type: "channel.lark.group_processor_task.pause.response",
        payload: {
          requestId: message.requestId,
          pausedTaskIds: service.pauseGroupMessageProcessorTasks(
            message.processorId,
            message.taskIds,
          ),
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error: null,
        },
      });
      return;
    case "channel.lark.group_processor_task.retry.request":
      emit({
        type: "channel.lark.group_processor_task.retry.response",
        payload: {
          requestId: message.requestId,
          retriedTaskIds: service.retryGroupMessageProcessorTasks(
            message.processorId,
            message.taskIds,
          ),
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error: null,
        },
      });
      return;
    case "channel.lark.group_processor_task.delete.request":
      emit({
        type: "channel.lark.group_processor_task.delete.response",
        payload: {
          requestId: message.requestId,
          deletedTaskIds: service.deleteGroupMessageProcessorTasks(
            message.processorId,
            message.taskIds,
          ),
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error: null,
        },
      });
  }
}

export function emitLarkGroupMessageProcessorSessionError(
  message: GroupProcessorRequest,
  service: LarkChannelService,
  emit: (response: GroupProcessorResponse) => void,
  error: string,
): void {
  const processors = service.listGroupMessageProcessors();
  switch (message.type) {
    case "channel.lark.group_processor.list.request":
      emit({
        type: "channel.lark.group_processor.list.response",
        payload: { requestId: message.requestId, processors, error },
      });
      return;
    case "channel.lark.group_processor.create.request":
      emit({
        type: "channel.lark.group_processor.create.response",
        payload: { requestId: message.requestId, processor: null, processors, error },
      });
      return;
    case "channel.lark.group_processor.update.request":
      emit({
        type: "channel.lark.group_processor.update.response",
        payload: { requestId: message.requestId, processor: null, processors, error },
      });
      return;
    case "channel.lark.group_processor.set_enabled.request":
      emit({
        type: "channel.lark.group_processor.set_enabled.response",
        payload: { requestId: message.requestId, processor: null, processors, error },
      });
      return;
    case "channel.lark.group_processor.delete.request":
      emit({
        type: "channel.lark.group_processor.delete.response",
        payload: {
          requestId: message.requestId,
          processorId: message.processorId,
          ok: false,
          processors,
          error,
        },
      });
      return;
    case "channel.lark.group_processor_task.list.request":
      emit({
        type: "channel.lark.group_processor_task.list.response",
        payload: {
          requestId: message.requestId,
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error,
        },
      });
      return;
    case "channel.lark.group_processor_task.scan.request":
      emit({
        type: "channel.lark.group_processor_task.scan.response",
        payload: {
          requestId: message.requestId,
          scannedProcessorCount: 0,
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error,
        },
      });
      return;
    case "channel.lark.group_processor_task.pause.request":
      emit({
        type: "channel.lark.group_processor_task.pause.response",
        payload: {
          requestId: message.requestId,
          pausedTaskIds: [],
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error,
        },
      });
      return;
    case "channel.lark.group_processor_task.retry.request":
      emit({
        type: "channel.lark.group_processor_task.retry.response",
        payload: {
          requestId: message.requestId,
          retriedTaskIds: [],
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error,
        },
      });
      return;
    case "channel.lark.group_processor_task.delete.request":
      emit({
        type: "channel.lark.group_processor_task.delete.response",
        payload: {
          requestId: message.requestId,
          deletedTaskIds: [],
          tasks: service.listGroupMessageProcessorTasks(message.processorId),
          error,
        },
      });
  }
}
