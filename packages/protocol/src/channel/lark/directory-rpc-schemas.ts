import { z } from "zod";
import { LarkDirectoryChatSchema, LarkDirectoryUserSchema } from "./directory-types.js";
import { LarkChannelStatusSchema } from "./types.js";

export const LarkDirectoryResolveUsersRequestSchema = z.object({
  type: z.literal("channel.lark.directory.resolve_users.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
  emails: z.array(z.string().trim().min(1)).min(1),
});

export const LarkDirectoryResolveUsersResponseSchema = z.object({
  type: z.literal("channel.lark.directory.resolve_users.response"),
  payload: z.object({
    requestId: z.string(),
    users: z.array(LarkDirectoryUserSchema),
    status: LarkChannelStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const LarkDirectoryResolveUserRequestSchema = z.object({
  type: z.literal("channel.lark.directory.resolve_user.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
  openId: z.string().trim().min(1),
});

export const LarkDirectoryResolveUserResponseSchema = z.object({
  type: z.literal("channel.lark.directory.resolve_user.response"),
  payload: z.object({
    requestId: z.string(),
    user: LarkDirectoryUserSchema.nullable(),
    status: LarkChannelStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const LarkDirectoryResolveChatsRequestSchema = z.object({
  type: z.literal("channel.lark.directory.resolve_chats.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
  query: z.string().trim().min(1),
});

export const LarkDirectoryResolveChatsResponseSchema = z.object({
  type: z.literal("channel.lark.directory.resolve_chats.response"),
  payload: z.object({
    requestId: z.string(),
    chats: z.array(LarkDirectoryChatSchema),
    status: LarkChannelStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const LarkDirectoryUpdateUserRequestSchema = z.object({
  type: z.literal("channel.lark.directory.update_user.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
  openId: z.string().trim().min(1),
  displayName: z.string().trim().max(200).nullable(),
  email: z.string().trim().max(320).nullable(),
});

export const LarkDirectoryUpdateUserResponseSchema = z.object({
  type: z.literal("channel.lark.directory.update_user.response"),
  payload: z.object({
    requestId: z.string(),
    user: LarkDirectoryUserSchema.nullable(),
    status: LarkChannelStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const LarkDirectoryClearFirstMessagesRequestSchema = z.object({
  type: z.literal("channel.lark.directory.clear_first_messages.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
});

export const LarkDirectoryClearFirstMessagesResponseSchema = z.object({
  type: z.literal("channel.lark.directory.clear_first_messages.response"),
  payload: z.object({
    requestId: z.string(),
    clearedCount: z.number().int().nonnegative(),
    status: LarkChannelStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});
