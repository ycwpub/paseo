import { z } from "zod";
import { LarkDirectoryUserSchema } from "./directory-types.js";
import { LarkChannelStatusSchema } from "./types.js";

export const LarkDirectoryRecentPrivateUserSchema = z.object({
  appId: z.string(),
  openId: z.string(),
  displayName: z.string().nullable(),
  firstMessageContent: z.string(),
  firstMessageAt: z.string(),
  lastMessageContent: z.string(),
  lastMessageAt: z.string(),
  messageCount: z.number().int().positive(),
  inDirectory: z.boolean(),
});
export type LarkDirectoryRecentPrivateUser = z.infer<typeof LarkDirectoryRecentPrivateUserSchema>;

export interface LarkDirectoryPrivateUserScanRange {
  lookbackMinutes: number;
  startTime?: number;
  endTime?: number;
}

export const LarkDirectoryScanPrivateUsersRequestSchema = z
  .object({
    type: z.literal("channel.lark.directory.scan_private_users.request"),
    requestId: z.string(),
    appId: z.string().trim().min(1),
    lookbackMinutes: z.number().int().min(1).max(10_080),
    startTime: z.number().int().nonnegative().optional(),
    endTime: z.number().int().nonnegative().optional(),
  })
  .superRefine((range, context) => {
    const hasStartTime = range.startTime != null;
    const hasEndTime = range.endTime != null;
    if (hasStartTime !== hasEndTime) {
      context.addIssue({
        code: "custom",
        message: "startTime and endTime must be provided together",
      });
      return;
    }
    if (!hasStartTime || !hasEndTime) return;
    if (range.endTime! <= range.startTime!) {
      context.addIssue({
        code: "custom",
        message: "endTime must be later than startTime",
        path: ["endTime"],
      });
    }
    if (range.endTime! - range.startTime! > 10_080 * 60) {
      context.addIssue({
        code: "custom",
        message: "scan range cannot exceed 7 days",
        path: ["endTime"],
      });
    }
  });

export const LarkDirectoryScanPrivateUsersResponseSchema = z.object({
  type: z.literal("channel.lark.directory.scan_private_users.response"),
  payload: z.object({
    requestId: z.string(),
    users: z.array(LarkDirectoryRecentPrivateUserSchema),
    error: z.string().nullable(),
  }),
});

export const LarkDirectoryAddPrivateUserRequestSchema = z.object({
  type: z.literal("channel.lark.directory.add_private_user.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
  openId: z.string().trim().min(1),
  displayName: z.string().trim().max(200).nullable(),
  firstMessageContent: z.string().max(10_000),
  firstMessageAt: z.string(),
});

export const LarkDirectoryAddPrivateUserResponseSchema = z.object({
  type: z.literal("channel.lark.directory.add_private_user.response"),
  payload: z.object({
    requestId: z.string(),
    user: LarkDirectoryUserSchema.nullable(),
    status: LarkChannelStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});
