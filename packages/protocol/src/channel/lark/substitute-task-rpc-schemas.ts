import { z } from "zod";
import { LarkSubstituteTaskSchema } from "./substitute-task-types.js";

const LarkSubstituteTaskListPayloadSchema = z.object({
  requestId: z.string(),
  tasks: z.array(LarkSubstituteTaskSchema),
  error: z.string().nullable(),
});

export const LarkSubstituteTaskListRequestSchema = z.object({
  type: z.literal("channel.lark.substitute_task.list.request"),
  requestId: z.string(),
  modeId: z.string().trim().min(1).optional(),
});

export const LarkSubstituteTaskListResponseSchema = z.object({
  type: z.literal("channel.lark.substitute_task.list.response"),
  payload: LarkSubstituteTaskListPayloadSchema,
});

export const LarkSubstituteTaskScanRequestSchema = z.object({
  type: z.literal("channel.lark.substitute_task.scan.request"),
  requestId: z.string(),
  modeId: z.string().trim().min(1).optional(),
});

export const LarkSubstituteTaskScanResponseSchema = z.object({
  type: z.literal("channel.lark.substitute_task.scan.response"),
  payload: LarkSubstituteTaskListPayloadSchema.extend({
    enabledModeCount: z.number().int().nonnegative(),
    groupScanCount: z.number().int().nonnegative(),
    privateScanCount: z.number().int().nonnegative(),
  }),
});

export const LarkSubstituteTaskPauseRequestSchema = z.object({
  type: z.literal("channel.lark.substitute_task.pause.request"),
  requestId: z.string(),
  modeId: z.string().trim().min(1).optional(),
  taskIds: z.array(z.string().min(1)).min(1).max(500),
});

export const LarkSubstituteTaskPauseResponseSchema = z.object({
  type: z.literal("channel.lark.substitute_task.pause.response"),
  payload: LarkSubstituteTaskListPayloadSchema.extend({
    pausedTaskIds: z.array(z.string()),
  }),
});

export const LarkSubstituteTaskDeleteRequestSchema = z.object({
  type: z.literal("channel.lark.substitute_task.delete.request"),
  requestId: z.string(),
  modeId: z.string().trim().min(1).optional(),
  taskIds: z.array(z.string().min(1)).min(1).max(500),
});

export const LarkSubstituteTaskDeleteResponseSchema = z.object({
  type: z.literal("channel.lark.substitute_task.delete.response"),
  payload: LarkSubstituteTaskListPayloadSchema.extend({
    deletedTaskIds: z.array(z.string()),
  }),
});
