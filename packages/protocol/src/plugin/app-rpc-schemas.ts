import { z } from "zod";
import { PluginAppStateSchema } from "./app-types.js";
import { PluginHttpJobSchema } from "./types.js";

const PluginAppResponsePayloadSchema = z.object({
  requestId: z.string(),
  app: PluginAppStateSchema.nullable(),
  error: z.string().nullable(),
});

export const PluginAppGetRequestSchema = z.object({
  type: z.literal("plugin.app.get.request"),
  requestId: z.string(),
  pluginId: z.string().min(1),
  appId: z.string().min(1),
});

export const PluginAppGetResponseSchema = z.object({
  type: z.literal("plugin.app.get.response"),
  payload: PluginAppResponsePayloadSchema,
});

export const PluginAppGenerateRequestSchema = z.object({
  type: z.literal("plugin.app.generate.request"),
  requestId: z.string(),
  pluginId: z.string().min(1),
  appId: z.string().min(1),
  prompt: z.string().trim().min(1).max(20_000),
});

export const PluginAppGenerateResponseSchema = z.object({
  type: z.literal("plugin.app.generate.response"),
  payload: PluginAppResponsePayloadSchema,
});

export const PluginAppActionSubmitRequestSchema = z.object({
  type: z.literal("plugin.app.action.submit.request"),
  requestId: z.string(),
  pluginId: z.string().min(1),
  appId: z.string().min(1),
  componentId: z.string().min(1),
  form: z.record(z.string(), z.unknown()),
});

export const PluginAppActionSubmitResponseSchema = z.object({
  type: z.literal("plugin.app.action.submit.response"),
  payload: z.object({
    requestId: z.string(),
    job: PluginHttpJobSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const PluginAppJobGetRequestSchema = z.object({
  type: z.literal("plugin.app.job.get.request"),
  requestId: z.string(),
  processId: z.string().min(1),
});

export const PluginAppJobGetResponseSchema = z.object({
  type: z.literal("plugin.app.job.get.response"),
  payload: z.object({
    requestId: z.string(),
    job: PluginHttpJobSchema.nullable(),
    error: z.string().nullable(),
  }),
});
