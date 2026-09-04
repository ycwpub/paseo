import { z } from "zod";
import {
  LarkSubstituteModeCreateInputSchema,
  LarkSubstituteModeSchema,
  LarkSubstituteModeUpdateInputSchema,
} from "./substitute-types.js";

const LarkSubstituteModeMutationPayloadSchema = z.object({
  requestId: z.string(),
  mode: LarkSubstituteModeSchema.nullable(),
  modes: z.array(LarkSubstituteModeSchema),
  error: z.string().nullable(),
});

export const LarkSubstituteModeListRequestSchema = z.object({
  type: z.literal("channel.lark.substitute.list.request"),
  requestId: z.string(),
});

export const LarkSubstituteModeListResponseSchema = z.object({
  type: z.literal("channel.lark.substitute.list.response"),
  payload: z.object({
    requestId: z.string(),
    modes: z.array(LarkSubstituteModeSchema),
    error: z.string().nullable(),
  }),
});

export const LarkSubstituteModeCreateRequestSchema = z.object({
  type: z.literal("channel.lark.substitute.create.request"),
  requestId: z.string(),
  mode: LarkSubstituteModeCreateInputSchema,
});

export const LarkSubstituteModeCreateResponseSchema = z.object({
  type: z.literal("channel.lark.substitute.create.response"),
  payload: LarkSubstituteModeMutationPayloadSchema,
});

export const LarkSubstituteModeUpdateRequestSchema = z.object({
  type: z.literal("channel.lark.substitute.update.request"),
  requestId: z.string(),
  modeId: z.string().min(1),
  mode: LarkSubstituteModeUpdateInputSchema,
});

export const LarkSubstituteModeUpdateResponseSchema = z.object({
  type: z.literal("channel.lark.substitute.update.response"),
  payload: LarkSubstituteModeMutationPayloadSchema,
});

export const LarkSubstituteModeSetEnabledRequestSchema = z.object({
  type: z.literal("channel.lark.substitute.set_enabled.request"),
  requestId: z.string(),
  modeId: z.string().min(1),
  enabled: z.boolean(),
});

export const LarkSubstituteModeSetEnabledResponseSchema = z.object({
  type: z.literal("channel.lark.substitute.set_enabled.response"),
  payload: LarkSubstituteModeMutationPayloadSchema,
});

export const LarkSubstituteModeDeleteRequestSchema = z.object({
  type: z.literal("channel.lark.substitute.delete.request"),
  requestId: z.string(),
  modeId: z.string().min(1),
});

export const LarkSubstituteModeDeleteResponseSchema = z.object({
  type: z.literal("channel.lark.substitute.delete.response"),
  payload: z.object({
    requestId: z.string(),
    modeId: z.string(),
    ok: z.boolean(),
    modes: z.array(LarkSubstituteModeSchema),
    error: z.string().nullable(),
  }),
});

export const LarkSubstituteModeChangedMessageSchema = z.object({
  type: z.literal("channel.lark.substitute.changed"),
  payload: z.object({
    modes: z.array(LarkSubstituteModeSchema),
  }),
});
