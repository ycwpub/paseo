import { z } from "zod";
import { LarkChannelTargetSchema } from "./types.js";

export const LarkSubstituteReplyIdentitySchema = z.enum(["user", "bot"]);
export type LarkSubstituteReplyIdentity = z.infer<typeof LarkSubstituteReplyIdentitySchema>;

export const LarkSubstituteUserSchema = z.object({
  openId: z.string().trim().min(1),
  name: z.string().trim().nullable().default(null),
  email: z.string().trim().nullable().default(null),
});
export type LarkSubstituteUser = z.infer<typeof LarkSubstituteUserSchema>;

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

const LarkSubstituteQuestionTypeRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("question_type"),
  description: z.string().trim().min(1),
});

export const LarkSubstituteRuleSchema = z.discriminatedUnion("type", [
  LarkSubstituteUserRuleSchema,
  LarkSubstituteGroupRuleSchema,
  LarkSubstituteGroupNameRegexRuleSchema,
  LarkSubstituteQuestionTypeRuleSchema,
]);
export type LarkSubstituteRule = z.infer<typeof LarkSubstituteRuleSchema>;

export const LarkSubstituteTimeRangeSchema = z.object({
  id: z.string().min(1),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
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

export const LarkSubstituteModeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  botId: z.string().trim().min(1),
  substituteUser: LarkSubstituteUserSchema,
  privateReplyIdentity: z.literal("user").default("user"),
  groupReplyIdentity: LarkSubstituteReplyIdentitySchema.default("bot"),
  disclosure: LarkSubstituteDisclosureSchema,
  customPrompt: z.string().max(10_000).default(""),
  delaySeconds: z.number().int().min(0).max(3_600).default(0),
  activeTimeRanges: z.array(LarkSubstituteTimeRangeSchema).max(32).default([]),
  allowlist: z.array(LarkSubstituteRuleSchema).max(200).default([]),
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
