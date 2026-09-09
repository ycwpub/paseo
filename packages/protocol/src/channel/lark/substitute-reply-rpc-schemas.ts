import { z } from "zod";

export const LarkSubstituteReplyResultSchema = z.object({
  agentId: z.string().min(1),
  taskId: z.string().min(1),
  modeId: z.string().min(1),
  projectId: z.string().min(1),
  botId: z.string().min(1),
  chatId: z.string().min(1),
  threadId: z.string().min(1),
  messageId: z.string().nullable(),
});
export type LarkSubstituteReplyResult = z.infer<typeof LarkSubstituteReplyResultSchema>;

export const LarkSubstituteReplyRequestSchema = z.object({
  type: z.literal("channel.lark.substitute.reply.request"),
  requestId: z.string(),
  agentId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(100_000),
});

export const LarkSubstituteReplyResponseSchema = z.object({
  type: z.literal("channel.lark.substitute.reply.response"),
  payload: z.object({
    requestId: z.string(),
    reply: LarkSubstituteReplyResultSchema.nullable(),
    error: z.string().nullable(),
  }),
});
