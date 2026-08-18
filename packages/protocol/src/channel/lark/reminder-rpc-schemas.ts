import { z } from "zod";
import { LarkReminderCreateInputSchema, LarkReminderSchema } from "./reminder-types.js";

const LarkReminderMutationPayloadSchema = z.object({
  requestId: z.string(),
  reminder: LarkReminderSchema.nullable(),
  reminders: z.array(LarkReminderSchema),
  error: z.string().nullable(),
});

export const LarkReminderListRequestSchema = z.object({
  type: z.literal("channel.lark.reminder.list.request"),
  requestId: z.string(),
});

export const LarkReminderListResponseSchema = z.object({
  type: z.literal("channel.lark.reminder.list.response"),
  payload: z.object({
    requestId: z.string(),
    reminders: z.array(LarkReminderSchema),
    error: z.string().nullable(),
  }),
});

export const LarkReminderCreateRequestSchema = LarkReminderCreateInputSchema.extend({
  type: z.literal("channel.lark.reminder.create.request"),
  requestId: z.string(),
});

export const LarkReminderCreateResponseSchema = z.object({
  type: z.literal("channel.lark.reminder.create.response"),
  payload: LarkReminderMutationPayloadSchema,
});

export const LarkReminderSetEnabledRequestSchema = z.object({
  type: z.literal("channel.lark.reminder.set_enabled.request"),
  requestId: z.string(),
  reminderId: z.string().min(1),
  enabled: z.boolean(),
});

export const LarkReminderSetEnabledResponseSchema = z.object({
  type: z.literal("channel.lark.reminder.set_enabled.response"),
  payload: LarkReminderMutationPayloadSchema,
});

export const LarkReminderDeleteRequestSchema = z.object({
  type: z.literal("channel.lark.reminder.delete.request"),
  requestId: z.string(),
  reminderId: z.string().min(1),
});

export const LarkReminderDeleteResponseSchema = z.object({
  type: z.literal("channel.lark.reminder.delete.response"),
  payload: z.object({
    requestId: z.string(),
    reminderId: z.string(),
    ok: z.boolean(),
    reminders: z.array(LarkReminderSchema),
    error: z.string().nullable(),
  }),
});

export const LarkReminderChangedMessageSchema = z.object({
  type: z.literal("channel.lark.reminder.changed"),
  payload: z.object({
    reminders: z.array(LarkReminderSchema),
  }),
});
