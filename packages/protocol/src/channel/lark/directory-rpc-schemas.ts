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
