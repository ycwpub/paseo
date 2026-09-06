import { z } from "zod";
import { LarkChannelTargetSchema } from "./types.js";

const LarkSubstituteUserRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("user"),
  openId: z.string().trim().nullable().default(null),
  name: z.string().trim().nullable().default(null),
  email: z.string().trim().nullable().default(null),
});

const LarkSubstituteGroupRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("group"),
  chatId: z.string().trim().min(1),
  groupId: z.string().trim().nullable().default(null),
  name: z.string().trim().nullable().default(null),
});

const LarkSubstituteGroupNameRegexRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("group_name_regex"),
  pattern: z.string().trim().min(1),
});

const LarkSubstituteGroupAiCategoryRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("group_ai_category"),
  description: z.string().trim().min(1),
});

const LarkSubstituteAllRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("all"),
});

const LarkSubstituteQuestionTypeRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("question_type"),
  description: z.string().trim().min(1),
});

export const LarkSubstituteRuleSchema = z.discriminatedUnion("type", [
  LarkSubstituteUserRuleSchema,
  LarkSubstituteGroupRuleSchema,
  LarkSubstituteGroupNameRegexRuleSchema,
  LarkSubstituteGroupAiCategoryRuleSchema,
  LarkSubstituteAllRuleSchema,
  LarkSubstituteQuestionTypeRuleSchema,
]);
export type LarkSubstituteRule = z.infer<typeof LarkSubstituteRuleSchema>;

export const LarkSubstituteAudienceRuleSchema = z.discriminatedUnion("type", [
  LarkSubstituteUserRuleSchema,
  LarkSubstituteGroupRuleSchema,
  LarkSubstituteGroupNameRegexRuleSchema,
  LarkSubstituteGroupAiCategoryRuleSchema,
  LarkSubstituteAllRuleSchema,
]);
export type LarkSubstituteAudienceRule = z.infer<typeof LarkSubstituteAudienceRuleSchema>;

export const LarkSubstituteQuestionRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1),
});
export type LarkSubstituteQuestionRule = z.infer<typeof LarkSubstituteQuestionRuleSchema>;

export const LarkSubstituteTimeRangeSchema = z.object({
  id: z.string().min(1),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
  timezone: z.string().trim().min(1).default("Asia/Shanghai"),
});
export type LarkSubstituteTimeRange = z.infer<typeof LarkSubstituteTimeRangeSchema>;

export const LarkSubstituteDisclosureSchema = z.object({
  enabled: z.boolean().default(true),
  prompt: z.string().max(1_000).default("【机器人代答】"),
});
export type LarkSubstituteDisclosure = z.infer<typeof LarkSubstituteDisclosureSchema>;

export const DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT = "仅回答工作相关问题，避免代替用户做承诺";
export const DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS = 60;
export const DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_INTERVAL_MINUTES = 30;
export const DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_LOOKBACK_MINUTES = 60;
export const DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_EXCLUDE_RECENT_MINUTES = 20;

export const LarkSubstitutePrivateScanSchema = z
  .object({
    enabled: z.boolean().default(true),
    intervalMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .default(DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_INTERVAL_MINUTES),
    lookbackMinutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60)
      .default(DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_LOOKBACK_MINUTES),
    excludeRecentMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .default(DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_EXCLUDE_RECENT_MINUTES),
  })
  .refine((value) => value.excludeRecentMinutes < value.lookbackMinutes, {
    message: "私聊扫描的排除最近时间必须小于扫描范围",
    path: ["excludeRecentMinutes"],
  });
export type LarkSubstitutePrivateScan = z.infer<typeof LarkSubstitutePrivateScanSchema>;

export const LarkSubstituteModeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  botId: z.string().trim().min(1),
  privateScan: LarkSubstitutePrivateScanSchema.default({
    enabled: true,
    intervalMinutes: DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_INTERVAL_MINUTES,
    lookbackMinutes: DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_LOOKBACK_MINUTES,
    excludeRecentMinutes: DEFAULT_LARK_SUBSTITUTE_PRIVATE_SCAN_EXCLUDE_RECENT_MINUTES,
  }),
  disclosure: LarkSubstituteDisclosureSchema,
  customPrompt: z.string().max(10_000).default(DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT),
  delaySeconds: z.number().int().min(0).max(3_600).default(DEFAULT_LARK_SUBSTITUTE_DELAY_SECONDS),
  activeTimeRanges: z.array(LarkSubstituteTimeRangeSchema).max(32).default([]),
  audienceAllowlist: z.array(LarkSubstituteAudienceRuleSchema).max(200).optional(),
  audienceDenylist: z.array(LarkSubstituteAudienceRuleSchema).max(200).optional(),
  questionAllowlist: z.array(LarkSubstituteQuestionRuleSchema).max(200).optional(),
  questionDenylist: z.array(LarkSubstituteQuestionRuleSchema).max(200).optional(),
  /** @deprecated Compatibility fields for substitute modes created before split rule lists. */
  allowlist: z.array(LarkSubstituteRuleSchema).max(200).default([]),
  /** @deprecated Compatibility fields for substitute modes created before split rule lists. */
  denylist: z.array(LarkSubstituteRuleSchema).max(200).default([]),
  target: LarkChannelTargetSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LarkSubstituteMode = z.infer<typeof LarkSubstituteModeSchema>;

export const LarkSubstituteModeCreateInputSchema = LarkSubstituteModeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type LarkSubstituteModeCreateInput = z.infer<typeof LarkSubstituteModeCreateInputSchema>;

export const LarkSubstituteModeUpdateInputSchema = LarkSubstituteModeCreateInputSchema;
export type LarkSubstituteModeUpdateInput = z.infer<typeof LarkSubstituteModeUpdateInputSchema>;
