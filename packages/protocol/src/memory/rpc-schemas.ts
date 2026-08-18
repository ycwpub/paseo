import { z } from "zod";
import { PaseoMemoryStateSchema, PaseoMemoryUpdateInputSchema } from "./types.js";

const MemoryResponsePayloadSchema = z.object({
  requestId: z.string(),
  memory: PaseoMemoryStateSchema.nullable(),
  error: z.string().nullable(),
});

export const MemoryGetStateRequestSchema = z.object({
  type: z.literal("memory.get_state.request"),
  requestId: z.string(),
});

export const MemoryGetStateResponseSchema = z.object({
  type: z.literal("memory.get_state.response"),
  payload: MemoryResponsePayloadSchema,
});

export const MemoryUpdateStateRequestSchema = z.object({
  type: z.literal("memory.update_state.request"),
  requestId: z.string(),
  update: PaseoMemoryUpdateInputSchema,
});

export const MemoryUpdateStateResponseSchema = z.object({
  type: z.literal("memory.update_state.response"),
  payload: MemoryResponsePayloadSchema,
});

export const MemoryClearRequestSchema = z.object({
  type: z.literal("memory.clear.request"),
  requestId: z.string(),
});

export const MemoryClearResponseSchema = z.object({
  type: z.literal("memory.clear.response"),
  payload: MemoryResponsePayloadSchema,
});
