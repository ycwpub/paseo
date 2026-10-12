import { z } from "zod";

import { LarkChannelTargetSchema } from "./types.js";

export const DEFAULT_LARK_GROUP_PROCESSOR_DELAY_SECONDS = 60;
export const DEFAULT_LARK_GROUP_PROCESSOR_SCAN_INTERVAL_MINUTES = 30;
export const DEFAULT_LARK_GROUP_PROCESSOR_SCAN_LOOKBACK_MINUTES = 60;
export const DEFAULT_LARK_GROUP_PROCESSOR_SCAN_EXCLUDE_RECENT_MINUTES = 10;
export const DEFAULT_LARK_GROUP_PROCESSOR_CONTEXT_COUNT = 10;

const FilterBaseSchema = z.object({
  id: z.string().min(1),
  effect: z.enum(["include", "exclude"]),
  value: z.string().trim().min(1).max(2_000),
});

const ExactFilterSchema = FilterBaseSchema.extend({
  field: z.enum(["group_chat_id", "sender_open_id"]),
  operator: z.literal("equals"),
});

const TextFilterSchema = FilterBaseSchema.extend({
  field: z.enum(["group_name", "sender_name", "message_content"]),
  operator: z.enum(["equals", "contains", "regex"]),
});

export const LarkGroupMessageProcessorFilterSchema = z.discriminatedUnion("field", [
  ExactFilterSchema.extend({ field: z.literal("group_chat_id") }),
  ExactFilterSchema.extend({ field: z.literal("sender_open_id") }),
  TextFilterSchema.extend({ field: z.literal("group_name") }),
  TextFilterSchema.extend({ field: z.literal("sender_name") }),
  TextFilterSchema.extend({ field: z.literal("message_content") }),
]);
export type LarkGroupMessageProcessorFilter = z.infer<typeof LarkGroupMessageProcessorFilterSchema>;

export const LarkGroupMessageProcessorRealtimeSchema = z.object({
  enabled: z.boolean().default(true),
  delaySeconds: z
    .number()
    .int()
    .min(0)
    .max(3_600)
    .default(DEFAULT_LARK_GROUP_PROCESSOR_DELAY_SECONDS),
});
export type LarkGroupMessageProcessorRealtime = z.infer<
  typeof LarkGroupMessageProcessorRealtimeSchema
>;

export const LarkGroupMessageProcessorScanSchema = z
  .object({
    enabled: z.boolean().default(true),
    intervalMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .default(DEFAULT_LARK_GROUP_PROCESSOR_SCAN_INTERVAL_MINUTES),
    lookbackMinutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60)
      .default(DEFAULT_LARK_GROUP_PROCESSOR_SCAN_LOOKBACK_MINUTES),
    excludeRecentMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .default(DEFAULT_LARK_GROUP_PROCESSOR_SCAN_EXCLUDE_RECENT_MINUTES),
  })
  .refine((value) => value.excludeRecentMinutes < value.lookbackMinutes, {
    message: "群消息扫描的排除最近时间必须小于扫描范围",
    path: ["excludeRecentMinutes"],
  });
export type LarkGroupMessageProcessorScan = z.infer<typeof LarkGroupMessageProcessorScanSchema>;

export const LarkGroupMessageProcessorContextSchema = z.object({
  previousMessageCount: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(DEFAULT_LARK_GROUP_PROCESSOR_CONTEXT_COUNT),
  followingMessageCount: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(DEFAULT_LARK_GROUP_PROCESSOR_CONTEXT_COUNT),
});
export type LarkGroupMessageProcessorContext = z.infer<
  typeof LarkGroupMessageProcessorContextSchema
>;

export const LarkGroupMessageProcessorSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  botId: z.string().trim().min(1),
  realtime: LarkGroupMessageProcessorRealtimeSchema.default({
    enabled: true,
    delaySeconds: DEFAULT_LARK_GROUP_PROCESSOR_DELAY_SECONDS,
  }),
  scan: LarkGroupMessageProcessorScanSchema.default({
    enabled: true,
    intervalMinutes: DEFAULT_LARK_GROUP_PROCESSOR_SCAN_INTERVAL_MINUTES,
    lookbackMinutes: DEFAULT_LARK_GROUP_PROCESSOR_SCAN_LOOKBACK_MINUTES,
    excludeRecentMinutes: DEFAULT_LARK_GROUP_PROCESSOR_SCAN_EXCLUDE_RECENT_MINUTES,
  }),
  context: LarkGroupMessageProcessorContextSchema.default({
    previousMessageCount: DEFAULT_LARK_GROUP_PROCESSOR_CONTEXT_COUNT,
    followingMessageCount: DEFAULT_LARK_GROUP_PROCESSOR_CONTEXT_COUNT,
  }),
  filters: z.array(LarkGroupMessageProcessorFilterSchema).max(200).default([]),
  aiFilterPrompt: z.string().max(10_000).default(""),
  replyPrompt: z.string().trim().min(1).max(20_000),
  autoArchiveAgent: z.boolean().default(true),
  target: LarkChannelTargetSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LarkGroupMessageProcessor = z.infer<typeof LarkGroupMessageProcessorSchema>;

export const LarkGroupMessageProcessorCreateInputSchema = LarkGroupMessageProcessorSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type LarkGroupMessageProcessorCreateInput = z.infer<
  typeof LarkGroupMessageProcessorCreateInputSchema
>;

export const LarkGroupMessageProcessorUpdateInputSchema =
  LarkGroupMessageProcessorCreateInputSchema;
export type LarkGroupMessageProcessorUpdateInput = z.infer<
  typeof LarkGroupMessageProcessorUpdateInputSchema
>;

export const LarkGroupMessageProcessorTaskSourceSchema = z.enum(["listener", "scan"]);
export type LarkGroupMessageProcessorTaskSource = z.infer<
  typeof LarkGroupMessageProcessorTaskSourceSchema
>;

export const LarkGroupMessageProcessorTaskStatusSchema = z.enum([
  "pending",
  "paused",
  "running",
  "completed",
  "skipped",
  "failed",
]);
export type LarkGroupMessageProcessorTaskStatus = z.infer<
  typeof LarkGroupMessageProcessorTaskStatusSchema
>;

export const LarkGroupMessageProcessorTaskFailureStageSchema = z.enum([
  "listener",
  "scan",
  "context",
  "processing",
  "reply",
]);
export type LarkGroupMessageProcessorTaskFailureStage = z.infer<
  typeof LarkGroupMessageProcessorTaskFailureStageSchema
>;

export const LarkGroupMessageProcessorTaskSchema = z.object({
  id: z.string().min(1),
  processorId: z.string().min(1),
  processorName: z.string().min(1),
  botId: z.string().min(1),
  source: LarkGroupMessageProcessorTaskSourceSchema,
  chatId: z.string().min(1),
  chatName: z.string().nullable(),
  messageId: z.string().min(1),
  senderOpenId: z.string().nullable(),
  senderName: z.string().nullable(),
  content: z.string(),
  status: LarkGroupMessageProcessorTaskStatusSchema,
  scheduledAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  agentId: z.string().nullable(),
  error: z.string().nullable(),
  failureStage: LarkGroupMessageProcessorTaskFailureStageSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LarkGroupMessageProcessorTask = z.infer<typeof LarkGroupMessageProcessorTaskSchema>;

export const LarkGroupMessageProcessorTaskScanRangeSchema = z
  .object({
    lookbackMinutes: z.number().int().min(1).max(10_080),
    excludeRecentMinutes: z.number().int().min(0).max(10_079),
  })
  .refine((value) => value.excludeRecentMinutes < value.lookbackMinutes, {
    message: "excludeRecentMinutes must be less than lookbackMinutes",
    path: ["excludeRecentMinutes"],
  });
export type LarkGroupMessageProcessorTaskScanRange = z.infer<
  typeof LarkGroupMessageProcessorTaskScanRangeSchema
>;
