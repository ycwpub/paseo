import { z } from "zod";

export const LarkSubstituteTaskSourceSchema = z.enum([
  "group_listener",
  "group_scan",
  "private_scan",
]);
export type LarkSubstituteTaskSource = z.infer<typeof LarkSubstituteTaskSourceSchema>;

export const LarkSubstituteTaskStatusSchema = z.enum([
  "pending",
  "paused",
  "running",
  "completed",
  "skipped",
  "failed",
]);
export type LarkSubstituteTaskStatus = z.infer<typeof LarkSubstituteTaskStatusSchema>;

export const LarkSubstituteTaskFailureStageSchema = z.enum([
  "listener",
  "group_scan",
  "private_scan",
  "processing",
  "reply",
]);
export type LarkSubstituteTaskFailureStage = z.infer<typeof LarkSubstituteTaskFailureStageSchema>;

export const LarkSubstituteTaskSchema = z.object({
  id: z.string().min(1),
  modeId: z.string().min(1),
  modeName: z.string().min(1),
  botId: z.string().min(1),
  source: LarkSubstituteTaskSourceSchema,
  chatId: z.string().min(1),
  chatName: z.string().nullable(),
  messageId: z.string().min(1),
  senderOpenId: z.string().nullable(),
  senderName: z.string().nullable(),
  content: z.string(),
  status: LarkSubstituteTaskStatusSchema,
  scheduledAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  agentId: z.string().nullable(),
  error: z.string().nullable(),
  failureStage: LarkSubstituteTaskFailureStageSchema.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LarkSubstituteTask = z.infer<typeof LarkSubstituteTaskSchema>;
