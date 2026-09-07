import { z } from "zod";
import { AlertTroubleshooterTaskSchema } from "./alert-troubleshooter-types.js";

export const AlertTroubleshooterEnqueueRecordRequestSchema = z.object({
  type: z.literal("plugin.alert_troubleshooter.enqueue_record.request"),
  requestId: z.string(),
  pluginId: z.string().trim().min(1),
  appId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  uniqueId: z.string().trim().min(1),
});

export const AlertTroubleshooterEnqueueRecordResponseSchema = z.object({
  type: z.literal("plugin.alert_troubleshooter.enqueue_record.response"),
  payload: z.object({
    requestId: z.string(),
    queued: z.boolean(),
    uniqueId: z.string(),
    error: z.string().nullable(),
  }),
});

const AlertTroubleshooterTaskListPayloadSchema = z.object({
  requestId: z.string(),
  tasks: z.array(AlertTroubleshooterTaskSchema),
  error: z.string().nullable(),
});

const AlertTroubleshooterTaskRequestBaseSchema = z.object({
  requestId: z.string(),
  pluginId: z.string().trim().min(1),
  appId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
});

export const AlertTroubleshooterTaskListRequestSchema =
  AlertTroubleshooterTaskRequestBaseSchema.extend({
    type: z.literal("plugin.alert_troubleshooter.task.list.request"),
  });

export const AlertTroubleshooterTaskListResponseSchema = z.object({
  type: z.literal("plugin.alert_troubleshooter.task.list.response"),
  payload: AlertTroubleshooterTaskListPayloadSchema,
});

export const AlertTroubleshooterTaskPauseRequestSchema =
  AlertTroubleshooterTaskRequestBaseSchema.extend({
    type: z.literal("plugin.alert_troubleshooter.task.pause.request"),
    taskIds: z.array(z.string().min(1)).min(1).max(500),
  });

export const AlertTroubleshooterTaskPauseResponseSchema = z.object({
  type: z.literal("plugin.alert_troubleshooter.task.pause.response"),
  payload: AlertTroubleshooterTaskListPayloadSchema.extend({
    pausedTaskIds: z.array(z.string()),
  }),
});

export const AlertTroubleshooterTaskDeleteRequestSchema =
  AlertTroubleshooterTaskRequestBaseSchema.extend({
    type: z.literal("plugin.alert_troubleshooter.task.delete.request"),
    taskIds: z.array(z.string().min(1)).min(1).max(500),
  });

export const AlertTroubleshooterTaskDeleteResponseSchema = z.object({
  type: z.literal("plugin.alert_troubleshooter.task.delete.response"),
  payload: AlertTroubleshooterTaskListPayloadSchema.extend({
    deletedTaskIds: z.array(z.string()),
  }),
});
