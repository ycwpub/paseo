import { z } from "zod";

export const LarkDirectoryUserSchema = z.object({
  appId: z.string(),
  email: z.string().nullable(),
  openId: z.string(),
  displayName: z.string().nullable(),
  updatedAt: z.string(),
});
export type LarkDirectoryUser = z.infer<typeof LarkDirectoryUserSchema>;

export const LarkDirectoryChatSchema = z.object({
  appId: z.string(),
  groupId: z.string(),
  chatId: z.string(),
  name: z.string(),
  updatedAt: z.string(),
});
export type LarkDirectoryChat = z.infer<typeof LarkDirectoryChatSchema>;

export const LarkDirectorySchema = z.object({
  users: z.array(LarkDirectoryUserSchema),
  chats: z.array(LarkDirectoryChatSchema),
});
export type LarkDirectory = z.infer<typeof LarkDirectorySchema>;
