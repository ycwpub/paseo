import { z } from "zod";

export const LarkReminderSenderSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bot"),
  }),
  z.object({
    type: z.literal("user"),
    userAccessTokenEnv: z.string().trim().min(1),
  }),
]);
export type LarkReminderSender = z.infer<typeof LarkReminderSenderSchema>;

export const LarkReminderStatusSchema = z.enum(["active", "paused", "completed", "error"]);
export type LarkReminderStatus = z.infer<typeof LarkReminderStatusSchema>;

export const LarkReminderReplySchema = z.object({
  messageId: z.string(),
  openId: z.string(),
  displayName: z.string(),
  text: z.string(),
  repliedAt: z.string(),
});
export type LarkReminderReply = z.infer<typeof LarkReminderReplySchema>;

export const LarkReminderSchema = z.object({
  id: z.string(),
  name: z.string(),
  botId: z.string(),
  chatId: z.string(),
  targetOpenIds: z.array(z.string().min(1)).min(1),
  message: z.string().min(1),
  frequencySeconds: z.number().int().min(60),
  sender: LarkReminderSenderSchema,
  status: LarkReminderStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  lastSentAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  sendCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  reply: LarkReminderReplySchema.nullable(),
});
export type LarkReminder = z.infer<typeof LarkReminderSchema>;

export const LarkReminderCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  botId: z.string().trim().min(1),
  chatId: z.string().trim().min(1),
  targetOpenIds: z.array(z.string().trim().min(1)).min(1).max(50),
  message: z.string().trim().min(1).max(3_000),
  frequencySeconds: z
    .number()
    .int()
    .min(60)
    .max(30 * 24 * 60 * 60),
  sender: LarkReminderSenderSchema,
  enabled: z.boolean().default(true),
});
export type LarkReminderCreateInput = z.infer<typeof LarkReminderCreateInputSchema>;
