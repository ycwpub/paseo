import { z } from "zod";
import { PluginAppStateSchema } from "./app-types.js";
import { PluginHttpJobListFilterSchema } from "./http-management.js";
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
  // COMPAT(pluginProjectScopedApps): added on 2026-08-20. Older clients omit it.
  projectId: z.string().min(1).optional(),
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
  // COMPAT(pluginProjectScopedApps): added on 2026-08-20. Older clients omit it.
  projectId: z.string().min(1).optional(),
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
  // COMPAT(pluginProjectScopedApps): added on 2026-08-20. Older clients omit it.
  projectId: z.string().min(1).optional(),
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

export const PluginHttpServiceSubmitRequestSchema = z.object({
  type: z.literal("plugin.http.submit.request"),
  requestId: z.string(),
  pluginId: z.string().min(1),
  serviceName: z.string().min(1),
  input: z.unknown(),
});

export const PluginHttpServiceSubmitResponseSchema = z.object({
  type: z.literal("plugin.http.submit.response"),
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

export const PluginAppJobListRequestSchema = z.object({
  type: z.literal("plugin.app.job.list.request"),
  requestId: z.string(),
  pluginId: z.string().min(1).optional(),
  serviceName: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
  // COMPAT(pluginHttpServiceManagement): added on 2026-08-20.
  filters: PluginHttpJobListFilterSchema.optional(),
});

export const PluginAppJobListResponseSchema = z.object({
  type: z.literal("plugin.app.job.list.response"),
  payload: z.object({
    requestId: z.string(),
    jobs: z.array(PluginHttpJobSchema),
    error: z.string().nullable(),
  }),
});

export const PluginAppJobUpdateRequestSchema = z.object({
  type: z.literal("plugin.app.job.update.request"),
  requestId: z.string(),
  processId: z.string().min(1),
  input: z.unknown(),
});

export const PluginAppJobUpdateResponseSchema = z.object({
  type: z.literal("plugin.app.job.update.response"),
  payload: z.object({
    requestId: z.string(),
    job: PluginHttpJobSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const PluginAppJobDeleteRequestSchema = z.object({
  type: z.literal("plugin.app.job.delete.request"),
  requestId: z.string(),
  processId: z.string().min(1),
});

export const PluginAppJobDeleteResponseSchema = z.object({
  type: z.literal("plugin.app.job.delete.response"),
  payload: z.object({
    requestId: z.string(),
    processId: z.string(),
    deleted: z.boolean(),
    error: z.string().nullable(),
  }),
});
