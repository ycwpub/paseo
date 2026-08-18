import { z } from "zod";
import { LarkDirectorySchema } from "./directory-types.js";

export const LarkChannelDomainSchema = z.enum(["feishu", "lark"]);
export type LarkChannelDomain = z.infer<typeof LarkChannelDomainSchema>;

export const LarkChannelConnectionStatusSchema = z.enum([
  "disabled",
  "idle",
  "connecting",
  "connected",
  "error",
]);
export type LarkChannelConnectionStatus = z.infer<typeof LarkChannelConnectionStatusSchema>;

const LarkChannelWorkspaceTargetSchema = z.object({
  kind: z.literal("workspace"),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modeId: z.string().nullable().optional(),
  thinkingOptionId: z.string().nullable().optional(),
  cwd: z.string().nullable(),
  workspaceId: z.string().nullable(),
});

const LarkChannelAssistantTargetSchema = z.object({
  kind: z.literal("assistant"),
  assistantId: z.string().nullable(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modeId: z.string().nullable().optional(),
  thinkingOptionId: z.string().nullable().optional(),
  cwd: z.string().nullable(),
  workspaceId: z.string().nullable(),
});

const LarkChannelTeamTargetSchema = z.object({
  kind: z.literal("team"),
  teamId: z.string().nullable(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modeId: z.string().nullable().optional(),
  thinkingOptionId: z.string().nullable().optional(),
  cwd: z.string().nullable(),
  workspaceId: z.string().nullable(),
});

export const LarkChannelTargetSchema = z.discriminatedUnion("kind", [
  LarkChannelWorkspaceTargetSchema,
  LarkChannelAssistantTargetSchema,
  LarkChannelTeamTargetSchema,
]);
export type LarkChannelTarget = z.infer<typeof LarkChannelTargetSchema>;

export const LarkChannelBotSchema = z.object({
  name: z.string().optional(),
  avatarUrl: z.string().optional(),
});
export type LarkChannelBot = z.infer<typeof LarkChannelBotSchema>;

export const LarkChannelSubstituteSchema = z.object({
  enabled: z.boolean(),
  openId: z.string().nullable(),
  name: z.string().nullable(),
});
export type LarkChannelSubstitute = z.infer<typeof LarkChannelSubstituteSchema>;

export const LarkChannelPendingPairingSchema = z.object({
  code: z.string(),
  openId: z.string().nullable(),
  unionId: z.string().nullable(),
  chatId: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type LarkChannelPendingPairing = z.infer<typeof LarkChannelPendingPairingSchema>;

export const LarkChannelAuthorizedUserSchema = z.object({
  id: z.string(),
  openId: z.string().nullable(),
  unionId: z.string().nullable(),
  chatId: z.string(),
  displayName: z.string(),
  authorizedAt: z.string(),
});
export type LarkChannelAuthorizedUser = z.infer<typeof LarkChannelAuthorizedUserSchema>;

export const LarkChannelBotStatusSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  enabled: z.boolean(),
  connectionStatus: LarkChannelConnectionStatusSchema,
  error: z.string().nullable(),
  appId: z.string().nullable(),
  hasAppSecret: z.boolean(),
  hasEncryptKey: z.boolean(),
  hasVerificationToken: z.boolean(),
  domain: LarkChannelDomainSchema,
  target: LarkChannelTargetSchema,
  substitute: LarkChannelSubstituteSchema.default({
    enabled: false,
    openId: null,
    name: null,
  }),
  bot: LarkChannelBotSchema.nullable(),
  pendingPairings: z.array(LarkChannelPendingPairingSchema),
  authorizedUsers: z.array(LarkChannelAuthorizedUserSchema),
});
export type LarkChannelBotStatus = z.infer<typeof LarkChannelBotStatusSchema>;

export const LarkChannelStatusSchema = LarkChannelBotStatusSchema.omit({
  id: true,
  name: true,
}).extend({
  activeBotId: z.string().nullable().default(null),
  bots: z.array(LarkChannelBotStatusSchema).default([]),
  // COMPAT(larkDirectory): added in v0.3.2, remove optional parsing after 2027-02-19.
  directory: LarkDirectorySchema.optional(),
});
export type LarkChannelStatus = z.infer<typeof LarkChannelStatusSchema>;
