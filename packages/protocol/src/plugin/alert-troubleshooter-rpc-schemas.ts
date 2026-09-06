import { z } from "zod";

export const AlertTroubleshooterEnqueueRecordRequestSchema = z.object({
  type: z.literal("plugin.alert_troubleshooter.enqueue_record.request"),
  requestId: z.string(),
  pluginId: z.string().trim().min(1),
  appId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  recordId: z.string().trim().min(1),
});

export const AlertTroubleshooterEnqueueRecordResponseSchema = z.object({
  type: z.literal("plugin.alert_troubleshooter.enqueue_record.response"),
  payload: z.object({
    requestId: z.string(),
    queued: z.boolean(),
    recordId: z.string(),
    error: z.string().nullable(),
  }),
});
