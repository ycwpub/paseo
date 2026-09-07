import { z } from "zod";

const LarkSubstituteAudienceGroupRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("group"),
  chatId: z.string().trim().min(1),
  groupId: z.string().trim().nullable().default(null),
  name: z.string().trim().nullable().default(null),
});

const LarkSubstituteAudienceGroupAiCategoryRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("group_ai_category"),
  description: z.string().trim().min(1),
});

const LarkSubstituteAudienceGroupNameRegexRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("group_name_regex"),
  pattern: z.string().trim().min(1),
});

const LarkSubstituteAudiencePrivateRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("private"),
});

const LarkSubstituteAudienceBotRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("bot"),
});

const LarkSubstituteAudienceAllGroupsRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("all_groups"),
});

const LarkSubstituteAudienceAllConversationsRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("all"),
});

export const LarkSubstituteAudienceConversationRuleSchema = z.discriminatedUnion("type", [
  LarkSubstituteAudienceGroupRuleSchema,
  LarkSubstituteAudienceGroupAiCategoryRuleSchema,
  LarkSubstituteAudienceGroupNameRegexRuleSchema,
  LarkSubstituteAudiencePrivateRuleSchema,
  LarkSubstituteAudienceBotRuleSchema,
  LarkSubstituteAudienceAllGroupsRuleSchema,
  LarkSubstituteAudienceAllConversationsRuleSchema,
]);
export type LarkSubstituteAudienceConversationRule = z.infer<
  typeof LarkSubstituteAudienceConversationRuleSchema
>;

const LarkSubstituteAudienceAllUsersRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("all_users"),
});

const LarkSubstituteAudienceBotAppRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("bot_app_id"),
  appId: z.string().trim().min(1),
});

const LarkSubstituteAudienceBotNameRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("bot_name"),
  name: z.string().trim().min(1),
});

const LarkSubstituteAudienceAllBotsRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("all_bots"),
});

const LarkSubstituteAudienceAllSendersRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("all"),
});

const LarkSubstituteAudienceUserNameRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("user_name"),
  name: z.string().trim().min(1),
  openId: z.string().trim().nullable().default(null),
  email: z.string().trim().nullable().default(null),
});

const LarkSubstituteAudienceUserEmailRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("user_email"),
  email: z.string().trim().email(),
  openId: z.string().trim().nullable().default(null),
  name: z.string().trim().nullable().default(null),
});

const LarkSubstituteAudienceUserOpenIdRuleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("user_open_id"),
  openId: z.string().trim().min(1),
  name: z.string().trim().nullable().default(null),
  email: z.string().trim().nullable().default(null),
});

export const LarkSubstituteAudienceUserRuleSchema = z.discriminatedUnion("type", [
  LarkSubstituteAudienceAllUsersRuleSchema,
  LarkSubstituteAudienceBotAppRuleSchema,
  LarkSubstituteAudienceBotNameRuleSchema,
  LarkSubstituteAudienceAllBotsRuleSchema,
  LarkSubstituteAudienceAllSendersRuleSchema,
  LarkSubstituteAudienceUserNameRuleSchema,
  LarkSubstituteAudienceUserOpenIdRuleSchema,
  // COMPAT(larkSubstituteUserEmailRule): keep parsing old saved modes.
  LarkSubstituteAudienceUserEmailRuleSchema,
]);
export type LarkSubstituteAudienceUserRule = z.infer<typeof LarkSubstituteAudienceUserRuleSchema>;

export const LarkSubstituteAudienceRuleGroupSchema = z.object({
  id: z.string().min(1),
  conversationRules: z.array(LarkSubstituteAudienceConversationRuleSchema).min(1).max(100),
  userRules: z.array(LarkSubstituteAudienceUserRuleSchema).min(1).max(100),
});
export type LarkSubstituteAudienceRuleGroup = z.infer<typeof LarkSubstituteAudienceRuleGroupSchema>;
