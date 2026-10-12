import { z } from "zod";

import {
  LarkGroupMessageProcessorCreateInputSchema,
  LarkGroupMessageProcessorSchema,
  LarkGroupMessageProcessorTaskScanRangeSchema,
  LarkGroupMessageProcessorTaskSchema,
  LarkGroupMessageProcessorUpdateInputSchema,
} from "./group-processor-types.js";

const ProcessorMutationPayloadSchema = z.object({
  requestId: z.string(),
  processor: LarkGroupMessageProcessorSchema.nullable(),
  processors: z.array(LarkGroupMessageProcessorSchema),
  error: z.string().nullable(),
});

const TaskListPayloadSchema = z.object({
  requestId: z.string(),
  tasks: z.array(LarkGroupMessageProcessorTaskSchema),
  error: z.string().nullable(),
});

export const LarkGroupMessageProcessorListRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor.list.request"),
  requestId: z.string(),
});

export const LarkGroupMessageProcessorListResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor.list.response"),
  payload: z.object({
    requestId: z.string(),
    processors: z.array(LarkGroupMessageProcessorSchema),
    error: z.string().nullable(),
  }),
});

export const LarkGroupMessageProcessorCreateRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor.create.request"),
  requestId: z.string(),
  processor: LarkGroupMessageProcessorCreateInputSchema,
});

export const LarkGroupMessageProcessorCreateResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor.create.response"),
  payload: ProcessorMutationPayloadSchema,
});

export const LarkGroupMessageProcessorUpdateRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor.update.request"),
  requestId: z.string(),
  processorId: z.string().min(1),
  processor: LarkGroupMessageProcessorUpdateInputSchema,
});

export const LarkGroupMessageProcessorUpdateResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor.update.response"),
  payload: ProcessorMutationPayloadSchema,
});

export const LarkGroupMessageProcessorSetEnabledRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor.set_enabled.request"),
  requestId: z.string(),
  processorId: z.string().min(1),
  enabled: z.boolean(),
});

export const LarkGroupMessageProcessorSetEnabledResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor.set_enabled.response"),
  payload: ProcessorMutationPayloadSchema,
});

export const LarkGroupMessageProcessorDeleteRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor.delete.request"),
  requestId: z.string(),
  processorId: z.string().min(1),
});

export const LarkGroupMessageProcessorDeleteResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor.delete.response"),
  payload: z.object({
    requestId: z.string(),
    processorId: z.string(),
    ok: z.boolean(),
    processors: z.array(LarkGroupMessageProcessorSchema),
    error: z.string().nullable(),
  }),
});

export const LarkGroupMessageProcessorChangedMessageSchema = z.object({
  type: z.literal("channel.lark.group_processor.changed"),
  payload: z.object({
    processors: z.array(LarkGroupMessageProcessorSchema),
  }),
});

export const LarkGroupMessageProcessorTaskListRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.list.request"),
  requestId: z.string(),
  processorId: z.string().trim().min(1),
});

export const LarkGroupMessageProcessorTaskListResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.list.response"),
  payload: TaskListPayloadSchema,
});

export const LarkGroupMessageProcessorTaskScanRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.scan.request"),
  requestId: z.string(),
  processorId: z.string().trim().min(1),
  scanRange: LarkGroupMessageProcessorTaskScanRangeSchema.optional(),
});

export const LarkGroupMessageProcessorTaskScanResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.scan.response"),
  payload: TaskListPayloadSchema.extend({
    scannedProcessorCount: z.number().int().nonnegative(),
  }),
});

export const LarkGroupMessageProcessorTaskPauseRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.pause.request"),
  requestId: z.string(),
  processorId: z.string().trim().min(1),
  taskIds: z.array(z.string().min(1)).min(1).max(500),
});

export const LarkGroupMessageProcessorTaskPauseResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.pause.response"),
  payload: TaskListPayloadSchema.extend({
    pausedTaskIds: z.array(z.string()),
  }),
});

export const LarkGroupMessageProcessorTaskRetryRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.retry.request"),
  requestId: z.string(),
  processorId: z.string().trim().min(1),
  taskIds: z.array(z.string().min(1)).min(1).max(500),
});

export const LarkGroupMessageProcessorTaskRetryResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.retry.response"),
  payload: TaskListPayloadSchema.extend({
    retriedTaskIds: z.array(z.string()),
  }),
});

export const LarkGroupMessageProcessorTaskDeleteRequestSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.delete.request"),
  requestId: z.string(),
  processorId: z.string().trim().min(1),
  taskIds: z.array(z.string().min(1)).min(1).max(500),
});

export const LarkGroupMessageProcessorTaskDeleteResponseSchema = z.object({
  type: z.literal("channel.lark.group_processor_task.delete.response"),
  payload: TaskListPayloadSchema.extend({
    deletedTaskIds: z.array(z.string()),
  }),
});
