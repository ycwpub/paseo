import { z } from "zod";

export const ReasoningTranslateRequestSchema = z.object({
  type: z.literal("reasoning.translate.request"),
  requestId: z.string(),
  agentId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(200_000),
});

export const ReasoningTranslateResponseSchema = z.object({
  type: z.literal("reasoning.translate.response"),
  payload: z.object({
    requestId: z.string(),
    translatedText: z.string().nullable(),
    error: z.string().nullable(),
  }),
});

export type ReasoningTranslateRequest = z.infer<typeof ReasoningTranslateRequestSchema>;
export type ReasoningTranslateResponse = z.infer<typeof ReasoningTranslateResponseSchema>;
